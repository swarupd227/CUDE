const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

const SYSTEM = `You are an AI agent in the CUDE (Configurable Universal Discovery Engine) governance platform.
You follow the ReAct (Reason + Act) pattern: observe, think, call tools, observe results, repeat.
Be precise, technical, and concise. Always output valid JSON when requested.
Context: You govern data assets across 6 domains: Electronic Circuit Drawings (ELECTRONIC_CIRCUIT), PDFs (PDF_DOCUMENT), Office Documents (OFFICE_DOCUMENT), Audio (AUDIO), Video (VIDEO), and Database Tables (STRUCTURED_DATA).
Classification tiers: PUBLIC < INTERNAL < CONFIDENTIAL < RESTRICTED < TRADE_SECRET.
HARD GATES (never act autonomously): TRADE_SECRET classification, access control changes, legal hold, retention enforcement.`;

// Generic agent reasoning call
async function agentReason(agentId, task, context, tools = []) {
  const prompt = `Agent: ${agentId}
Task: ${task}
Context: ${JSON.stringify(context, null, 2)}
${tools.length ? `Available tools: ${tools.join(', ')}` : ''}

Reason through this task step by step. Then provide your conclusion.
Respond ONLY with JSON (no markdown):
{
  "reasoning_steps": [
    {"step": 1, "thought": "...", "action": "tool_name or null", "action_input": "...", "observation": "..."}
  ],
  "conclusion": "...",
  "recommended_action": "AUTO_CLASSIFY | SUPERVISED_REVIEW | HUMAN_ESCALATE | INVESTIGATE",
  "confidence": 0.0,
  "signals_detected": ["..."]
}`;

  try {
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1000,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }]
    });
    const text = resp.content[0]?.text || '{}';
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch (_) {
    return getMockReason(agentId, task, context);
  }
}

// Arbiter: classification ambiguity resolution
async function arbitrate(asset, richContext) {
  const projectInfo = richContext?.project ? `\nProject: ${richContext.project.name} (${richContext.project.code}), Sensitivity Ceiling: ${richContext.project.sensitivity_ceiling}` : '';
  const precedentInfo = richContext?.precedents?.length > 0 ? `\nPrecedent decisions in this project (${richContext.precedents.length} most recent):\n${richContext.precedents.slice(0,5).map(p => `  - ${p.file_name}: ${p.decided_tier} (${p.rationale || 'no rationale recorded'})`).join('\n')}` : '';
  const queueInfo = richContext?.operational ? `\nOperational: ${richContext.operational.queue_depth} items in queue, ${richContext.operational.sla_items_at_risk} at SLA risk` : '';

  const prompt = `Arbiter Agent task: Resolve classification ambiguity for asset.

Asset metadata:
- File: ${asset.file_name}
- Domain: ${asset.content_domain}
- Project: ${asset.project_code}
- Current ML confidence: ${asset.classification_confidence}
- Proposed tier: ${asset.data_classification}
- Signals: ${JSON.stringify(asset.muas_audio?.topics || asset.muas_pdf?.entities || asset.muas_office || {})}${projectInfo}${precedentInfo}${queueInfo}

ReAct loop:
1. Assess initial confidence and signals
2. Simulate: query similar assets (tool: get_similar_classified_assets)
3. Simulate: query policy engine (tool: query_policy_engine)
4. Make final determination

Respond ONLY with JSON:
{
  "reasoning_steps": [{"step":1,"thought":"...","action":"tool_name","observation":"..."}],
  "final_tier": "CONFIDENTIAL|RESTRICTED|TRADE_SECRET",
  "final_confidence": 0.0,
  "zone": "AUTONOMOUS|SUPERVISED|GATED",
  "rationale": "...",
  "policy_rules_matched": ["R-14"],
  "evidence_summary": "...",
  "requires_human": true
}`;

  try {
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }]
    });
    return JSON.parse(resp.content[0]?.text?.replace(/```json|```/g, '').trim() || '{}');
  } catch (_) {
    return getMockArbiter(asset);
  }
}

