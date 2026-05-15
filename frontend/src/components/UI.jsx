import React from 'react';
import { DOMAIN_META, CLASS_META, ZONE_META, AGENT_META, formatBytes, formatDate, confColor, confBg } from '../utils/helpers';

// Convert UUID-like project codes to human-readable display
function displayProjectCode(code) {
  if (!code) return '';
  // If it's a UUID (8-4-4-4-12 hex), show nothing useful — return empty
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)) return '';
  return code;
}

export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) return (
      <div className="p-4 border border-red-800/40 rounded-lg bg-red-950/20 text-xs text-red-400">
        <div className="font-medium mb-1">Something went wrong</div>
        <div className="text-red-400/70">{this.state.error?.message}</div>
        <button onClick={() => this.setState({ hasError: false, error: null })} className="mt-2 text-blue-400 hover:text-blue-300">Try again</button>
      </div>
    );
    return this.props.children;
  }
}

export function Spinner({ size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="animate-spin"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity=".2"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>;
}

export function DomainBadge({ domain }) {
  const m = DOMAIN_META[domain] || { label:domain, icon:'📁', color:'bg-slate-800 text-slate-400 border-slate-700' };
  return <span className={`badge border ${m.color} gap-1`}>{m.icon} {m.label}</span>;
}

export function ClassBadge({ cls }) {
  const m = CLASS_META[cls] || { color:'bg-slate-800 text-slate-400' };
  return <span className={`badge ${m.color}`}>{cls || '—'}</span>;
}

export function ZoneBadge({ zone }) {
  const m = ZONE_META[zone] || { label:zone, cls:'bg-slate-800 text-slate-400', icon:'⚪' };
  return <span className={`badge border ${m.cls}`}>{m.icon} {m.label}</span>;
}

export function AgentBadge({ agentId }) {
  const m = AGENT_META[agentId] || { label:agentId, short:'??', color:'#666' };
  return <span className="badge border text-xs font-mono" style={{ borderColor:m.color+'66', color:m.color, background:m.color+'22' }}>{m.short} {m.label}</span>;
}

export function ConfBar({ conf }) {
  if (conf == null) return <span className="text-slate-600 text-xs">—</span>;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${confBg(conf)}`} style={{ width:`${Math.round(conf*100)}%` }}/>
      </div>
      <span className={`text-xs font-mono flex-shrink-0 ${confColor(conf)}`}>{Math.round(conf*100)}%</span>
      <span className="text-[9px] text-slate-700 flex-shrink-0">est.</span>
    </div>
  );
}

export function StatCard({ label, value, sub, icon: Icon, accent='blue', alert }) {
  const accents = { blue:'text-blue-400 bg-blue-500/10', purple:'text-purple-400 bg-purple-500/10', green:'text-green-400 bg-green-500/10', red:'text-red-400 bg-red-500/10', amber:'text-amber-400 bg-amber-500/10', teal:'text-teal-400 bg-teal-500/10', orange:'text-orange-400 bg-orange-500/10' };
  const [tc, bg] = (accents[accent]||accents.blue).split(' ');
  return (
    <div className={`card p-4 ${alert?'border-red-800/50':''}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="label mb-1">{label}</div>
          <div className={`text-2xl font-bold tabular-nums ${alert&&value>0?'text-red-400':'text-slate-100'}`}>{value??'—'}</div>
          {sub && <div className="text-xs text-slate-600 mt-1">{sub}</div>}
        </div>
        {Icon && <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center`}><Icon size={18} className={tc}/></div>}
      </div>
    </div>
  );
}

export function ReasoningTrace({ steps, collapsed = false }) {
  const [open, setOpen] = React.useState(!collapsed);
  if (!steps?.length) return null;
  return (
    <div className="border border-slate-800 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-3 py-2 bg-slate-800/50 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors">
        <span>🧠 Agent Reasoning Trace ({steps.length} steps)</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="p-3 space-y-2 bg-slate-950/50">
          {steps.map((s, i) => (
            <div key={i} className="reasoning-step">
              <div className="flex items-center gap-2">
                <span className="text-slate-600 font-mono">Step {s.step}</span>
                {s.action && <span className="text-blue-400 font-mono">→ {s.action}</span>}
              </div>
              {s.thought && <div className="text-slate-400 leading-relaxed">{s.thought}</div>}
              {s.action_input && <div className="font-mono text-slate-500 text-[11px] bg-slate-900 rounded px-2 py-1">{s.action_input}</div>}
              {s.observation && <div className="text-green-400/80 text-[11px] flex gap-1.5"><span className="flex-shrink-0">↳</span>{s.observation}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AssetCard({ asset, onClick, selected }) {
  const dom = DOMAIN_META[asset.content_domain] || {};
  return (
    <div onClick={() => onClick?.(asset)} className={`card-hover p-4 ${selected?'border-blue-600 bg-blue-950/10':''}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-200 truncate">{asset.file_name}</div>
          <div className="text-xs text-slate-600 mt-0.5 truncate">{asset.vault_path}</div>
        </div>
        {asset.ai_enriched && <span className="badge bg-blue-900/40 text-blue-300 border border-blue-700/30 flex-shrink-0 text-[10px]">✦ AI</span>}
      </div>
      <div className="flex flex-wrap gap-1 mb-3">
        <DomainBadge domain={asset.content_domain}/>
        <ClassBadge cls={asset.data_classification}/>
        <ZoneBadge zone={asset.classification_zone}/>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500 mb-2">
        <span>📁 {formatBytes(asset.file_size_mb)}</span>
        <span>👤 {(asset.designer || '').split('@')[0] || '—'}</span>
        <span>📅 {formatDate(asset.modified_at || asset.created_at)}</span>
        <span>🏷️ {displayProjectCode(asset.project_code) || asset.source_connector || '—'}</span>
      </div>
      <ConfBar conf={asset.classification_confidence}/>
    </div>
  );
}

export function AssetDetailPanel({ asset, onEnrich, enriching, onInvestigate, onAnalyze, analyzing }) {
  if (!asset) return null;
  try {
  const dom = DOMAIN_META[asset.content_domain] || {};
  const domKey = asset.content_domain?.toLowerCase().replace('_document','').replace('_circuit','').replace('_recording','') || '';
  const domExt = (domKey && asset[`muas_${domKey}`]) || {};
  return (
    <div className="space-y-4 overflow-y-auto">
      <div>
        <div className="text-xs text-slate-600 mb-1 truncate">{asset.vault_path || ''}</div>
        <div className="text-sm font-semibold text-slate-100 break-all">{asset.file_name || 'Untitled'}</div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <DomainBadge domain={asset.content_domain}/>
          <ClassBadge cls={asset.data_classification}/>
          <ZoneBadge zone={asset.classification_zone}/>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {[['Project', displayProjectCode(asset.project_code) || '—'], ['Format', asset.asset_type], ['Size', formatBytes(asset.file_size_mb)], ['Designer', (asset.designer || '').split('@')[0] || '—'], ['Source', asset.source_connector || '—'], ['ECCN', asset.export_control?.ear_eccn], ['ITAR', asset.export_control?.itar_applicable ? '⚠ YES' : '✓ NO'], ['Parser', asset.parser_used]].map(([k,v]) => (
          <div key={k}><div className="text-slate-600">{k}</div><div className="text-slate-300 font-medium truncate mt-0.5">{v||'—'}</div></div>
        ))}
      </div>
      <div>
        <div className="label mb-1">Classification Confidence</div>
        <ConfBar conf={asset.classification_confidence}/>
      </div>
      {/* Governance-sensitive metadata warnings */}
      {domExt.password_protected && (
        <div className="border border-red-800/40 rounded-lg p-3 bg-red-950/20 text-xs text-red-300 flex items-center gap-2">🔒 Password-protected file — content could not be extracted for classification</div>
      )}
      {domExt.has_tracked_changes && (
        <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20 text-xs text-amber-300 flex items-center gap-2">
          ✏️ Tracked Changes Detected — {domExt.tracked_insertions || 0} insertions, {domExt.tracked_deletions || 0} deletions. May contain sensitive edit history.
        </div>
      )}
      {domExt.has_hidden_text && (
        <div className="border border-orange-800/40 rounded-lg p-3 bg-orange-950/20 text-xs text-orange-300 flex items-center gap-2">👁️ Hidden text detected — document contains concealed content that may require review</div>
      )}
      {domExt.hidden_slides > 0 && (
        <div className="border border-orange-800/40 rounded-lg p-3 bg-orange-950/20 text-xs text-orange-300 flex items-center gap-2">👁️ {domExt.hidden_slides} hidden slide(s) detected — may contain unreleased content</div>
      )}
      {domExt.embedded_objects > 0 && (
        <div className="border border-blue-800/40 rounded-lg p-3 bg-blue-950/20 text-xs text-blue-300 flex items-center gap-2">📎 {domExt.embedded_objects} embedded OLE object(s) — may contain external data sources</div>
      )}

      {Object.keys(domExt).length > 0 && (
        <div>
          <div className="label mb-2">{dom.label} Metadata</div>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            {(() => {
              // Prioritize important fields first
              const priority = [
                // EDA fields first
                'language','module_count','module_names','total_ports','input_ports','output_ports',
                'subcircuit_count','subcircuit_names','total_devices','parameter_count',
                'clock_count','total_constraints','format',
                'macro_count','footprint_count','layer_count','track_count',
                'aperture_count','entity_count','line_count',
                // Document fields
                'author','title','company','last_modified_by','producer','page_count','word_count',
                'slide_count','sheet_count','paragraph_count','duration_seconds',
                'application_name','revision','doc_created','doc_modified','subject','keywords','category',
                'embedded_images','embedded_charts','comment_count','slides_with_notes',
                'tracked_insertions','tracked_deletions',
              ];
              const entries = Object.entries(domExt).filter(([,v]) => v !== null && v !== undefined && (typeof v !== 'object' || Array.isArray(v)));
              const sorted = entries.sort((a,b) => {
                const ai = priority.indexOf(a[0]), bi = priority.indexOf(b[0]);
                if (ai >= 0 && bi >= 0) return ai - bi;
                if (ai >= 0) return -1;
                if (bi >= 0) return 1;
                return 0;
              });
              return sorted.slice(0,18).map(([k,v]) => (
                <div key={k}><div className="text-slate-600">{k.replace(/_/g,' ')}</div><div className="text-slate-300 truncate" title={Array.isArray(v) ? v.join(', ') : String(v)}>{Array.isArray(v) ? v.slice(0,5).join(', ') + (v.length > 5 ? ` (+${v.length-5})` : '') : typeof v==='boolean' ? String(v) : String(v)}</div></div>
              ));
            })()}
          </div>
        </div>
      )}
      {asset.export_control?.itar_applicable && (
        <div className="border border-red-800/40 rounded-lg p-3 bg-red-950/20 text-xs text-red-300">⚠ ITAR Applicable — legal review required before any international transfer</div>
      )}
      {/* AI Content Analysis — the wow factor */}
      {asset.ai_analysis && (
        <div className="border border-purple-800/40 rounded-lg p-3 bg-purple-950/20 space-y-3">
          <div className="text-xs font-semibold text-purple-300 flex items-center gap-1.5">✦ AI Content Analysis {asset.ai_analysis.ai_generated && <span className="badge bg-green-900/40 text-green-300 border border-green-700/30 text-[9px]">LIVE AI</span>}{asset.ai_analysis.mock && <span className="badge bg-slate-800 text-slate-400 border border-slate-700 text-[9px]">MOCK</span>}</div>
          {asset.ai_analysis.content_summary && <p className="text-xs text-slate-300 leading-relaxed">{typeof asset.ai_analysis.content_summary === 'string' ? asset.ai_analysis.content_summary : JSON.stringify(asset.ai_analysis.content_summary)}</p>}
          {asset.ai_analysis.classification_rationale && (
            <div className="border-t border-purple-800/30 pt-2">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Classification Rationale</div>
              <p className="text-xs text-slate-400 leading-relaxed">{typeof asset.ai_analysis.classification_rationale === 'string' ? asset.ai_analysis.classification_rationale : JSON.stringify(asset.ai_analysis.classification_rationale)}</p>
            </div>
          )}
          {asset.ai_analysis.risk_assessment && (
            <div className="border-t border-purple-800/30 pt-2">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Risk Assessment</div>
              <p className="text-xs text-orange-300/80 leading-relaxed">{typeof asset.ai_analysis.risk_assessment === 'string' ? asset.ai_analysis.risk_assessment : JSON.stringify(asset.ai_analysis.risk_assessment)}</p>
            </div>
          )}
          {asset.ai_analysis.key_topics?.length > 0 && (
            <div className="flex flex-wrap gap-1">{asset.ai_analysis.key_topics.map((t,i) => <span key={i} className="badge bg-purple-900/30 text-purple-300 border border-purple-700/30 text-[10px]">{typeof t === 'string' ? t : JSON.stringify(t)}</span>)}</div>
          )}
          {asset.ai_analysis.sensitive_content_flags?.length > 0 && (
            <div className="space-y-1">{asset.ai_analysis.sensitive_content_flags.map((f,i) => <div key={i} className="text-xs text-red-400 flex gap-1.5"><span>⚠</span>{typeof f === 'string' ? f : JSON.stringify(f)}</div>)}</div>
          )}
        </div>
      )}

      {/* PII Detection with details */}
      {asset.pii_flag?.contains_pii && (
        <div className="border border-amber-800/40 rounded-lg p-3 bg-amber-950/20 space-y-2">
          <div className="text-xs font-semibold text-amber-300">🔒 PII Detected — {asset.pii_flag.pii_count || asset.pii_flag.pii_types?.length || 0} item(s)</div>
          {asset.pii_flag.pii_types?.length > 0 && (
            <div className="flex flex-wrap gap-1">{asset.pii_flag.pii_types.map(t => <span key={t} className="badge bg-amber-900/30 text-amber-300 border border-amber-700/30 text-[10px]">{t}</span>)}</div>
          )}
          {asset.pii_flag.regulations?.length > 0 && (
            <div className="text-[10px] text-amber-400/70">Applicable: {asset.pii_flag.regulations.join(', ')}</div>
          )}
          {asset.ai_analysis?.pii_findings?.length > 0 && (
            <div className="space-y-1.5 mt-1">{asset.ai_analysis.pii_findings.filter(p => p && typeof p === 'object').slice(0,5).map((p,i) => (
              <div key={i} className="flex items-start gap-2 text-xs p-1.5 rounded bg-amber-950/30 border border-amber-900/20">
                <span className="badge bg-amber-900/40 text-amber-200 border-amber-700/30 text-[9px] flex-shrink-0">{String(p.type || '')}</span>
                <div className="min-w-0"><span className="font-mono text-amber-300">{String(p.value || '')}</span>{p.regulation && <span className="text-amber-500 ml-1.5">· {String(p.regulation)}</span>}</div>
              </div>
            ))}</div>
          )}
        </div>
      )}

      {/* Retention Policy */}
      {asset.retention_policy && (
        <div className="border border-slate-800 rounded-lg p-3 bg-slate-900/30">
          <div className="label mb-2">Retention Policy</div>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <div><div className="text-slate-600">Policy</div><div className="text-slate-300">{asset.retention_policy.policy_id || '—'}</div></div>
            <div><div className="text-slate-600">Retention</div><div className="text-slate-300">{asset.retention_policy.label || `${asset.retention_policy.retention_days} days`}</div></div>
            <div><div className="text-slate-600">Review Date</div><div className="text-slate-300">{asset.retention_policy.review_date ? new Date(asset.retention_policy.review_date).toLocaleDateString() : '—'}</div></div>
            <div><div className="text-slate-600">Legal Hold</div><div className={asset.retention_policy.legal_hold ? 'text-red-400 font-medium' : 'text-green-400'}>{asset.retention_policy.legal_hold ? '🔒 YES' : '✓ No'}</div></div>
          </div>
        </div>
      )}
      {asset.ai_enrichment && <ReasoningTrace steps={asset.ai_enrichment.reasoning_steps} collapsed/>}
      {/* Tags / Business Terms */}
      <TagEditor assetId={asset.id} existingTags={asset.tags || []}/>

      <div className="flex flex-col gap-2">
        <button onClick={() => onAnalyze?.(asset.id)} disabled={analyzing} className="btn-primary justify-center">
          {analyzing ? <><Spinner size={14}/>AI Analyzing Content…</> : asset.ai_analysis ? '✦ Re-run AI Content Analysis' : '✦ Run AI Content Analysis'}
        </button>
        {!asset.ai_enriched && (
          <button onClick={() => onEnrich?.(asset.id)} disabled={enriching} className="btn-secondary justify-center">
            {enriching ? <><Spinner size={14}/>Running Classification Arbiter…</> : '⚖ Run Classification Arbiter'}
          </button>
        )}
        <button onClick={() => onInvestigate?.(asset.id)} className="btn-secondary justify-center">
          🔍 Investigate Relationships
        </button>
      </div>
    </div>
  );
  } catch (err) {
    return <div className="p-4 text-red-400 text-xs">Error rendering asset details: {err.message}</div>;
  }
}

export function EmptyState({ icon: Icon, title, desc }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
      {Icon && <Icon size={36} className="text-slate-700"/>}
      <div className="text-slate-400 font-medium">{title}</div>
      {desc && <div className="text-slate-600 text-sm max-w-xs">{desc}</div>}
    </div>
  );
}

