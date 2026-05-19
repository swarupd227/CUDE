const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { v4: uuidv4 } = require('uuid');
const { catalog, approvalQueue, agentRegistry, pluginConfig, eventLog, pushEvent, recordAgentActivity } = require('../data/seedData');
const { parseAsset, detectFormat, detectDomain } = require('../services/domainParsers');
const { evaluateClassification, determineZone, getECCN, RULES, computeConfidence, inferContentSignals, assignRetentionPolicy, loadProjectRules } = require('../services/policyEngine');
const { agentReason, arbitrate, investigate, generateReport, monitorAlerts, nlqSearch, analyzeContent } = require('../services/claudeService');
const eventBus = require('../services/eventBus');

// Find asset — checks in-memory catalog first, then PostgreSQL
async function findAsset(id) {
  let asset = catalog.find(a => a.id === id);
  if (asset) return asset;
  try {
    const assetRepo = require('../db/repositories/assetRepo');
    return await assetRepo.findById(id);
  } catch { return null; }
}

// Non-blocking audit log write — never fails the main request
function audit(entry) {
  try {
    const auditRepo = require('../db/repositories/auditRepo');
    auditRepo.write(entry).catch(() => {});
  } catch (_) { /* DB not available */ }
}

// Index asset in Elasticsearch + compute embedding (non-blocking)
function indexAsset(asset) {
  try {
    const searchService = require('../services/searchService');
    if (searchService.isAvailable()) searchService.indexAsset(asset).catch(() => {});
  } catch (_) {}
  // Upsert to Neo4j knowledge graph
  try {
    const graphService = require('../services/graphService');
    if (graphService.isAvailable()) {
      graphService.upsertAssetNode(asset).catch(() => {});
      graphService.autoCreateProjectEdges(asset).catch(() => {});
    }
  } catch (_) {}
  // Compute semantic embedding
  try {
    const embeddingService = require('../services/embeddingService');
    if (embeddingService.isAvailable()) {
      const domKey = asset.content_domain?.toLowerCase().replace('_document','').replace('_circuit','').replace('_recording','') || '';
      const domMeta = (domKey && asset[`muas_${domKey}`]) || asset.domain_metadata || {};
      const textForEmbed = [asset.file_name, asset.content_domain, asset.project_code || '', domMeta.text_preview || '', asset.ai_analysis?.content_summary || ''].join(' ');
      embeddingService.embedAsset(asset.id, textForEmbed).catch(() => {});
    }
  } catch (_) {}
}

// Deterministic confidence score from file properties — same file always gets the same score
function stableConfidence(fileName, sizeMb, domain) {
  let hash = 0;
  const seed = `${fileName}|${sizeMb}|${domain}`;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  // Map to 0.60–0.97 range deterministically
  const normalized = ((hash >>> 0) % 10000) / 10000; // 0.0 – 0.9999
  return parseFloat((0.60 + normalized * 0.37).toFixed(4));
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

// Helper: resolve domain scanner name
function domainScannerName(domain) {
  const map = { ELECTRONIC_CIRCUIT:'Circuit Drawing Scanner', PDF_DOCUMENT:'PDF Document Scanner', OFFICE_DOCUMENT:'Office Document Scanner', AUDIO:'Audio & Meeting Scanner', VIDEO:'Video Content Scanner' };
  return map[domain] || map[domain?.split('_')[0]] || 'Domain Scanner';
}

// Central emit — always requires a human-readable message string
function emit(type, agentName, message, payload = {}) {
  // Map display name back to registry key for pushEvent
  const agentId = Object.keys(agentRegistry).find(k => agentRegistry[k].name === agentName) || agentName;
  const ev = pushEvent(type, agentId, message, payload);
  eventBus.publish(ev);
  if (recordAgentActivity && agentRegistry[agentId]) recordAgentActivity(agentId, message.substring(0, 120));
  return ev;
}

// ── SSE stream ────────────────────────────────────────────────────────────────
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.write('data: {"type":"connected","message":"Connected to CUDE live event stream"}\n\n');
  eventBus.subscribe(res);
});

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  // Try PostgreSQL first, fall back to in-memory
  try {
    const assetRepo = require('../db/repositories/assetRepo');
    const stats = await assetRepo.getStats();
    stats.active_agents = Object.values(agentRegistry).filter(a=>a.status==='RUNNING').length;
    stats.total_agents = Object.keys(agentRegistry).length;
    return res.json(stats);
  } catch (_) {}

  // Fallback to in-memory
  const domainCounts = catalog.reduce((a,f) => { a[f.content_domain]=(a[f.content_domain]||0)+1; return a; }, {});
  const classCounts  = catalog.reduce((a,f) => { a[f.data_classification]=(a[f.data_classification]||0)+1; return a; }, {});
  const zoneCounts   = catalog.reduce((a,f) => { a[f.classification_zone]=(a[f.classification_zone]||0)+1; return a; }, {});
  const enriched     = catalog.filter(f=>f.ai_enriched).length;
  const itar         = catalog.filter(f=>f.export_control?.itar_applicable).length;
  const pending      = approvalQueue.filter(q=>q.status==='PENDING').length;
  const avgConf      = catalog.length ? catalog.reduce((s,f)=>s+(f.classification_confidence||0),0)/catalog.length : 0;
  const avgQ         = catalog.length ? catalog.reduce((s,f)=>s+(f.quality_score||0),0)/catalog.length : 0;
  res.json({ total:catalog.length, enriched, enriched_pct:catalog.length?Math.round(enriched/catalog.length*100):0, itar_flagged:itar, pending_approvals:pending, avg_confidence:parseFloat(avgConf.toFixed(2)), avg_quality:parseFloat(avgQ.toFixed(2)), pipeline_health:catalog.length?Math.round((zoneCounts.AUTONOMOUS||0)/catalog.length*100):0, domain_counts:domainCounts, class_counts:classCounts, zone_counts:zoneCounts, active_agents:Object.values(agentRegistry).filter(a=>a.status==='RUNNING').length, total_agents:Object.keys(agentRegistry).length });
});

// ── Catalog ───────────────────────────────────────────────────────────────────
router.get('/catalog', async (req, res) => {
  const { domain, classification, zone, project, search, page=1, limit=20 } = req.query;

  // Try PostgreSQL first
  try {
    const assetRepo = require('../db/repositories/assetRepo');
    const result = await assetRepo.findAll({ domain, classification, zone, project_code: project, search }, parseInt(page), parseInt(limit));
    return res.json(result);
  } catch (_) {}

  // Fallback to in-memory
  let result = [...catalog];
  if (domain) result = result.filter(f=>f.content_domain===domain);
  if (classification) result = result.filter(f=>f.data_classification===classification);
  if (zone) result = result.filter(f=>f.classification_zone===zone);
  if (project) result = result.filter(f=>f.project_code===project);
  if (search) { const q=search.toLowerCase(); result=result.filter(f=>f.file_name?.toLowerCase().includes(q)||f.project_code?.toLowerCase().includes(q)||f.content_domain?.toLowerCase().includes(q)); }
  const total=result.length, p=parseInt(page), lim=parseInt(limit);
  res.json({ assets:result.slice((p-1)*lim,p*lim), total, page:p, pages:Math.ceil(total/lim) });
});

router.get('/catalog/:id', async (req, res) => {
  const asset = await findAsset(req.params.id);
  if (!asset) return res.status(404).json({ error:'Asset not found' });
  res.json(asset);
});

// ── Upload & Parse ────────────────────────────────────────────────────────────
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error:'No file uploaded' });
  const { originalname:name, size } = req.file;
  const sizeMb = parseFloat((size/1024/1024).toFixed(2));
  const format = detectFormat(name);
  const domain = detectDomain(format);
  const scanner = domainScannerName(domain);

  emit('AssetDiscovered', 'Pipeline Orchestrator',
    `Upload received: ${name} (${sizeMb < 1 ? (sizeMb*1024).toFixed(0)+'KB' : sizeMb.toFixed(1)+'MB'}) — routing to ${scanner}`,
    { file_name:name, format, domain, size_mb:sizeMb });

  emit('ScanStage', scanner,
    `Invoking ${format} parser for ${name}...`,
    { file_name:name, stage:'parser_invoke', format });

  const parseResult = await parseAsset(domain, format, name, sizeMb, req.file.buffer, null);

  emit('ParseComplete', scanner,
    `Parsing complete: ${name} — ${parseResult.steps.length} stages in ${parseResult.total_ms}ms (quality: ${Math.round(parseResult.quality_score*100)}%)`,
    { file_name:name, parser:parseResult.parser_used, stages:parseResult.steps.length, total_ms:parseResult.total_ms, quality:parseResult.quality_score });

  const signals    = inferContentSignals(name, domain, parseResult);
  const policyResult = evaluateClassification(signals);
  const confResult = computeConfidence(signals, policyResult.matched_rules, parseResult, name);
  const confidence = confResult.confidence;
  const zone       = determineZone(confidence, policyResult.recommended_tier);
  const zoneLabel  = { AUTONOMOUS:'auto-classified', SUPERVISED:'queued for human review', GATED:'legal approval required', PENDING_REVIEW:'escalated — low confidence' }[zone] || zone;

  const newAsset = {
    id:uuidv4(), file_name:name, content_domain:domain, asset_type:format,
    project_code:req.body.project_code||'UNASSIGNED', designer:req.body.designer||'unknown@company.com',
    file_size_mb:sizeMb, parser_used:parseResult.parser_used,
    data_classification:policyResult.recommended_tier, ip_ownership_tier:req.body.ip_tier||'FIRST_PARTY',
    export_control:{ ear_eccn:getECCN(policyResult.recommended_tier,domain), itar_applicable:false, classifier_source:'AI_AUTO' },
    quality_score:parseResult.quality_score, ai_enriched:false,
    classification_confidence:confidence, classification_zone:zone,
    lifecycle_state: zone === 'AUTONOMOUS' ? 'CLASSIFIED' : zone === 'GATED' ? 'GATED' : 'PENDING_REVIEW',
    release_status:'WIP', created_at:new Date().toISOString(), modified_at:new Date().toISOString(),
    vault_path:`/cude/uploads/${domain.toLowerCase()}/${name}`,
    [`muas_${domain.toLowerCase().replace('_document','').replace('_circuit','').replace('_recording','')}`]: parseResult.domain_metadata,
    agent_processing_log:[
      { agent:'Pipeline Orchestrator', action:'upload_dispatch', timestamp:new Date().toISOString(), result:`Routed ${name} to ${scanner}` },
      { agent:scanner, action:'parse', timestamp:new Date().toISOString(), result:`Parsed with ${parseResult.parser_used} in ${parseResult.total_ms}ms` },
    ],
    pii_flag:{ contains_pii:false, pii_types:[] },
    retention_policy: assignRetentionPolicy(policyResult.recommended_tier, new Date().toISOString()),
    parse_steps:parseResult.steps, parse_total_ms:parseResult.total_ms,
  };

  catalog.unshift(newAsset);

  emit('ClassificationProposed', 'Classification Arbiter',
    `${name} → ${policyResult.recommended_tier} (${Math.round(confidence*100)}% confidence) — ${zoneLabel}`,
    { asset_id:newAsset.id, file_name:name, tier:policyResult.recommended_tier, confidence, zone });

  // Queue non-autonomous assets for human review
  if (zone !== 'AUTONOMOUS') {
    const confPct = Math.round(confidence*100);
    const zoneReason = zone === 'GATED' ? 'Classification tier is TRADE_SECRET which requires mandatory legal approval (hard gate policy).'
      : zone === 'PENDING_REVIEW' ? `Classification confidence is ${confPct}% which is below the 70% threshold for supervised review. Manual classification is needed.`
      : `Classification confidence is ${confPct}% which is below the 90% auto-approval threshold. A data steward must verify the proposed tier.`;
    const reasoningSteps = [
      { step:1, thought:`Received uploaded file: ${name} (${domain}). Running format detection and domain-specific parser.`, action:'parse_asset', observation:`Parsed successfully with ${parseResult.parser_used} in ${parseResult.total_ms}ms. Quality score: ${Math.round(parseResult.quality_score*100)}%.` },
      { step:2, thought:`Evaluating classification signals from file metadata and content indicators.`, action:'evaluate_classification', observation:`Signals detected: [${signals.join(', ')}]. ${policyResult.matched_rules.length} policy rule(s) matched: ${policyResult.matched_rules.map(r=>`${r.id} — ${r.description} (→ ${r.tier})`).join('; ') || 'no specific rules triggered, applying default INTERNAL tier'}. Recommended tier: ${policyResult.recommended_tier}.` },
      { step:3, thought:`Assessing classification confidence to determine governance zone.`, action:'determine_zone', observation:`Confidence: ${confPct}%. ${zoneReason} Placing in ${zone} zone for steward review.` },
    ];
    const qItem = { id:uuidv4(), asset_id:newAsset.id, zone, agent:'Classification Arbiter', proposed_tier:policyResult.recommended_tier, current_tier:'UNCLASSIFIED', confidence, created_at:new Date().toISOString(), expires_at:new Date(Date.now()+172800000).toISOString(), status:'PENDING', reasoning_summary:`${name}: Classified as ${policyResult.recommended_tier} with ${confPct}% confidence. ${zoneReason}`, evidence:{ signals_detected:signals, reasoning_steps:reasoningSteps }, priority:zone==='GATED'?'CRITICAL':'HIGH' };
    approvalQueue.push(qItem);
    emit('ReviewPackageCreated', 'Classification Arbiter',
      `Review queued: ${name} — ${zone} zone, proposed tier: ${policyResult.recommended_tier}. Awaiting steward review.`,
      { asset_id:newAsset.id, zone, queue_id:qItem.id, proposed_tier:policyResult.recommended_tier });
  }

  // Audit + Index
  audit({ actor_type:'USER', actor_id:req.user?.email||'upload', action:'asset.uploaded', entity_type:'asset', entity_id:newAsset.id, after_state:{ file_name:name, domain, tier:policyResult.recommended_tier, zone, confidence } });
  indexAsset(newAsset);

  res.json({ asset:newAsset, parse_result:parseResult });
});

