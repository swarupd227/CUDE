// Classification policy engine - implements the MUAS v2.0 classification policy matrix

const RULES = [
  { id:'R-01', tier:'TRADE_SECRET', signals:['die_cost_data','yield_data','process_node_params'], description:'Die cost, yield, or process parameters detected' },
  { id:'R-02', tier:'TRADE_SECRET', signals:['unreleased_ip_core','mask_shop_delivery'], description:'Unreleased IP core or mask shop data' },
  { id:'R-14', tier:'RESTRICTED', signals:['tapeout_schedule','customer_nda'], description:'Tapeout schedule + customer NDA reference' },
  { id:'R-15', tier:'RESTRICTED', signals:['competitive_teardown','unreleased_device'], description:'Competitor teardown of unreleased device' },
  { id:'R-16', tier:'RESTRICTED', signals:['financial_projection','customer_nda'], description:'Financial projections under NDA' },
  { id:'R-17', tier:'RESTRICTED', signals:['tapeout_schedule'], description:'Tapeout or tape-in schedule reference' },
  { id:'R-18', tier:'RESTRICTED', signals:['customer_design_win'], description:'Named customer design win' },
  { id:'R-22', tier:'RESTRICTED', signals:['embedded_circuit','customer_nda'], description:'Embedded circuit + customer NDA reference' },
  { id:'R-30', tier:'CONFIDENTIAL', signals:['product_roadmap'], description:'Product roadmap content' },
  { id:'R-31', tier:'CONFIDENTIAL', signals:['internal_pricing'], description:'Internal pricing or cost data' },
  { id:'R-32', tier:'CONFIDENTIAL', signals:['personnel_info'], description:'Personnel or HR information' },
  { id:'R-40', tier:'INTERNAL', signals:['internal_procedure'], description:'Internal procedure or process document' },
  { id:'R-50', tier:'PUBLIC', signals:['public_datasheet','press_release'], description:'Published public content' },
];

const TIER_ORDER = ['PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','TRADE_SECRET'];

// Cache for project rules to avoid DB query on every file during a scan
let _projectRulesCache = {};
let _projectRulesCacheTime = {};

// Cache for glossary terms — refreshed every 120s
let _glossaryCache = null;
let _glossaryCacheTime = 0;

async function loadGlossaryTerms() {
  const now = Date.now();
  if (_glossaryCache && (now - _glossaryCacheTime) < 120000) return _glossaryCache;
  try {
    const { query } = require('../db/pool');
    const result = await query('SELECT term, synonyms, related_signals, category FROM business_terms');
    _glossaryCache = result.rows;
    _glossaryCacheTime = now;
    return _glossaryCache;
  } catch { return []; }
}

// Match glossary terms against asset text, return { matched_terms[], injected_signals[] }
async function matchGlossaryTerms(fileName, textPreview, contentSummary) {
  const terms = await loadGlossaryTerms();
  if (!terms.length) return { matched_terms: [], injected_signals: [] };

  const assetText = [fileName || '', textPreview || '', contentSummary || ''].join(' ').toLowerCase();
  const matched_terms = [];
  const injected_signals = [];

  for (const term of terms) {
    const allWords = [term.term, ...(term.synonyms || [])];
    const isMatch = allWords.some(w => w && assetText.includes(w.toLowerCase()));
    if (isMatch) {
      matched_terms.push(term.term);
      // Inject related_signals from this glossary term into classification
      if (term.related_signals?.length > 0) {
        injected_signals.push(...term.related_signals);
      }
    }
  }

  return { matched_terms: [...new Set(matched_terms)], injected_signals: [...new Set(injected_signals)] };
}

async function loadProjectRules(projectId) {
  if (!projectId) return [];
  // Cache for 60 seconds during batch scans
  const now = Date.now();
  if (_projectRulesCache[projectId] && (now - (_projectRulesCacheTime[projectId] || 0)) < 60000) {
    return _projectRulesCache[projectId];
  }
  try {
    const { query } = require('../db/pool');
    const result = await query(
      'SELECT rule_code, description, signals, recommended_tier, priority FROM policy_rules WHERE project_id = $1 AND enabled = true ORDER BY priority ASC',
      [projectId]
    );
    const rules = result.rows.map(r => ({
      id: r.rule_code,
      tier: r.recommended_tier,
      signals: r.signals || [],
      description: r.description,
      priority: r.priority,
      project_specific: true,
    }));
    _projectRulesCache[projectId] = rules;
    _projectRulesCacheTime[projectId] = now;
    return rules;
  } catch { return []; }
}