// Investigator: cross-domain relationship discovery
async function investigate(assetId, catalog) {
  let target = catalog.find(a => a.id === assetId);
  let candidateSource = catalog;

  // If not in memory, load from PostgreSQL
  if (!target) {
    try {
      const assetRepo = require('../db/repositories/assetRepo');
      target = await assetRepo.findById(assetId);
      if (!target) return { relationships: [], summary: 'Asset not found' };
      // Also load candidates from PostgreSQL
      const allAssets = await assetRepo.findAll({ project_id: target.project_id }, 1, 50);
      candidateSource = allAssets.assets || [];
    } catch (e) {
      return { relationships: [], summary: 'Asset not found: ' + e.message };
    }
  }

  const candidates = candidateSource.filter(a => a.id !== assetId && (a.project_code === target.project_code || a.project_id === target.project_id)).slice(0, 12);
  // Build a lookup map so Claude can reference by file_name and we can resolve to asset IDs
  const candidateMap = {};
  candidates.forEach(a => { candidateMap[a.file_name.toLowerCase()] = a; });
  const prompt = `Investigator Agent task: Discover cross-domain relationships.

Target asset: ${target.file_name} (${target.content_domain}, ${target.project_code})
Candidate assets from same project:
${candidates.map(a => `- file_name: "${a.file_name}" (${a.content_domain}, conf:${a.classification_confidence})`).join('\n')}

Identify which candidates likely have a meaningful relationship to the target.
Relationship types: DOCUMENTS_CIRCUIT, DISCUSSES_DESIGN, PRESENTS_DESIGN, DERIVED_FROM, REFERENCES_IP

Respond ONLY with JSON:
{
  "reasoning_steps": [{"step":1,"thought":"...","action":"traverse_graph","observation":"..."}],
  "relationships": [
    {"file_name":"exact filename from the list above", "relationship_type":"...", "confidence":0.0, "rationale":"..."}
  ],
  "summary": "...",
  "graph_insights": "..."
}`;

  try {
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1000,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }]
    });
    const result = JSON.parse(resp.content[0]?.text?.replace(/```json|```/g, '').trim() || '{}');
    // Hydrate with actual asset data — match by file_name, not array index
    if (result.relationships) {
      result.relationships = result.relationships.map(r => {
        const fname = (r.file_name || r.asset_name || '').toLowerCase().trim();
        if (!fname) return { ...r, asset_id: null };
        // Priority: exact match → exact without extension → substring (only if name is long enough to avoid false positives)
        const matched = candidateMap[fname]
          || candidates.find(c => c.file_name.toLowerCase() === fname)
          || candidates.find(c => c.file_name.toLowerCase().replace(/\.\w+$/, '') === fname.replace(/\.\w+$/, ''))
          || (fname.length >= 8 && candidates.find(c => c.file_name.toLowerCase().includes(fname)));
        return {
          ...r,
          asset_id: matched?.id || r.asset_id,
          asset_name: matched?.file_name || r.file_name || '—',
          asset_domain: matched?.content_domain || '—',
        };
      }).filter(r => r.asset_id); // Remove unmatched relationships
    }
    return result;
  } catch (_) {
    return getMockInvestigator(target, candidates);
  }
}

// Reporter: compliance report generation
async function generateReport(catalog) {
  const stats = {
    total: catalog.length,
    by_domain: catalog.reduce((a, f) => { a[f.content_domain] = (a[f.content_domain]||0)+1; return a; }, {}),
    by_tier: catalog.reduce((a, f) => { a[f.data_classification] = (a[f.data_classification]||0)+1; return a; }, {}),
    by_zone: catalog.reduce((a, f) => { a[f.classification_zone] = (a[f.classification_zone]||0)+1; return a; }, {}),
    pending_review: catalog.filter(f => f.classification_zone === 'PENDING_REVIEW').length,
    itar_flagged: catalog.filter(f => f.export_control?.itar_applicable).length,
    pii_assets: catalog.filter(f => f.pii_flag?.contains_pii).length,
  };

  const prompt = `Reporter Agent task: Generate compliance report.

Catalog statistics:
${JSON.stringify(stats, null, 2)}

Generate a comprehensive governance compliance report.
Respond ONLY with JSON:
{
  "reasoning_steps": [{"step":1,"thought":"...","action":"query_by_classification","observation":"..."}],
  "risk_score": 0,
  "risk_level": "LOW|MEDIUM|HIGH|CRITICAL",
  "compliance_score": 0,
  "export_control_status": "COMPLIANT|AT_RISK|NON_COMPLIANT",
  "top_risks": ["..."],
  "recommendations": ["..."],
  "priority_actions": ["..."],
  "domain_insights": {"ELECTRONIC_CIRCUIT":"...","PDF_DOCUMENT":"...","OFFICE_DOCUMENT":"...","AUDIO":"...","VIDEO":"..."},
  "executive_summary": "..."
}`;

  try {
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }]
    });
    return { ...JSON.parse(resp.content[0]?.text?.replace(/```json|```/g,'').trim()||'{}'), stats, mock:false };
  } catch (_) {
    return getMockReport(stats);
  }
}

// Monitor: generate alerts
async function monitorAlerts(catalog) {
  const issues = {
    unclassified: catalog.filter(f => !f.export_control?.ear_eccn).length,
    pending_old: catalog.filter(f => f.classification_zone === 'PENDING_REVIEW').length,
    low_quality: catalog.filter(f => f.quality_score < 0.6).length,
    itar: catalog.filter(f => f.export_control?.itar_applicable).length,
    pii_unreviewed: catalog.filter(f => f.pii_flag?.contains_pii && f.classification_zone !== 'AUTONOMOUS').length,
  };

  return getMockAlerts(issues);
}

// ── Mock fallbacks ─────────────────────────────────────────────────────────────
function getMockReason(agentId, task) {
  return {
    reasoning_steps: [
      { step:1, thought:`Analyzing task: ${task.substring(0,80)}`, action:'query_catalog', observation:'Retrieved relevant assets from catalog.' },
      { step:2, thought:'Assessing classification signals and policy rule applicability.', action:'query_policy_engine', observation:'Policy rules R-14, R-22 evaluated.' },
      { step:3, thought:'Cross-referencing with similar classified assets for precedent.', action:'get_similar_classified_assets', observation:'4 similar assets found, avg classification: RESTRICTED.' },
    ],
    conclusion: 'Task completed. Recommendation based on policy rules and precedent.',
    recommended_action: 'SUPERVISED_REVIEW',
    confidence: 0.78,
    signals_detected: ['embedded_circuit','customer_nda'],
  };
}