// ── AI Enrichment ─────────────────────────────────────────────────────────────
router.post('/enrich/:id', async (req, res) => {
  const asset = await findAsset(req.params.id);
  if (!asset) return res.status(404).json({ error:'Not found' });

  emit('EnrichmentStarted', 'Classification Arbiter',
    `Starting AI enrichment for: ${asset.file_name} (current classification: ${asset.data_classification})`,
    { asset_id:asset.id, file_name:asset.file_name, current_tier:asset.data_classification });

  emit('ScanStage', 'Classification Arbiter',
    `Gathering evidence — building rich context package (project, policies, precedents)...`,
    { asset_id:asset.id, stage:'context_building' });

  // Build rich context package per Enterprise Spec Section 5.2
  let richContext = null;
  try {
    const { buildArbiterContext } = require('./services/contextBuilder') || require('../services/contextBuilder');
    richContext = await buildArbiterContext(asset, catalog);
  } catch (_) {}

  const result = await arbitrate(asset, richContext);

  emit('ScanStage', 'Classification Arbiter',
    `Evidence gathered — ${result.policy_rules_matched?.length||0} policy rule(s) matched. Recalculating confidence...`,
    { asset_id:asset.id, rules_matched:result.policy_rules_matched, stage:'confidence_recalc' });

  asset.ai_enriched = true;
  asset.ai_enrichment = result;
  asset.classification_confidence = result.final_confidence || asset.classification_confidence;
  asset.classification_zone = result.zone || asset.classification_zone;
  asset.data_classification = result.final_tier || asset.data_classification;
  asset.modified_at = new Date().toISOString();
  asset.agent_processing_log.push({ agent:'Classification Arbiter', action:'arbitrate', timestamp:new Date().toISOString(), confidence:result.final_confidence, zone:result.zone, rules_matched:result.policy_rules_matched });

  if (result.requires_human && result.zone !== 'AUTONOMOUS') {
    const qItem = { id:uuidv4(), asset_id:asset.id, zone:result.zone, agent:'Classification Arbiter', proposed_tier:result.final_tier, current_tier:asset.data_classification, confidence:result.final_confidence, created_at:new Date().toISOString(), expires_at:new Date(Date.now()+172800000).toISOString(), status:'PENDING', reasoning_summary:result.rationale, evidence:{ signals_detected:result.policy_rules_matched||[], reasoning_steps:result.reasoning_steps }, priority:result.zone==='GATED'?'CRITICAL':'HIGH' };
    approvalQueue.push(qItem);
    emit('ReviewPackageCreated', 'Classification Arbiter',
      `Review package created for ${asset.file_name} — ${result.zone} zone, proposed tier: ${result.final_tier}. Queued for steward review.`,
      { asset_id:asset.id, zone:result.zone, queue_id:qItem.id, proposed_tier:result.final_tier });
  } else {
    emit('ClassificationComplete', 'Classification Arbiter',
      `${asset.file_name} classified as ${result.final_tier} (${Math.round((result.final_confidence||0)*100)}% confidence) — auto-approved`,
      { asset_id:asset.id, tier:result.final_tier, confidence:result.final_confidence, zone:result.zone });
  }

  audit({ actor_type:'AGENT', actor_id:'Classification Arbiter', action:'asset.enriched', entity_type:'asset', entity_id:asset.id, after_state:{ tier:result.final_tier, confidence:result.final_confidence, zone:result.zone } });
  indexAsset(asset);
  res.json({ asset, enrichment:result });
});

// ── Agents ────────────────────────────────────────────────────────────────────
router.get('/agents', (req, res) => res.json(Object.values(agentRegistry)));

router.post('/agents/:id/run', async (req, res) => {
  const agentId  = req.params.id;
  const agent    = agentRegistry[agentId];
  if (!agent) return res.status(404).json({ error:'Agent not found' });
  const agentName = agent.name;
  const task      = req.body.task || 'General run';

  emit('AgentTaskStarted', agentName,
    `${agentName} starting task: ${task.substring(0,100)}`,
    { task });

  let result;

  if (agentId === 'A3_INVESTIGATOR') {
    const targetId = req.body.asset_id || catalog[0]?.id;
    const target   = catalog.find(a=>a.id===targetId);
    emit('ScanStage', agentName,
      `Traversing knowledge graph — looking for cross-domain links${target?' for: '+target.file_name:''}...`,
      { stage:'graph_traversal', asset_id:targetId });
    result = await investigate(targetId, catalog);
    emit('RelationshipFound', agentName,
      `Investigation complete — ${result.relationships?.length||0} cross-domain relationship(s) discovered. ${result.summary||''}`,
      { relationships:result.relationships?.length||0, summary:result.summary });

  } else if (agentId === 'A4_ARBITER') {
    const target = catalog.find(a=>a.classification_zone==='SUPERVISED') || catalog[0];
    if (target) {
      emit('ScanStage', agentName,
        `Evaluating ambiguous classification for: ${target.file_name} (current confidence: ${Math.round((target.classification_confidence||0)*100)}%)`,
        { stage:'evidence_gathering', file_name:target.file_name, confidence:target.classification_confidence });
      result = await arbitrate(target);
      emit('ReviewPackageCreated', agentName,
        `Classification Arbiter decision: ${target.file_name} → ${result.final_tier} (${Math.round((result.final_confidence||0)*100)}%) — ${result.zone}`,
        { file_name:target.file_name, final_tier:result.final_tier, zone:result.zone, confidence:result.final_confidence });
    } else {
      result = { summary:'No supervised-zone assets found to arbitrate.' };
      emit('AgentTaskComplete', agentName, 'No assets in supervised zone — nothing to arbitrate', {});
    }

  } else if (agentId === 'A5_MONITOR') {
    emit('ScanStage', agentName,
      `Running governance health check across all ${catalog.length} catalogued assets...`,
      { stage:'health_check', catalog_size:catalog.length });
    result = { alerts: await monitorAlerts(catalog) };
    const critical = result.alerts.filter(a=>a.severity==='CRITICAL').length;
    const high = result.alerts.filter(a=>a.severity==='HIGH').length;
    emit('AlertGenerated', agentName,
      `Governance check complete — ${result.alerts.length} alert(s) raised (${critical} critical, ${high} high)`,
      { alert_count:result.alerts.length, critical, high });

  } else if (agentId === 'A6_REPORTER') {
    emit('ScanStage', agentName,
      `Traversing catalog, access logs, and lineage graph to build compliance report (${catalog.length} assets)...`,
      { stage:'evidence_collection', catalog_size:catalog.length });
    result = await generateReport(catalog);
    emit('ReportGenerated', agentName,
      `Compliance report ready — Risk score: ${result.risk_score}, Compliance score: ${result.compliance_score}%, Status: ${result.export_control_status}`,
      { risk_score:result.risk_score, compliance_score:result.compliance_score, export_control_status:result.export_control_status });

  } else {
    // Discovery agents (A1, A2_*)
    emit('ScanStage', agentName,
      `${agentName} executing: ${task.substring(0,80)}...`,
      { stage:'scan', task });
    result = await agentReason(agentId, task, { catalog_size:catalog.length });
    emit('AgentTaskComplete', agentName,
      `${agentName} task complete: ${(result.conclusion||'').substring(0,100)}`,
      { conclusion:result.conclusion, recommended_action:result.recommended_action });
  }

  if (agentRegistry[agentId]) {
    agentRegistry[agentId].last_action = (result.summary||result.conclusion||'Task completed').substring(0,120);
    agentRegistry[agentId].jobs_processed += 1;
    agentRegistry[agentId].tool_calls_today += result.reasoning_steps?.length || 1;
    agentRegistry[agentId].status = 'RUNNING';
    setTimeout(() => { if(agentRegistry[agentId]) agentRegistry[agentId].status='IDLE'; }, 6000);
  }

  res.json({ agent:agentId, result });
});

// ── Investigate ───────────────────────────────────────────────────────────────
router.post('/investigate/:id', async (req, res) => {
  const asset = await findAsset(req.params.id);
  emit('InvestigationStarted', 'Relationship Investigator',
    `Starting cross-domain investigation${asset?' for: '+asset.file_name:''} — traversing knowledge graph...`,
    { asset_id:req.params.id });
  emit('ScanStage', 'Relationship Investigator',
    `Querying entity references, traversing relationship edges up to depth 6...`,
    { stage:'graph_traversal', asset_id:req.params.id });
  const result = await investigate(req.params.id, catalog);

  // H6: Persist agent-discovered relationships to DB + Neo4j
  if (result.relationships?.length > 0) {
    try {
      const graphService = require('../services/graphService');
      const { query: dbQuery } = require('../db/pool');
      for (const rel of result.relationships) {
        const relType = (rel.relationship_type || 'REFERENCES_IP').toUpperCase().replace(/[-\s]+/g, '_').replace(/[^A-Z_]/g, '');
        // Neo4j
        if (graphService.isAvailable()) {
          graphService.createRelationship(req.params.id, rel.asset_id, relType, rel.confidence || 0.7, rel.rationale || '').catch(() => {});
        }
        // PostgreSQL
        try {
          await dbQuery(
            `INSERT INTO asset_relationships (source_asset_id, target_asset_id, relationship_type, confidence, evidence, project_id)
             VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (source_asset_id, target_asset_id, relationship_type) DO NOTHING`,
            [req.params.id, rel.asset_id, relType, rel.confidence || 0.7,
             JSON.stringify({ rationale: rel.rationale, agent_discovered: true }),
             asset?.project_id || null]
          );
        } catch (_) {}
      }
    } catch (_) {}
  }

  emit('RelationshipFound', 'Relationship Investigator',
    `Investigation complete — ${result.relationships?.length||0} relationship(s) found and persisted. ${result.summary||''}`,
    { relationships:result.relationships?.length||0, asset_id:req.params.id });
  res.json(result);
});

router.get('/relationships', async (req, res) => {
  // Try Neo4j first for real persistent graph
  try {
    const graphService = require('../services/graphService');
    if (graphService.isAvailable()) {
      const projectCode = req.query.project || req.query.project_code;
      // Build active asset ID set from PostgreSQL to filter stale Neo4j nodes
      const { query: dbQuery } = require('../db/pool');
      const pgResult = await dbQuery('SELECT id FROM assets');
      const activeAssetIds = new Set(pgResult.rows.map(r => r.id));
      // Pass projectCode (or null for all projects) and active set as filter
      const graph = await graphService.getProjectGraph(projectCode || null, 500, activeAssetIds);
      if (graph && graph.nodes.length > 0) return res.json({ ...graph, source: 'neo4j' });
    }
  } catch (_) {}

  // Fallback: build graph from PostgreSQL asset_relationships table (real persisted relationships)
  try {
    const { query: dbQuery } = require('../db/pool');
    const relResult = await dbQuery(
      `SELECT ar.source_asset_id, ar.target_asset_id, ar.relationship_type, ar.confidence,
              a1.file_name as source_name, a1.content_domain as source_domain, a1.data_classification as source_class, a1.classification_zone as source_zone, a1.classification_confidence as source_conf, a1.project_code as source_project,
              a2.file_name as target_name, a2.content_domain as target_domain, a2.data_classification as target_class, a2.classification_zone as target_zone, a2.classification_confidence as target_conf, a2.project_code as target_project
       FROM asset_relationships ar
       JOIN assets a1 ON ar.source_asset_id = a1.id
       JOIN assets a2 ON ar.target_asset_id = a2.id
       ORDER BY ar.confidence DESC LIMIT 1000`
    );
    if (relResult.rows.length > 0) {
      const nodesMap = {};
      const edges = [];
      for (const r of relResult.rows) {
        nodesMap[r.source_asset_id] = { id: r.source_asset_id, label: r.source_name?.length > 28 ? r.source_name.substring(0,25)+'...' : r.source_name, full_name: r.source_name, domain: r.source_domain, classification: r.source_class, zone: r.source_zone, confidence: r.source_conf, project: r.source_project };
        nodesMap[r.target_asset_id] = { id: r.target_asset_id, label: r.target_name?.length > 28 ? r.target_name.substring(0,25)+'...' : r.target_name, full_name: r.target_name, domain: r.target_domain, classification: r.target_class, zone: r.target_zone, confidence: r.target_conf, project: r.target_project };
        edges.push({ source: r.source_asset_id, target: r.target_asset_id, relationship: r.relationship_type, confidence: parseFloat(r.confidence) });
      }
      // Add orphan assets (those not in any relationship)
      const allAssets = await dbQuery('SELECT id, file_name, content_domain, data_classification, classification_zone, classification_confidence, project_code FROM assets WHERE id != ALL($1) LIMIT 500', [Object.keys(nodesMap)]);
      for (const a of allAssets.rows) {
        nodesMap[a.id] = { id: a.id, label: a.file_name?.length > 28 ? a.file_name.substring(0,25)+'...' : a.file_name, full_name: a.file_name, domain: a.content_domain, classification: a.data_classification, zone: a.classification_zone, confidence: a.classification_confidence, project: a.project_code };
      }
      return res.json({ nodes: Object.values(nodesMap), edges, source: 'postgresql' });
    }
  } catch (_) {}

  // Final fallback: build from asset list only (no relationships)
  let assetList = catalog.slice(0, 30);
  if (assetList.length === 0) {
    try {
      const assetRepo = require('../db/repositories/assetRepo');
      const dbResult = await assetRepo.findAll({}, 1, 30);
      assetList = dbResult.assets || [];
    } catch (_) {}
  }

  const nodes = assetList.map(a=>({ id:a.id, label:(a.file_name||'').length>28?a.file_name.substring(0,25)+'...':a.file_name, full_name:a.file_name, domain:a.content_domain, classification:a.data_classification, zone:a.classification_zone, confidence:a.classification_confidence, project:a.project_code }));
  res.json({ nodes, edges: [], source: 'catalog_only' });
});

// ── Ontology Schema API ─────────────────────────────────────────────────────
router.get('/ontology/domains', async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    const result = await dbQuery('SELECT * FROM ontology_domains ORDER BY priority ASC, label ASC');
    res.json({ domains: result.rows });
  } catch (e) {
    // Fallback to hardcoded defaults
    res.json({ domains: [
      { domain_code:'ELECTRONIC_CIRCUIT', label:'Electronic Circuit', color:'#8b5cf6', initials:'E', icon:'🔲', enabled:true },
      { domain_code:'PDF_DOCUMENT', label:'PDF Document', color:'#ef4444', initials:'P', icon:'📄', enabled:true },
      { domain_code:'OFFICE_DOCUMENT', label:'Office Document', color:'#3b82f6', initials:'O', icon:'📊', enabled:true },
      { domain_code:'AUDIO', label:'Audio Recording', color:'#10b981', initials:'A', icon:'🎙️', enabled:true },
      { domain_code:'VIDEO', label:'Video Content', color:'#14b8a6', initials:'V', icon:'🎬', enabled:true },
    ]});
  }
});