function evaluateClassification(signals, projectRules) {
  // Combine global rules + project-specific rules
  const allRules = [...RULES];
  if (projectRules && projectRules.length > 0) {
    allRules.push(...projectRules);
  }
  // Sort by priority (lower number = higher priority, project rules override global)
  allRules.sort((a, b) => (a.priority || 50) - (b.priority || 50));

  const matchedRules = [];
  let highestTier = 'INTERNAL';

  for (const rule of allRules) {
    const matched = rule.signals.some(s => signals.includes(s));
    if (matched) {
      matchedRules.push(rule);
      if (TIER_ORDER.indexOf(rule.tier) > TIER_ORDER.indexOf(highestTier)) {
        highestTier = rule.tier;
      }
    }
  }

  return {
    recommended_tier: highestTier,
    matched_rules: matchedRules,
    signal_count: signals.length,
  };
}

function determineZone(confidence, tier) {
  if (tier === 'TRADE_SECRET') return 'GATED';
  if (confidence >= 0.90) return 'AUTONOMOUS';
  if (confidence >= 0.70) return 'SUPERVISED';
  return 'PENDING_REVIEW';
}

function getECCN(tier, domain) {
  if (tier === 'TRADE_SECRET' || (domain === 'ELECTRONIC_CIRCUIT' && tier === 'RESTRICTED')) return '3E001';
  if (tier === 'RESTRICTED') return '3E002';
  return 'EAR99';
}

// Retention policy defaults per classification tier (from POV Section 7.1)
const RETENTION_DEFAULTS = {
  TRADE_SECRET:  { retention_days: 2555, review_interval_days: 365, label: '7 years post-product EOL' },
  RESTRICTED:    { retention_days: 1825, review_interval_days: 1095, label: '5 years; review at 3 years' },
  CONFIDENTIAL:  { retention_days: 1095, review_interval_days: 365, label: '3 years; review annually' },
  INTERNAL:      { retention_days: 730, review_interval_days: 730, label: '2 years; auto-review' },
  PUBLIC:        { retention_days: -1, review_interval_days: -1, label: 'Indefinite' },
};

function assignRetentionPolicy(tier, createdAt) {
  const defaults = RETENTION_DEFAULTS[tier] || RETENTION_DEFAULTS.INTERNAL;
  const created = new Date(createdAt || Date.now());
  return {
    policy_id: `RET-${tier}`,
    retention_days: defaults.retention_days,
    label: defaults.label,
    legal_hold: false,
    review_date: defaults.review_interval_days > 0
      ? new Date(created.getTime() + defaults.review_interval_days * 86400000).toISOString()
      : null,
    delete_after: defaults.retention_days > 0
      ? new Date(created.getTime() + defaults.retention_days * 86400000).toISOString()
      : null,
  };
}

// Evidence-based confidence scoring — replaces arbitrary hash-based scoring
// Confidence reflects how much evidence supports the classification decision
function computeConfidence(signals, matchedRules, parseResult, fileName) {
  let score = 0.50; // Base: we know the file exists and its domain
  const factors = [];

  // Factor 1: Real parsing vs estimation (+0.10–0.15)
  if (parseResult?.real_parse) {
    score += 0.12;
    factors.push('real_content_parsed');
  } else {
    score += 0.03; // Slight bump for at least having file metadata
    factors.push('metadata_only');
  }

  // Factor 2: Signal strength — more signals matched = more confidence (+0.05–0.20)
  const signalCount = signals.length;
  if (signalCount >= 3) { score += 0.18; factors.push('strong_signal_match'); }
  else if (signalCount >= 2) { score += 0.12; factors.push('moderate_signal_match'); }
  else if (signalCount >= 1) { score += 0.07; factors.push('weak_signal_match'); }

  // Factor 3: Policy rule matches — rules matched = clearer classification (+0.05–0.15)
  const ruleCount = matchedRules.length;
  if (ruleCount >= 2) { score += 0.13; factors.push('multiple_rules_matched'); }
  else if (ruleCount === 1) { score += 0.08; factors.push('single_rule_matched'); }
  else { factors.push('no_rules_matched_default_tier'); }

  // Factor 4: Filename keyword clarity (+0.03–0.08)
  const name = (fileName || '').toLowerCase();
  const strongKeywords = ['confidential','restricted','secret','internal','public','nda','itar','customer','roadmap','tapeout','classified'];
  const keywordHits = strongKeywords.filter(k => name.includes(k)).length;
  if (keywordHits >= 2) { score += 0.08; factors.push('strong_filename_indicators'); }
  else if (keywordHits >= 1) { score += 0.04; factors.push('filename_indicator'); }

  // Factor 5: Entity corroboration — entities in text support classification (+0.03–0.08)
  const entities = parseResult?.domain_metadata?.entities;
  if (entities) {
    const entityCount = (entities.emails?.length || 0) + (entities.phones?.length || 0) +
                        (entities.part_numbers?.length || 0) + (entities.dates?.length || 0);
    if (entityCount >= 5) { score += 0.08; factors.push('rich_entity_evidence'); }
    else if (entityCount >= 1) { score += 0.04; factors.push('some_entity_evidence'); }
  }

  // Factor 6: Content quality from parser (+0.02–0.05)
  const quality = parseResult?.quality_score || 0;
  if (quality >= 0.85) { score += 0.05; factors.push('high_parse_quality'); }
  else if (quality >= 0.65) { score += 0.02; factors.push('moderate_parse_quality'); }

  // Cap at 0.97 — never 100% without human confirmation
  score = Math.min(0.97, Math.max(0.45, score));

  return {
    confidence: parseFloat(score.toFixed(4)),
    factors,
    factor_count: factors.length,
  };
}