function getMockArbiter(asset) {
  const conf = asset.classification_confidence;
  const tier = conf >= 0.85 ? asset.data_classification : 'RESTRICTED';
  return {
    reasoning_steps: [
      { step:1, thought:`Examining asset: ${asset.file_name} (${asset.content_domain}, current confidence: ${conf.toFixed(2)}). Confidence falls in ambiguous band — gathering additional evidence.`, action:'get_similar_classified_assets', observation:`Queried catalog for assets with similar domain (${asset.content_domain}) and project (${asset.project_code}).` },
      { step:2, thought:`Cross-referencing detected file signals against classification policy rules.`, action:'query_policy_engine', observation:`Policy engine evaluated signals derived from filename and domain. Recommended tier: ${tier}.` },
      { step:3, thought:`Recalculated confidence to ${Math.min(conf + 0.09, 0.92).toFixed(2)} after evidence. Zone: ${tier === 'TRADE_SECRET' ? 'GATED' : 'SUPERVISED'}.`, action:'create_review_package', observation:'Review package prepared and queued for steward decision.' },
    ],
    final_tier: tier,
    final_confidence: Math.min(conf + 0.09, 0.92),
    zone: tier === 'TRADE_SECRET' ? 'GATED' : 'SUPERVISED',
    rationale: `Classification Arbiter analysed ${asset.file_name} (${asset.content_domain}) with initial confidence ${conf.toFixed(2)}. After querying similar assets in project ${asset.project_code} and cross-referencing policy rules, recommended tier is ${tier} with confidence elevated to ${(Math.min(conf + 0.09, 0.92)).toFixed(2)}. Human review recommended.`,
    policy_rules_matched: conf < 0.75 ? ['R-31'] : ['R-30'],
    evidence_summary: `Evidence gathered from catalog query and policy engine evaluation. Confidence elevated from ${conf.toFixed(2)} to ${(Math.min(conf+0.09,0.92)).toFixed(2)}. Final zone: ${tier === 'TRADE_SECRET' ? 'GATED' : 'SUPERVISED'}.`,
    requires_human: true,
    mock: true,
  };
}

function getMockInvestigator(target, candidates) {
  const rels = candidates.slice(0, Math.min(3, candidates.length)).map((c, i) => {
    const types = ['DOCUMENTS_CIRCUIT','DISCUSSES_DESIGN','PRESENTS_DESIGN','REFERENCES_IP'];
    return { asset_id: c.id, asset_name: c.file_name, asset_domain: c.content_domain, relationship_type: types[i % types.length], confidence: 0.65 + Math.random() * 0.25, rationale: `Shared project code ${target.project_code} and overlapping entity references detected.` };
  });
  return {
    reasoning_steps: [
      { step:1, thought:`Target: ${target.file_name}. Starting graph traversal for project ${target.project_code}.`, action:'traverse_graph', observation:`${candidates.length} candidate assets in same project.` },
      { step:2, thought:'Checking entity overlap: part numbers, project codenames, designer identity.', action:'get_entity_references', observation:'Shared entities found across domains.' },
      { step:3, thought:'Scoring relationship confidence based on entity overlap and domain compatibility.', action:'compare_classifications', observation:`${rels.length} high-confidence relationships identified.` },
    ],
    relationships: rels,
    summary: `Found ${rels.length} cross-domain relationship(s) for ${target.file_name} within project ${target.project_code}. Assets share common project context and content references.`,
    graph_insights: `Project ${target.project_code} has ${candidates.length} catalogued assets across multiple content domains. ${rels.length} direct relationships discovered in this traversal.`,
    mock: true,
  };
}

function getMockReport(stats) {
  const riskScore = Math.min(100, stats.pending_review * 8 + stats.itar_flagged * 15 + stats.pii_assets * 3);
  return {
    stats, mock: true,
    risk_score: riskScore,
    risk_level: riskScore > 60 ? 'HIGH' : riskScore > 35 ? 'MEDIUM' : 'LOW',
    compliance_score: Math.max(40, 85 - riskScore / 2),
    export_control_status: stats.itar_flagged > 2 ? 'AT_RISK' : 'COMPLIANT',
    top_risks: [
      stats.pending_review > 0 ? `${stats.pending_review} asset(s) in approval queue awaiting steward decision` : null,
      stats.itar_flagged   > 0 ? `${stats.itar_flagged} asset(s) flagged ITAR-applicable — legal review required before international transfer` : null,
      stats.pii_assets     > 0 ? `${stats.pii_assets} asset(s) with PII detected — GDPR/CCPA obligations may apply` : null,
      riskScore > 50 ? 'Overall risk score above threshold — governance action recommended' : null,
    ].filter(Boolean),
    recommendations: [
      stats.pending_review > 0 ? `Process ${stats.pending_review} pending approval queue item(s) to maintain classification coverage` : 'Approval queue is clear — governance posture is healthy',
      stats.itar_flagged   > 0 ? 'Engage export compliance counsel to review ITAR-flagged assets before any international transfer' : 'No ITAR-applicable assets detected — export control posture is clean',
      `Run Classification Arbiter on any assets with confidence below 0.90 to reduce supervised-zone backlog`,
      `Schedule regular re-enrichment cycles for the ${stats.total} catalogued assets to maintain classification accuracy`,
    ].filter(Boolean),
    priority_actions: [
      stats.pending_review > 0 ? `Clear ${stats.pending_review} item(s) from approval queue — review classification proposals` : null,
      stats.itar_flagged   > 0 ? `Legal team review required for ${stats.itar_flagged} ITAR-applicable asset(s)` : null,
      stats.pii_assets     > 0 ? `Initiate PII redaction workflow for ${stats.pii_assets} asset(s) with detected personal data` : null,
      `Run Compliance Reporter weekly to maintain an up-to-date audit trail`,
    ].filter(Boolean),
    domain_insights: Object.fromEntries(
      Object.entries(stats.by_domain || {}).map(([domain, count]) => {
        const zoneBreakdown = stats.by_zone || {};
        const cls = stats.by_class || {};
        const restricted = (cls.RESTRICTED || 0) + (cls.TRADE_SECRET || 0);
        const domainLabels = { ELECTRONIC_CIRCUIT:'Electronic Circuit Drawings', PDF_DOCUMENT:'PDF Documents', OFFICE_DOCUMENT:'Office Documents', AUDIO:'Audio Recordings', VIDEO:'Video Files' };
        const label = domainLabels[domain] || domain;
        return [domain, `${count} ${label} asset${count!==1?'s':''} in catalog. ${restricted > 0 ? restricted + ' classified RESTRICTED or above.' : 'No high-sensitivity classifications detected.'} ${zoneBreakdown.SUPERVISED > 0 ? (zoneBreakdown.SUPERVISED) + ' asset(s) pending steward review.' : 'All classifications resolved.'}`];
      })
    ),
    executive_summary: `CUDE governance platform covers ${stats.total} assets across 5 domains. Overall compliance score: ${Math.max(40, 85 - riskScore / 2).toFixed(0)}%. Primary risks: ${stats.pending_review} assets in approval queue and ${stats.itar_flagged} ITAR-flagged files requiring legal review.`,
    reasoning_steps: [
      { step:1, thought:'Aggregating catalog statistics across all 5 content domains.', action:'query_by_classification', observation:`${stats.total} total assets. ${JSON.stringify(stats.by_domain)}` },
      { step:2, thought:'Evaluating export control coverage and ITAR flag status.', action:'get_export_controlled_assets', observation:`${stats.itar_flagged} ITAR-applicable assets. ${stats.pending_review} pending classification review.` },
      { step:3, thought:'Calculating risk score and compliance metrics.', action:'synthesize_report', observation:`Risk score: ${riskScore}. Compliance score: ${Math.max(40, 85 - riskScore / 2).toFixed(0)}%.` },
    ],
  };
}