const EVENT_CONFIG = {
  ScanStarted:          { icon:'🔍', color:'text-blue-400',   bg:'bg-blue-950/30',   border:'border-blue-800/40',   label:'Scan Started' },
  ScanStage:            { icon:'⚙️', color:'text-slate-400',  bg:'bg-slate-800/20',  border:'border-slate-700/30',  label:'Stage' },
  ScanProgress:         { icon:'📊', color:'text-cyan-400',   bg:'bg-cyan-950/20',   border:'border-cyan-800/30',   label:'Progress' },
  AssetDiscovered:      { icon:'📁', color:'text-blue-300',   bg:'bg-blue-950/20',   border:'border-blue-800/30',   label:'Discovered' },
  ParseStage:           { icon:'🔬', color:'text-slate-500',  bg:'bg-slate-900/40',  border:'border-slate-800/20',  label:'Parse' },
  ParseComplete:        { icon:'✅', color:'text-green-400',  bg:'bg-green-950/20',  border:'border-green-800/30',  label:'Parsed' },
  ClassificationProposed:{ icon:'🏷️', color:'text-yellow-400', bg:'bg-yellow-950/20', border:'border-yellow-800/30', label:'Classified' },
  ClassificationComplete:{ icon:'✅', color:'text-green-400',  bg:'bg-green-950/20',  border:'border-green-800/30',  label:'Classified' },
  EnrichmentStarted:    { icon:'✨', color:'text-purple-400', bg:'bg-purple-950/20', border:'border-purple-800/30', label:'Enriching' },
  ReviewPackageCreated: { icon:'📋', color:'text-orange-400', bg:'bg-orange-950/20', border:'border-orange-800/30', label:'Review Queued' },
  RelationshipFound:    { icon:'🔗', color:'text-amber-400',  bg:'bg-amber-950/20',  border:'border-amber-800/30',  label:'Relationship' },
  InvestigationStarted: { icon:'🔍', color:'text-amber-300',  bg:'bg-amber-950/20',  border:'border-amber-800/30',  label:'Investigating' },
  AlertGenerated:       { icon:'⚠️', color:'text-red-400',    bg:'bg-red-950/20',    border:'border-red-800/30',    label:'Alert' },
  AssetApproved:        { icon:'✅', color:'text-green-400',  bg:'bg-green-950/20',  border:'border-green-800/30',  label:'Approved' },
  AssetRejected:        { icon:'❌', color:'text-orange-400', bg:'bg-orange-950/20', border:'border-orange-800/30', label:'Rejected' },
  AssetEscalated:       { icon:'🚨', color:'text-red-400',    bg:'bg-red-950/20',    border:'border-red-800/30',    label:'Escalated' },
  ReportStarted:        { icon:'📊', color:'text-pink-400',   bg:'bg-pink-950/20',   border:'border-pink-800/30',   label:'Report' },
  ReportGenerated:      { icon:'📄', color:'text-pink-400',   bg:'bg-pink-950/20',   border:'border-pink-800/30',   label:'Report Ready' },
  AgentTaskStarted:     { icon:'🤖', color:'text-blue-400',   bg:'bg-blue-950/20',   border:'border-blue-800/30',   label:'Agent Running' },
  AgentTaskComplete:    { icon:'🤖', color:'text-green-400',  bg:'bg-green-950/20',  border:'border-green-800/30',  label:'Agent Done' },
  ConfigUpdated:        { icon:'⚙️', color:'text-slate-400',  bg:'bg-slate-800/20',  border:'border-slate-700/30',  label:'Config' },
  ScanComplete:         { icon:'🎉', color:'text-green-400',  bg:'bg-green-950/30',  border:'border-green-700/40',  label:'Scan Complete' },
  default:              { icon:'💬', color:'text-slate-400',  bg:'bg-slate-800/20',  border:'border-slate-700/30',  label:'Event' },
};

