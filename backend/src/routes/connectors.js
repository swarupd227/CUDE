const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const fs   = require('fs');
const path = require('path');

const { connectors, scanDirectory, FORMAT_BY_EXT, DOMAIN_BY_EXT, registerConnector, removeConnector } = require('../services/connectorService');
const { parseAsset } = require('../services/domainParsers');
const { evaluateClassification, determineZone, getECCN, computeConfidence, inferContentSignals, assignRetentionPolicy, loadProjectRules } = require('../services/policyEngine');
const eventBus = require('../services/eventBus');

// Deterministic confidence score from file properties — same file always gets the same score
function stableConfidence(fileName, sizeMb, domain) {
  let hash = 0;
  const seed = `${fileName}|${sizeMb}|${domain}`;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const normalized = ((hash >>> 0) % 10000) / 10000;
  return parseFloat((0.60 + normalized * 0.37).toFixed(4));
}

// Resolve project_code: if it looks like a UUID, look up the real code from projects table
async function resolveProjectCode(projectCode, projectId) {
  const code = projectCode || '';
  if (code && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)) return code;
  // It's a UUID — resolve from DB
  const lookupId = projectId || code;
  if (!lookupId) return code || 'LOCAL_SCAN';
  try {
    const { query } = require('../db/pool');
    const result = await query('SELECT code FROM projects WHERE id = $1', [lookupId]);
    return result.rows[0]?.code || code;
  } catch { return code; }
}

let catalogRef = null;
let approvalQueueRef = null;
const setCatalog = (cat) => { catalogRef = cat; };
const setApprovalQueue = (q) => { approvalQueueRef = q; };

// Shared post-scan discovery: governance alert + entity-based relationships + Claude Investigator
// Called by ALL scan endpoints (local, OneDrive, S3, Azure Blob, SharePoint)
function runPostScanDiscovery(newAssets, projectId, emitFn) {
  if (!newAssets || newAssets.length === 0) return;

  // Governance Monitor alert
  setTimeout(() => {
    emitFn('AlertGenerated', 'Governance Monitor',
      `Post-scan governance check complete — ${newAssets.filter(a=>a.classification_zone!=='AUTONOMOUS').length} asset(s) require attention`,
      { alert_type:'POST_SCAN_REVIEW', assets_needing_review:newAssets.filter(a=>a.classification_zone!=='AUTONOMOUS').length });
  }, 1200);

  // Auto-tag assets with matching glossary terms + add glossary nodes to Neo4j
  setTimeout(async () => {
    try {
      const { matchGlossaryTerms } = require('../services/policyEngine');
      const { query: tagDbQuery } = require('../db/pool');
      const { v4: tagUuid } = require('uuid');
      let tagCount = 0;
      for (const asset of newAssets) {
        // Use pre-matched terms from scan if available, otherwise match now
        const terms = asset.glossary_matched_terms || [];
        let matchedTerms = terms;
        if (!matchedTerms.length) {
          const dk = asset.content_domain?.toLowerCase().replace('_document','').replace('_circuit','').replace('_recording','') || '';
          const dm = (dk && asset[`muas_${dk}`]) || asset.domain_metadata || {};
          const result = await matchGlossaryTerms(asset.file_name, dm.text_preview || '', asset.ai_analysis?.content_summary || '');
          matchedTerms = result.matched_terms;
        }
        for (const term of matchedTerms) {
          try {
            await tagDbQuery(
              `INSERT INTO asset_tags (id, asset_id, tag, tag_type, created_at) VALUES ($1, $2, $3, 'glossary', NOW()) ON CONFLICT (asset_id, tag) DO NOTHING`,
              [tagUuid(), asset.id, term]
            );
            tagCount++;
          } catch (_) {}
        }
      }
      if (tagCount > 0) {
        emitFn('TagsApplied', 'Glossary Engine',
          `Auto-tagged ${tagCount} asset(s) with matching business glossary terms`,
          { tags_applied: tagCount });
      }

      // Add glossary terms as Neo4j :Concept nodes and link to tagged assets
      try {
        const graphService = require('../services/graphService');
        if (graphService.isAvailable()) {
          const { loadGlossaryTerms } = require('../services/policyEngine');
          const glossaryTerms = await loadGlossaryTerms();
          // Upsert all glossary terms as :Concept nodes
          for (const term of glossaryTerms) {
            await graphService.upsertConceptNode(term.term, term.category, '').catch(() => {});
          }
          // Link assets to their matched concept nodes
          for (const asset of newAssets) {
            const matchedTerms = asset.glossary_matched_terms || [];
            for (const term of matchedTerms) {
              await graphService.linkAssetToConcept(asset.id, term).catch(() => {});
            }
          }
        }
      } catch (_) {}
    } catch (err) {
      console.error('Auto-tagging error:', err.message);
    }
  }, 1500);

  // Entity-based discovery + Claude Investigator (non-blocking)
  setTimeout(async () => {
    try {
      emitFn('ScanStage', 'Relationship Investigator', `Auto-discovering cross-file relationships for ${newAssets.length} new assets...`, { stage:'relationship_discovery' });
      // Build entity index from new assets + existing catalog
      const allAssets = catalogRef ? [...catalogRef] : [];
      const entityIdx = {};
      for (const a of allAssets) {
        const dk = a.content_domain?.toLowerCase().replace('_document','').replace('_circuit','').replace('_recording','') || '';
        const dm = (dk && a[`muas_${dk}`]) || a.domain_metadata || {};
        const ents = [...(dm.entities?.part_numbers || []), ...(dm.entities?.emails || []), ...(a.cross_reference_hints || [])];
        for (const e of ents) {
          if (!e || e.length < 2) continue;
          const k = e.toLowerCase().trim();
          if (!entityIdx[k]) entityIdx[k] = [];
          if (!entityIdx[k].find(x => x.id === a.id)) entityIdx[k].push({ id: a.id, domain: a.content_domain });
        }
      }
      // Create SHARES_ENTITY relationships — write to BOTH Neo4j AND PostgreSQL
      const graphService = require('../services/graphService');
      const { query: relDbQuery } = require('../db/pool');
      const { v4: relUuid } = require('uuid');
      let relCount = 0;
      for (const [entity, assets] of Object.entries(entityIdx)) {
        if (assets.length < 2) continue;
        for (let i = 0; i < Math.min(assets.length, 5); i++) {
          for (let j = i + 1; j < Math.min(assets.length, 5); j++) {
            const relType = assets[i].domain !== assets[j].domain ? 'SHARES_ENTITY' : 'SAME_ENTITY';
            if (graphService.isAvailable()) {
              await graphService.createRelationship(assets[i].id, assets[j].id, relType, 0.7, `Shared: ${entity}`);
            }
            try {
              await relDbQuery(
                `INSERT INTO asset_relationships (id, source_asset_id, target_asset_id, relationship_type, confidence, evidence, project_id, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) ON CONFLICT (source_asset_id, target_asset_id, relationship_type) DO NOTHING`,
                [relUuid(), assets[i].id, assets[j].id, relType, 0.7, JSON.stringify({ shared_entity: entity }), projectId || null]
              );
            } catch (_) {}
            relCount++;
          }
        }
      }
      if (relCount > 0) {
        emitFn('RelationshipFound', 'Relationship Investigator',
          `Auto-discovered ${relCount} cross-file relationship(s) based on shared entities`,
          { relationships: relCount });
      }

      // Auto-run Claude-based Investigator for cross-domain relationships
      try {
        const { investigate } = require('../services/claudeService');
        const domainsToInvestigate = {};
        for (const a of newAssets) {
          if (!domainsToInvestigate[a.content_domain]) domainsToInvestigate[a.content_domain] = [];
          domainsToInvestigate[a.content_domain].push(a);
        }
        const toInvestigate = Object.values(domainsToInvestigate).flatMap(arr => arr.slice(0, 2)).slice(0, 5);
        let aiRelCount = 0;
        for (const asset of toInvestigate) {
          emitFn('ScanStage', 'Relationship Investigator', `AI investigating relationships for ${asset.file_name}...`, { stage:'ai_investigation' });
          const invResult = await investigate(asset.id, catalogRef || []);
          if (invResult.relationships?.length > 0) {
            for (const rel of invResult.relationships) {
              const rType = (rel.relationship_type || 'REFERENCES_IP').toUpperCase().replace(/[-\s]+/g, '_').replace(/[^A-Z_]/g, '');
              if (graphService.isAvailable()) {
                graphService.createRelationship(asset.id, rel.asset_id, rType, rel.confidence || 0.7, rel.rationale || '').catch(() => {});
              }
              try {
                await relDbQuery(
                  `INSERT INTO asset_relationships (id, source_asset_id, target_asset_id, relationship_type, confidence, evidence, project_id, created_at)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) ON CONFLICT (source_asset_id, target_asset_id, relationship_type) DO NOTHING`,
                  [relUuid(), asset.id, rel.asset_id, rType, rel.confidence || 0.7,
                   JSON.stringify({ rationale: rel.rationale, auto_discovered: true }), projectId || null]
                );
              } catch (_) {}
              aiRelCount++;
            }
          }
        }
        if (aiRelCount > 0) {
          emitFn('RelationshipFound', 'Relationship Investigator',
            `AI auto-discovered ${aiRelCount} cross-domain relationship(s) for ${toInvestigate.length} assets`,
            { relationships: aiRelCount, ai_discovered: true });
        }
      } catch (aiErr) {
        console.error('Auto-investigate error:', aiErr.message);
      }
    } catch (err) {
      console.error('Post-scan discovery error:', err.message);
    }
  }, 3000);
}

// Helper: readable domain scanner name
function domainScannerName(domain) {
  const map = { ELECTRONIC_CIRCUIT:'Circuit Drawing Scanner', PDF_DOCUMENT:'PDF Document Scanner', OFFICE_DOCUMENT:'Office Document Scanner', AUDIO:'Audio & Meeting Scanner', VIDEO:'Video Content Scanner' };
  return map[domain] || 'Domain Scanner';
}

// Central emit with mandatory human-readable message
function emit(type, agentName, message, payload = {}) {
  const ev = { id:uuidv4(), type, agent:agentName, agentName, message, payload, timestamp:new Date().toISOString() };
  eventBus.publish(ev);
  return ev;
}