function getMockAlerts(issues) {
  const alerts = [];
  if (issues.pending_old > 0) alerts.push({ id: require('uuid').v4(), severity:'HIGH', type:'QUEUE_SLA_BREACH', title:'Approval Queue SLA Risk', description:`${issues.pending_old} assets in PENDING_REVIEW approaching or past 72h SLA. Steward action required.`, agent:"Governance Monitor", created_at:new Date().toISOString(), asset_count:issues.pending_old });
  if (issues.itar > 0) alerts.push({ id: require('uuid').v4(), severity:'CRITICAL', type:'ITAR_UNREVIEWED', title:'ITAR-Applicable Assets Unreviewed', description:`${issues.itar} assets flagged as ITAR-applicable. Legal review required before any international transfer.`, agent:"Governance Monitor", created_at:new Date().toISOString(), asset_count:issues.itar });
  if (issues.pii_unreviewed > 0) alerts.push({ id: require('uuid').v4(), severity:'MEDIUM', type:'PII_UNRESOLVED', title:'PII Detected — Classification Incomplete', description:`${issues.pii_unreviewed} assets contain PII with incomplete governance classification. GDPR/CCPA obligations may apply.`, agent:"Governance Monitor", created_at:new Date().toISOString(), asset_count:issues.pii_unreviewed });
  if (issues.unclassified > 0) alerts.push({ id: require('uuid').v4(), severity:'MEDIUM', type:'ECCN_MISSING', title:'Assets Missing ECCN Classification', description:`${issues.unclassified} assets lack EAR ECCN codes. Export compliance gap detected.`, agent:"Governance Monitor", created_at:new Date().toISOString(), asset_count:issues.unclassified });
  alerts.push({ id: require('uuid').v4(), severity:'LOW', type:'QUALITY_DRIFT', title:'Quality Score Drift Detected', description:`${issues.low_quality} assets have quality scores below 0.60. Recommend re-enrichment cycle.`, agent:"Governance Monitor", created_at:new Date().toISOString(), asset_count:issues.low_quality });
  return alerts;
}

// ── OCR via Claude Vision ─────────────────────────────────────────────────────
// Sends a PDF page image (as base64) to Claude Vision to extract text from scanned documents.
// Only works when ANTHROPIC_API_KEY is set. Called by domainParsers when pdf-parse finds empty text layer.
async function ocrWithVision(imageBase64, mimeType = 'image/png') {
  if (!process.env.ANTHROPIC_API_KEY) return { text: '', error: 'ANTHROPIC_API_KEY not set' };
  try {
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
          { type: 'text', text: 'Extract ALL text from this document image. Return only the extracted text, nothing else. Preserve paragraph structure.' }
        ]
      }]
    });
    return { text: resp.content[0]?.text || '', success: true };
  } catch (e) {
    return { text: '', error: e.message };
  }
}

// ── Image description via Claude Vision ───────────────────────────────────────
// Produces a concise content description of an image (diagram, chart, photo,
// screenshot) for cataloguing + classification. Complements ocrWithVision.
async function describeImageWithVision(imageBase64, mimeType = 'image/png') {
  if (!process.env.ANTHROPIC_API_KEY) return { description: '', error: 'ANTHROPIC_API_KEY not set' };
  try {
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
          { type: 'text', text: 'Describe this image in 1-3 sentences for a data catalog. State what it depicts (e.g. schematic, chart, screenshot, photo, diagram, scanned document) and any sensitive content (PII, credentials, proprietary designs). Be concise.' }
        ]
      }]
    });
    return { description: resp.content[0]?.text || '', success: true };
  } catch (e) {
    return { description: '', error: e.message };
  }
}