// Infer content signals from file name AND extracted text content
function inferContentSignals(fileName, domain, parseResult) {
  const signals = [];
  const name = (fileName || '').toLowerCase();

  // Filename-based signals (existing logic)
  if (name.includes('tapeout') || name.includes('gds') || name.includes('final')) signals.push('tapeout_schedule');
  if (name.includes('nda') || name.includes('customer') || name.includes('client')) signals.push('customer_nda');
  if (name.includes('roadmap') || name.includes('plan')) signals.push('product_roadmap');
  if (name.includes('cost') || name.includes('yield') || name.includes('price')) signals.push('die_cost_data');
  if (name.includes('teardown') || name.includes('competitive')) signals.push('competitive_teardown');
  if (name.includes('public') || name.includes('datasheet') || name.includes('press')) signals.push('public_datasheet');
  if (name.includes('sop') || name.includes('procedure') || name.includes('guide')) signals.push('internal_procedure');
  if (name.includes('confidential')) signals.push('product_roadmap');
  if (name.includes('restricted') || name.includes('secret')) signals.push('die_cost_data');
  if (name.includes('hr') || name.includes('personnel') || name.includes('salary')) signals.push('personnel_info');

  // Content-based signals (from real parsing)
  const text = (parseResult?.domain_metadata?.text_preview || '').toLowerCase();
  if (text.length > 50) {
    if (/confidential|proprietary|do not distribute/i.test(text)) signals.push('product_roadmap');
    if (/nda|non-disclosure|non disclosure/i.test(text)) signals.push('customer_nda');
    if (/itar|export.?control|ear\s?99|eccn/i.test(text)) signals.push('tapeout_schedule');
    if (/cost|revenue|pricing|margin|forecast/i.test(text)) signals.push('internal_pricing');
    if (/employee|salary|performance.?review|hr\b/i.test(text)) signals.push('personnel_info');
    if (/public|press.?release|datasheet|open.?source/i.test(text)) signals.push('public_datasheet');
    if (/roadmap|strategy|milestone|q[1-4]\s?\d{4}/i.test(text)) signals.push('product_roadmap');
  }

  // Structured data signals — classify based on table/column names
  if (domain === 'STRUCTURED_DATA') {
    if (/customer|client|user|person|employee|hr|salary/i.test(name)) signals.push('personnel_info');
    if (/sales|revenue|order|invoice|billing|payment/i.test(name)) signals.push('internal_pricing');
    if (/finance|cost|price|margin|budget|forecast/i.test(name)) signals.push('financial_projection');
    if (/product|inventory|catalog|item/i.test(name)) signals.push('internal_procedure');
    if (/territory|region|geography|country/i.test(name)) signals.push('internal_procedure');
    if (/fact/i.test(name)) signals.push('internal_pricing'); // Fact tables often contain financial data
    if (/dim/i.test(name)) signals.push('internal_procedure'); // Dimension tables are reference data
  }

  // Domain-based default
  if (domain === 'AUDIO' || domain === 'VIDEO') signals.push('internal_procedure');
  if (!signals.length) signals.push('internal_procedure');

  // Deduplicate
  return [...new Set(signals)];
}

module.exports = { evaluateClassification, determineZone, getECCN, RULES, computeConfidence, inferContentSignals, assignRetentionPolicy, RETENTION_DEFAULTS, loadProjectRules, loadGlossaryTerms, matchGlossaryTerms };