// Subtle events rendered as compact lines rather than full cards
const COMPACT_TYPES = new Set(['ScanStage','ParseStage','ConfigUpdated']);

// Tag Editor — add/remove business tags on assets
export function TagEditor({ assetId, existingTags = [] }) {
  const [tags, setTags] = React.useState([]);
  const [newTag, setNewTag] = React.useState('');
  const [loaded, setLoaded] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState([]);

  React.useEffect(() => {
    if (!assetId) return;
    fetch(`/api/assets/${assetId}/tags`).then(r=>r.json()).then(d => { setTags(d.tags || []); setLoaded(true); }).catch(() => setLoaded(true));
    // Fetch AI-powered tag suggestions
    fetch(`/api/assets/${assetId}/suggest-tags`).then(r=>r.json()).then(d => setSuggestions(d.suggestions || [])).catch(() => {});
  }, [assetId]);

  const addTag = async (tagText, tagType) => {
    const text = tagText || newTag.trim();
    if (!text) return;
    const token = localStorage.getItem('cude_token');
    await fetch(`/api/assets/${assetId}/tags`, {
      method: 'POST', headers: { 'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`} : {}) },
      body: JSON.stringify({ tag: text, tag_type: tagType || 'custom' })
    });
    setNewTag('');
    const d = await fetch(`/api/assets/${assetId}/tags`).then(r=>r.json());
    setTags(d.tags || []);
    // Remove from suggestions if it was a suggestion
    setSuggestions(prev => prev.filter(s => s.tag.toLowerCase() !== text.toLowerCase()));
  };

  const removeTag = async (tagId) => {
    const token = localStorage.getItem('cude_token');
    await fetch(`/api/assets/${assetId}/tags/${tagId}`, {
      method: 'DELETE', headers: token ? {Authorization:`Bearer ${token}`} : {}
    });
    setTags(tags.filter(t => t.id !== tagId));
  };

  const allTags = [...(existingTags || []).map(t => ({ id: 'legacy-'+t, tag: t, legacy: true })), ...tags];
  const uniqueTags = allTags.filter((t, i) => allTags.findIndex(x => x.tag === t.tag) === i);

  const sourceLabel = (src) => src === 'ai_analysis' ? 'AI' : src === 'ai_summary' ? 'AI' : src === 'glossary' ? 'Glossary' : 'Meta';
  const sourceColor = (src) => src === 'ai_analysis' || src === 'ai_summary' ? 'text-emerald-400' : src === 'glossary' ? 'text-purple-400' : 'text-slate-500';

  return (
    <div className="border border-slate-800 rounded-lg p-3 bg-slate-900/30">
      <div className="label mb-2">Business Tags</div>

      {/* AI-Powered Suggested Tags */}
      {suggestions.length > 0 && (
        <div className="mb-2">
          <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Suggested Tags</div>
          <div className="flex flex-wrap gap-1">
            {suggestions.slice(0, 10).map(s => (
              <button key={s.tag} onClick={() => addTag(s.tag, s.source)} title={s.reason}
                className="badge bg-green-900/20 text-green-300 border border-green-700/30 text-[10px] hover:bg-green-900/40 cursor-pointer flex items-center gap-0.5 transition-colors">
                + {s.tag}
                <span className={`text-[8px] ml-0.5 ${sourceColor(s.source)}`}>({sourceLabel(s.source)})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Applied Tags */}
      <div className="flex flex-wrap gap-1 mb-2">
        {uniqueTags.map(t => (
          <span key={t.id} className="badge bg-blue-900/30 text-blue-300 border border-blue-700/30 text-[10px] flex items-center gap-1">
            {t.tag}
            {!t.legacy && <button onClick={() => removeTag(t.id)} className="text-blue-400 hover:text-red-400 ml-0.5">×</button>}
          </span>
        ))}
        {uniqueTags.length === 0 && <span className="text-[10px] text-slate-600">No tags yet</span>}
      </div>

      {/* Manual Tag Input */}
      <div className="flex gap-1">
        <input className="input flex-1 text-[10px] py-1" placeholder="Add tag (e.g. DDR5, Tapeout, Q3-Roadmap)" value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()}/>
        <button onClick={() => addTag()} disabled={!newTag.trim()} className="btn-secondary text-[10px] px-2 py-1">Add</button>
      </div>
    </div>
  );
}

export function EventFeed({ events, maxHeight = 'max-h-64' }) {
  const bottomRef = React.useRef(null);
  const containerRef = React.useRef(null);

  // Auto-scroll only if user is already near the bottom of the feed container
  React.useEffect(() => {
    const container = containerRef.current;
    if (container && bottomRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 80;
      if (isNearBottom) {
        bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [events.length]);

  if (!events.length) {
    return (
      <div className={`${maxHeight} flex items-center justify-center`}>
        <div className="text-center text-slate-600 text-xs">
          <div className="text-2xl mb-2">📡</div>
          <div>Waiting for activity…</div>
          <div className="text-slate-700 mt-1">Events will appear here as agents discover and process files</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`${maxHeight} overflow-y-auto space-y-1 pr-1`} style={{scrollbarWidth:'thin'}}>
      {events.slice(0, 60).map((ev, i) => {
        const cfg  = EVENT_CONFIG[ev.type] || EVENT_CONFIG.default;
        const time = new Date(ev.timestamp).toLocaleTimeString('en-US', { hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit' });
        const msg  = ev.message || ev.payload?.file_name || ev.payload?.detail || ev.type;
        const agentLabel = ev.agentName || ev.agent || '';
        const isNew = i < 3;
        const isCompact = COMPACT_TYPES.has(ev.type);

        if (isCompact) {
          // Compact single-line for stage/config events
          return (
            <div key={ev.id||i} className={`flex items-start gap-2 px-2 py-0.5 rounded text-[11px] font-mono ${isNew ? 'opacity-100' : 'opacity-50'} transition-opacity`}>
              <span className="text-slate-700 flex-shrink-0 tabular-nums">{time}</span>
              <span className="text-slate-600 flex-shrink-0">{cfg.icon}</span>
              <span className="text-slate-500 truncate">{msg}</span>
            </div>
          );
        }

        // Full card for meaningful events
        return (
          <div key={ev.id||i}
            className={`border rounded-lg px-3 py-2 ${cfg.border} ${cfg.bg} ${isNew ? 'opacity-100' : 'opacity-70'} transition-opacity`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <span className="text-sm flex-shrink-0 mt-0.5">{cfg.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span className={`text-[10px] font-bold uppercase tracking-wide flex-shrink-0 ${cfg.color}`}>{cfg.label}</span>
                    {agentLabel && <span className="text-[10px] text-slate-600 flex-shrink-0">· {agentLabel}</span>}
                  </div>
                  <div className={`text-xs leading-relaxed ${isNew ? 'text-slate-300' : 'text-slate-400'} break-words`}>{msg}</div>
                  {/* Progress bar for ScanProgress events */}
                  {ev.type === 'ScanProgress' && ev.payload?.pct != null && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-cyan-500 transition-all duration-300" style={{width:`${ev.payload.pct}%`}}/>
                      </div>
                      <span className="text-[10px] text-cyan-400 font-mono tabular-nums flex-shrink-0">{ev.payload.pct}%</span>
                    </div>
                  )}
                </div>
              </div>
              <span className="text-[10px] text-slate-700 font-mono tabular-nums flex-shrink-0">{time}</span>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef}/>
    </div>
  );
}