// ── ASR via OpenAI Whisper API ────────────────────────────────────────────────
// Sends audio buffer to OpenAI's Whisper API for real transcription.
// Requires OPENAI_API_KEY env var. Max 25MB file size.
async function transcribeWithWhisper(audioBuffer, fileName) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { text: '', error: 'OPENAI_API_KEY not set' };
  if (audioBuffer.length > 25 * 1024 * 1024) return { text: '', error: 'File exceeds Whisper 25MB limit' };

  try {
    // Build multipart form data manually
    const boundary = '----CUDEWhisperBoundary' + Date.now();
    const ext = fileName.split('.').pop().toLowerCase();
    const mimeMap = { mp3:'audio/mpeg', mp4:'audio/mp4', m4a:'audio/mp4', wav:'audio/wav', webm:'audio/webm', ogg:'audio/ogg' };
    const mime = mimeMap[ext] || 'audio/mpeg';

    const parts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mime}\r\n\r\n`,
      audioBuffer,
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n`,
      `--${boundary}--\r\n`
    ];

    const body = Buffer.concat(parts.map(p => typeof p === 'string' ? Buffer.from(p) : p));

    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return { text: '', error: `Whisper API error ${resp.status}: ${errText}` };
    }

    const data = await resp.json();
    return { text: data.text || '', success: true, duration: data.duration };
  } catch (e) {
    return { text: '', error: e.message };
  }
}

// ── AI Content Analysis — the "wow factor" ───────────────────────────────────
// Claude reads extracted text and produces an intelligent content summary,
// classification rationale, risk assessment, and detected entities.
async function analyzeContent(asset, extractedText, entities) {
  // For audio/video without text, build a metadata description instead
  const isMedia = asset.content_domain === 'AUDIO' || asset.content_domain === 'VIDEO';
  const domKey = asset.content_domain?.toLowerCase().replace('_document','').replace('_circuit','').replace('_recording','') || '';
  const domMeta = (domKey && asset[`muas_${domKey}`]) || asset.domain_metadata || {};

  let textForAnalysis = extractedText || '';
  const isStructured = asset.content_domain === 'STRUCTURED_DATA';

  if (isStructured) {
    // Build rich metadata summary for database table analysis
    const metaParts = [`Database Table: ${asset.file_name}`, `Type: ${domMeta.table_type || 'table'}`];
    if (domMeta.row_count) metaParts.push(`Row Count: ${domMeta.row_count.toLocaleString()}`);
    if (domMeta.column_count) metaParts.push(`Column Count: ${domMeta.column_count}`);
    if (domMeta.pk_columns?.length) metaParts.push(`Primary Keys: ${domMeta.pk_columns.join(', ')}`);
    if (domMeta.fk_count) metaParts.push(`Foreign Key Count: ${domMeta.fk_count}`);
    if (domMeta.columns?.length) {
      metaParts.push(`\nColumns:`);
      domMeta.columns.forEach(c => {
        metaParts.push(`  - ${c.name} (${c.type}${c.isPrimaryKey ? ', PK' : ''}${c.isForeignKey ? ', FK' : ''}${c.nullable ? ', nullable' : ''})`);
      });
    }
    if (domMeta.foreign_keys?.length) {
      metaParts.push(`\nForeign Keys:`);
      domMeta.foreign_keys.forEach(fk => {
        metaParts.push(`  - ${fk.column} → ${fk.referencedTable}.${fk.referencedColumn}`);
      });
    }
    if (domMeta.data_quality) {
      metaParts.push(`\nData Quality: Completeness ${domMeta.data_quality.completeness}%, Uniqueness ${domMeta.data_quality.uniqueness}%, Freshness ${domMeta.data_quality.freshness}%`);
    }
    textForAnalysis = metaParts.join('\n');
  } else if (isMedia && textForAnalysis.length < 20) {
    // Build metadata summary for Claude to analyze
    const metaParts = [`File: ${asset.file_name}`, `Domain: ${asset.content_domain}`];
    if (domMeta.duration_seconds) metaParts.push(`Duration: ${domMeta.duration_seconds} seconds`);
    if (domMeta.format) metaParts.push(`Format: ${domMeta.format}`);
    if (domMeta.resolution) metaParts.push(`Resolution: ${domMeta.resolution}`);
    if (domMeta.video_codec) metaParts.push(`Video Codec: ${domMeta.video_codec}`);
    if (domMeta.sample_rate_hz) metaParts.push(`Sample Rate: ${domMeta.sample_rate_hz}Hz`);
    if (domMeta.channels) metaParts.push(`Channels: ${domMeta.channels}`);
    if (domMeta.bitrate) metaParts.push(`Bitrate: ${domMeta.bitrate}`);
    if (domMeta.title) metaParts.push(`Title: ${domMeta.title}`);
    if (domMeta.artist) metaParts.push(`Artist: ${domMeta.artist}`);
    textForAnalysis = metaParts.join('\n');
  }

  if (!process.env.ANTHROPIC_API_KEY || textForAnalysis.length < 20) {
    return getMockAnalysis(asset, textForAnalysis, entities);
  }

  const textSnippet = extractedText.substring(0, 3000); // Stay within token limits
  const prompt = `Analyze this ${asset.content_domain} file for data governance purposes.

File: ${asset.file_name}
Domain: ${asset.content_domain}
Size: ${asset.file_size_mb}MB

Extracted text (first 3000 chars):
---
${textSnippet}
---

Detected entities: ${JSON.stringify(entities || {})}

Respond ONLY with JSON:
{
  "content_summary": "2-3 sentence summary of what this file contains and its business purpose",
  "classification_rationale": "Why this should be classified at the recommended tier — cite specific content evidence",
  "recommended_tier": "PUBLIC|INTERNAL|CONFIDENTIAL|RESTRICTED|TRADE_SECRET",
  "risk_assessment": "Key governance risks identified in this content",
  "key_topics": ["topic1", "topic2", "topic3"],
  "sensitive_content_flags": ["specific sensitive items found, e.g. 'customer pricing on page 3', 'employee SSN detected'"],
  "pii_findings": [{"type": "EMAIL|PHONE|NAME|SSN|ADDRESS", "value": "the actual PII found", "context": "surrounding text snippet", "regulation": "GDPR|CCPA|both"}],
  "cross_reference_hints": ["entities/keywords that might link this file to other assets, e.g. part numbers, project names, product codenames"]
}`;

  try {
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }]
    });
    const result = JSON.parse(resp.content[0]?.text?.replace(/```json|```/g, '').trim() || '{}');
    result.ai_generated = true;
    return result;
  } catch (e) {
    return getMockAnalysis(asset, extractedText, entities);
  }
}