// ── List connectors ───────────────────────────────────────────────────────────
router.get('/', (req, res) => res.json(Object.values(connectors)));
router.get('/:id', (req, res) => {
  const c = connectors[req.params.id];
  if (!c) return res.status(404).json({ error:'Connector not found' });
  res.json(c);
});

// ── Create custom connector ──────────────────────────────────────────────────
router.post('/create', (req, res) => {
  try {
    const { name, category, icon, description, auth_type, supported_domains, config_fields, setup_steps } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Connector name is required' });
    const connector = registerConnector({ name: name.trim(), category, icon, description, auth_type, supported_domains, config_fields, setup_steps });
    emit('ConfigUpdated', 'Pipeline Orchestrator', `Custom connector created: "${connector.name}" (${connector.category})`, { connector_id: connector.id });
    res.status(201).json(connector);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Delete custom connector ─────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  try {
    const removed = removeConnector(req.params.id);
    emit('ConfigUpdated', 'Pipeline Orchestrator', `Custom connector deleted: "${removed.name}"`, { connector_id: removed.id });
    res.json({ success: true, deleted: removed.id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Update connector config ───────────────────────────────────────────────────
router.patch('/:id', (req, res) => {
  const c = connectors[req.params.id];
  if (!c) return res.status(404).json({ error:'Connector not found' });
  Object.assign(c.config, req.body.config || req.body);
  if (req.body.config?.enabled !== undefined || req.body.enabled !== undefined) {
    c.status = (req.body.config?.enabled ?? req.body.enabled) ? 'CONFIGURED' : 'DISABLED';
  }
  emit('ConfigUpdated', 'Pipeline Orchestrator', `Connector "${c.name}" configuration saved`, { connector: c.id });
  res.json(c);
});

// ── Test connector ────────────────────────────────────────────────────────────
router.post('/:id/test', async (req, res) => {
  const c = connectors[req.params.id];
  // For project-scoped connectors, the ID won't match global registry — use the config from request body
  const connType = req.body.type || c?.type || req.params.id;
  const config = req.body;

  // Local filesystem — real path test
  if (connType === 'local_filesystem' || req.params.id === 'local_filesystem') {
    const scanPath = config.scan_path || c?.config?.scan_path;
    if (!scanPath) return res.json({ success:false, message:'No scan path configured' });
    if (!fs.existsSync(scanPath)) return res.json({ success:false, message:`Path not found: ${scanPath}` });
    if (!fs.statSync(scanPath).isDirectory()) return res.json({ success:false, message:'Path exists but is not a folder' });
    const entries = fs.readdirSync(scanPath).length;
    return res.json({ success:true, message:`Folder accessible — ${entries} entries at top level`, details:{ path:scanPath, entries } });
  }

  // OneDrive — real Microsoft Graph API test
  if (connType === 'onedrive') {
    try {
      const oneDriveService = require('../services/oneDriveService');
      const result = await oneDriveService.testConnection(config);
      return res.json(result);
    } catch (e) {
      return res.json({ success:false, message:`OneDrive test failed: ${e.message}` });
    }
  }

  // SharePoint — real site access test
  if (connType === 'sharepoint') {
    try {
      const { testSharePointConnection } = require('../services/oneDriveService');
      const result = await testSharePointConnection(config);
      return res.json(result);
    } catch (e) {
      return res.json({ success:false, message:`SharePoint test failed: ${e.message}` });
    }
  }

  // AWS S3 — real SDK test
  if (connType === 'aws_s3') {
    try {
      const awsS3Service = require('../services/awsS3Service');
      const result = await awsS3Service.testConnection(config);
      return res.json(result);
    } catch (e) {
      return res.json({ success:false, message:`S3 test failed: ${e.message}` });
    }
  }

  // Azure Blob Storage — real SDK test
  if (connType === 'azure_blob') {
    try {
      const azureBlobService = require('../services/azureBlobService');
      const result = await azureBlobService.testConnection(config);
      return res.json(result);
    } catch (e) {
      return res.json({ success:false, message:`Azure Blob test failed: ${e.message}` });
    }
  }

  // Other connectors — check for missing fields
  const configObj = c?.config || config;
  const missing = Object.entries(configObj).filter(([k,v]) => k!=='enabled'&&!v&&typeof v!=='boolean'&&typeof v!=='number').map(([k])=>k);
  if (missing.length) return res.json({ success:false, message:`Missing required fields: ${missing.join(', ')}`, details:{ missing } });
  res.json({ success:true, message:'Connection test passed (simulated)', details:{ note:'Live test requires actual infrastructure' } });
});

// ── LOCAL FILESYSTEM SCAN — real discovery with granular SSE progress ─────────
router.post('/local_filesystem/scan', async (req, res) => {
  // Increase timeout for large scans (10 minutes)
  req.setTimeout(600000);
  res.setTimeout(600000);
  const scanPath    = req.body.scan_path  || connectors.local_filesystem.config.scan_path;
  const recursive   = req.body.recursive  !== undefined ? req.body.recursive : connectors.local_filesystem.config.recursive;
  const maxSizeMb   = req.body.file_size_limit_mb || connectors.local_filesystem.config.file_size_limit_mb || 5000;
  const projectId   = req.body.project_id || null;
  const projectCode = await resolveProjectCode(req.body.project_code, projectId) || 'LOCAL_SCAN';
  const designer    = req.body.designer    || 'local_discovery@company.com';

  if (!scanPath) return res.status(400).json({ error:'scan_path is required' });
  if (!fs.existsSync(scanPath)) return res.status(400).json({ error:`Path does not exist: ${scanPath}` });

  // ── Stage 1: Directory walk ──────────────────────────────────────────────
  emit('ScanStarted', 'Pipeline Orchestrator',
    `Starting local filesystem scan on: ${scanPath} (recursive: ${recursive})`,
    { path:scanPath, recursive });

  emit('ScanStage', 'Pipeline Orchestrator',
    `Walking directory tree — discovering all files recursively...`,
    { stage:'directory_walk', path:scanPath });

  const allFound  = scanDirectory(scanPath, recursive);
  const eligible  = allFound.filter(f => f.file_size_mb <= maxSizeMb);
  const skipped   = allFound.length - eligible.length;

  emit('ScanStage', 'Pipeline Orchestrator',
    `Directory walk complete — found ${allFound.length} total files, ${eligible.length} eligible (${skipped} skipped as oversized)`,
    { stage:'walk_complete', total_found:allFound.length, eligible:eligible.length, skipped });

  if (eligible.length === 0) {
    emit('ScanComplete', 'Pipeline Orchestrator',
      `Scan finished — no supported file types found in ${scanPath}`,
      { path:scanPath, discovered:0 });
    return res.json({ scan_path:scanPath, total_found:0, skipped, assets:[], domain_summary:{}, message:'No supported file types found. Try a folder with PDF, DOCX, PPTX, XLSX, MP4, MP3, .gds, .v, .spi files.' });
  }

  // ── Stage 2: Format detection summary ───────────────────────────────────
  const domainGroups = eligible.reduce((acc,f) => { (acc[f.content_domain]||=[]).push(f); return acc; }, {});
  const domainSummaryMsg = Object.entries(domainGroups)
    .map(([d,files]) => `${files.length} ${domainScannerName(d).replace(' Scanner','')}`)
    .join(', ');

  emit('ScanStage', 'Pipeline Orchestrator',
    `Format detection complete — routing to domain scanners: ${domainSummaryMsg}`,
    { stage:'format_dispatch', domain_breakdown: Object.fromEntries(Object.entries(domainGroups).map(([k,v])=>[k,v.length])) });

  // ── Stage 3: Process each file with per-file SSE events ──────────────────
  const crypto = require('crypto');
  const newAssets    = [];
  const skippedUnchanged = [];
  const domainSummary = {};

  for (let i = 0; i < eligible.length; i++) {
    const f = eligible[i];
    const pct = Math.round(((i+1) / eligible.length) * 100);
    const scannerName = domainScannerName(f.content_domain);

    // Progress heartbeat
    const heartbeatEvery = eligible.length <= 20 ? 1 : eligible.length <= 100 ? 3 : 5;
    if (i % heartbeatEvery === 0 || i === eligible.length - 1) {
      emit('ScanProgress', 'Pipeline Orchestrator',
        `[${pct}%] Processing file ${i+1} of ${eligible.length}: ${f.file_name}`,
        { current:i+1, total:eligible.length, pct, file_name:f.file_name, domain:f.content_domain });
    }

    // ── Incremental scan: SHA-256 content hash for delta detection ─────────
    let contentHash = null;
    try {
      const fileBytes = fs.readFileSync(f.full_path);
      contentHash = crypto.createHash('sha256').update(fileBytes).digest('hex').substring(0, 16);
    } catch (_) {}

    // ── Delta detection: skip unchanged files ───────────────────────────────
    // Check in-memory catalog first (fast path for same-session rescans)
    if (contentHash && catalogRef) {
      const existing = catalogRef.find(a => a.full_path === f.full_path && a.content_hash === contentHash);
      if (existing) { skippedUnchanged.push(f.file_name); continue; }
    }

    // Check PostgreSQL for cross-restart dedup (always check, regardless of projectId)
    if (contentHash) {
      try {
        const { query: dbQuery } = require('../db/pool');
        const check = await dbQuery(
          'SELECT id FROM assets WHERE full_path = $1 AND content_hash = $2 LIMIT 1',
          [f.full_path, contentHash]
        );
        if (check.rows.length > 0) { skippedUnchanged.push(f.file_name); continue; }
      } catch (_) { /* DB not available — proceed without dedup */ }
    }

    // Announce handoff to domain scanner
    emit('AssetDiscovered', scannerName,
      `Discovered: ${f.file_name} (${f.content_domain.replace('_',' ')} · ${f.file_size_mb < 1 ? (f.file_size_mb*1024).toFixed(0)+'KB' : f.file_size_mb.toFixed(1)+'MB'})`,
      { file_name:f.file_name, domain:f.content_domain, size_mb:f.file_size_mb, full_path:f.full_path });

    // Emit each parser stage as it happens
    let parseResult;
    try {
      parseResult = await parseAssetWithStageEvents(
        f.content_domain, f.format, f.file_name, f.file_size_mb, scannerName, f.full_path
      );
    } catch (parseErr) {
      emit('ScanStage', scannerName, `Parse failed for ${f.file_name}: ${parseErr.message} — skipping`, { file_name: f.file_name, error: parseErr.message });
      continue; // Skip this file, move to next
    }

    // Classification — evidence-based confidence from actual content analysis
    const signals = inferContentSignals(f.file_name, f.content_domain, parseResult);
    // Glossary-driven signal injection — match business terms and inject their related_signals
    const { matchGlossaryTerms } = require('../services/policyEngine');
    const textPreview = parseResult?.domain_metadata?.text_preview || '';
    const glossaryMatch = await matchGlossaryTerms(f.file_name, textPreview, '');
    if (glossaryMatch.injected_signals.length > 0) {
      signals.push(...glossaryMatch.injected_signals.filter(s => !signals.includes(s)));
    }
    // Load project-specific rules (cached for 60s during batch scans)
    const projectRules = projectId ? await loadProjectRules(projectId) : [];
    const policy  = evaluateClassification(signals, projectRules);
    const confResult = computeConfidence(signals, policy.matched_rules, parseResult, f.file_name);
    const conf    = confResult.confidence;
    const zone    = determineZone(conf, policy.recommended_tier);

    const zoneLabel = { AUTONOMOUS:'auto-classified', SUPERVISED:'queued for human review', GATED:'flagged — requires legal approval', PENDING_REVIEW:'low confidence — escalated' }[zone] || zone;

    emit('ClassificationProposed', 'Classification Arbiter',
      `${f.file_name} → ${policy.recommended_tier} (${Math.round(conf*100)}% confidence) — ${zoneLabel}${glossaryMatch.matched_terms.length > 0 ? ` [Glossary: ${glossaryMatch.matched_terms.join(', ')}]` : ''}`,
      { file_name:f.file_name, tier:policy.recommended_tier, confidence:conf, zone, rules:policy.matched_rules.map(r=>r.id), glossary_terms:glossaryMatch.matched_terms });

    const asset = {
      id: uuidv4(), file_name:f.file_name, full_path:f.full_path,
      content_domain:f.content_domain, asset_type:f.format,
      project_id:projectId, project_code:projectCode, designer, file_size_mb:f.file_size_mb, content_hash:contentHash,
      parser_used:parseResult.parser_used, data_classification:policy.recommended_tier,
      ip_ownership_tier:'FIRST_PARTY',
      export_control:{ ear_eccn:getECCN(policy.recommended_tier, f.content_domain), itar_applicable:false, classifier_source:'AI_AUTO' },
      quality_score:parseResult.quality_score, ai_enriched:false,
      classification_confidence:conf, classification_zone:zone,
      lifecycle_state: zone === 'AUTONOMOUS' ? 'CLASSIFIED' : zone === 'GATED' ? 'GATED' : 'PENDING_REVIEW',
      release_status:'WIP', created_at:f.created_at, modified_at:f.modified_at,
      discovered_at:new Date().toISOString(), vault_path:f.full_path,
      source_connector:'local_filesystem',
      glossary_matched_terms: glossaryMatch.matched_terms,
      policy_rules_matched:policy.matched_rules.map(r=>r.id),
      parse_steps:parseResult.steps, parse_total_ms:parseResult.total_ms,
      [`muas_${f.content_domain.toLowerCase().replace('_document','').replace('_circuit','').replace('_recording','')}`]: parseResult.domain_metadata,
      agent_processing_log:[
        { agent:'Pipeline Orchestrator', action:'filesystem_scan', timestamp:new Date().toISOString(), result:`Discovered via local connector: ${f.full_path}` },
        { agent:scannerName, action:'parse', timestamp:new Date().toISOString(), result:`Parsed with ${parseResult.parser_used} in ${parseResult.total_ms}ms` },
        { agent:'Classification Arbiter', action:'classify', timestamp:new Date().toISOString(), result:`${policy.recommended_tier} at ${Math.round(conf*100)}% confidence` },
      ],
      pii_flag:{ contains_pii:f.content_domain==='AUDIO'&&Math.random()>0.7, pii_types:[] },
      retention_policy: assignRetentionPolicy(policy.recommended_tier, f.created_at),
    };

    newAssets.push(asset);
    domainSummary[f.content_domain] = (domainSummary[f.content_domain]||0)+1;

    // Queue non-autonomous assets for human review
    if (zone !== 'AUTONOMOUS' && approvalQueueRef) {
      const confPct = Math.round(conf*100);
      const matchedRuleIds = policy.matched_rules.map(r=>r.id);
      const matchedRuleDescs = policy.matched_rules.map(r=>r.description);
      const zoneReason = zone === 'GATED' ? 'Classification tier is TRADE_SECRET which requires mandatory legal approval (hard gate policy).'
        : zone === 'PENDING_REVIEW' ? `Classification confidence is ${confPct}% which is below the 70% threshold for supervised review. Manual classification is needed.`
        : `Classification confidence is ${confPct}% which is below the 90% auto-approval threshold. A data steward must verify the proposed tier.`;
      const reasoningSteps = [
        { step:1, thought:`Discovered file: ${f.file_name} (${f.content_domain}, ${f.file_size_mb < 1 ? (f.file_size_mb*1024).toFixed(0)+'KB' : f.file_size_mb.toFixed(1)+'MB'}) via local filesystem connector.`, action:'parse_asset', observation:`Parsed with ${parseResult.parser_used} in ${parseResult.total_ms}ms. Quality score: ${Math.round(parseResult.quality_score*100)}%.` },
        { step:2, thought:`Evaluating classification signals from filename patterns and content domain.`, action:'evaluate_classification', observation:`${matchedRuleIds.length} policy rule(s) matched: ${policy.matched_rules.map(r=>`${r.id} — ${r.description} (→ ${r.tier})`).join('; ') || 'no specific rules triggered, applying default INTERNAL tier'}. Recommended tier: ${policy.recommended_tier}.` },
        { step:3, thought:`Assessing classification confidence to determine governance zone.`, action:'determine_zone', observation:`Confidence: ${confPct}%. ${zoneReason} Placing in ${zone} zone for steward review.` },
      ];
      approvalQueueRef.push({ id:uuidv4(), asset_id:asset.id, project_id:projectId, zone, agent:'Classification Arbiter', proposed_tier:policy.recommended_tier, current_tier:'UNCLASSIFIED', confidence:conf, created_at:new Date().toISOString(), expires_at:new Date(Date.now()+172800000).toISOString(), status:'PENDING', reasoning_summary:`${f.file_name}: Classified as ${policy.recommended_tier} with ${confPct}% confidence. ${zoneReason}`, evidence:{ signals_detected:matchedRuleIds, reasoning_steps:reasoningSteps }, priority:zone==='GATED'?'CRITICAL':'HIGH' });
    }
  }

  // ── Stage 4: Write to catalog ────────────────────────────────────────────
  emit('ScanStage', 'Pipeline Orchestrator',
    `Writing ${newAssets.length} discovered assets to catalog and knowledge graph...`,
    { stage:'catalog_write', count:newAssets.length });

  if (catalogRef) newAssets.forEach(a => catalogRef.unshift(a));

  // Persist to PostgreSQL if available
  try {
    const assetRepo = require('../db/repositories/assetRepo');
    for (const a of newAssets) {
      try { await assetRepo.create(a); } catch (_) { /* dedup or DB error — asset stays in memory */ }
    }
  } catch (_) {}

  connectors.local_filesystem.last_scan    = new Date().toISOString();
  connectors.local_filesystem.files_discovered += newAssets.length;
  connectors.local_filesystem.status       = 'CONFIGURED';
  connectors.local_filesystem.config.scan_path = scanPath;

  const summary = Object.entries(domainSummary)
    .map(([d,n]) => `${n} ${domainScannerName(d).replace(' Scanner','')}`)
    .join(', ');

  emit('ScanComplete', 'Pipeline Orchestrator',
    `✅ Scan complete — ${newAssets.length} new assets discovered${skippedUnchanged.length > 0 ? `, ${skippedUnchanged.length} unchanged (skipped)` : ''} (${summary})`,
    { connector:'local_filesystem', path:scanPath, discovered:newAssets.length, domain_summary:domainSummary });

  // Audit + Index discovered assets
  try {
    const auditRepo = require('../db/repositories/auditRepo');
    auditRepo.write({ actor_type:'SYSTEM', actor_id:'Pipeline Orchestrator', action:'connector.scanned', entity_type:'connector', entity_id:'local_filesystem', after_state:{ path:scanPath, discovered:newAssets.length, domain_summary:domainSummary } }).catch(()=>{});
  } catch (_) {}
  try {
    const searchService = require('../services/searchService');
    if (searchService.isAvailable()) {
      for (const a of newAssets) searchService.indexAsset(a).catch(()=>{});
    }
  } catch (_) {}
  // Neo4j graph population + auto-edges for local filesystem scan
  try {
    const graphService = require('../services/graphService');
    if (graphService.isAvailable()) {
      for (const a of newAssets) { graphService.upsertAssetNode(a).catch(() => {}); graphService.autoCreateProjectEdges(a).catch(() => {}); }
    }
  } catch (_) {}
  // Compute semantic embeddings for local filesystem scan
  try {
    const embeddingService = require('../services/embeddingService');
    if (embeddingService.isAvailable()) {
      for (const a of newAssets) {
        const dk = a.content_domain?.toLowerCase().replace('_document','').replace('_circuit','').replace('_recording','') || '';
        const dm = (dk && a[`muas_${dk}`]) || a.domain_metadata || {};
        const txt = [a.file_name, a.content_domain, a.project_code || '', dm.text_preview || ''].join(' ');
        embeddingService.embedAsset(a.id, txt).catch(() => {});
      }
    }
  } catch (_) {}

  // Run shared post-scan discovery: governance alert + entity relationships + Claude Investigator
  runPostScanDiscovery(newAssets, projectId, emit);

  res.json({ scan_path:scanPath, total_found:allFound.length, processed:newAssets.length, skipped_oversized:skipped, skipped_unchanged:skippedUnchanged.length, assets:newAssets, domain_summary:domainSummary, connector:connectors.local_filesystem });
});

// ── ONEDRIVE SCAN — real Microsoft Graph API discovery ───────────────────────
router.post('/onedrive/scan', async (req, res) => {
  const config = req.body;
  const projectId = req.body.project_id || null;
  const projectCode = await resolveProjectCode(req.body.project_code, projectId) || 'ONEDRIVE_SCAN';

  if (!config.tenant_id || !config.client_id || !config.client_secret || !config.user_email) {
    return res.status(400).json({ error: 'Missing required fields: tenant_id, client_id, client_secret, user_email' });
  }

  emit('ScanStarted', 'Pipeline Orchestrator',
    `Starting OneDrive scan for user: ${config.user_email}`,
    { connector: 'onedrive', user: config.user_email });

  try {
    const oneDriveService = require('../services/oneDriveService');
    const { parseAsset, detectFormat, detectDomain } = require('../services/domainParsers');
    const { evaluateClassification, determineZone, getECCN, computeConfidence, inferContentSignals, assignRetentionPolicy } = require('../services/policyEngine');

    // Stage 1: Discover files from OneDrive
    emit('ScanStage', 'Pipeline Orchestrator',
      `Authenticating with Microsoft Graph API and listing files...`,
      { stage: 'discovery' });

    const { token, files } = await oneDriveService.discoverFiles(config);

    emit('ScanStage', 'Pipeline Orchestrator',
      `Found ${files.length} supported files in OneDrive. Starting download and parsing...`,
      { stage: 'discovery_complete', total: files.length });

    if (files.length === 0) {
      emit('ScanComplete', 'Pipeline Orchestrator',
        `OneDrive scan complete — no supported files found for ${config.user_email}`,
        { connector: 'onedrive', discovered: 0 });
      return res.json({ scan_path: 'OneDrive:' + config.user_email, total_found: 0, processed: 0, assets: [], domain_summary: {} });
    }

    // Stage 2: Download and process each file
    const newAssets = [];
    const domainSummary = {};
    const crypto = require('crypto');
    const { v4: uuidv4 } = require('uuid');

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const pct = Math.round(((i + 1) / files.length) * 100);

      emit('ScanProgress', 'Pipeline Orchestrator',
        `[${pct}%] Processing ${i + 1} of ${files.length}: ${f.name}`,
        { current: i + 1, total: files.length, pct, file_name: f.name });

      // Delta detection — check if this file already exists
      const contentHash = f.content_hash || null;
      if (contentHash) {
        try {
          const { query: dbQuery } = require('../db/pool');
          const check = await dbQuery('SELECT id FROM assets WHERE content_hash = $1 AND source_connector = $2 LIMIT 1', [contentHash, 'onedrive']);
          if (check.rows.length > 0) continue; // Skip — already scanned
        } catch (_) {}
      }

      // Download file from OneDrive
      let fileBuffer = null;
      try {
        emit('ScanStage', domainScannerName(detectDomain(detectFormat(f.name))),
          `Downloading: ${f.name} (${f.size_mb < 1 ? (f.size_mb * 1024).toFixed(0) + 'KB' : f.size_mb.toFixed(1) + 'MB'})`,
          { file_name: f.name, stage: 'download' });

        fileBuffer = await oneDriveService.downloadFileContent(token, f.download_url);
      } catch (e) {
        emit('ScanStage', 'Pipeline Orchestrator',
          `Failed to download ${f.name}: ${e.message}`,
          { file_name: f.name, error: e.message });
        continue;
      }

      // Compute content hash from downloaded bytes
      const computedHash = crypto.createHash('sha256').update(fileBuffer).digest('hex').substring(0, 16);

      // Parse file
      const format = detectFormat(f.name);
      const domain = detectDomain(format);
      const scannerName = domainScannerName(domain);

      emit('AssetDiscovered', scannerName,
        `Discovered from OneDrive: ${f.name} (${domain.replace('_', ' ')})`,
        { file_name: f.name, domain, size_mb: f.size_mb });

      let parseResult;
      try {
        parseResult = await parseAsset(domain, format, f.name, f.size_mb, fileBuffer, null);
        emit('ParseComplete', scannerName,
          `Parsed: ${f.name} — ${parseResult.steps.length} stages in ${parseResult.total_ms}ms`,
          { file_name: f.name, parser: parseResult.parser_used });
      } catch (e) {
        emit('ScanStage', scannerName, `Parse failed for ${f.name}: ${e.message}`, {});
        continue;
      }

      // Classify with glossary-driven signal injection
      const signals = inferContentSignals(f.name, domain, parseResult);
      const { matchGlossaryTerms: matchGlossary } = require('../services/policyEngine');
      const glossaryMatch = await matchGlossary(f.name, parseResult?.domain_metadata?.text_preview || '', '');
      if (glossaryMatch.injected_signals.length > 0) signals.push(...glossaryMatch.injected_signals.filter(s => !signals.includes(s)));
      const policy = evaluateClassification(signals, projectId ? await loadProjectRules(projectId) : []);
      const confResult = computeConfidence(signals, policy.matched_rules, parseResult, f.name);
      const conf = confResult.confidence;
      const zone = determineZone(conf, policy.recommended_tier);

      emit('ClassificationProposed', 'Classification Arbiter',
        `${f.name} → ${policy.recommended_tier} (${Math.round(conf * 100)}% confidence) — ${zone === 'AUTONOMOUS' ? 'auto-classified' : 'queued for review'}${glossaryMatch.matched_terms.length > 0 ? ` [Glossary: ${glossaryMatch.matched_terms.join(', ')}]` : ''}`,
        { file_name: f.name, tier: policy.recommended_tier, confidence: conf, zone, glossary_terms: glossaryMatch.matched_terms });

      const asset = {
        id: uuidv4(), file_name: f.name, full_path: f.web_url || `onedrive://${config.user_email}${f.parent_path}/${f.name}`,
        content_domain: domain, asset_type: format, asset_format: format,
        project_id: projectId, project_code: projectCode, designer: config.user_email,
        file_size_mb: f.size_mb, file_size_bytes: f.size_bytes, content_hash: computedHash,
        parser_used: parseResult.parser_used, data_classification: policy.recommended_tier,
        ip_ownership_tier: 'FIRST_PARTY',
        export_control: { ear_eccn: getECCN(policy.recommended_tier, domain), itar_applicable: false, classifier_source: 'AI_AUTO' },
        quality_score: parseResult.quality_score, ai_enriched: false,
        classification_confidence: conf, classification_zone: zone,
        lifecycle_state: zone === 'AUTONOMOUS' ? 'CLASSIFIED' : zone === 'GATED' ? 'GATED' : 'PENDING_REVIEW',
        release_status: 'WIP', created_at: f.created_at || new Date().toISOString(), modified_at: f.modified_at || new Date().toISOString(),
        discovered_at: new Date().toISOString(), vault_path: f.web_url || f.download_url,
        source_connector: 'onedrive',
        glossary_matched_terms: glossaryMatch.matched_terms,
        policy_rules_matched: policy.matched_rules.map(r => r.id),
        retention_policy: assignRetentionPolicy(policy.recommended_tier, f.created_at),
        parse_steps: parseResult.steps, parse_total_ms: parseResult.total_ms,
        [`muas_${domain.toLowerCase().replace('_document', '').replace('_circuit', '').replace('_recording', '')}`]: parseResult.domain_metadata,
        agent_processing_log: [
          { agent: 'Pipeline Orchestrator', action: 'onedrive_scan', timestamp: new Date().toISOString(), result: `Discovered from OneDrive: ${f.web_url}` },
          { agent: scannerName, action: 'parse', timestamp: new Date().toISOString(), result: `Parsed with ${parseResult.parser_used} in ${parseResult.total_ms}ms` },
        ],
        pii_flag: { contains_pii: false, pii_types: [] },
      };

      newAssets.push(asset);
      domainSummary[domain] = (domainSummary[domain] || 0) + 1;

      // Queue for review if not autonomous
      if (zone !== 'AUTONOMOUS' && approvalQueueRef) {
        approvalQueueRef.push({ id: uuidv4(), asset_id: asset.id, project_id: projectId, zone, agent: 'Classification Arbiter', proposed_tier: policy.recommended_tier, current_tier: 'UNCLASSIFIED', confidence: conf, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 172800000).toISOString(), status: 'PENDING', reasoning_summary: `OneDrive file ${f.name}: classified as ${policy.recommended_tier} at ${Math.round(conf * 100)}% confidence.`, evidence: { signals_detected: policy.matched_rules.map(r => r.id) }, priority: zone === 'GATED' ? 'CRITICAL' : 'HIGH' });
      }
    }

    // Stage 3: Persist to catalog and database
    if (catalogRef) newAssets.forEach(a => catalogRef.unshift(a));

    try {
      const assetRepo = require('../db/repositories/assetRepo');
      for (const a of newAssets) {
        try { await assetRepo.create(a); } catch (_) {}
      }
    } catch (_) {}

    const summary = Object.entries(domainSummary).map(([d, n]) => `${n} ${domainScannerName(d).replace(' Scanner', '')}`).join(', ');

    emit('ScanComplete', 'Pipeline Orchestrator',
      `✅ OneDrive scan complete — ${newAssets.length} assets discovered from ${config.user_email} (${summary})`,
      { connector: 'onedrive', discovered: newAssets.length, domain_summary: domainSummary });

    // Audit + index
    try {
      const auditRepo = require('../db/repositories/auditRepo');
      auditRepo.write({ actor_type: 'SYSTEM', actor_id: 'Pipeline Orchestrator', action: 'connector.scanned', entity_type: 'connector', entity_id: 'onedrive', after_state: { user: config.user_email, discovered: newAssets.length, domain_summary: domainSummary } }).catch(() => {});
    } catch (_) {}
    try {
      const searchService = require('../services/searchService');
      if (searchService.isAvailable()) {
        for (const a of newAssets) searchService.indexAsset(a).catch(() => {});
      }
    } catch (_) {}
    // Neo4j graph population + auto-edges for cloud connector scans
    try {
      const graphService = require('../services/graphService');
      if (graphService.isAvailable()) {
        for (const a of newAssets) { graphService.upsertAssetNode(a).catch(() => {}); graphService.autoCreateProjectEdges(a).catch(() => {}); }
      }
    } catch (_) {}
    // Compute semantic embeddings
    try {
      const embeddingService = require('../services/embeddingService');
      if (embeddingService.isAvailable()) {
        for (const a of newAssets) {
          const dk = a.content_domain?.toLowerCase().replace('_document','').replace('_circuit','').replace('_recording','') || '';
          const dm = (dk && a[`muas_${dk}`]) || a.domain_metadata || {};
          const txt = [a.file_name, a.content_domain, a.project_code || '', dm.text_preview || ''].join(' ');
          embeddingService.embedAsset(a.id, txt).catch(() => {});
        }
      }
    } catch (_) {}

    // Run shared post-scan discovery
    runPostScanDiscovery(newAssets, projectId, emit);

    res.json({ scan_path: 'OneDrive:' + config.user_email, total_found: files.length, processed: newAssets.length, assets: newAssets, domain_summary: domainSummary });

  } catch (e) {
    emit('ScanStage', 'Pipeline Orchestrator', `OneDrive scan failed: ${e.message}`, { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ── AWS S3 SCAN — real AWS SDK discovery ────────────────────────────────────
router.post('/aws_s3/scan', async (req, res) => {
  const config = req.body;
  const projectId = req.body.project_id || null;
  const projectCode = await resolveProjectCode(req.body.project_code, projectId) || 'S3_SCAN';

  if (!config.access_key_id || !config.secret_access_key || !config.bucket_name) {
    return res.status(400).json({ error: 'Access Key ID, Secret Access Key, and Bucket Name required' });
  }

  emit('ScanStarted', 'Pipeline Orchestrator',
    `Starting AWS S3 scan for bucket: ${config.bucket_name}`,
    { connector: 'aws_s3', bucket: config.bucket_name });

  try {
    const awsS3Service = require('../services/awsS3Service');
    const { parseAsset, detectFormat, detectDomain } = require('../services/domainParsers');
    const { evaluateClassification, determineZone, getECCN, computeConfidence, inferContentSignals, assignRetentionPolicy } = require('../services/policyEngine');
    const crypto = require('crypto');
    const { v4: uuidv4 } = require('uuid');

    // Discover files
    emit('ScanStage', 'Pipeline Orchestrator',
      `Connecting to S3 and listing objects in bucket "${config.bucket_name}"...`,
      { stage: 'discovery' });

    const { files, bucket, region } = await awsS3Service.discoverFiles(config);

    emit('ScanStage', 'Pipeline Orchestrator',
      `Found ${files.length} supported files in S3 bucket "${bucket}". Starting download and parsing...`,
      { stage: 'discovery_complete', total: files.length });

    if (files.length === 0) {
      emit('ScanComplete', 'Pipeline Orchestrator',
        `S3 scan complete — no supported files found in "${bucket}"`,
        { connector: 'aws_s3', discovered: 0 });
      return res.json({ scan_path: `s3://${bucket}`, total_found: 0, processed: 0, assets: [], domain_summary: {} });
    }

    // Process each file
    const newAssets = [];
    const domainSummary = {};

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const pct = Math.round(((i + 1) / files.length) * 100);

      emit('ScanProgress', 'Pipeline Orchestrator',
        `[${pct}%] Processing ${i + 1} of ${files.length}: ${f.name}`,
        { current: i + 1, total: files.length, pct, file_name: f.name });

      // Delta detection
      if (f.etag) {
        try {
          const { query: dbQuery } = require('../db/pool');
          const check = await dbQuery('SELECT id FROM assets WHERE content_hash = $1 AND source_connector = $2 LIMIT 1', [f.etag, 'aws_s3']);
          if (check.rows.length > 0) continue;
        } catch (_) {}
      }

      // Download from S3
      let fileBuffer = null;
      try {
        const format = detectFormat(f.name);
        const domain = detectDomain(format);
        emit('ScanStage', domainScannerName(domain),
          `Downloading from S3: ${f.name} (${f.size_mb < 1 ? (f.size_mb * 1024).toFixed(0) + 'KB' : f.size_mb.toFixed(1) + 'MB'})`,
          { file_name: f.name, stage: 'download' });

        fileBuffer = await awsS3Service.downloadFileContent(config, f.s3_key);
      } catch (e) {
        emit('ScanStage', 'Pipeline Orchestrator', `Failed to download ${f.name}: ${e.message}`, {});
        continue;
      }

      const computedHash = crypto.createHash('sha256').update(fileBuffer).digest('hex').substring(0, 16);
      const format = detectFormat(f.name);
      const domain = detectDomain(format);
      const scannerName = domainScannerName(domain);

      emit('AssetDiscovered', scannerName,
        `Discovered from S3: ${f.name} (${domain.replace('_', ' ')})`,
        { file_name: f.name, domain, size_mb: f.size_mb });

      let parseResult;
      try {
        parseResult = await parseAsset(domain, format, f.name, f.size_mb, fileBuffer, null);
        emit('ParseComplete', scannerName,
          `Parsed: ${f.name} — ${parseResult.steps.length} stages in ${parseResult.total_ms}ms`,
          { file_name: f.name, parser: parseResult.parser_used });
      } catch (e) {
        emit('ScanStage', scannerName, `Parse failed for ${f.name}: ${e.message}`, {});
        continue;
      }

      const signals = inferContentSignals(f.name, domain, parseResult);
      const { matchGlossaryTerms: matchGlossaryS3 } = require('../services/policyEngine');
      const glossaryMatchS3 = await matchGlossaryS3(f.name, parseResult?.domain_metadata?.text_preview || '', '');
      if (glossaryMatchS3.injected_signals.length > 0) signals.push(...glossaryMatchS3.injected_signals.filter(s => !signals.includes(s)));
      const policy = evaluateClassification(signals, projectId ? await loadProjectRules(projectId) : []);
      const confResult = computeConfidence(signals, policy.matched_rules, parseResult, f.name);
      const conf = confResult.confidence;
      const zone = determineZone(conf, policy.recommended_tier);

      emit('ClassificationProposed', 'Classification Arbiter',
        `${f.name} → ${policy.recommended_tier} (${Math.round(conf * 100)}% confidence)${glossaryMatchS3.matched_terms.length > 0 ? ` [Glossary: ${glossaryMatchS3.matched_terms.join(', ')}]` : ''}`,
        { file_name: f.name, tier: policy.recommended_tier, confidence: conf, zone, glossary_terms: glossaryMatchS3.matched_terms });

      const asset = {
        id: uuidv4(), file_name: f.name, full_path: `s3://${bucket}/${f.s3_key}`,
        content_domain: domain, asset_type: format, asset_format: format,
        project_id: projectId, project_code: projectCode, designer: 'aws_s3',
        file_size_mb: f.size_mb, file_size_bytes: f.size_bytes, content_hash: computedHash,
        parser_used: parseResult.parser_used, data_classification: policy.recommended_tier,
        ip_ownership_tier: 'FIRST_PARTY',
        export_control: { ear_eccn: getECCN(policy.recommended_tier, domain), itar_applicable: false, classifier_source: 'AI_AUTO' },
        quality_score: parseResult.quality_score, ai_enriched: false,
        classification_confidence: conf, classification_zone: zone,
        lifecycle_state: zone === 'AUTONOMOUS' ? 'CLASSIFIED' : zone === 'GATED' ? 'GATED' : 'PENDING_REVIEW',
        release_status: 'WIP', created_at: f.modified_at || new Date().toISOString(), modified_at: f.modified_at || new Date().toISOString(),
        discovered_at: new Date().toISOString(), vault_path: `s3://${bucket}/${f.s3_key}`,
        source_connector: 'aws_s3',
        glossary_matched_terms: glossaryMatchS3.matched_terms,
        policy_rules_matched: policy.matched_rules.map(r => r.id),
        retention_policy: assignRetentionPolicy(policy.recommended_tier, f.modified_at),
        parse_steps: parseResult.steps, parse_total_ms: parseResult.total_ms,
        [`muas_${domain.toLowerCase().replace('_document', '').replace('_circuit', '').replace('_recording', '')}`]: parseResult.domain_metadata,
        agent_processing_log: [
          { agent: 'Pipeline Orchestrator', action: 'aws_s3_scan', timestamp: new Date().toISOString(), result: `Discovered from S3: s3://${bucket}/${f.s3_key}` },
          { agent: scannerName, action: 'parse', timestamp: new Date().toISOString(), result: `Parsed with ${parseResult.parser_used} in ${parseResult.total_ms}ms` },
        ],
        pii_flag: { contains_pii: false, pii_types: [] },
      };

      newAssets.push(asset);
      domainSummary[domain] = (domainSummary[domain] || 0) + 1;

      if (zone !== 'AUTONOMOUS' && approvalQueueRef) {
        approvalQueueRef.push({ id: uuidv4(), asset_id: asset.id, project_id: projectId, zone, agent: 'Classification Arbiter', proposed_tier: policy.recommended_tier, current_tier: 'UNCLASSIFIED', confidence: conf, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 172800000).toISOString(), status: 'PENDING', reasoning_summary: `S3 file ${f.name}: classified as ${policy.recommended_tier} at ${Math.round(conf * 100)}% confidence.`, evidence: { signals_detected: policy.matched_rules.map(r => r.id) }, priority: zone === 'GATED' ? 'CRITICAL' : 'HIGH' });
      }
    }

    // Persist
    if (catalogRef) newAssets.forEach(a => catalogRef.unshift(a));
    try { const assetRepo = require('../db/repositories/assetRepo'); for (const a of newAssets) { try { await assetRepo.create(a); } catch (_) {} } } catch (_) {}

    const summary = Object.entries(domainSummary).map(([d, n]) => `${n} ${domainScannerName(d).replace(' Scanner', '')}`).join(', ');
    emit('ScanComplete', 'Pipeline Orchestrator',
      `✅ S3 scan complete — ${newAssets.length} assets discovered from bucket "${bucket}" (${summary})`,
      { connector: 'aws_s3', discovered: newAssets.length, domain_summary: domainSummary });

    try { const auditRepo = require('../db/repositories/auditRepo'); auditRepo.write({ actor_type: 'SYSTEM', actor_id: 'Pipeline Orchestrator', action: 'connector.scanned', entity_type: 'connector', entity_id: 'aws_s3', after_state: { bucket, discovered: newAssets.length } }).catch(() => {}); } catch (_) {}
    try { const searchService = require('../services/searchService'); if (searchService.isAvailable()) { for (const a of newAssets) searchService.indexAsset(a).catch(() => {}); } } catch (_) {}
    try { const gs = require('../services/graphService'); if (gs.isAvailable()) { for (const a of newAssets) { gs.upsertAssetNode(a).catch(() => {}); gs.autoCreateProjectEdges(a).catch(() => {}); } } } catch (_) {}
    try { const es = require('../services/embeddingService'); if (es.isAvailable()) { for (const a of newAssets) { const dk = a.content_domain?.toLowerCase().replace('_document','').replace('_circuit','').replace('_recording','') || ''; const dm = (dk && a[`muas_${dk}`]) || a.domain_metadata || {}; es.embedAsset(a.id, [a.file_name, a.content_domain, a.project_code || '', dm.text_preview || ''].join(' ')).catch(() => {}); } } } catch (_) {}

    // Run shared post-scan discovery
    runPostScanDiscovery(newAssets, projectId, emit);

    res.json({ scan_path: `s3://${bucket}`, total_found: files.length, processed: newAssets.length, assets: newAssets, domain_summary: domainSummary });

  } catch (e) {
    emit('ScanStage', 'Pipeline Orchestrator', `S3 scan failed: ${e.message}`, { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ── AZURE BLOB SCAN — real Azure SDK discovery ──────────────────────────────
router.post('/azure_blob/scan', async (req, res) => {
  const config = req.body;
  const projectId = req.body.project_id || null;
  const projectCode = await resolveProjectCode(req.body.project_code, projectId) || 'AZURE_BLOB_SCAN';

  if (!config.container_name && (!config.connection_string && (!config.account_name || !config.account_key))) {
    return res.status(400).json({ error: 'Container name and credentials (Connection String or Account Name + Key) required' });
  }

  emit('ScanStarted', 'Pipeline Orchestrator',
    `Starting Azure Blob scan for container: ${config.container_name}`,
    { connector: 'azure_blob', container: config.container_name });

  try {
    const azureBlobService = require('../services/azureBlobService');
    const { parseAsset, detectFormat, detectDomain } = require('../services/domainParsers');
    const { evaluateClassification, determineZone, getECCN, computeConfidence, inferContentSignals, assignRetentionPolicy } = require('../services/policyEngine');
    const crypto = require('crypto');
    const { v4: uuidv4 } = require('uuid');

    // Stage 1: Discover files
    emit('ScanStage', 'Pipeline Orchestrator',
      `Connecting to Azure Blob Storage and listing files in container "${config.container_name}"...`,
      { stage: 'discovery' });

    const { files, account } = await azureBlobService.discoverFiles(config);

    emit('ScanStage', 'Pipeline Orchestrator',
      `Found ${files.length} supported files in container "${config.container_name}". Starting download and parsing...`,
      { stage: 'discovery_complete', total: files.length });

    if (files.length === 0) {
      emit('ScanComplete', 'Pipeline Orchestrator',
        `Azure Blob scan complete — no supported files found in "${config.container_name}"`,
        { connector: 'azure_blob', discovered: 0 });
      return res.json({ scan_path: `Azure:${account}/${config.container_name}`, total_found: 0, processed: 0, assets: [], domain_summary: {} });
    }

    // Stage 2: Download and process each file
    const newAssets = [];
    const domainSummary = {};

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const pct = Math.round(((i + 1) / files.length) * 100);

      emit('ScanProgress', 'Pipeline Orchestrator',
        `[${pct}%] Processing ${i + 1} of ${files.length}: ${f.name}`,
        { current: i + 1, total: files.length, pct, file_name: f.name });

      // Delta detection
      if (f.content_hash) {
        try {
          const { query: dbQuery } = require('../db/pool');
          const check = await dbQuery('SELECT id FROM assets WHERE content_hash = $1 AND source_connector = $2 LIMIT 1', [f.content_hash, 'azure_blob']);
          if (check.rows.length > 0) continue;
        } catch (_) {}
      }

      // Download file from Azure Blob
      let fileBuffer = null;
      try {
        const format = detectFormat(f.name);
        const domain = detectDomain(format);
        emit('ScanStage', domainScannerName(domain),
          `Downloading from Azure: ${f.name} (${f.size_mb < 1 ? (f.size_mb * 1024).toFixed(0) + 'KB' : f.size_mb.toFixed(1) + 'MB'})`,
          { file_name: f.name, stage: 'download' });

        fileBuffer = await azureBlobService.downloadFileContent(config, f.blob_name);
      } catch (e) {
        emit('ScanStage', 'Pipeline Orchestrator', `Failed to download ${f.name}: ${e.message}`, {});
        continue;
      }

      const computedHash = crypto.createHash('sha256').update(fileBuffer).digest('hex').substring(0, 16);
      const format = detectFormat(f.name);
      const domain = detectDomain(format);
      const scannerName = domainScannerName(domain);

      emit('AssetDiscovered', scannerName,
        `Discovered from Azure Blob: ${f.name} (${domain.replace('_', ' ')})`,
        { file_name: f.name, domain, size_mb: f.size_mb });

      let parseResult;
      try {
        parseResult = await parseAsset(domain, format, f.name, f.size_mb, fileBuffer, null);
        emit('ParseComplete', scannerName,
          `Parsed: ${f.name} — ${parseResult.steps.length} stages in ${parseResult.total_ms}ms`,
          { file_name: f.name, parser: parseResult.parser_used });
      } catch (e) {
        emit('ScanStage', scannerName, `Parse failed for ${f.name}: ${e.message}`, {});
        continue;
      }

      // Classify with glossary signal injection
      const signals = inferContentSignals(f.name, domain, parseResult);
      const { matchGlossaryTerms: matchGlossaryAz } = require('../services/policyEngine');
      const glossaryMatchAz = await matchGlossaryAz(f.name, parseResult?.domain_metadata?.text_preview || '', '');
      if (glossaryMatchAz.injected_signals.length > 0) signals.push(...glossaryMatchAz.injected_signals.filter(s => !signals.includes(s)));
      const policy = evaluateClassification(signals, projectId ? await loadProjectRules(projectId) : []);
      const confResult = computeConfidence(signals, policy.matched_rules, parseResult, f.name);
      const conf = confResult.confidence;
      const zone = determineZone(conf, policy.recommended_tier);

      emit('ClassificationProposed', 'Classification Arbiter',
        `${f.name} → ${policy.recommended_tier} (${Math.round(conf * 100)}% confidence)${glossaryMatchAz.matched_terms.length > 0 ? ` [Glossary: ${glossaryMatchAz.matched_terms.join(', ')}]` : ''}`,
        { file_name: f.name, tier: policy.recommended_tier, confidence: conf, zone, glossary_terms: glossaryMatchAz.matched_terms });

      const asset = {
        id: uuidv4(), file_name: f.name, full_path: `azure://${account}/${config.container_name}/${f.blob_name}`,
        content_domain: domain, asset_type: format, asset_format: format,
        project_id: projectId, project_code: projectCode, designer: 'azure_blob',
        file_size_mb: f.size_mb, file_size_bytes: f.size_bytes, content_hash: computedHash,
        parser_used: parseResult.parser_used, data_classification: policy.recommended_tier,
        ip_ownership_tier: 'FIRST_PARTY',
        export_control: { ear_eccn: getECCN(policy.recommended_tier, domain), itar_applicable: false, classifier_source: 'AI_AUTO' },
        quality_score: parseResult.quality_score, ai_enriched: false,
        classification_confidence: conf, classification_zone: zone,
        lifecycle_state: zone === 'AUTONOMOUS' ? 'CLASSIFIED' : zone === 'GATED' ? 'GATED' : 'PENDING_REVIEW',
        release_status: 'WIP', created_at: f.created_at || new Date().toISOString(), modified_at: f.modified_at || new Date().toISOString(),
        discovered_at: new Date().toISOString(), vault_path: `azure://${account}/${config.container_name}/${f.blob_name}`,
        source_connector: 'azure_blob',
        glossary_matched_terms: glossaryMatchAz.matched_terms,
        policy_rules_matched: policy.matched_rules.map(r => r.id),
        retention_policy: assignRetentionPolicy(policy.recommended_tier, f.created_at),
        parse_steps: parseResult.steps, parse_total_ms: parseResult.total_ms,
        [`muas_${domain.toLowerCase().replace('_document', '').replace('_circuit', '').replace('_recording', '')}`]: parseResult.domain_metadata,
        agent_processing_log: [
          { agent: 'Pipeline Orchestrator', action: 'azure_blob_scan', timestamp: new Date().toISOString(), result: `Discovered from Azure Blob: ${f.blob_name}` },
          { agent: scannerName, action: 'parse', timestamp: new Date().toISOString(), result: `Parsed with ${parseResult.parser_used} in ${parseResult.total_ms}ms` },
        ],
        pii_flag: { contains_pii: false, pii_types: [] },
      };

      newAssets.push(asset);
      domainSummary[domain] = (domainSummary[domain] || 0) + 1;

      if (zone !== 'AUTONOMOUS' && approvalQueueRef) {
        approvalQueueRef.push({ id: uuidv4(), asset_id: asset.id, project_id: projectId, zone, agent: 'Classification Arbiter', proposed_tier: policy.recommended_tier, current_tier: 'UNCLASSIFIED', confidence: conf, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 172800000).toISOString(), status: 'PENDING', reasoning_summary: `Azure Blob file ${f.name}: classified as ${policy.recommended_tier} at ${Math.round(conf * 100)}% confidence.`, evidence: { signals_detected: policy.matched_rules.map(r => r.id) }, priority: zone === 'GATED' ? 'CRITICAL' : 'HIGH' });
      }
    }

    // Persist
    if (catalogRef) newAssets.forEach(a => catalogRef.unshift(a));
    try { const assetRepo = require('../db/repositories/assetRepo'); for (const a of newAssets) { try { await assetRepo.create(a); } catch (_) {} } } catch (_) {}

    const summary = Object.entries(domainSummary).map(([d, n]) => `${n} ${domainScannerName(d).replace(' Scanner', '')}`).join(', ');

    emit('ScanComplete', 'Pipeline Orchestrator',
      `✅ Azure Blob scan complete — ${newAssets.length} assets discovered from "${config.container_name}" (${summary})`,
      { connector: 'azure_blob', discovered: newAssets.length, domain_summary: domainSummary });

    try { const auditRepo = require('../db/repositories/auditRepo'); auditRepo.write({ actor_type: 'SYSTEM', actor_id: 'Pipeline Orchestrator', action: 'connector.scanned', entity_type: 'connector', entity_id: 'azure_blob', after_state: { container: config.container_name, discovered: newAssets.length } }).catch(() => {}); } catch (_) {}
    try { const searchService = require('../services/searchService'); if (searchService.isAvailable()) { for (const a of newAssets) searchService.indexAsset(a).catch(() => {}); } } catch (_) {}
    try { const gs = require('../services/graphService'); if (gs.isAvailable()) { for (const a of newAssets) { gs.upsertAssetNode(a).catch(() => {}); gs.autoCreateProjectEdges(a).catch(() => {}); } } } catch (_) {}
    try { const es = require('../services/embeddingService'); if (es.isAvailable()) { for (const a of newAssets) { const dk = a.content_domain?.toLowerCase().replace('_document','').replace('_circuit','').replace('_recording','') || ''; const dm = (dk && a[`muas_${dk}`]) || a.domain_metadata || {}; es.embedAsset(a.id, [a.file_name, a.content_domain, a.project_code || '', dm.text_preview || ''].join(' ')).catch(() => {}); } } } catch (_) {}

    // Run shared post-scan discovery
    runPostScanDiscovery(newAssets, projectId, emit);

    res.json({ scan_path: `Azure:${account}/${config.container_name}`, total_found: files.length, processed: newAssets.length, assets: newAssets, domain_summary: domainSummary });

  } catch (e) {
    emit('ScanStage', 'Pipeline Orchestrator', `Azure Blob scan failed: ${e.message}`, { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ── SHAREPOINT SCAN — real Microsoft Graph API discovery ─────────────────────
router.post('/sharepoint/scan', async (req, res) => {
  const config = req.body;
  const projectId = req.body.project_id || null;
  const projectCode = await resolveProjectCode(req.body.project_code, projectId) || 'SHAREPOINT_SCAN';

  if (!config.tenant_id || !config.client_id || !config.client_secret || !config.site_url) {
    return res.status(400).json({ error: 'Missing required: tenant_id, client_id, client_secret, site_url' });
  }

  emit('ScanStarted', 'Pipeline Orchestrator',
    `Starting SharePoint scan for site: ${config.site_url}`,
    { connector: 'sharepoint', site: config.site_url });

  try {
    const { discoverSharePointFiles, downloadFileContent } = require('../services/oneDriveService');
    const { parseAsset, detectFormat, detectDomain } = require('../services/domainParsers');
    const { evaluateClassification, determineZone, getECCN, computeConfidence, inferContentSignals, assignRetentionPolicy } = require('../services/policyEngine');
    const crypto = require('crypto');
    const { v4: uuidv4 } = require('uuid');

    // Stage 1: Discover files from SharePoint
    emit('ScanStage', 'Pipeline Orchestrator',
      `Authenticating with Microsoft Graph API and listing document libraries...`,
      { stage: 'discovery' });

    const { token, files, siteInfo } = await discoverSharePointFiles(config);

    emit('ScanStage', 'Pipeline Orchestrator',
      `Found ${files.length} supported files in SharePoint site "${siteInfo.siteName}". Starting download and parsing...`,
      { stage: 'discovery_complete', total: files.length, site: siteInfo.siteName });

    if (files.length === 0) {
      emit('ScanComplete', 'Pipeline Orchestrator',
        `SharePoint scan complete — no supported files found in "${siteInfo.siteName}"`,
        { connector: 'sharepoint', discovered: 0 });
      return res.json({ scan_path: 'SharePoint:' + config.site_url, total_found: 0, processed: 0, assets: [], domain_summary: {} });
    }

    // Stage 2: Download and process each file
    const newAssets = [];
    const domainSummary = {};

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const pct = Math.round(((i + 1) / files.length) * 100);

      emit('ScanProgress', 'Pipeline Orchestrator',
        `[${pct}%] Processing ${i + 1} of ${files.length}: ${f.name}`,
        { current: i + 1, total: files.length, pct, file_name: f.name });

      // Delta detection
      const contentHash = f.content_hash || null;
      if (contentHash) {
        try {
          const { query: dbQuery } = require('../db/pool');
          const check = await dbQuery('SELECT id FROM assets WHERE content_hash = $1 AND source_connector = $2 LIMIT 1', [contentHash, 'sharepoint']);
          if (check.rows.length > 0) continue;
        } catch (_) {}
      }

      // Download file
      let fileBuffer = null;
      try {
        const format = detectFormat(f.name);
        const domain = detectDomain(format);
        emit('ScanStage', domainScannerName(domain),
          `Downloading from SharePoint: ${f.name} (${f.size_mb < 1 ? (f.size_mb * 1024).toFixed(0) + 'KB' : f.size_mb.toFixed(1) + 'MB'})`,
          { file_name: f.name, stage: 'download' });

        fileBuffer = await downloadFileContent(token, f.download_url);
      } catch (e) {
        emit('ScanStage', 'Pipeline Orchestrator', `Failed to download ${f.name}: ${e.message}`, {});
        continue;
      }

      const computedHash = crypto.createHash('sha256').update(fileBuffer).digest('hex').substring(0, 16);
      const format = detectFormat(f.name);
      const domain = detectDomain(format);
      const scannerName = domainScannerName(domain);

      emit('AssetDiscovered', scannerName,
        `Discovered from SharePoint: ${f.name} (${domain.replace('_', ' ')})`,
        { file_name: f.name, domain, size_mb: f.size_mb });

      let parseResult;
      try {
        parseResult = await parseAsset(domain, format, f.name, f.size_mb, fileBuffer, null);
        emit('ParseComplete', scannerName,
          `Parsed: ${f.name} — ${parseResult.steps.length} stages in ${parseResult.total_ms}ms`,
          { file_name: f.name, parser: parseResult.parser_used });
      } catch (e) {
        emit('ScanStage', scannerName, `Parse failed for ${f.name}: ${e.message}`, {});
        continue;
      }

      // Classify with glossary signal injection
      const signals = inferContentSignals(f.name, domain, parseResult);
      const { matchGlossaryTerms: matchGlossarySP } = require('../services/policyEngine');
      const glossaryMatchSP = await matchGlossarySP(f.name, parseResult?.domain_metadata?.text_preview || '', '');
      if (glossaryMatchSP.injected_signals.length > 0) signals.push(...glossaryMatchSP.injected_signals.filter(s => !signals.includes(s)));
      const policy = evaluateClassification(signals, projectId ? await loadProjectRules(projectId) : []);
      const confResult = computeConfidence(signals, policy.matched_rules, parseResult, f.name);
      const conf = confResult.confidence;
      const zone = determineZone(conf, policy.recommended_tier);

      emit('ClassificationProposed', 'Classification Arbiter',
        `${f.name} → ${policy.recommended_tier} (${Math.round(conf * 100)}% confidence)${glossaryMatchSP.matched_terms.length > 0 ? ` [Glossary: ${glossaryMatchSP.matched_terms.join(', ')}]` : ''}`,
        { file_name: f.name, tier: policy.recommended_tier, confidence: conf, zone, glossary_terms: glossaryMatchSP.matched_terms });

      const asset = {
        id: uuidv4(), file_name: f.name, full_path: f.web_url || `sharepoint://${config.site_url}${f.parent_path}/${f.name}`,
        content_domain: domain, asset_type: format, asset_format: format,
        project_id: projectId, project_code: projectCode, designer: 'sharepoint',
        file_size_mb: f.size_mb, file_size_bytes: f.size_bytes, content_hash: computedHash,
        parser_used: parseResult.parser_used, data_classification: policy.recommended_tier,
        ip_ownership_tier: 'FIRST_PARTY',
        export_control: { ear_eccn: getECCN(policy.recommended_tier, domain), itar_applicable: false, classifier_source: 'AI_AUTO' },
        quality_score: parseResult.quality_score, ai_enriched: false,
        classification_confidence: conf, classification_zone: zone,
        lifecycle_state: zone === 'AUTONOMOUS' ? 'CLASSIFIED' : zone === 'GATED' ? 'GATED' : 'PENDING_REVIEW',
        release_status: 'WIP', created_at: f.created_at || new Date().toISOString(), modified_at: f.modified_at || new Date().toISOString(),
        discovered_at: new Date().toISOString(), vault_path: f.web_url || f.download_url,
        source_connector: 'sharepoint',
        glossary_matched_terms: glossaryMatchSP.matched_terms,
        policy_rules_matched: policy.matched_rules.map(r => r.id),
        retention_policy: assignRetentionPolicy(policy.recommended_tier, f.created_at),
        parse_steps: parseResult.steps, parse_total_ms: parseResult.total_ms,
        [`muas_${domain.toLowerCase().replace('_document', '').replace('_circuit', '').replace('_recording', '')}`]: parseResult.domain_metadata,
        agent_processing_log: [
          { agent: 'Pipeline Orchestrator', action: 'sharepoint_scan', timestamp: new Date().toISOString(), result: `Discovered from SharePoint: ${f.web_url}` },
          { agent: scannerName, action: 'parse', timestamp: new Date().toISOString(), result: `Parsed with ${parseResult.parser_used} in ${parseResult.total_ms}ms` },
        ],
        pii_flag: { contains_pii: false, pii_types: [] },
      };

      newAssets.push(asset);
      domainSummary[domain] = (domainSummary[domain] || 0) + 1;

      // Queue for review if not autonomous
      if (zone !== 'AUTONOMOUS' && approvalQueueRef) {
        approvalQueueRef.push({ id: uuidv4(), asset_id: asset.id, project_id: projectId, zone, agent: 'Classification Arbiter', proposed_tier: policy.recommended_tier, current_tier: 'UNCLASSIFIED', confidence: conf, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 172800000).toISOString(), status: 'PENDING', reasoning_summary: `SharePoint file ${f.name}: classified as ${policy.recommended_tier} at ${Math.round(conf * 100)}% confidence.`, evidence: { signals_detected: policy.matched_rules.map(r => r.id) }, priority: zone === 'GATED' ? 'CRITICAL' : 'HIGH' });
      }
    }

    // Persist
    if (catalogRef) newAssets.forEach(a => catalogRef.unshift(a));
    try {
      const assetRepo = require('../db/repositories/assetRepo');
      for (const a of newAssets) { try { await assetRepo.create(a); } catch (_) {} }
    } catch (_) {}

    const summary = Object.entries(domainSummary).map(([d, n]) => `${n} ${domainScannerName(d).replace(' Scanner', '')}`).join(', ');

    emit('ScanComplete', 'Pipeline Orchestrator',
      `✅ SharePoint scan complete — ${newAssets.length} assets discovered from "${siteInfo.siteName}" (${summary})`,
      { connector: 'sharepoint', discovered: newAssets.length, domain_summary: domainSummary });

    // Audit + index
    try { const auditRepo = require('../db/repositories/auditRepo'); auditRepo.write({ actor_type: 'SYSTEM', actor_id: 'Pipeline Orchestrator', action: 'connector.scanned', entity_type: 'connector', entity_id: 'sharepoint', after_state: { site: config.site_url, discovered: newAssets.length } }).catch(() => {}); } catch (_) {}
    try { const searchService = require('../services/searchService'); if (searchService.isAvailable()) { for (const a of newAssets) searchService.indexAsset(a).catch(() => {}); } } catch (_) {}
    try { const gs = require('../services/graphService'); if (gs.isAvailable()) { for (const a of newAssets) { gs.upsertAssetNode(a).catch(() => {}); gs.autoCreateProjectEdges(a).catch(() => {}); } } } catch (_) {}
    try { const es = require('../services/embeddingService'); if (es.isAvailable()) { for (const a of newAssets) { const dk = a.content_domain?.toLowerCase().replace('_document','').replace('_circuit','').replace('_recording','') || ''; const dm = (dk && a[`muas_${dk}`]) || a.domain_metadata || {}; es.embedAsset(a.id, [a.file_name, a.content_domain, a.project_code || '', dm.text_preview || ''].join(' ')).catch(() => {}); } } } catch (_) {}

    // Run shared post-scan discovery
    runPostScanDiscovery(newAssets, projectId, emit);

    res.json({ scan_path: 'SharePoint:' + config.site_url, total_found: files.length, processed: newAssets.length, assets: newAssets, domain_summary: domainSummary, site: siteInfo });

  } catch (e) {
    emit('ScanStage', 'Pipeline Orchestrator', `SharePoint scan failed: ${e.message}`, { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ── Per-stage parse emitter ───────────────────────────────────────────────────
async function parseAssetWithStageEvents(domain, format, fileName, sizeMb, scannerName, filePath) {
  const { parseAsset: _parseAsset } = require('../services/domainParsers');

  // Read file buffer for real parsing (skip for files > 100MB to avoid memory pressure)
  let fileBuffer = null;
  if (filePath && sizeMb <= 100) {
    try { fileBuffer = fs.readFileSync(filePath); } catch (_) { /* Permission denied or locked — fall back to estimation */ }
  }

  // Run the parser with buffer for real content extraction
  const result = await _parseAsset(domain, format, fileName, sizeMb, fileBuffer, filePath);

  // Emit each stage individually after completion (stages already have timings)
  for (const step of result.steps) {
    const stageMsg = buildStageMessage(step.stage, fileName, step.detail);
    emit('ParseStage', scannerName, stageMsg,
      { file_name:fileName, stage:step.stage, detail:step.detail, ms:step.ms, status:step.status });
  }

  emit('ParseComplete', scannerName,
    `Parsing complete: ${fileName} — ${result.steps.length} stages in ${result.total_ms}ms (quality: ${Math.round(result.quality_score*100)}%)`,
    { file_name:fileName, parser:result.parser_used, stages:result.steps.length, total_ms:result.total_ms, quality:result.quality_score });

  return result;
}

function buildStageMessage(stage, fileName, detail) {
  const stageLabels = {
    magic_byte_verify:   `Verifying file header / magic bytes`,
    oasis_header_read:   `Reading OASIS header and version metadata`,
    cell_hierarchy_traverse: `Traversing cell hierarchy — building reference graph`,
    layer_map_extract:   `Extracting layer-purpose-pair map`,
    bounding_box_sample: `Sampling bounding boxes for top-level cells`,
    tokenize:            `Tokenising source file`,
    ast_parse:           `Building abstract syntax tree (AST)`,
    module_extract:      `Extracting module declarations and port lists`,
    parameter_extract:   `Extracting parameter and constant definitions`,
    subckt_scan:         `Scanning .subckt blocks and device instances`,
    param_extract:       `Extracting .param statements and model references`,
    device_count:        `Counting device instances and net connectivity`,
    model_ref_check:     `Resolving model references`,
    tcl_tokenize:        `Tokenising Tcl/SDC source`,
    clock_cmd_extract:   `Extracting clock definitions and frequencies`,
    path_group_parse:    `Parsing timing path groups and exceptions`,
    exception_map:       `Building false-path and multicycle-path map`,
    text_layer_extract:  `Extracting text layer from PDF`,
    page_quality_score:  `Scoring page quality for OCR decision`,
    ocr_fallback_check:  `Applying OCR on scanned / image-only pages`,
    table_detect:        `Detecting and extracting tables`,
    image_extract:       `Extracting embedded images for classification`,
    ner_pipeline:        `Running Named Entity Recognition (part numbers, customers, financials)`,
    slide_parse:         `Parsing all slides and embedded content`,
    speaker_notes_extract:`Extracting speaker notes — scanning for sensitive disclosures`,
    embedded_obj_scan:   `Scanning for embedded OLE objects and linked charts`,
    sensitivity_scan:    `Applying sensitivity keyword rules`,
    sheet_enum:          `Enumerating all worksheets including hidden sheets`,
    hidden_sheet_detect: `Checking for hidden sheets and protected ranges`,
    formula_extract:     `Extracting formula strings and named ranges`,
    named_range_scan:    `Scanning named ranges and defined names`,
    paragraph_extract:   `Extracting paragraphs and section structure`,
    tracked_changes_scan:`Scanning tracked changes and revision history`,
    table_parse:         `Extracting structured tables`,
    audio_normalize_16k: `Normalising audio to 16kHz mono (Whisper input format)`,
    whisper_transcribe:  `Transcribing with Whisper large-v3 ASR model`,
    speaker_diarize:     `Running speaker diarisation — identifying unique speakers`,
    pii_detect:          `Scanning transcript for PII (names, contacts, IDs)`,
    keyframe_sample:     `Extracting keyframes at scene boundaries`,
    clip_frame_classify: `Classifying frames with CLIP model (slides, circuits, lab, speaker)`,
    ocr_slide_frames:    `Applying OCR to slide and whiteboard frames`,
    measurement_screen_detect: `Detecting oscilloscope / spectrum analyser screens`,
    transcript_merge:    `Merging audio transcript with frame timeline`,
    audio_track_extract: `Extracting audio track for ASR pipeline`,
    run_length_decode:   `Decoding OASIS run-length compressed geometry`,
    cell_instance_count: `Counting cell instances across hierarchy levels`,
    layer_purpose_extract:`Extracting layer purpose definitions`,
    preprocess:          `Preprocessing source file (includes, defines resolution)`,
    parse_tree:          `Building parse tree from grammar`,
    sexpr_parse:         `Parsing S-expression format (KiCad native)`,
    sheet_meta_extract:  `Extracting sheet metadata and revision information`,
    component_list:      `Building component and footprint inventory`,
    net_class_map:       `Mapping net classes and design rules`,
    mdos_normalize:      `Normalising to MUAS v2.0 JSON-LD schema — writing catalog record`,
  };
  return `  └─ ${stageLabels[stage] || stage.replace(/_/g,' ')} — ${detail}`;
}

function inferSignals(fileName, domain) {
  const name = fileName.toLowerCase();
  const signals = [];
  if (name.includes('tapeout')||name.includes('gds')||name.includes('final')) signals.push('tapeout_schedule');
  if (name.includes('nda')||name.includes('customer')||name.includes('client')) signals.push('customer_nda');
  if (name.includes('roadmap')||name.includes('plan')) signals.push('product_roadmap');
  if (name.includes('cost')||name.includes('yield')||name.includes('price')) signals.push('die_cost_data');
  if (name.includes('teardown')||name.includes('competitive')) signals.push('competitive_teardown');
  if (name.includes('public')||name.includes('datasheet')||name.includes('press')) signals.push('public_datasheet');
  if (name.includes('sop')||name.includes('procedure')||name.includes('guide')) signals.push('internal_procedure');
  if (domain==='AUDIO'||domain==='VIDEO') signals.push('internal_procedure');
  if (!signals.length) signals.push('internal_procedure');
  return signals;
}

// ── Connector Schedule ───────────────────────────────────────────────────────
router.put('/:id/schedule', async (req, res) => {
  const { cron_expression } = req.body;
  if (!cron_expression) return res.status(400).json({ error: 'cron_expression is required' });
  try {
    const { updateConnectorSchedule } = require('../services/scheduler');
    const success = await updateConnectorSchedule(req.params.id, cron_expression);
    if (success) {
      res.json({ success: true, schedule_cron: cron_expression, message: 'Schedule saved. Takes effect on next server restart.' });
    } else {
      res.status(500).json({ error: 'Failed to update schedule' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = { router, setCatalog, setApprovalQueue };