router.post('/ontology/domains', async (req, res) => {
  const { domain_code, label, description, color, initials, icon, properties } = req.body;
  if (!domain_code || !label) return res.status(400).json({ error: 'domain_code and label are required' });
  try {
    const { query: dbQuery } = require('../db/pool');
    const result = await dbQuery(
      `INSERT INTO ontology_domains (domain_code, label, description, color, initials, icon, properties)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (domain_code) DO UPDATE SET label=$2, description=$3, color=$4, initials=$5, icon=$6, properties=$7, updated_at=now()
       RETURNING *`,
      [domain_code.toUpperCase().replace(/[^A-Z_]/g, ''), label, description || '', color || '#64748b', initials || label[0], icon || '📄', JSON.stringify(properties || [])]
    );
    res.status(201).json({ domain: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/ontology/domains/:id', async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    const fields = ['label','description','color','initials','icon','enabled','priority','properties','parent_code','is_abstract'].filter(f => req.body[f] !== undefined);
    if (!fields.length) return res.json({ domain: null });
    const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const values = fields.map(f => f === 'properties' ? JSON.stringify(req.body[f]) : req.body[f]);
    const result = await dbQuery(`UPDATE ontology_domains SET ${sets}, updated_at=now() WHERE id=$1 RETURNING *`, [req.params.id, ...values]);
    res.json({ domain: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/ontology/domains/:id', async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    await dbQuery('DELETE FROM ontology_domains WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/ontology/relationships', async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    const result = await dbQuery('SELECT * FROM ontology_relationships ORDER BY priority ASC, label ASC');
    res.json({ relationships: result.rows });
  } catch (e) {
    res.json({ relationships: [
      { relationship_code:'DOCUMENTS_CIRCUIT', label:'Documents Circuit', color:'#8b5cf6', abbreviation:'DOC', is_structural:false },
      { relationship_code:'REFERENCES_IP', label:'References IP', color:'#f59e0b', abbreviation:'REF', is_structural:false },
      { relationship_code:'DERIVED_FROM', label:'Derived From', color:'#ec4899', abbreviation:'DER', is_structural:false },
    ]});
  }
});

router.post('/ontology/relationships', async (req, res) => {
  const { relationship_code, label, description, color, abbreviation, source_domain, target_domain, is_structural } = req.body;
  if (!relationship_code || !label) return res.status(400).json({ error: 'relationship_code and label are required' });
  try {
    const { query: dbQuery } = require('../db/pool');
    const result = await dbQuery(
      `INSERT INTO ontology_relationships (relationship_code, label, description, color, abbreviation, source_domain, target_domain, is_structural)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (relationship_code) DO UPDATE SET label=$2, description=$3, color=$4, abbreviation=$5, source_domain=$6, target_domain=$7, updated_at=now()
       RETURNING *`,
      [relationship_code.toUpperCase().replace(/[^A-Z_]/g, ''), label, description || '', color || '#64748b', abbreviation || label.substring(0, 3).toUpperCase(), source_domain || null, target_domain || null, is_structural || false]
    );
    res.status(201).json({ relationship: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/ontology/relationships/:id', async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    const fields = ['label','description','color','abbreviation','source_domain','target_domain','enabled','priority','cardinality','inverse_code','parent_code'].filter(f => req.body[f] !== undefined);
    if (!fields.length) return res.json({ relationship: null });
    const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const values = fields.map(f => req.body[f]);
    const result = await dbQuery(`UPDATE ontology_relationships SET ${sets}, updated_at=now() WHERE id=$1 RETURNING *`, [req.params.id, ...values]);
    res.json({ relationship: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/ontology/relationships/:id', async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    await dbQuery('DELETE FROM ontology_relationships WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Ontology Template Application ───────────────────────────────────────────
router.post('/ontology/apply-template', async (req, res) => {
  const { template } = req.body;
  const { TEMPLATES } = require('../data/ontologyTemplates');
  if (!TEMPLATES[template]) return res.status(400).json({ error: `Unknown template: ${template}. Available: ${Object.keys(TEMPLATES).join(', ')}` });

  try {
    const { applyTemplateToOntology } = require('../services/ontologyTemplateService');
    const { query: dbQuery } = require('../db/pool');
    const result = await applyTemplateToOntology(template);

    audit({ actor_type:'USER', actor_id:req.user?.email||'admin', action:'ontology.template_applied',
      entity_type:'ontology', entity_id:template, after_state:{ template, ...result.counts } });

    // Return the full updated schema
    const domains = await dbQuery('SELECT * FROM ontology_domains ORDER BY priority');
    const relationships = await dbQuery('SELECT * FROM ontology_relationships ORDER BY priority');
    const glossary = await dbQuery('SELECT * FROM business_terms ORDER BY category, term');

    res.json({
      template: result.template, applied: true,
      standards: result.standards,
      domains: domains.rows, relationships: relationships.rows, glossary: glossary.rows,
      counts: result.counts,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/ontology/templates', (req, res) => {
  const { TEMPLATES } = require('../data/ontologyTemplates');
  const list = Object.entries(TEMPLATES).map(([key, t]) => {
    const propCount = t.properties
      ? Object.values(t.properties).reduce((s, arr) => s + arr.length, 0)
      : 0;
    return {
      key, name: t.name, description: t.description,
      standards: t.standards || [],
      domains: t.domains.length,
      relationships: t.relationships.length,
      properties: propCount,
      glossary: (t.glossary || []).length,
    };
  });
  res.json({ templates: list });
});

// Ontology usage stats — asset counts, relationship usage, cross-domain matrix
router.get('/ontology/stats', async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');

    // Asset count per entity type
    const domainCounts = await dbQuery(
      `SELECT content_domain as code, COUNT(*) as count
       FROM assets WHERE content_domain IS NOT NULL
       GROUP BY content_domain ORDER BY count DESC`
    );

    // Relationship usage count per type
    const relCounts = await dbQuery(
      `SELECT relationship_type as code, COUNT(*) as count
       FROM asset_relationships
       WHERE relationship_type NOT IN ('SAME_PROJECT','BELONGS_TO','SAME_ENTITY')
       GROUP BY relationship_type ORDER BY count DESC`
    );

    // Cross-domain matrix: which entity types are connected by which relationships
    const matrix = await dbQuery(
      `SELECT a1.content_domain as source_domain, a2.content_domain as target_domain,
              ar.relationship_type, COUNT(*) as count
       FROM asset_relationships ar
       JOIN assets a1 ON ar.source_asset_id = a1.id
       JOIN assets a2 ON ar.target_asset_id = a2.id
       WHERE ar.relationship_type NOT IN ('SAME_PROJECT','BELONGS_TO','SAME_ENTITY')
       AND a1.content_domain IS NOT NULL AND a2.content_domain IS NOT NULL
       GROUP BY a1.content_domain, a2.content_domain, ar.relationship_type
       ORDER BY count DESC`
    );

    // Total counts
    const totals = await dbQuery(`SELECT
      (SELECT COUNT(*) FROM assets) as asset_count,
      (SELECT COUNT(*) FROM asset_relationships WHERE relationship_type NOT IN ('SAME_PROJECT','BELONGS_TO','SAME_ENTITY')) as relationship_count,
      (SELECT COUNT(*) FROM business_terms) as concept_count`);

    res.json({
      domainCounts: Object.fromEntries(domainCounts.rows.map(r => [r.code, parseInt(r.count)])),
      relationshipCounts: Object.fromEntries(relCounts.rows.map(r => [r.code, parseInt(r.count)])),
      matrix: matrix.rows.map(r => ({
        source: r.source_domain, target: r.target_domain,
        relationship: r.relationship_type, count: parseInt(r.count),
      })),
      totals: {
        assets: parseInt(totals.rows[0].asset_count),
        relationships: parseInt(totals.rows[0].relationship_count),
        concepts: parseInt(totals.rows[0].concept_count),
      },
    });
  } catch (e) {
    res.json({ domainCounts: {}, relationshipCounts: {}, matrix: [], totals: {}, error: e.message });
  }
});

// ── Ontology Properties (entity-type schema attributes) ─────────────────────

router.get('/ontology/properties', async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    const { domain } = req.query;
    const rows = domain
      ? (await dbQuery('SELECT * FROM ontology_properties WHERE domain_code = $1 ORDER BY display_order, property_label', [domain])).rows
      : (await dbQuery('SELECT * FROM ontology_properties ORDER BY domain_code, display_order, property_label')).rows;
    res.json({ properties: rows });
  } catch (e) { res.json({ properties: [], error: e.message }); }
});

router.get('/ontology/properties/:domainCode', async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    const result = await dbQuery(
      'SELECT * FROM ontology_properties WHERE domain_code = $1 ORDER BY display_order, property_label',
      [req.params.domainCode]
    );
    res.json({ properties: result.rows });
  } catch (e) { res.json({ properties: [], error: e.message }); }
});

router.post('/ontology/properties', async (req, res) => {
  const { domain_code, property_name, property_label, data_type, is_required, is_unique, default_value, enum_values, reference_domain, description, display_order } = req.body;
  if (!domain_code || !property_name || !property_label) {
    return res.status(400).json({ error: 'domain_code, property_name and property_label are required' });
  }
  try {
    const { query: dbQuery } = require('../db/pool');
    const pn = property_name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const result = await dbQuery(
      `INSERT INTO ontology_properties
         (domain_code, property_name, property_label, data_type, is_required, is_unique,
          default_value, enum_values, reference_domain, description, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (domain_code, property_name) DO UPDATE
         SET property_label=$3, data_type=$4, is_required=$5, is_unique=$6,
             default_value=$7, enum_values=$8, reference_domain=$9, description=$10,
             display_order=$11, updated_at=now()
       RETURNING *`,
      [
        domain_code, pn, property_label,
        data_type || 'text',
        !!is_required, !!is_unique,
        default_value || null,
        Array.isArray(enum_values) && enum_values.length ? enum_values : null,
        reference_domain || null,
        description || '',
        display_order ?? 50,
      ]
    );
    res.status(201).json({ property: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/ontology/properties/:id', async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    const fields = ['property_label','data_type','is_required','is_unique','default_value','enum_values','reference_domain','description','display_order']
      .filter(f => req.body[f] !== undefined);
    if (!fields.length) return res.json({ property: null });
    const sets = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const values = fields.map(f => {
      if (f === 'enum_values') return Array.isArray(req.body[f]) && req.body[f].length ? req.body[f] : null;
      return req.body[f];
    });
    const result = await dbQuery(
      `UPDATE ontology_properties SET ${sets}, updated_at=now() WHERE id=$1 RETURNING *`,
      [req.params.id, ...values]
    );
    res.json({ property: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/ontology/properties/:id', async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    await dbQuery('DELETE FROM ontology_properties WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Ontology Validation (schema-violation detector) ─────────────────────────
// Scans assets and relationships against the active ontology and reports
// constraint violations: missing required properties, cardinality breaches,
// references to disabled / unknown entity types.
router.get('/ontology/violations', async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');

    // Active schema snapshot
    const props = (await dbQuery('SELECT * FROM ontology_properties')).rows;
    const domains = (await dbQuery('SELECT * FROM ontology_domains')).rows;
    const rels    = (await dbQuery('SELECT * FROM ontology_relationships')).rows;

    const requiredByDomain = {};
    for (const p of props) {
      if (!p.is_required) continue;
      (requiredByDomain[p.domain_code] = requiredByDomain[p.domain_code] || []).push(p);
    }
    const enabledDomains = new Set(domains.filter(d => d.enabled !== false).map(d => d.domain_code));
    const cardinalityByRel = Object.fromEntries(rels.map(r => [r.relationship_code, r.cardinality || 'N:M']));

    const violations = [];

    // 1) Missing required properties on assets
    if (Object.keys(requiredByDomain).length) {
      const domainCodes = Object.keys(requiredByDomain);
      const assets = (await dbQuery(
        `SELECT id, file_name, content_domain, domain_metadata, raw_metadata FROM assets WHERE content_domain = ANY($1::text[])`,
        [domainCodes]
      )).rows;
      for (const a of assets) {
        const meta = { ...(a.domain_metadata || {}), ...(a.raw_metadata || {}) };
        for (const p of requiredByDomain[a.content_domain] || []) {
          const present = meta[p.property_name] !== undefined && meta[p.property_name] !== null && meta[p.property_name] !== '';
          if (!present) {
            violations.push({
              severity: 'warning',
              kind: 'missing_required_property',
              asset_id: a.id,
              asset_name: a.file_name,
              entity_type: a.content_domain,
              property: p.property_name,
              message: `${a.file_name}: missing required property "${p.property_label}"`,
            });
          }
        }
      }
    }

    // 2) Assets pointing to disabled or unknown entity types
    const orphanDomains = (await dbQuery(
      `SELECT id, file_name, content_domain FROM assets
       WHERE content_domain IS NOT NULL AND content_domain NOT IN (
         SELECT domain_code FROM ontology_domains WHERE enabled = true
       )`
    )).rows;
    for (const a of orphanDomains) {
      violations.push({
        severity: 'error',
        kind: 'unknown_entity_type',
        asset_id: a.id,
        asset_name: a.file_name,
        entity_type: a.content_domain,
        message: `${a.file_name}: references disabled or unknown entity type "${a.content_domain}"`,
      });
    }

    // 3) Cardinality violations — only 1:1 and 1:N are easily checkable
    for (const r of rels) {
      if (r.is_structural) continue;
      const card = (r.cardinality || 'N:M').toUpperCase();
      if (card === 'N:M') continue;
      // For 1:1 or 1:N: each source asset may have at most 1 outgoing edge of this type
      if (card === '1:1' || card === '1:N' || card === 'N:1') {
        const sourceCol = (card === 'N:1') ? 'target_asset_id' : 'source_asset_id';
        const offenders = await dbQuery(
          `SELECT ${sourceCol} as offender, COUNT(*) as c
           FROM asset_relationships
           WHERE relationship_type = $1
           GROUP BY ${sourceCol} HAVING COUNT(*) > 1`,
          [r.relationship_code]
        );
        for (const o of offenders.rows) {
          const name = (await dbQuery('SELECT file_name FROM assets WHERE id = $1', [o.offender])).rows[0]?.file_name || o.offender;
          violations.push({
            severity: 'error',
            kind: 'cardinality_violation',
            relationship: r.relationship_code,
            asset_id: o.offender,
            asset_name: name,
            count: parseInt(o.c),
            message: `${r.label} is ${card} but "${name}" has ${o.c} edges`,
          });
        }
      }
    }

    res.json({
      violations,
      summary: {
        total: violations.length,
        errors: violations.filter(v => v.severity === 'error').length,
        warnings: violations.filter(v => v.severity === 'warning').length,
      },
    });
  } catch (e) {
    res.json({ violations: [], summary: { total: 0, errors: 0, warnings: 0 }, error: e.message });
  }
});

// ── Enterprise Graph API ────────────────────────────────────────────────────
const STRUCTURAL_EDGES = new Set(['SAME_PROJECT', 'BELONGS_TO']);

// Compute graph stats directly from PostgreSQL (always works, even when Neo4j is down)
async function computeStatsFromPostgres() {
  const { query: dbQuery } = require('../db/pool');
  const stats = { available: true, nodeCount: 0, edgeCount: 0, density: 0, avgDegree: 0, orphanedNodes: 0, relationshipTypes: {}, domainDistribution: {}, conceptNodes: 0 };

  // Node count
  const nc = await dbQuery('SELECT COUNT(*) as c FROM assets');
  stats.nodeCount = parseInt(nc.rows[0].c) || 0;

  // Edge count (semantic only — exclude structural)
  const ec = await dbQuery(
    `SELECT COUNT(*) as c FROM asset_relationships WHERE relationship_type NOT IN ('SAME_PROJECT','BELONGS_TO','SAME_ENTITY')`
  );
  stats.edgeCount = parseInt(ec.rows[0].c) || 0;

  // Relationship type distribution
  const rd = await dbQuery(
    `SELECT relationship_type as t, COUNT(*) as c FROM asset_relationships
     WHERE relationship_type NOT IN ('SAME_PROJECT','BELONGS_TO','SAME_ENTITY')
     GROUP BY relationship_type ORDER BY c DESC`
  );
  rd.rows.forEach(r => { stats.relationshipTypes[r.t] = parseInt(r.c); });

  // Domain distribution
  const dd = await dbQuery(
    `SELECT content_domain as d, COUNT(*) as c FROM assets WHERE content_domain IS NOT NULL GROUP BY content_domain ORDER BY c DESC`
  );
  dd.rows.forEach(r => { stats.domainDistribution[r.d] = parseInt(r.c); });

  // Orphan count (assets with no semantic relationships)
  const oc = await dbQuery(
    `SELECT COUNT(*) as c FROM assets a
     WHERE NOT EXISTS (
       SELECT 1 FROM asset_relationships ar
       WHERE (ar.source_asset_id = a.id OR ar.target_asset_id = a.id)
       AND ar.relationship_type NOT IN ('SAME_PROJECT','BELONGS_TO','SAME_ENTITY')
     )`
  );
  stats.orphanedNodes = parseInt(oc.rows[0].c) || 0;

  // Concept nodes (from business_terms)
  try {
    const cc = await dbQuery('SELECT COUNT(*) as c FROM business_terms');
    stats.conceptNodes = parseInt(cc.rows[0].c) || 0;
  } catch (_) {}

  // Density and avg degree
  stats.density = stats.nodeCount > 1 ? parseFloat(((2 * stats.edgeCount) / (stats.nodeCount * (stats.nodeCount - 1))).toFixed(4)) : 0;
  stats.avgDegree = stats.nodeCount > 0 ? parseFloat(((2 * stats.edgeCount) / stats.nodeCount).toFixed(2)) : 0;

  return stats;
}

router.get('/graph/stats', async (req, res) => {
  try {
    // Try Neo4j first
    const graphService = require('../services/graphService');
    if (graphService.isAvailable()) {
      const neoStats = await graphService.getGraphStatistics();
      if (neoStats && neoStats.nodeCount > 0) {
        // Filter structural edges
        if (neoStats.relationshipTypes) {
          let semanticEdgeCount = 0;
          const filtered = {};
          for (const [type, count] of Object.entries(neoStats.relationshipTypes)) {
            if (!STRUCTURAL_EDGES.has(type)) { filtered[type] = count; semanticEdgeCount += count; }
          }
          neoStats.relationshipTypes = filtered;
          neoStats.edgeCount = semanticEdgeCount;
        }
        // Use PostgreSQL node count as ground truth
        try {
          const { query: dbQuery } = require('../db/pool');
          const pgCount = await dbQuery('SELECT COUNT(*) as c FROM assets');
          neoStats.nodeCount = parseInt(pgCount.rows[0].c) || neoStats.nodeCount;
        } catch (_) {}
        neoStats.density = neoStats.nodeCount > 1 ? parseFloat(((2 * neoStats.edgeCount) / (neoStats.nodeCount * (neoStats.nodeCount - 1))).toFixed(4)) : 0;
        neoStats.avgDegree = neoStats.nodeCount > 0 ? parseFloat(((2 * neoStats.edgeCount) / neoStats.nodeCount).toFixed(2)) : 0;
        return res.json({ available: true, ...neoStats });
      }
    }
    // Fallback: compute from PostgreSQL
    const stats = await computeStatsFromPostgres();
    res.json(stats);
  } catch (e) {
    try {
      const stats = await computeStatsFromPostgres();
      res.json(stats);
    } catch (e2) {
      res.json({ available: false, nodeCount: 0, edgeCount: 0, error: e2.message });
    }
  }
});

router.get('/graph/top-connected', async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  try {
    // Try Neo4j first (cleaned via startup reconciliation)
    const graphService = require('../services/graphService');
    const { query: dbQuery } = require('../db/pool');

    if (graphService.isAvailable()) {
      const neo4jAssets = await graphService.getMostConnectedAssets(limit);
      if (neo4jAssets && neo4jAssets.length > 0) {
        // Cross-check with PostgreSQL to filter any remaining stale nodes
        const pgResult = await dbQuery('SELECT id FROM assets');
        const activeIds = new Set(pgResult.rows.map(r => r.id));
        const filtered = neo4jAssets.filter(a => activeIds.has(a.id));
        if (filtered.length > 0) return res.json({ assets: filtered });
      }
    }

    // Fallback to PostgreSQL
    const result = await dbQuery(
      `SELECT a.id, a.file_name as name, a.content_domain as domain, a.data_classification as classification,
              a.classification_zone as zone, a.project_code as project, COUNT(ar.id) as degree,
              array_agg(DISTINCT ar.relationship_type) as rel_types
       FROM assets a
       JOIN asset_relationships ar ON (a.id = ar.source_asset_id OR a.id = ar.target_asset_id)
       WHERE ar.relationship_type NOT IN ('SAME_PROJECT','BELONGS_TO','SAME_ENTITY')
       GROUP BY a.id, a.file_name, a.content_domain, a.data_classification, a.classification_zone, a.project_code
       ORDER BY degree DESC LIMIT $1`,
      [limit]
    );
    const assets = result.rows.map(r => ({
      id: r.id, name: r.name, domain: r.domain,
      classification: r.classification, zone: r.zone, project: r.project,
      degree: parseInt(r.degree),
      relationshipTypes: r.rel_types || [],
    }));
    res.json({ assets });
  } catch (e) { res.json({ assets: [], error: e.message }); }
});

router.get('/graph/orphaned', async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  try {
    // Use PostgreSQL as source of truth (Neo4j may contain stale data)
    const { query: dbQuery } = require('../db/pool');
    const result = await dbQuery(
      `SELECT a.id, a.file_name as name, a.content_domain as domain,
              a.data_classification as classification, a.classification_zone as zone, a.project_code as project
       FROM assets a
       WHERE NOT EXISTS (
         SELECT 1 FROM asset_relationships ar
         WHERE (ar.source_asset_id = a.id OR ar.target_asset_id = a.id)
         AND ar.relationship_type NOT IN ('SAME_PROJECT','BELONGS_TO','SAME_ENTITY')
       )
       LIMIT $1`,
      [limit]
    );
    const assets = result.rows.map(r => ({
      id: r.id, name: r.name, domain: r.domain,
      classification: r.classification, zone: r.zone, project: r.project,
    }));
    res.json({ assets });
  } catch (e) { res.json({ assets: [], error: e.message }); }
});

router.get('/graph/neighbors/:id', async (req, res) => {
  try {
    const graphService = require('../services/graphService');
    if (!graphService.isAvailable()) return res.json({ neighbors: [] });
    const neighbors = await graphService.getNeighbors(req.params.id, parseInt(req.query.depth) || 1, parseInt(req.query.limit) || 50);
    res.json({ neighbors: neighbors || [] });
  } catch (e) { res.json({ neighbors: [] }); }
});

router.get('/graph/shortest-path', async (req, res) => {
  const { source, target } = req.query;
  if (!source || !target) return res.status(400).json({ error: 'source and target are required' });
  try {
    const graphService = require('../services/graphService');
    if (!graphService.isAvailable()) return res.json({ found: false });
    const path = await graphService.findShortestPath(source, target);
    res.json(path || { found: false });
  } catch (e) { res.json({ found: false, error: e.message }); }
});

router.get('/graph/all-paths', async (req, res) => {
  const { source, target } = req.query;
  if (!source || !target) return res.status(400).json({ error: 'source and target are required' });
  try {
    const graphService = require('../services/graphService');
    if (!graphService.isAvailable()) return res.json({ paths: [] });
    const paths = await graphService.findAllPaths(source, target, parseInt(req.query.maxDepth) || 4);
    res.json({ paths: paths || [] });
  } catch (e) { res.json({ paths: [] }); }
});

router.get('/graph/impact/:id', async (req, res) => {
  try {
    const graphService = require('../services/graphService');
    let impacted = [];
    if (graphService.isAvailable()) {
      impacted = await graphService.getImpactAnalysis(req.params.id, parseInt(req.query.depth) || 3) || [];
    }
    // Fallback / supplement from PostgreSQL asset_relationships
    if (impacted.length === 0) {
      try {
        const { query: dbQuery } = require('../db/pool');
        const result = await dbQuery(
          `WITH RECURSIVE impact_chain AS (
             SELECT target_asset_id as id, 1 as distance, relationship_type
             FROM asset_relationships WHERE source_asset_id = $1
             UNION
             SELECT ar.target_asset_id, ic.distance + 1, ar.relationship_type
             FROM asset_relationships ar JOIN impact_chain ic ON ar.source_asset_id = ic.id
             WHERE ic.distance < $2
           )
           SELECT DISTINCT a.id, a.file_name as name, a.content_domain as domain,
                  a.data_classification as classification, a.classification_zone as zone,
                  MIN(ic.distance) as distance
           FROM impact_chain ic
           JOIN assets a ON ic.id = a.id
           WHERE a.id != $1
           GROUP BY a.id, a.file_name, a.content_domain, a.data_classification, a.classification_zone
           ORDER BY distance ASC LIMIT 20`,
          [req.params.id, parseInt(req.query.depth) || 3]
        );
        impacted = result.rows.map(r => ({
          id: r.id, name: r.name, domain: r.domain,
          classification: r.classification, zone: r.zone,
          distance: parseInt(r.distance), viaRelationships: [],
        }));
      } catch (_) {}
    }
    res.json({ impacted, source_id: req.params.id });
  } catch (e) { res.json({ impacted: [] }); }
});

router.get('/graph/export', async (req, res) => {
  try {
    const graphService = require('../services/graphService');
    if (!graphService.isAvailable()) return res.json({ nodes: [], edges: [] });
    const projectCode = req.query.project;
    const graph = await graphService.getProjectGraph(projectCode, 500);
    if (!graph) return res.json({ nodes: [], edges: [] });
    const format = req.query.format || 'json';
    if (format === 'csv') {
      const nodesCsv = 'id,name,domain,classification,zone,project\n' + graph.nodes.map(n => `${n.id},"${n.full_name||n.label}",${n.domain},${n.classification},${n.zone},${n.project}`).join('\n');
      const edgesCsv = 'source,target,relationship,confidence\n' + graph.edges.map(e => `${e.source},${e.target},${e.relationship},${e.confidence}`).join('\n');
      res.json({ nodes_csv: nodesCsv, edges_csv: edgesCsv });
    } else {
      res.json(graph);
    }
  } catch (e) { res.json({ nodes: [], edges: [], error: e.message }); }
});

// ── Manual Relationship Creation ─────────────────────────────────────────────
router.post('/relationships', async (req, res) => {
  const { source_asset_id, target_asset_id, relationship_type, confidence, evidence } = req.body;
  if (!source_asset_id || !target_asset_id || !relationship_type) {
    return res.status(400).json({ error: 'source_asset_id, target_asset_id, and relationship_type are required' });
  }
  const source = await findAsset(source_asset_id);
  const target = await findAsset(target_asset_id);
  if (!source) return res.status(404).json({ error: 'Source asset not found' });
  if (!target) return res.status(404).json({ error: 'Target asset not found' });

  const relType = relationship_type.toUpperCase().replace(/[-\s]+/g, '_').replace(/[^A-Z_]/g, '');
  const conf = confidence || 1.0;
  const evidenceJson = JSON.stringify({ ...(evidence ? { notes: evidence } : {}), manually_created: true, created_by: req.user?.email || 'admin' });

  // Write to Neo4j
  try {
    const graphService = require('../services/graphService');
    if (graphService.isAvailable()) {
      await graphService.createRelationship(source_asset_id, target_asset_id, relType, conf, evidence || 'Manual relationship');
    }
  } catch (_) {}

  // Write to PostgreSQL
  try {
    const { query: dbQuery } = require('../db/pool');
    const result = await dbQuery(
      `INSERT INTO asset_relationships (source_asset_id, target_asset_id, relationship_type, confidence, evidence, project_id)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (source_asset_id, target_asset_id, relationship_type) DO UPDATE SET confidence=$4, evidence=$5
       RETURNING *`,
      [source_asset_id, target_asset_id, relType, conf, evidenceJson, source.project_id || null]
    );
    audit({ actor_type:'USER', actor_id:req.user?.email||'admin', action:'relationship.created', entity_type:'relationship',
      entity_id:result.rows[0]?.id||'manual', after_state:{ source:source.file_name, target:target.file_name, type:relType } });
    emit('RelationshipFound', 'Data Steward', `Manual relationship created: ${source.file_name} → ${relType} → ${target.file_name}`,
      { source:source.file_name, target:target.file_name, type:relType, confidence:conf });
    res.status(201).json({ relationship: result.rows[0], source_name: source.file_name, target_name: target.file_name });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Approval Queue ────────────────────────────────────────────────────────────
router.get('/queue', (req, res) => {
  const pending = approvalQueue.filter(q=>q.status==='PENDING');
  const enriched = pending.map(q=>({ ...q, asset:catalog.find(a=>a.id===q.asset_id)||null, hours_remaining:Math.max(0,Math.floor((new Date(q.expires_at)-Date.now())/3600000)) }));
  res.json({ queue:enriched, total:pending.length });
});

router.post('/queue/:id/approve', (req, res) => {
  const item = approvalQueue.find(q=>q.id===req.params.id);
  if (!item) return res.status(404).json({ error:'Queue item not found' });
  item.status='APPROVED'; item.resolved_at=new Date().toISOString(); item.resolved_by=req.body.approver||'data_steward@company.com';
  const asset = catalog.find(a=>a.id===item.asset_id);
  if (asset) { asset.data_classification=item.proposed_tier; asset.classification_zone='AUTONOMOUS'; asset.lifecycle_state='APPROVED'; asset.modified_at=new Date().toISOString(); }
  const assetName = asset?.file_name || item.asset_id;
  emit('AssetApproved', 'Data Steward',
    `Steward approved: ${assetName} → ${item.proposed_tier} (manual approval)`,
    { queue_id:item.id, asset_id:item.asset_id, tier:item.proposed_tier });
  audit({ actor_type:'USER', actor_id:req.body.approver||req.user?.email||'steward', action:'approval.approved', entity_type:'asset', entity_id:item.asset_id, before_state:{ tier:item.current_tier }, after_state:{ tier:item.proposed_tier, zone:'AUTONOMOUS' } });
  if (asset) indexAsset(asset);
  res.json({ item, asset });
});

router.post('/queue/:id/reject', (req, res) => {
  const item = approvalQueue.find(q=>q.id===req.params.id);
  if (!item) return res.status(404).json({ error:'Queue item not found' });
  item.status='REJECTED'; item.resolved_at=new Date().toISOString(); item.resolved_by=req.body.approver||'data_steward@company.com'; item.override_tier=req.body.override_tier||item.current_tier;
  const asset = catalog.find(a=>a.id===item.asset_id);
  if (asset&&item.override_tier) { asset.data_classification=item.override_tier; asset.classification_zone='AUTONOMOUS'; }
  const assetName = asset?.file_name || item.asset_id;
  emit('AssetRejected', 'Data Steward',
    `Steward rejected proposed classification for ${assetName} — reverted to ${item.override_tier}`,
    { queue_id:item.id, override_tier:item.override_tier });
  audit({ actor_type:'USER', actor_id:req.body.approver||req.user?.email||'steward', action:'approval.rejected', entity_type:'asset', entity_id:item.asset_id, before_state:{ tier:item.proposed_tier }, after_state:{ tier:item.override_tier, override:true } });
  if (asset) indexAsset(asset);
  res.json({ item, asset });
});

router.post('/queue/:id/escalate', (req, res) => {
  const item = approvalQueue.find(q=>q.id===req.params.id);
  if (!item) return res.status(404).json({ error:'Queue item not found' });
  item.priority='CRITICAL'; item.escalated_at=new Date().toISOString();
  const asset = catalog.find(a=>a.id===item.asset_id);
  emit('AssetEscalated', 'Data Steward',
    `Escalated to legal team: ${asset?.file_name||item.asset_id} — reason: ${req.body.reason||'Legal review requested'}`,
    { queue_id:item.id, reason:req.body.reason });
  audit({ actor_type:'USER', actor_id:req.user?.email||'steward', action:'approval.escalated', entity_type:'asset', entity_id:item.asset_id, after_state:{ reason:req.body.reason, priority:'CRITICAL' } });
  res.json({ item, message:'Escalated to legal team' });
});

// ── Governance ────────────────────────────────────────────────────────────────
router.get('/governance', async (req, res) => {
  const alerts = await monitorAlerts(catalog);
  const eccnBreakdown = catalog.reduce((a,f)=>{ const k=f.export_control?.ear_eccn||'UNCLASSIFIED'; a[k]=(a[k]||0)+1; return a; }, {});
  const ipBreakdown   = catalog.reduce((a,f)=>{ a[f.ip_ownership_tier]=(a[f.ip_ownership_tier]||0)+1; return a; }, {});
  const piiAssets     = catalog.filter(f=>f.pii_flag?.contains_pii);
  const itarAssets    = catalog.filter(f=>f.export_control?.itar_applicable);
  const lowQuality    = catalog.filter(f=>f.quality_score<0.60);
  res.json({ alerts, eccnBreakdown, ipBreakdown, piiAssets:piiAssets.slice(0,5), piiCount:piiAssets.length, itarAssets:itarAssets.slice(0,5), itarCount:itarAssets.length, lowQualityCount:lowQuality.length, domainCoverage:Object.fromEntries(Object.entries(catalog.reduce((a,f)=>{ a[f.content_domain]=(a[f.content_domain]||0)+1; return a; },{}) ).map(([k,v])=>[k,Math.round(v/Math.max(catalog.length,1)*100)])) });
});

// ── Reports ───────────────────────────────────────────────────────────────────
router.post('/reports/generate', async (req, res) => {
  emit('ReportStarted', 'Compliance Reporter',
    `Compliance Reporter starting full audit — scanning ${catalog.length} assets across all domains...`,
    { type:req.body.type||'FULL_AUDIT', catalog_size:catalog.length });
  emit('ScanStage', 'Compliance Reporter',
    `Querying catalog, access logs, ECCN classifications, and lineage graph...`,
    { stage:'evidence_collection' });
  const report = await generateReport(catalog);
  emit('ReportGenerated', 'Compliance Reporter',
    `Audit report complete — Risk: ${report.risk_score} (${report.risk_level}), Compliance: ${report.compliance_score}%, Export Control: ${report.export_control_status}`,
    { risk_score:report.risk_score, risk_level:report.risk_level, compliance_score:report.compliance_score, export_control_status:report.export_control_status });
  const reportId = uuidv4();
  audit({ actor_type:'USER', actor_id:req.user?.email||'reporter', action:'report.generated', entity_type:'report', entity_id:reportId, after_state:{ risk_score:report.risk_score, compliance_score:report.compliance_score, type:req.body.type||'FULL_AUDIT' } });
  res.json({ ...report, report_id:reportId, generated_at:new Date().toISOString(), type:req.body.type||'FULL_AUDIT' });
});

// ── Policy Rules ─────────────────────────────────────────────────────────────
// ── Global Policy Rules (CRUD) ───────────────────────────────────────────────
router.get('/policies', async (req, res) => {
  // Try loading from PostgreSQL first (includes user-added global rules)
  try {
    const { query: dbQuery } = require('../db/pool');
    const result = await dbQuery('SELECT * FROM policy_rules WHERE project_id IS NULL ORDER BY priority ASC, created_at');
    if (result.rows.length > 0) {
      return res.json({ rules: result.rows, tier_order: ['PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','TRADE_SECRET'], source: 'database' });
    }
  } catch (_) {}
  // Fallback to hardcoded
  res.json({ rules: RULES, tier_order: ['PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','TRADE_SECRET'], source: 'hardcoded' });
});

router.post('/policies', async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    const { rule_code, description, signals, recommended_tier, priority } = req.body;
    if (!rule_code || !description || !signals?.length || !recommended_tier) {
      return res.status(400).json({ error: 'rule_code, description, signals, and recommended_tier are required' });
    }
    const result = await dbQuery(
      `INSERT INTO policy_rules (project_id, rule_code, description, signals, recommended_tier, priority, enabled, created_by)
       VALUES (NULL, $1, $2, $3, $4, $5, true, $6)
       ON CONFLICT (project_id, rule_code) DO UPDATE SET description=$2, signals=$3, recommended_tier=$4, priority=$5, updated_at=now()
       RETURNING *`,
      [rule_code, description, signals, recommended_tier, priority || 50, req.user?.id !== 'demo-user' ? req.user?.id : null]
    );
    audit({ actor_type:'USER', actor_id:req.user?.email||'admin', action:'policy.created', entity_type:'policy_rule', entity_id:rule_code, after_state:{ rule_code, recommended_tier, signals, scope:'global' } });
    res.status(201).json({ rule: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/policies/:ruleId', async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    const { description, signals, recommended_tier, priority, enabled } = req.body;
    const updates = []; const params = [req.params.ruleId]; let idx = 2;
    if (description !== undefined) { updates.push(`description=$${idx++}`); params.push(description); }
    if (signals) { updates.push(`signals=$${idx++}`); params.push(signals); }
    if (recommended_tier) { updates.push(`recommended_tier=$${idx++}`); params.push(recommended_tier); }
    if (priority !== undefined) { updates.push(`priority=$${idx++}`); params.push(priority); }
    if (enabled !== undefined) { updates.push(`enabled=$${idx++}`); params.push(enabled); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    updates.push('updated_at=now()');
    const result = await dbQuery(`UPDATE policy_rules SET ${updates.join(',')} WHERE id=$1 RETURNING *`, params);
    if (!result.rows[0]) return res.status(404).json({ error: 'Rule not found' });
    audit({ actor_type:'USER', actor_id:req.user?.email||'admin', action:'policy.modified', entity_type:'policy_rule', entity_id:req.params.ruleId, after_state:req.body });
    res.json({ rule: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/policies/:ruleId', async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    await dbQuery('DELETE FROM policy_rules WHERE id = $1', [req.params.ruleId]);
    audit({ actor_type:'USER', actor_id:req.user?.email||'admin', action:'policy.deleted', entity_type:'policy_rule', entity_id:req.params.ruleId });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Config ────────────────────────────────────────────────────────────────────
router.get('/config', (req, res) => res.json({ plugins:pluginConfig, agents:agentRegistry }));
router.patch('/config/plugins/:domain', (req, res) => {
  if (!pluginConfig[req.params.domain]) return res.status(404).json({ error:'Domain not found' });
  Object.assign(pluginConfig[req.params.domain], req.body);
  emit('ConfigUpdated', 'Pipeline Orchestrator',
    `Plugin config updated: ${req.params.domain} — ${Object.entries(req.body).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join(', ')}`,
    { domain:req.params.domain, changes:req.body });
  audit({ actor_type:'USER', actor_id:req.user?.email||'admin', action:'config.updated', entity_type:'plugin', entity_id:req.params.domain, after_state:req.body });
  res.json(pluginConfig[req.params.domain]);
});

// ── AI Content Analysis — the demo "wow" moment ─────────────────────────────
router.post('/analyze/:id', async (req, res) => {
  // Try in-memory first, then PostgreSQL
  let asset = catalog.find(a => a.id === req.params.id);
  if (!asset) {
    try {
      const assetRepo = require('../db/repositories/assetRepo');
      asset = await assetRepo.findById(req.params.id);
    } catch (_) {}
  }
  if (!asset) return res.status(404).json({ error:'Asset not found' });

  emit('EnrichmentStarted', 'Classification Arbiter',
    `Starting AI content analysis for: ${asset.file_name}`,
    { asset_id:asset.id, file_name:asset.file_name });

  // Get extracted text and entities from domain metadata
  const domKey = asset.content_domain?.toLowerCase().replace('_document','').replace('_circuit','').replace('_recording','') || '';
  const domMeta = (domKey && asset[`muas_${domKey}`]) || asset.domain_metadata || {};
  const text = domMeta.text_preview || '';
  const entities = domMeta.entities || {};

  const analysis = await analyzeContent(asset, text, entities);

  // Update asset with AI analysis
  asset.ai_analysis = analysis;
  asset.ai_enriched = true;
  asset.modified_at = new Date().toISOString();

  // Update PII flag with real findings
  if (analysis.pii_findings?.length > 0) {
    asset.pii_flag = {
      contains_pii: true,
      pii_types: [...new Set(analysis.pii_findings.map(p => p.type))],
      pii_count: analysis.pii_findings.length,
      regulations: [...new Set(analysis.pii_findings.map(p => p.regulation).filter(Boolean))],
    };
  }

  // Store cross-reference hints for relationship discovery
  if (analysis.cross_reference_hints?.length > 0) {
    asset.cross_reference_hints = analysis.cross_reference_hints;
  }

  emit('ClassificationComplete', 'Classification Arbiter',
    `AI analysis complete for ${asset.file_name}: ${analysis.recommended_tier} — ${analysis.key_topics?.slice(0,3).join(', ')}${analysis.pii_findings?.length > 0 ? ` · ${analysis.pii_findings.length} PII found` : ''}`,
    { asset_id:asset.id, tier:analysis.recommended_tier, topics:analysis.key_topics, pii_count:analysis.pii_findings?.length || 0 });

  // Persist to PostgreSQL
  try {
    const assetRepo = require('../db/repositories/assetRepo');
    await assetRepo.update(asset.id, { ai_analysis: analysis, ai_enriched: true, pii_flag: asset.pii_flag });
  } catch (_) {}

  audit({ actor_type:'USER', actor_id:req.user?.email||'analyst', action:'asset.analyzed', entity_type:'asset', entity_id:asset.id, after_state:{ tier:analysis.recommended_tier, topics:analysis.key_topics, pii_count:analysis.pii_findings?.length||0 } });
  indexAsset(asset);
  res.json({ asset, analysis });
});

// ── Cross-File Intelligence — shared entities across assets ──────────────────
router.get('/intelligence/cross-file', async (req, res) => {
  // Build entity index across all assets
  const entityIndex = {}; // entity_value → [asset_ids]

  for (const asset of catalog) {
    const domKey = asset.content_domain?.toLowerCase().replace('_document','').replace('_circuit','').replace('_recording','') || '';
    const domMeta = (domKey && asset[`muas_${domKey}`]) || {};
    const entities = domMeta.entities || {};
    const hints = asset.cross_reference_hints || [];

    // Index part numbers, emails, and cross-reference hints
    const allEntities = [
      ...(entities.part_numbers || []),
      ...(entities.emails || []),
      ...hints,
    ];

    for (const entity of allEntities) {
      if (!entity || entity.length < 2) continue;
      const key = entity.toLowerCase().trim();
      if (!entityIndex[key]) entityIndex[key] = [];
      if (!entityIndex[key].find(e => e.id === asset.id)) {
        entityIndex[key].push({ id:asset.id, file_name:asset.file_name, content_domain:asset.content_domain, data_classification:asset.data_classification });
      }
    }
  }

  // Find entities shared across 2+ assets (these are cross-file links)
  const crossLinks = Object.entries(entityIndex)
    .filter(([, assets]) => assets.length >= 2)
    .map(([entity, assets]) => ({
      entity,
      shared_across: assets.length,
      domains: [...new Set(assets.map(a => a.content_domain))],
      is_cross_domain: new Set(assets.map(a => a.content_domain)).size > 1,
      assets: assets.map(a => ({ id:a.id, file_name:a.file_name, domain:a.content_domain, classification:a.data_classification })),
    }))
    .sort((a, b) => b.shared_across - a.shared_across || (b.is_cross_domain ? 1 : 0) - (a.is_cross_domain ? 1 : 0))
    .slice(0, 20);

  // H1: Auto-persist discovered relationships to Neo4j + PostgreSQL
  let persisted = 0;
  try {
    const graphService = require('../services/graphService');
    const { query: dbQuery } = require('../db/pool');
    for (const link of crossLinks) {
      if (link.assets.length < 2) continue;
      for (let i = 0; i < link.assets.length; i++) {
        for (let j = i + 1; j < link.assets.length; j++) {
          const src = link.assets[i], tgt = link.assets[j];
          const relType = link.is_cross_domain ? 'SHARES_ENTITY' : 'SAME_ENTITY';
          // Persist to Neo4j
          if (graphService.isAvailable()) {
            graphService.createRelationship(src.id, tgt.id, relType, 0.7, `Shared entity: ${link.entity}`).catch(() => {});
          }
          // Persist to PostgreSQL
          try {
            await dbQuery(
              `INSERT INTO asset_relationships (source_asset_id, target_asset_id, relationship_type, confidence, evidence)
               VALUES ($1, $2, $3, $4, $5) ON CONFLICT (source_asset_id, target_asset_id, relationship_type) DO NOTHING`,
              [src.id, tgt.id, relType, 0.7, JSON.stringify({ shared_entity: link.entity, domains: link.domains })]
            );
            persisted++;
          } catch (_) {}
        }
      }
    }
  } catch (_) {}

  res.json({
    total_entities_indexed: Object.keys(entityIndex).length,
    cross_file_links: crossLinks.length,
    cross_domain_links: crossLinks.filter(l => l.is_cross_domain).length,
    relationships_persisted: persisted,
    links: crossLinks,
  });
});

// ── Business Glossary ────────────────────────────────────────────────────────
router.get('/glossary', async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    const result = await dbQuery('SELECT * FROM business_terms ORDER BY category, term');
    res.json({ terms: result.rows });
  } catch { res.json({ terms: [] }); }
});

router.post('/glossary', async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    const { term, definition, category, synonyms, related_signals } = req.body;
    if (!term) return res.status(400).json({ error: 'Term is required' });
    const result = await dbQuery(
      `INSERT INTO business_terms (term, definition, category, synonyms, related_signals, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (term) DO UPDATE SET definition=$2, category=$3, synonyms=$4, related_signals=$5, updated_at=now()
       RETURNING *`,
      [term, definition || '', category || 'General', synonyms || [], related_signals || [],
       req.user?.id !== 'demo-user' ? req.user?.id : null]
    );
    audit({ actor_type:'USER', actor_id:req.user?.email||'admin', action:'glossary.added', entity_type:'business_term', entity_id:term, after_state:{ term, category, definition } });
    res.status(201).json({ term: result.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/glossary/:id', async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    await dbQuery('DELETE FROM business_terms WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── AI Glossary Generation ───────────────────────────────────────────────────
router.post('/glossary/generate', async (req, res) => {
  const { company_name, division, industry, additional_context } = req.body;
  if (!company_name) return res.status(400).json({ error: 'company_name is required' });

  const prompt = `Generate a comprehensive business glossary for enterprise data governance.

Company: ${company_name}
${division ? `Division/Business Unit: ${division}` : ''}
${industry ? `Industry: ${industry}` : ''}
${additional_context ? `Additional Context: ${additional_context}` : ''}

Generate 15-25 business terms that would be commonly found in this organization's data assets.
For each term, include:
- term: the business term (short, specific)
- definition: 1-2 sentence business definition
- category: one of [Engineering, Finance, Legal, Product, Operations, Customer, Compliance, HR, Executive, Research]
- synonyms: 2-3 alternative names/abbreviations
- related_signals: 1-2 classification signals from this list that this term would trigger if found in a document:
  [tapeout_schedule, customer_nda, product_roadmap, die_cost_data, competitive_teardown, internal_pricing, personnel_info, public_datasheet, internal_procedure, yield_data, process_node_params, unreleased_ip_core, financial_projection, customer_design_win, embedded_circuit]

Focus on terms that carry data sensitivity implications — terms that, when found in documents, suggest a specific classification tier.
Mix across categories: include engineering/technical terms, financial terms, legal/compliance terms, and strategic/product terms.

Respond ONLY with valid JSON array:
[
  {"term":"...","definition":"...","category":"...","synonyms":["..."],"related_signals":["..."]}
]`;

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    });
    const text = resp.content[0]?.text?.replace(/```json|```/g, '').trim() || '[]';
    const terms = JSON.parse(text);

    // Persist all generated terms to database
    const { query: dbQuery } = require('../db/pool');
    let saved = 0;
    for (const t of terms) {
      try {
        await dbQuery(
          `INSERT INTO business_terms (id, term, definition, category, synonyms, related_signals, created_by, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
           ON CONFLICT (term) DO UPDATE SET definition=$2, category=$3, synonyms=$4, related_signals=$5, updated_at=NOW()`,
          [t.term, t.definition || '', t.category || 'General', t.synonyms || [], t.related_signals || [],
           req.user?.id !== 'demo-user' ? req.user?.id : null]
        );
        saved++;
      } catch (_) {}
    }

    audit({ actor_type:'USER', actor_id:req.user?.email||'admin', action:'glossary.ai_generated',
      entity_type:'business_terms', entity_id:'bulk', after_state:{ company: company_name, division, terms_generated: terms.length, terms_saved: saved } });

    // Return the full updated glossary
    const allTerms = await dbQuery('SELECT * FROM business_terms ORDER BY category, term');
    res.json({ generated: terms.length, saved, terms: allTerms.rows });
  } catch (e) {
    // Mock fallback if API key not set
    const mockTerms = generateMockGlossary(company_name, division, industry);
    const { query: dbQuery } = require('../db/pool');
    let saved = 0;
    for (const t of mockTerms) {
      try {
        await dbQuery(
          `INSERT INTO business_terms (id, term, definition, category, synonyms, related_signals, created_by, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NULL, NOW(), NOW())
           ON CONFLICT (term) DO UPDATE SET definition=$2, category=$3, synonyms=$4, related_signals=$5, updated_at=NOW()`,
          [t.term, t.definition, t.category, t.synonyms, t.related_signals]
        );
        saved++;
      } catch (_) {}
    }
    const allTerms = await dbQuery('SELECT * FROM business_terms ORDER BY category, term');
    res.json({ generated: mockTerms.length, saved, terms: allTerms.rows, mock: true });
  }
});

function generateMockGlossary(company, division, industry) {
  const ind = (industry || '').toLowerCase();
  const base = [
    { term:'NDA', definition:'Non-Disclosure Agreement — legal contract restricting information sharing with third parties.', category:'Legal', synonyms:['Non-Disclosure','Confidentiality Agreement'], related_signals:['customer_nda'] },
    { term:'Product Roadmap', definition:'Strategic document outlining planned product releases, features, and timelines.', category:'Product', synonyms:['Roadmap','Product Plan','Release Schedule'], related_signals:['product_roadmap'] },
    { term:'Competitive Analysis', definition:'Research comparing company products/services against competitors.', category:'Research', synonyms:['Competitor Teardown','Market Analysis'], related_signals:['competitive_teardown'] },
    { term:'Revenue Forecast', definition:'Financial projection of expected revenue over a defined period.', category:'Finance', synonyms:['Revenue Projection','Sales Forecast'], related_signals:['financial_projection','internal_pricing'] },
    { term:'Employee Performance Review', definition:'Periodic assessment of employee work quality and contributions.', category:'HR', synonyms:['Performance Appraisal','Annual Review'], related_signals:['personnel_info'] },
    { term:'Press Release', definition:'Official public statement distributed to media outlets.', category:'Executive', synonyms:['PR','Media Release','Public Announcement'], related_signals:['public_datasheet'] },
    { term:'Standard Operating Procedure', definition:'Step-by-step instructions for routine business operations.', category:'Operations', synonyms:['SOP','Process Document','Work Instruction'], related_signals:['internal_procedure'] },
    { term:'Customer Design Win', definition:'Confirmation that a customer has selected the company product for their design.', category:'Customer', synonyms:['Design Win','Socket Win','Customer Award'], related_signals:['customer_design_win'] },
    { term:'Export Control', definition:'Regulatory framework governing the transfer of technology across national borders.', category:'Compliance', synonyms:['ITAR','EAR','Export License'], related_signals:['tapeout_schedule'] },
    { term:'Pricing Matrix', definition:'Internal document detailing product pricing tiers and volume discounts.', category:'Finance', synonyms:['Price List','Rate Card','Pricing Sheet'], related_signals:['internal_pricing','die_cost_data'] },
  ];
  // Add industry-specific terms
  if (ind.includes('semicon') || ind.includes('chip') || ind.includes('electronic')) {
    base.push(
      { term:'Tapeout', definition:'Final step in IC design where the layout is sent to the foundry for manufacturing.', category:'Engineering', synonyms:['Tape-out','GDS Submission','Mask Release'], related_signals:['tapeout_schedule'] },
      { term:'Process Design Kit', definition:'Set of files and rules provided by a foundry for a specific manufacturing process node.', category:'Engineering', synonyms:['PDK','Process Kit','Foundry Kit'], related_signals:['process_node_params'] },
      { term:'IP Core', definition:'Reusable block of logic or circuit design used as a building block in chip design.', category:'Engineering', synonyms:['Silicon IP','Design IP','IP Block'], related_signals:['unreleased_ip_core'] },
      { term:'Yield Data', definition:'Manufacturing yield statistics showing percentage of functional chips per wafer.', category:'Engineering', synonyms:['Wafer Yield','Die Yield','Fab Yield'], related_signals:['yield_data','die_cost_data'] },
      { term:'Die Cost', definition:'Per-unit manufacturing cost of a single integrated circuit die.', category:'Finance', synonyms:['Chip Cost','Silicon Cost','Unit Cost'], related_signals:['die_cost_data'] },
      { term:'Design Rule Check', definition:'Automated verification that IC layout meets manufacturing constraints.', category:'Engineering', synonyms:['DRC','Layout Verification','Physical Verification'], related_signals:['internal_procedure'] }
    );
  }
  if (ind.includes('pharma') || ind.includes('health') || ind.includes('medical')) {
    base.push(
      { term:'Clinical Trial Data', definition:'Results from human testing phases of drug/device development.', category:'Research', synonyms:['Trial Results','Phase Data','Study Data'], related_signals:['product_roadmap'] },
      { term:'FDA Submission', definition:'Regulatory filing to the Food and Drug Administration for product approval.', category:'Compliance', synonyms:['NDA Filing','510(k)','Regulatory Submission'], related_signals:['tapeout_schedule'] },
      { term:'Drug Formulation', definition:'Proprietary composition and manufacturing process for a pharmaceutical product.', category:'Engineering', synonyms:['Formulation','Drug Recipe','Composition'], related_signals:['unreleased_ip_core','process_node_params'] },
      { term:'Patient Data', definition:'Protected health information collected during clinical activities.', category:'Compliance', synonyms:['PHI','HIPAA Data','Medical Records'], related_signals:['personnel_info'] }
    );
  }
  if (ind.includes('financ') || ind.includes('bank') || ind.includes('insurance')) {
    base.push(
      { term:'Trading Algorithm', definition:'Proprietary algorithm used for automated financial trading decisions.', category:'Engineering', synonyms:['Trading Strategy','Quant Model','Alpha Model'], related_signals:['unreleased_ip_core','die_cost_data'] },
      { term:'Risk Assessment', definition:'Analysis of potential financial losses and their probabilities.', category:'Finance', synonyms:['Risk Model','VaR','Stress Test'], related_signals:['financial_projection'] },
      { term:'KYC Documentation', definition:'Know Your Customer records for regulatory compliance.', category:'Compliance', synonyms:['KYC','Customer Due Diligence','AML Records'], related_signals:['customer_nda','personnel_info'] },
      { term:'Portfolio Holdings', definition:'Current investment positions and asset allocations.', category:'Finance', synonyms:['Holdings','Position Report','Portfolio Statement'], related_signals:['internal_pricing','financial_projection'] }
    );
  }
  return base;
}

// ── Asset Tags ───────────────────────────────────────────────────────────────
router.get('/assets/:id/tags', async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    const result = await dbQuery('SELECT * FROM asset_tags WHERE asset_id = $1 ORDER BY created_at', [req.params.id]);
    res.json({ tags: result.rows });
  } catch { res.json({ tags: [] }); }
});

router.post('/assets/:id/tags', async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    const { tag, tag_type } = req.body;
    if (!tag) return res.status(400).json({ error: 'Tag is required' });
    const result = await dbQuery(
      `INSERT INTO asset_tags (asset_id, tag, tag_type, added_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (asset_id, tag) DO NOTHING RETURNING *`,
      [req.params.id, tag.trim(), tag_type || 'custom', req.user?.id !== 'demo-user' ? req.user?.id : null]
    );
    res.status(201).json({ tag: result.rows[0] || { tag, exists: true } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/assets/:id/tags/:tagId', async (req, res) => {
  try {
    const { query: dbQuery } = require('../db/pool');
    await dbQuery('DELETE FROM asset_tags WHERE id = $1 AND asset_id = $2', [req.params.tagId, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── AI Tag Suggestions ──────────────────────────────────────────────────────
router.get('/assets/:id/suggest-tags', async (req, res) => {
  try {
    const asset = await findAsset(req.params.id);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    const suggestions = [];

    // Source 1: key_topics from AI content analysis
    if (asset.ai_analysis?.key_topics?.length > 0) {
      for (const topic of asset.ai_analysis.key_topics) {
        suggestions.push({ tag: topic, source: 'ai_analysis', reason: 'Identified as key topic by AI content analysis' });
      }
    }

    // Source 2: content signals from classification
    if (asset.ai_analysis?.content_summary) {
      // Extract notable phrases from summary (first 3 words of each sentence)
      const phrases = asset.ai_analysis.content_summary.split(/[.!?]/).filter(s => s.trim().length > 5).slice(0, 2);
      for (const p of phrases) {
        const tag = p.trim().split(/\s+/).slice(0, 3).join(' ');
        if (tag.length >= 4 && tag.length <= 40) {
          suggestions.push({ tag, source: 'ai_summary', reason: 'Extracted from AI content summary' });
        }
      }
    }

    // Source 3: Business glossary terms matching asset text
    try {
      const { query: dbQuery } = require('../db/pool');
      const terms = await dbQuery('SELECT term, category, synonyms FROM business_terms');
      const assetText = [
        asset.file_name, asset.content_domain, asset.project_code || '',
        asset.ai_analysis?.content_summary || '', asset.data_classification || ''
      ].join(' ').toLowerCase();

      for (const row of terms.rows) {
        const allTerms = [row.term, ...(row.synonyms || [])];
        if (allTerms.some(t => assetText.includes(t.toLowerCase()))) {
          suggestions.push({ tag: row.term, source: 'glossary', reason: `Matches glossary term (${row.category})` });
        }
      }
    } catch (_) {}

    // Source 4: Metadata-based suggestions
    if (asset.content_domain) {
      suggestions.push({ tag: asset.content_domain.replace(/_/g, ' '), source: 'metadata', reason: 'Content domain classification' });
    }
    if (asset.data_classification) {
      suggestions.push({ tag: asset.data_classification, source: 'metadata', reason: 'Data classification tier' });
    }
    if (asset.project_code && asset.project_code !== 'LOCAL_SCAN') {
      suggestions.push({ tag: asset.project_code, source: 'metadata', reason: 'Project code' });
    }

    // Deduplicate and filter out already-applied tags
    try {
      const { query: dbQuery } = require('../db/pool');
      const existingTags = await dbQuery('SELECT tag FROM asset_tags WHERE asset_id = $1', [req.params.id]);
      const existingSet = new Set(existingTags.rows.map(r => r.tag.toLowerCase()));
      const unique = suggestions.filter((s, i) =>
        suggestions.findIndex(x => x.tag.toLowerCase() === s.tag.toLowerCase()) === i
        && !existingSet.has(s.tag.toLowerCase())
      );
      res.json({ suggestions: unique });
    } catch (_) {
      res.json({ suggestions });
    }
  } catch (e) { res.json({ suggestions: [] }); }
});

// ── Natural Language Query ────────────────────────────────────────────────────
router.post('/nlq', async (req, res) => {
  const { query: q } = req.body;
  if (!q || !q.trim()) return res.status(400).json({ error:'Query is required' });

  // Build summary from PostgreSQL or in-memory
  let summary;
  try {
    const assetRepo = require('../db/repositories/assetRepo');
    const stats = await assetRepo.getStats();
    summary = {
      total: stats.total,
      domains: Object.keys(stats.domain_counts || {}),
      classifications: Object.keys(stats.class_counts || {}),
      zones: Object.keys(stats.zone_counts || {}),
      projects: [],
    };
  } catch {
    summary = {
      total: catalog.length,
      domains: [...new Set(catalog.map(a=>a.content_domain))],
      classifications: [...new Set(catalog.map(a=>a.data_classification))],
      projects: [...new Set(catalog.map(a=>a.project_code).filter(Boolean))],
      zones: [...new Set(catalog.map(a=>a.classification_zone))],
    };
  }

  const nlqResult = await nlqSearch(q, summary);
  const filters = nlqResult.filters || {};

  // H4: If query is about relationships/connections, query Neo4j
  const qLower = q.toLowerCase();
  // Check for tag-based search
  const isTagQuery = qLower.includes('tag') || qLower.includes('tagged') || qLower.includes('label');

  const isGraphQuery = qLower.includes('related') || qLower.includes('connected') || qLower.includes('relationship') || qLower.includes('linked') || qLower.includes('lineage') || qLower.includes('derived');
  if (isGraphQuery) {
    try {
      const { query: dbQuery } = require('../db/pool');
      const assetRepo = require('../db/repositories/assetRepo');

      // Extract asset name from query — support multiple patterns
      // "related assets for why_atlas.pptx" | "what is related to budget.xlsx" | "related to budget" | "related assets why_atlas"
      let assetName = '';
      const nameWithExt = qLower.match(/(?:for|of|to)\s+['"]?([^\s'"]+\.\w{2,5})['"]?/);
      const nameNoPrep = qLower.match(/related\s+(?:assets?\s+)?['"]?([^\s'"]+\.\w{2,5})['"]?/);
      const nameFromFilter = filters.search || '';
      if (nameWithExt) assetName = nameWithExt[1];
      else if (nameNoPrep) assetName = nameNoPrep[1];
      else if (nameFromFilter) assetName = nameFromFilter;
      // Also try extracting name without extension: "related assets for why_atlas"
      if (!assetName) {
        const nameNoExt = qLower.match(/(?:for|of|to)\s+['"]?([a-z0-9_.-]{3,})['"]?\s*$/);
        if (nameNoExt) assetName = nameNoExt[1];
      }

      if (assetName) {
        // Find the specific asset — try PostgreSQL first, then in-memory catalog
        let targetAsset = null;
        const assetResult = await dbQuery('SELECT * FROM assets WHERE file_name ILIKE $1 LIMIT 1', [`%${assetName}%`]);
        if (assetResult.rows.length > 0) {
          targetAsset = assetRepo.hydrateAsset ? assetRepo.hydrateAsset(assetResult.rows[0]) : assetResult.rows[0];
        } else {
          // Check in-memory catalog
          targetAsset = catalog.find(a => a.file_name?.toLowerCase().includes(assetName));
        }

        if (targetAsset) {
          const targetId = targetAsset.id;
          const targetName = targetAsset.file_name;

          // Step 1: Query Neo4j FIRST (auto-scan writes relationships here)
          // Use depth=1 to avoid traversing through Project nodes (which connects everything)
          // Filter out structural edges (BELONGS_TO, SAME_PROJECT) — these are trivial, not meaningful relationships
          const STRUCTURAL_EDGES = new Set(['BELONGS_TO', 'SAME_PROJECT', 'SAME_ENTITY']);
          try {
            const graphService = require('../services/graphService');
            console.log(`[NLQ-Graph] Neo4j available: ${graphService.isAvailable()}, querying relationships for asset ${targetId} (${targetName})`);
            if (graphService.isAvailable()) {
              const graphRels = await graphService.getAssetRelationships(targetId, 1);
              // Filter to only meaningful relationship types
              const meaningfulRels = (graphRels || []).filter(r => !STRUCTURAL_EDGES.has(r.relationship));
              console.log(`[NLQ-Graph] Neo4j returned ${graphRels ? graphRels.length : 'null'} total, ${meaningfulRels.length} meaningful relationships`);
              if (meaningfulRels.length > 0) {
                // Collect unique related asset IDs (exclude the target itself)
                const relatedIds = [...new Set(meaningfulRels.flatMap(r => [r.source.id, r.target.id]).filter(id => id !== targetId))];
                if (relatedIds.length > 0) {
                  // Fetch full asset records from PostgreSQL
                  const assetsResult = await dbQuery(`SELECT * FROM assets WHERE id = ANY($1)`, [relatedIds]);
                  let results = assetsResult.rows.map(a => assetRepo.hydrateAsset ? assetRepo.hydrateAsset(a) : a);
                  // Also include any in-memory assets not in PostgreSQL
                  const dbIds = new Set(results.map(a => a.id));
                  const memAssets = catalog.filter(a => relatedIds.includes(a.id) && !dbIds.has(a.id));
                  results = [...results, ...memAssets];

                  const relTypes = [...new Set(meaningfulRels.map(r=>r.relationship))].join(', ');
                  return res.json({
                    interpretation: `Found ${meaningfulRels.length} meaningful relationship(s) for "${targetName}" in the knowledge graph`,
                    filters,
                    results,
                    total: results.length,
                    relationships: meaningfulRels.map(r => ({ type: r.relationship, confidence: r.confidence, source: r.source.name, target: r.target.name })),
                    suggestion: `${meaningfulRels.length} graph edges found. Types: ${relTypes}`,
                    source: 'knowledge_graph',
                  });
                }
              }
            }
          } catch (neoErr) {
            console.error('Neo4j NLQ query error:', neoErr.message);
          }

          // Step 2: Fallback to PostgreSQL asset_relationships table
          let relResult = { rows: [] };
          try {
            relResult = await dbQuery(
              `SELECT ar.*, a1.file_name as source_name, a1.content_domain as source_domain,
                      a2.file_name as target_name, a2.content_domain as target_domain
               FROM asset_relationships ar
               JOIN assets a1 ON ar.source_asset_id = a1.id
               JOIN assets a2 ON ar.target_asset_id = a2.id
               WHERE ar.source_asset_id = $1 OR ar.target_asset_id = $1
               ORDER BY ar.confidence DESC LIMIT 20`, [targetId]
            );
          } catch (_) {}

          if (relResult.rows.length > 0) {
            const relatedIds = relResult.rows.map(r => r.source_asset_id === targetId ? r.target_asset_id : r.source_asset_id);
            const assetsResult = await dbQuery(`SELECT * FROM assets WHERE id = ANY($1)`, [relatedIds]);
            return res.json({
              interpretation: `Found ${relResult.rows.length} relationship(s) for "${targetName}" in the knowledge graph`,
              filters,
              results: assetsResult.rows.map(a => assetRepo.hydrateAsset ? assetRepo.hydrateAsset(a) : a),
              total: assetsResult.rows.length,
              relationships: relResult.rows.map(r => ({ type: r.relationship_type, confidence: r.confidence, source: r.source_name, target: r.target_name })),
              suggestion: `${relResult.rows.length} relationships found. Types: ${[...new Set(relResult.rows.map(r=>r.relationship_type))].join(', ')}`,
              source: 'knowledge_graph',
            });
          }

          // Step 2: Try pgvector semantic similarity
          try {
            const embeddingService = require('../services/embeddingService');
            if (embeddingService.isAvailable()) {
              const similar = await embeddingService.findSimilar(targetId, 10);
              if (similar.length > 0) {
                return res.json({
                  interpretation: `No direct relationships found for "${targetName}". Showing ${similar.length} semantically similar assets.`,
                  filters, results: similar, total: similar.length,
                  suggestion: 'Use "Investigate Relationships" on the asset detail panel to discover and persist relationships to the knowledge graph.',
                  source: 'pgvector_similarity',
                });
              }
            }
          } catch (_) {}

          // Step 3: Smart fallback — prioritize same DOMAIN (semantically relevant), not just same project
          const fallbackResults = [];
          const fallbackSource = [];
          try {
            // First: same domain + same project (most relevant — e.g., other Office docs in the same project)
            if (targetAsset.project_id && targetAsset.content_domain) {
              const sameDomainProject = await dbQuery(
                `SELECT * FROM assets WHERE project_id = $1 AND content_domain = $2 AND id != $3 ORDER BY created_at DESC LIMIT 10`,
                [targetAsset.project_id, targetAsset.content_domain, targetId]
              );
              if (sameDomainProject.rows.length > 0) {
                fallbackResults.push(...sameDomainProject.rows.map(a => assetRepo.hydrateAsset ? assetRepo.hydrateAsset(a) : a));
                fallbackSource.push('same domain & project');
              }
            }
            // Second: same domain across all projects (e.g., other PPTX files elsewhere)
            if (fallbackResults.length < 8 && targetAsset.content_domain) {
              const existingIds = fallbackResults.map(a => a.id);
              const sameDomain = await dbQuery(
                `SELECT * FROM assets WHERE content_domain = $1 AND id != $2 AND id != ALL($3) ORDER BY created_at DESC LIMIT $4`,
                [targetAsset.content_domain, targetId, existingIds, 8 - fallbackResults.length]
              );
              if (sameDomain.rows.length > 0) {
                fallbackResults.push(...sameDomain.rows.map(a => assetRepo.hydrateAsset ? assetRepo.hydrateAsset(a) : a));
                fallbackSource.push('same domain');
              }
            }
            // Third: same classification level in same project (e.g., other CONFIDENTIAL files)
            if (fallbackResults.length < 5 && targetAsset.project_id && targetAsset.data_classification) {
              const existingIds = fallbackResults.map(a => a.id);
              const sameClass = await dbQuery(
                `SELECT * FROM assets WHERE project_id = $1 AND data_classification = $2 AND id != $3 AND id != ALL($4) ORDER BY created_at DESC LIMIT $5`,
                [targetAsset.project_id, targetAsset.data_classification, targetId, existingIds, 5 - fallbackResults.length]
              );
              if (sameClass.rows.length > 0) {
                fallbackResults.push(...sameClass.rows.map(a => assetRepo.hydrateAsset ? assetRepo.hydrateAsset(a) : a));
                fallbackSource.push('same classification');
              }
            }
          } catch (_) {}

          // Also check in-memory catalog for same domain
          if (fallbackResults.length < 3) {
            const fallbackIds = new Set(fallbackResults.map(a => a.id));
            const memRelated = catalog.filter(a =>
              a.id !== targetId && !fallbackIds.has(a.id) &&
              a.content_domain === targetAsset.content_domain
            ).slice(0, 5 - fallbackResults.length);
            fallbackResults.push(...memRelated);
          }

          if (fallbackResults.length > 0) {
            return res.json({
              interpretation: `No explicit graph relationships found for "${targetName}". Showing ${fallbackResults.length} contextually related asset(s) (${fallbackSource.join(', ')}).`,
              filters, results: fallbackResults, total: fallbackResults.length,
              suggestion: 'Run "Investigate Relationships" from the asset detail panel to discover cross-file connections and build the knowledge graph.',
              source: 'smart_fallback',
            });
          }

          // Nothing found at all — return helpful message instead of nothing
          return res.json({
            interpretation: `No related assets found for "${targetName}". This asset has no graph relationships, embeddings, or matching assets in the catalog.`,
            filters, results: [], total: 0,
            suggestion: 'Scan more files into this project, then run "Investigate Relationships" to discover connections.',
            source: 'no_results',
          });
        }
      }

      // Generic relationship query — show all relationships
      const relResult = await dbQuery(
        `SELECT ar.*, a1.file_name as source_name, a1.content_domain as source_domain,
                a2.file_name as target_name, a2.content_domain as target_domain
         FROM asset_relationships ar
         JOIN assets a1 ON ar.source_asset_id = a1.id
         JOIN assets a2 ON ar.target_asset_id = a2.id
         ORDER BY ar.confidence DESC LIMIT 20`
      );
      if (relResult.rows.length > 0) {
        return res.json({
          interpretation: nlqResult.interpretation + ` (${relResult.rows.length} relationships in knowledge graph)`,
          filters,
          results: relResult.rows.map(r => ({
            id: r.id, type: 'relationship',
            source: { id: r.source_asset_id, name: r.source_name, domain: r.source_domain },
            target: { id: r.target_asset_id, name: r.target_name, domain: r.target_domain },
            relationship_type: r.relationship_type, confidence: r.confidence,
          })),
          total: relResult.rows.length,
          suggestion: nlqResult.suggestion,
          source: 'knowledge_graph',
        });
      }
    } catch (graphErr) {
      console.error('Graph query error:', graphErr.message);
    }
  }

  // Tag-based search — find assets by business tags
  if (isTagQuery || filters.search) {
    try {
      const { query: dbQuery } = require('../db/pool');
      const searchTerm = filters.search || qLower.replace(/.*(?:tagged|tag|label)\s+(?:as\s+|with\s+)?/i, '').trim().split(' ')[0];
      if (searchTerm) {
        const tagResult = await dbQuery(
          `SELECT DISTINCT a.* FROM assets a
           JOIN asset_tags t ON a.id = t.asset_id
           WHERE t.tag ILIKE $1
           ORDER BY a.created_at DESC LIMIT 50`,
          [`%${searchTerm}%`]
        );
        if (tagResult.rows.length > 0) {
          const assetRepo = require('../db/repositories/assetRepo');
          return res.json({
            interpretation: `Found ${tagResult.rows.length} asset(s) tagged with "${searchTerm}"`,
            filters, results: tagResult.rows.map(a => assetRepo.hydrateAsset ? assetRepo.hydrateAsset(a) : a),
            total: tagResult.rows.length,
            suggestion: `Showing assets matching tag "${searchTerm}". Add more tags to assets from the Asset Detail panel.`,
            source: 'tags',
          });
        }
      }
    } catch (_) {}
  }

  // Apply filters via PostgreSQL first
  try {
    const assetRepo = require('../db/repositories/assetRepo');
    const dbFilters = {};
    if (filters.domain) dbFilters.domain = filters.domain;
    if (filters.classification) dbFilters.classification = filters.classification;
    if (filters.zone) dbFilters.zone = filters.zone;
    if (filters.search) dbFilters.search = filters.search;
    if (filters.project) dbFilters.project_code = filters.project;
    const result = await assetRepo.findAll(dbFilters, 1, 50);
    return res.json({ interpretation: nlqResult.interpretation, filters, results: result.assets, total: result.total, suggestion: nlqResult.suggestion });
  } catch (_) {}

  // Fallback to in-memory
  let results = [...catalog];
  if (filters.domain) results = results.filter(a => a.content_domain === filters.domain);
  if (filters.classification) results = results.filter(a => a.data_classification === filters.classification);
  if (filters.zone) results = results.filter(a => a.classification_zone === filters.zone);
  if (filters.project) results = results.filter(a => a.project_code?.toLowerCase().includes(filters.project.toLowerCase()));
  if (filters.search) {
    const sq = filters.search.toLowerCase();
    results = results.filter(a => a.file_name?.toLowerCase().includes(sq) || a.project_code?.toLowerCase().includes(sq));
  }

  res.json({ interpretation: nlqResult.interpretation, filters, results: results.slice(0, 50), total: results.length, suggestion: nlqResult.suggestion });
});

// ── Retention Policy ─────────────────────────────────────────────────────────
router.get('/retention/summary', (req, res) => {
  const now = Date.now();
  const summary = { total: catalog.length, on_legal_hold: 0, review_overdue: 0, expiring_soon: 0, by_tier: {} };
  for (const a of catalog) {
    const rp = a.retention_policy;
    if (!rp) continue;
    if (rp.legal_hold) summary.on_legal_hold++;
    if (rp.review_date && new Date(rp.review_date).getTime() < now) summary.review_overdue++;
    if (rp.delete_after && (new Date(rp.delete_after).getTime() - now) < 90*86400000) summary.expiring_soon++;
    const tier = a.data_classification || 'UNKNOWN';
    summary.by_tier[tier] = (summary.by_tier[tier] || 0) + 1;
  }
  res.json(summary);
});

router.post('/retention/:id/hold', (req, res) => {
  const asset = catalog.find(a => a.id === req.params.id);
  if (!asset) return res.status(404).json({ error:'Asset not found' });
  if (!asset.retention_policy) asset.retention_policy = {};
  asset.retention_policy.legal_hold = !!req.body.hold;
  asset.retention_policy.hold_reason = req.body.reason || '';
  asset.retention_policy.hold_date = new Date().toISOString();
  emit('ConfigUpdated', 'Data Steward', `Legal hold ${req.body.hold ? 'placed on' : 'removed from'}: ${asset.file_name}`, { asset_id: asset.id, legal_hold: !!req.body.hold });
  audit({ actor_type:'USER', actor_id:req.user?.email||'steward', action:req.body.hold?'retention.hold_placed':'retention.hold_removed', entity_type:'asset', entity_id:asset.id, after_state:{ legal_hold:!!req.body.hold, reason:req.body.reason } });
  res.json({ asset });
});

// ── Similar Asset Search ─────────────────────────────────────────────────────
router.get('/search/similar/:id', async (req, res) => {
  // Try pgvector first for real semantic similarity
  try {
    const embeddingService = require('../services/embeddingService');
    if (embeddingService.isAvailable()) {
      const similar = await embeddingService.findSimilar(req.params.id, 10);
      if (similar.length > 0) {
        return res.json({ target_id: req.params.id, similar, source: 'pgvector' });
      }
    }
  } catch (_) {}

  // Fallback to attribute-based scoring
  const target = await findAsset(req.params.id);
  if (!target) return res.status(404).json({ error:'Asset not found' });

  const scored = catalog.filter(a => a.id !== target.id).map(a => {
    let score = 0;
    if (a.content_domain === target.content_domain) score += 0.3;
    if (a.data_classification === target.data_classification) score += 0.15;
    if (a.project_code && a.project_code === target.project_code) score += 0.25;
    if (a.asset_type === target.asset_type) score += 0.1;
    const targetWords = (target.file_name || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2);
    const assetWords = (a.file_name || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2);
    const shared = targetWords.filter(w => assetWords.includes(w)).length;
    if (shared > 0) score += Math.min(0.2, shared * 0.05);
    return { ...a, similarity_score: parseFloat(score.toFixed(3)) };
  }).filter(a => a.similarity_score > 0.1).sort((a, b) => b.similarity_score - a.similarity_score).slice(0, 10);

  res.json({ target_id: target.id, target_name: target.file_name, similar: scored, source: 'attribute' });
});

// ── Full-Text Search (Elasticsearch) ─────────────────────────────────────────
router.post('/search', async (req, res) => {
  const searchService = require('../services/searchService');
  if (!searchService.isAvailable()) {
    // Fallback to in-memory search
    const { query: q, filters = {}, page = 1, limit = 20 } = req.body;
    let results = [...catalog];
    if (q) {
      const lq = q.toLowerCase();
      results = results.filter(a =>
        a.file_name?.toLowerCase().includes(lq) ||
        a.project_code?.toLowerCase().includes(lq) ||
        a.content_domain?.toLowerCase().includes(lq) ||
        a.data_classification?.toLowerCase().includes(lq)
      );
    }
    if (filters.domain) results = results.filter(a => a.content_domain === filters.domain);
    if (filters.classification) results = results.filter(a => a.data_classification === filters.classification);
    if (filters.zone) results = results.filter(a => a.classification_zone === filters.zone);
    return res.json({ hits: results.slice((page-1)*limit, page*limit), total: results.length, page, pages: Math.ceil(results.length/limit), facets: {}, source: 'in-memory' });
  }
  const { query: q, filters, page, limit } = req.body;
  const result = await searchService.search(q, filters, page, limit);
  res.json({ ...result, source: 'elasticsearch' });
});

// ── Audit Trail ──────────────────────────────────────────────────────────────
router.get('/audit', async (req, res) => {
  try {
    const auditRepo = require('../db/repositories/auditRepo');
    const { project_id, action, actor_type, from, to, page = 1, limit = 50 } = req.query;
    const result = await auditRepo.findByProject(project_id, { action, actor_type, from, to }, parseInt(page), parseInt(limit));
    res.json(result);
  } catch (e) {
    // DB not available — return empty
    res.json({ entries: [], total: 0, page: 1, pages: 0, source: 'unavailable' });
  }
});

// ── Lifecycle States ─────────────────────────────────────────────────────────
router.get('/lifecycle/states', (req, res) => {
  const { getAllStates, TRANSITIONS } = require('../services/lifecycleEngine');
  res.json({ states: getAllStates(), transitions: TRANSITIONS });
});

// ── Queue Stats (BullMQ) ─────────────────────────────────────────────────────
router.get('/queue/jobs/stats', async (req, res) => {
  try {
    const { getStats, isAvailable } = require('../queue/queues');
    if (!isAvailable()) return res.json({ available: false, queues: {} });
    const stats = await getStats();
    res.json({ available: true, queues: stats });
  } catch {
    res.json({ available: false, queues: {} });
  }
});

// ── Events & misc ─────────────────────────────────────────────────────────────
router.get('/events', (req, res) => res.json({ events:eventLog.slice(0,50) }));
router.get('/export/csv', (req, res) => {
  const cols = ['id','file_name','content_domain','asset_type','project_code','data_classification','classification_zone','classification_confidence','export_control.ear_eccn','export_control.itar_applicable','quality_score','ai_enriched','file_size_mb','designer','created_at'];
  const rows = catalog.map(a=>cols.map(c=>{ const v=c.includes('.')?c.split('.').reduce((o,k)=>o?.[k],a):a[c]; return typeof v==='string'&&v.includes(',')?`"${v}"`:(v??''); }).join(','));
  res.setHeader('Content-Type','text/csv');
  res.setHeader('Content-Disposition','attachment; filename=cude_catalog.csv');
  res.send([cols.join(','),...rows].join('\n'));
});
router.get('/health', async (req, res) => {
  const services = { api: 'ok' };
  // Check PostgreSQL
  try {
    const { testConnection } = require('../db/pool');
    const db = await testConnection();
    services.postgres = db.connected ? 'connected' : 'unavailable';
  } catch { services.postgres = 'unavailable'; }
  // Check MinIO
  try {
    const { isAvailable } = require('../services/objectStore');
    services.minio = isAvailable() ? 'connected' : 'unavailable';
  } catch { services.minio = 'unavailable'; }
  services.claude = process.env.ANTHROPIC_API_KEY ? 'configured' : 'not_configured';
  services.whisper = process.env.OPENAI_API_KEY ? 'configured' : 'not_configured';

  res.json({
    status: 'ok',
    platform: 'CUDE Enterprise',
    version: '3.0',
    catalog: catalog.length,
    queue: approvalQueue.filter(q=>q.status==='PENDING').length,
    uptime: process.uptime(),
    use_database: process.env.USE_DATABASE !== 'false',
    services,
  });
});

// ── Folder suggestions for local filesystem scanner ──────────────────────────
router.get('/folders/suggestions', (req, res) => {
  const os = require('os');
  const path = require('path');
  const fs = require('fs');
  const home = os.homedir();

  // Check for Docker-mounted paths first, then local paths
  const candidates = [
    { label:'Test', path:'/data/scan/Test' },
    { label:'Downloads', path:'/data/scan/Downloads' },
    { label:'Documents', path:'/data/scan/Documents' },
    { label:'Desktop', path:'/data/scan/Desktop' },
    { label:'Downloads', path:path.join(home, 'Downloads') },
    { label:'Documents', path:path.join(home, 'Documents') },
    { label:'Desktop', path:path.join(home, 'Desktop') },
  ];

  // Deduplicate by label — prefer Docker-mounted paths (listed first)
  const seen = new Set();
  const suggestions = candidates.filter(s => {
    if (seen.has(s.label)) return false;
    try {
      if (!fs.existsSync(s.path)) return false;
      seen.add(s.label);
      return true;
    } catch { return false; }
  });

  res.json({ home, suggestions });
});

// ── Column-Level Lineage ────────────────────────────────────────────────────
// The #1 capability buyers (CDO / Head of Data / Data Eng Lead) evaluate.
// Sources: dbt manifest, MySQL FK + view introspection, Snowflake ACCESS_HISTORY.

router.get('/lineage/stats', async (req, res) => {
  try {
    const lineageService = require('../services/lineageService');
    res.json(await lineageService.getStats());
  } catch (e) { res.json({ columns: 0, assets_with_columns: 0, lineage_edges: 0, pii_columns: 0, error: e.message }); }
});

router.get('/lineage/assets', async (req, res) => {
  try {
    const lineageService = require('../services/lineageService');
    const assets = await lineageService.listAssetsWithColumns();
    res.json({ assets });
  } catch (e) { res.json({ assets: [], error: e.message }); }
});

router.get('/lineage/columns/:assetId', async (req, res) => {
  try {
    const lineageService = require('../services/lineageService');
    const columns = await lineageService.getColumnsForAsset(req.params.assetId);
    res.json({ columns });
  } catch (e) { res.json({ columns: [], error: e.message }); }
});

router.get('/lineage/column/:columnId/upstream', async (req, res) => {
  try {
    const lineageService = require('../services/lineageService');
    const depth = parseInt(req.query.depth || '3', 10);
    const edges = await lineageService.getUpstreamLineage(req.params.columnId, depth);
    res.json({ edges });
  } catch (e) { res.json({ edges: [], error: e.message }); }
});

router.get('/lineage/column/:columnId/downstream', async (req, res) => {
  try {
    const lineageService = require('../services/lineageService');
    const depth = parseInt(req.query.depth || '3', 10);
    const edges = await lineageService.getDownstreamLineage(req.params.columnId, depth);
    res.json({ edges });
  } catch (e) { res.json({ edges: [], error: e.message }); }
});

router.get('/lineage/column/:columnId/impact', async (req, res) => {
  try {
    const lineageService = require('../services/lineageService');
    res.json(await lineageService.getImpactAnalysis(req.params.columnId));
  } catch (e) { res.json({ impacted_columns: 0, impacted_assets: 0, edges: 0, max_depth: 0, details: [], error: e.message }); }
});

// Upload a real dbt manifest.json — accepts the full manifest object in body
router.post('/lineage/dbt/ingest', async (req, res) => {
  try {
    const { manifest, project_name } = req.body;
    if (!manifest || !manifest.nodes) {
      return res.status(400).json({ error: 'Request body must contain `manifest` with a `nodes` field (dbt manifest.json)' });
    }
    const lineageService = require('../services/lineageService');
    const result = await lineageService.ingestDbtManifest(manifest, project_name || 'uploaded_dbt_project');
    res.json({ ingested: true, ...result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Re-seed the sample projects (for demos where the data was cleared)
router.post('/lineage/seed-samples', async (req, res) => {
  try {
    const lineageService = require('../services/lineageService');
    // Force re-seed regardless of existing data
    const { SAMPLE_PROJECTS } = require('../data/sampleLineageProjects');
    const results = [];
    for (const project of SAMPLE_PROJECTS) {
      results.push(await lineageService.ingestProject(project));
    }
    res.json({ seeded: true, projects: results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