function getMockAnalysis(asset, text, entities) {
  const piiFindings = [];
  if (entities?.emails?.length) {
    entities.emails.forEach(e => piiFindings.push({ type:'EMAIL', value:e, context:`Found in document text`, regulation:'GDPR' }));
  }
  if (entities?.phones?.length) {
    entities.phones.forEach(p => piiFindings.push({ type:'PHONE', value:p, context:`Found in document text`, regulation:'CCPA' }));
  }

  // Build topics from text content OR from filename/domain for media files
  const topics = [];
  const t = (text || '').toLowerCase();
  const fname = (asset.file_name || '').toLowerCase();

  if (t.includes('cost') || t.includes('price') || t.includes('revenue')) topics.push('Financial Data');
  if (t.includes('customer') || t.includes('client')) topics.push('Customer Information');
  if (t.includes('design') || t.includes('circuit') || t.includes('schematic')) topics.push('Engineering Design');
  if (t.includes('schedule') || t.includes('milestone') || t.includes('deadline')) topics.push('Project Timeline');
  if (t.includes('confidential') || t.includes('restricted')) topics.push('Sensitive Classification');

  // Filename-based topic detection for media files
  if (fname.includes('meeting') || fname.includes('call') || fname.includes('review')) topics.push('Meeting Recording');
  if (fname.includes('demo') || fname.includes('presentation') || fname.includes('webinar')) topics.push('Presentation/Demo');
  if (fname.includes('training') || fname.includes('onboarding') || fname.includes('tutorial')) topics.push('Training Content');
  if (fname.includes('interview') || fname.includes('hr')) topics.push('HR Content');
  if (fname.includes('product') || fname.includes('launch') || fname.includes('roadmap')) topics.push('Product');

  if (!topics.length) {
    if (asset.content_domain === 'AUDIO') topics.push('Audio Recording');
    else if (asset.content_domain === 'VIDEO') topics.push('Video Content');
    else topics.push('General Documentation');
  }

  // Build domain-aware metadata description for audio/video
  const domKey = asset.content_domain?.toLowerCase().replace('_document','').replace('_circuit','').replace('_recording','') || '';
  const domMeta = (domKey && asset[`muas_${domKey}`]) || asset.domain_metadata || {};

  let contentDesc;
  if (asset.content_domain === 'VIDEO' || asset.content_domain === 'AUDIO') {
    const duration = domMeta.duration_seconds;
    const durationStr = duration ? (duration >= 3600 ? `${Math.floor(duration/3600)}h ${Math.floor((duration%3600)/60)}m` : duration >= 60 ? `${Math.floor(duration/60)}m ${duration%60}s` : `${duration}s`) : 'unknown duration';
    const format = domMeta.format || domMeta.video_codec || domMeta.audio_codec || asset.asset_type || '';
    const resolution = domMeta.resolution || '';
    const extras = [format, resolution, domMeta.bitrate].filter(Boolean).join(', ');
    contentDesc = `This ${asset.content_domain === 'VIDEO' ? 'video' : 'audio'} file (${asset.file_name}) is ${durationStr} long${extras ? ` — ${extras}` : ''}. ${asset.content_domain === 'AUDIO' ? 'Audio transcription is available when OPENAI_API_KEY (Whisper) is configured.' : 'Video frame analysis and audio transcription are available with API keys configured.'}`;
  } else {
    contentDesc = `This ${asset.content_domain.replace('_',' ').toLowerCase()} file (${asset.file_name}) contains ${text ? text.length + ' characters of extractable content' : 'content that could not be fully parsed'}. ${topics.length > 1 ? 'Topics covered include ' + topics.slice(0,3).join(', ') + '.' : ''}`;
  }

  // Risk assessment for media files
  let riskAssessment;
  if (asset.content_domain === 'AUDIO' || asset.content_domain === 'VIDEO') {
    const hasRiskyName = fname.includes('nda') || fname.includes('customer') || fname.includes('confidential') || fname.includes('earnings');
    riskAssessment = hasRiskyName
      ? `Filename suggests potentially sensitive content (${topics.join(', ')}). Audio/video content cannot be text-analyzed without transcription. Recommend enabling Whisper ASR for full content analysis.`
      : `Media file classified based on filename and metadata. No text content available for deep analysis. For full governance, enable audio transcription via OPENAI_API_KEY.`;
  } else {
    riskAssessment = piiFindings.length > 0 ? `${piiFindings.length} PII instance(s) found — GDPR/CCPA obligations may apply.` : 'No immediate governance risks identified from content analysis.';
  }

  return {
    content_summary: contentDesc,
    classification_rationale: `Classification based on ${text && text.length > 50 ? 'extracted text content and ' : ''}${entities && Object.values(entities).flat().length > 0 ? 'detected entities (' + Object.values(entities).flat().length + ' found) and ' : ''}file metadata, domain, and filename pattern analysis. ${piiFindings.length > 0 ? piiFindings.length + ' PII item(s) detected.' : 'No PII detected in available content.'}`,
    recommended_tier: asset.data_classification || 'INTERNAL',
    risk_assessment: riskAssessment,
    key_topics: topics,
    sensitive_content_flags: piiFindings.length > 0 ? [`${piiFindings.length} PII items detected`] : [],
    pii_findings: piiFindings,
    cross_reference_hints: entities?.part_numbers?.length > 0 ? entities.part_numbers : [],
    ai_generated: false,
    mock: true,
  };
}

// ── Natural Language Query (NLQ) ──────────────────────────────────────────────
// Translates a free-form question into structured catalog filters using Claude.
async function nlqSearch(query, catalogSummary) {
  const prompt = `You are a search assistant for a data discovery platform. The catalog contains unstructured assets across 5 domains: ELECTRONIC_CIRCUIT, PDF_DOCUMENT, OFFICE_DOCUMENT, AUDIO, VIDEO.

Classification tiers: PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED, TRADE_SECRET.
Classification zones: AUTONOMOUS, SUPERVISED, GATED, PENDING_REVIEW.

Current catalog summary:
${JSON.stringify(catalogSummary, null, 2)}

User's natural language query: "${query}"

Translate this into structured filters. Respond ONLY with JSON (no markdown):
{
  "interpretation": "Human-readable interpretation of what the user is looking for",
  "filters": {
    "domain": null or "ELECTRONIC_CIRCUIT"|"PDF_DOCUMENT"|"OFFICE_DOCUMENT"|"AUDIO"|"VIDEO",
    "classification": null or "PUBLIC"|"INTERNAL"|"CONFIDENTIAL"|"RESTRICTED"|"TRADE_SECRET",
    "zone": null or "AUTONOMOUS"|"SUPERVISED"|"GATED"|"PENDING_REVIEW",
    "search": null or "keyword to search in file names",
    "ai_enriched": null or true or false,
    "date_filter": null or "recent" or "last_week" or "last_month",
    "project": null or "project code"
  },
  "suggestion": "A helpful follow-up suggestion for the user"
}`;

  try {
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 500,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }]
    });
    return JSON.parse(resp.content[0]?.text?.replace(/```json|```/g, '').trim() || '{}');
  } catch (_) {
    // Fallback: basic keyword extraction without Claude
    const q = query.toLowerCase();
    const filters = {};
    if (q.includes('circuit') || q.includes('eda') || q.includes('gds') || q.includes('verilog')) filters.domain = 'ELECTRONIC_CIRCUIT';
    else if (q.includes('pdf')) filters.domain = 'PDF_DOCUMENT';
    else if (q.includes('word') || q.includes('excel') || q.includes('powerpoint') || q.includes('office') || q.includes('document')) filters.domain = 'OFFICE_DOCUMENT';
    else if (q.includes('audio') || q.includes('recording') || q.includes('meeting')) filters.domain = 'AUDIO';
    else if (q.includes('video')) filters.domain = 'VIDEO';
    if (q.includes('confidential')) filters.classification = 'CONFIDENTIAL';
    else if (q.includes('restricted') || q.includes('secret')) filters.classification = 'RESTRICTED';
    else if (q.includes('public')) filters.classification = 'PUBLIC';
    else if (q.includes('internal')) filters.classification = 'INTERNAL';
    if (q.includes('pending') || q.includes('review')) filters.zone = 'PENDING_REVIEW';
    else if (q.includes('gated') || q.includes('legal')) filters.zone = 'GATED';
    return { interpretation: `Searching for: ${query}`, filters, suggestion: 'Set ANTHROPIC_API_KEY for intelligent natural language search.' };
  }
}

// NLQ-to-SQL: translate natural language question to SQL query
async function nlqToSql(question, schemaContext, database) {
  const prompt = `You are a SQL query generator. Given a database schema and a natural language question, generate a MySQL SELECT query.

DATABASE: ${database}

SCHEMA:
${schemaContext}

RULES:
- Generate ONLY a SELECT statement (no INSERT, UPDATE, DELETE, DROP, etc.)
- Use backtick quoting for table and column names
- Include appropriate JOINs based on foreign key relationships
- Add LIMIT 1000 if not specified
- For aggregations, use GROUP BY and appropriate aggregate functions (SUM, COUNT, AVG, etc.)
- For date filtering, use the DimDate table and CalendarYear/CalendarQuarter columns
- Format currency values with 2 decimal places

QUESTION: ${question}

Respond ONLY with valid JSON:
{
  "sql": "SELECT ...",
  "explanation": "Brief explanation of what this query does",
  "tables_used": ["table1", "table2"]
}`;

  try {
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    });
    const text = resp.content[0]?.text?.replace(/```json|```/g, '').trim() || '{}';
    return JSON.parse(text);
  } catch (e) {
    // Mock fallback — generate simple query based on keywords
    return generateMockSql(question, database);
  }
}

function generateMockSql(question, database) {
  const q = question.toLowerCase();
  let sql, explanation, tables_used;

  if (q.includes('sales') && q.includes('territory')) {
    sql = 'SELECT t.SalesTerritoryRegion, t.SalesTerritoryCountry, SUM(f.SalesAmount) as TotalSales, COUNT(*) as OrderCount FROM FactInternetSales f JOIN DimSalesTerritory t ON f.SalesTerritoryKey = t.SalesTerritoryKey GROUP BY t.SalesTerritoryRegion, t.SalesTerritoryCountry ORDER BY TotalSales DESC LIMIT 20';
    explanation = 'Total internet sales grouped by sales territory region and country';
    tables_used = ['FactInternetSales', 'DimSalesTerritory'];
  } else if (q.includes('product') && (q.includes('top') || q.includes('best'))) {
    sql = 'SELECT p.EnglishProductName, SUM(f.SalesAmount) as TotalRevenue, SUM(f.OrderQuantity) as TotalQuantity FROM FactInternetSales f JOIN DimProduct p ON f.ProductKey = p.ProductKey GROUP BY p.EnglishProductName ORDER BY TotalRevenue DESC LIMIT 10';
    explanation = 'Top 10 products by total revenue from internet sales';
    tables_used = ['FactInternetSales', 'DimProduct'];
  } else if (q.includes('customer')) {
    sql = 'SELECT c.FirstName, c.LastName, c.EmailAddress, c.YearlyIncome, g.City, g.EnglishCountryRegionName, SUM(f.SalesAmount) as TotalSpent FROM DimCustomer c JOIN DimGeography g ON c.GeographyKey = g.GeographyKey LEFT JOIN FactInternetSales f ON c.CustomerKey = f.CustomerKey GROUP BY c.CustomerKey, c.FirstName, c.LastName, c.EmailAddress, c.YearlyIncome, g.City, g.EnglishCountryRegionName ORDER BY TotalSpent DESC LIMIT 20';
    explanation = 'Customer details with their total spending from internet sales';
    tables_used = ['DimCustomer', 'DimGeography', 'FactInternetSales'];
  } else if (q.includes('category') || q.includes('categories')) {
    sql = 'SELECT pc.EnglishProductCategoryName, COUNT(DISTINCT p.ProductKey) as ProductCount, SUM(f.SalesAmount) as TotalSales FROM FactInternetSales f JOIN DimProduct p ON f.ProductKey = p.ProductKey JOIN DimProductSubcategory ps ON p.ProductSubcategoryKey = ps.ProductSubcategoryKey JOIN DimProductCategory pc ON ps.ProductCategoryKey = pc.ProductCategoryKey GROUP BY pc.EnglishProductCategoryName ORDER BY TotalSales DESC';
    explanation = 'Sales breakdown by product category';
    tables_used = ['FactInternetSales', 'DimProduct', 'DimProductSubcategory', 'DimProductCategory'];
  } else if (q.includes('year') || q.includes('trend') || q.includes('monthly')) {
    sql = 'SELECT d.CalendarYear, d.EnglishMonthName, d.MonthNumberOfYear, SUM(f.SalesAmount) as MonthlySales, COUNT(*) as OrderCount FROM FactInternetSales f JOIN DimDate d ON f.OrderDateKey = d.DateKey GROUP BY d.CalendarYear, d.EnglishMonthName, d.MonthNumberOfYear ORDER BY d.CalendarYear, d.MonthNumberOfYear';
    explanation = 'Monthly sales trend across all years';
    tables_used = ['FactInternetSales', 'DimDate'];
  } else if (q.includes('reseller') || q.includes('channel')) {
    sql = 'SELECT r.ResellerName, r.BusinessType, SUM(f.SalesAmount) as TotalSales, COUNT(*) as OrderCount FROM FactResellerSales f JOIN DimReseller r ON f.ResellerKey = r.ResellerKey GROUP BY r.ResellerName, r.BusinessType ORDER BY TotalSales DESC LIMIT 15';
    explanation = 'Top resellers by total sales amount';
    tables_used = ['FactResellerSales', 'DimReseller'];
  } else if (q.includes('employee') || q.includes('rep')) {
    sql = 'SELECT e.FirstName, e.LastName, e.Title, SUM(f.SalesAmount) as TotalSales, COUNT(*) as OrderCount FROM FactResellerSales f JOIN DimEmployee e ON f.EmployeeKey = e.EmployeeKey GROUP BY e.EmployeeKey, e.FirstName, e.LastName, e.Title ORDER BY TotalSales DESC';
    explanation = 'Sales performance by employee/sales representative';
    tables_used = ['FactResellerSales', 'DimEmployee'];
  } else {
    sql = 'SELECT TABLE_NAME, TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = \'' + database + '\' AND TABLE_TYPE = \'BASE TABLE\' ORDER BY TABLE_ROWS DESC';
    explanation = 'Showing all tables in the database with row counts';
    tables_used = ['INFORMATION_SCHEMA'];
  }

  return { sql, explanation, tables_used, mock: true };
}

module.exports = { agentReason, arbitrate, investigate, generateReport, monitorAlerts, ocrWithVision, describeImageWithVision, transcribeWithWhisper, nlqSearch, analyzeContent, nlqToSql };
