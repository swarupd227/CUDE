import React, { useEffect, useState } from 'react';
import { Settings2, RefreshCw, Activity, Shield, Plus, Trash2, X } from 'lucide-react';
import { Spinner } from '../components/UI';
import { API, DOMAIN_META } from '../utils/helpers';

const DOMAIN_ORDER = ['ELECTRONIC_CIRCUIT','PDF_DOCUMENT','OFFICE_DOCUMENT','AUDIO','VIDEO','STRUCTURED_DATA'];
const TIERS = ['PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','TRADE_SECRET'];
const TIER_COLORS = { TRADE_SECRET:'bg-red-900/40 text-red-300 border-red-700/40', RESTRICTED:'bg-orange-900/40 text-orange-300 border-orange-700/40', CONFIDENTIAL:'bg-yellow-900/40 text-yellow-300 border-yellow-700/40', INTERNAL:'bg-blue-900/40 text-blue-300 border-blue-700/40', PUBLIC:'bg-green-900/40 text-green-300 border-green-700/40' };

function Toggle({ checked, onChange }) {
  return (
    <button onClick={() => onChange(!checked)} className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${checked ? 'bg-blue-600' : 'bg-slate-700'}`}>
      <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`}/>
    </button>
  );
}

function ConfidenceSlider({ label, value, onChange }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono text-blue-400">{Math.round(value * 100)}%</span>
      </div>
      <input type="range" min="0.50" max="0.99" step="0.01" value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer accent-blue-500"/>
    </div>
  );
}

export default function Settings() {
  const [config, setConfig] = useState(null);
  const [health, setHealth] = useState(null);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [showAddRule, setShowAddRule] = useState(false);
  const [ruleForm, setRuleForm] = useState({ rule_code:'', description:'', signals:'', recommended_tier:'INTERNAL', priority:50 });
  const [savingRule, setSavingRule] = useState(false);

  const viewAsRole = localStorage.getItem('cude_view_as') || 'ADMIN';
  const canEditRules = ['ADMIN', 'OWNER'].includes(viewAsRole);
  const token = localStorage.getItem('cude_token');
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  const load = async () => {
    setLoading(true);
    const [c, h, p] = await Promise.all([
      fetch(`${API}/config`).then(r => r.json()),
      fetch(`${API}/health`).then(r => r.json()),
      fetch(`${API}/policies`, { headers }).then(r => r.json()).catch(() => ({ rules: [] })),
    ]);
    setConfig(c); setHealth(h); setRules(p.rules || []); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const savePlugin = async (domain, patch) => {
    setSaving(p => ({ ...p, [domain]: true }));
    await fetch(`${API}/config/plugins/${domain}`, { method:'PATCH', headers, body:JSON.stringify(patch) });
    setConfig(prev => ({ ...prev, plugins: { ...prev.plugins, [domain]: { ...prev.plugins[domain], ...patch } } }));
    setSaving(p => ({ ...p, [domain]: false }));
  };

  const handleAddRule = async () => {
    if (!ruleForm.rule_code || !ruleForm.description || !ruleForm.signals) return;
    setSavingRule(true);
    await fetch(`${API}/policies`, {
      method: 'POST', headers,
      body: JSON.stringify({ ...ruleForm, signals: ruleForm.signals.split(',').map(s=>s.trim()).filter(Boolean) })
    });
    setShowAddRule(false);
    setRuleForm({ rule_code:'', description:'', signals:'', recommended_tier:'INTERNAL', priority:50 });
    setSavingRule(false);
    load();
  };

  const handleToggleRule = async (rule) => {
    await fetch(`${API}/policies/${rule.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ enabled: !rule.enabled })
    });
    load();
  };

  const handleDeleteRule = async (ruleId) => {
    if (!confirm('Delete this global rule? This affects classification across all projects.')) return;
    await fetch(`${API}/policies/${ruleId}`, { method: 'DELETE', headers });
    load();
  };

  if (loading) return <div className="flex items-center justify-center h-96"><Spinner size={32}/></div>;

  const uptimeStr = s => { const h=Math.floor(s/3600), m=Math.floor((s%3600)/60); return `${h}h ${m}m`; };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Settings & Configuration</h1>
          <p className="text-slate-500 text-sm mt-0.5">Domain plugins, classification rules, and system health</p>
        </div>
        <button onClick={load} className="btn-secondary"><RefreshCw size={13}/>Refresh</button>
      </div>

      {/* System Health */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2"><Activity size={14} className="text-blue-400"/>System Health</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          {[
            { label:'Catalog Size', value:`${health?.catalog || 0} assets` },
            { label:'Pending Queue', value:health?.queue || 0, cls:health?.queue > 0 ? 'text-orange-400' : 'text-green-400' },
            { label:'Uptime', value:uptimeStr(health?.uptime || 0) },
            { label:'Platform', value:health?.platform || 'CUDE', cls:'text-blue-400' },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-slate-800/40 rounded-xl p-3">
              <div className="text-xs text-slate-500 mb-1">{label}</div>
              <div className={`text-lg font-bold ${cls || 'text-slate-100'}`}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Domain Plugin Config */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2"><Settings2 size={14} className="text-blue-400"/>Domain Plugin Configuration</h3>
        <div className="space-y-4">
          {DOMAIN_ORDER.map(domain => {
            const plugin = config?.plugins?.[domain] || {};
            const m = DOMAIN_META[domain] || {};
            return (
              <div key={domain} className={`border rounded-xl p-4 transition-all ${plugin.enabled ? 'border-slate-700' : 'border-slate-800 opacity-60'}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{m.icon}</span>
                    <div>
                      <div className="text-sm font-semibold text-slate-200">{m.label}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-2">
                        <span className={`badge ${plugin.priority === 'P1' ? 'bg-red-900/40 text-red-300' : 'bg-blue-900/40 text-blue-300'}`}>{plugin.priority}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {saving[domain] && <Spinner size={14}/>}
                    <Toggle checked={!!plugin.enabled} onChange={v => savePlugin(domain, { enabled: v })}/>
                  </div>
                </div>
                {plugin.enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <ConfidenceSlider label="Auto-classify threshold" value={plugin.confidence_auto || 0.90}
                      onChange={v => savePlugin(domain, { confidence_auto: v })}/>
                    <ConfidenceSlider label="Supervised zone threshold" value={plugin.confidence_supervised || 0.70}
                      onChange={v => savePlugin(domain, { confidence_supervised: v })}/>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Classification Policy Rules — Full CRUD for Admin/Owner */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2"><Shield size={14} className="text-blue-400"/>Global Classification Rules</h3>
          {canEditRules && (
            <button onClick={() => setShowAddRule(true)} className="btn-primary text-xs"><Plus size={12}/>Add Rule</button>
          )}
        </div>
        <p className="text-xs text-slate-500 mb-4">These global rules apply to all projects. When content signals match a rule, the corresponding sensitivity tier is assigned. Projects can override with project-specific rules and toggle global rules ON/OFF.</p>

        {/* Add Rule Form */}
        {showAddRule && canEditRules && (
          <div className="border border-blue-800/40 rounded-xl p-4 bg-blue-950/10 space-y-3 mb-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-blue-300">New Global Rule</div>
              <button onClick={() => setShowAddRule(false)} className="text-slate-500 hover:text-slate-300"><X size={14}/></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><div className="text-xs text-slate-400 mb-1">Rule Code</div><input className="input w-full text-xs font-mono" placeholder="e.g. R-100" value={ruleForm.rule_code} onChange={e=>setRuleForm(f=>({...f,rule_code:e.target.value}))}/></div>
              <div><div className="text-xs text-slate-400 mb-1">Classification Tier</div>
                <select className="input w-full text-xs" value={ruleForm.recommended_tier} onChange={e=>setRuleForm(f=>({...f,recommended_tier:e.target.value}))}>
                  {TIERS.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="col-span-2"><div className="text-xs text-slate-400 mb-1">Description</div><input className="input w-full text-xs" placeholder="What triggers this rule" value={ruleForm.description} onChange={e=>setRuleForm(f=>({...f,description:e.target.value}))}/></div>
              <div><div className="text-xs text-slate-400 mb-1">Trigger Signals (comma separated)</div><input className="input w-full text-xs font-mono" placeholder="e.g. tapeout_schedule, customer_nda" value={ruleForm.signals} onChange={e=>setRuleForm(f=>({...f,signals:e.target.value}))}/></div>
              <div><div className="text-xs text-slate-400 mb-1">Priority (lower = evaluated first)</div><input type="number" className="input w-full text-xs" value={ruleForm.priority} onChange={e=>setRuleForm(f=>({...f,priority:parseInt(e.target.value)||50}))}/></div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAddRule(false)} className="btn-secondary text-xs">Cancel</button>
              <button onClick={handleAddRule} disabled={savingRule} className="btn-primary text-xs">{savingRule ? <Spinner size={10}/> : <><Plus size={12}/>Create Rule</>}</button>
            </div>
          </div>
        )}

        {/* Rules Table */}
        <div className="space-y-1">
          <div className="grid grid-cols-12 gap-2 text-[10px] text-slate-500 uppercase tracking-wider font-medium px-3 py-1.5">
            <div className="col-span-1">Rule</div>
            <div className="col-span-2">Tier</div>
            <div className="col-span-3">Trigger Signals</div>
            <div className="col-span-4">Description</div>
            {canEditRules && <div className="col-span-2 text-right">Actions</div>}
          </div>
          {rules.map(rule => (
            <div key={rule.id || rule.rule_code} className={`grid grid-cols-12 gap-2 items-center px-3 py-2.5 rounded-lg border border-transparent hover:border-slate-800 hover:bg-slate-800/20 transition-colors text-xs ${rule.enabled === false ? 'opacity-50' : ''}`}>
              <div className="col-span-1 font-mono text-slate-400 font-medium">{rule.rule_code || rule.id}</div>
              <div className="col-span-2"><span className={`badge border text-[10px] ${TIER_COLORS[rule.recommended_tier || rule.tier] || 'bg-slate-800 text-slate-400'}`}>{rule.recommended_tier || rule.tier}</span></div>
              <div className="col-span-3 flex flex-wrap gap-1">{(rule.signals || []).map(s => <span key={s} className="badge bg-slate-800 text-slate-400 border border-slate-700 font-mono text-[10px]">{String(s).replace(/_/g,' ')}</span>)}</div>
              <div className="col-span-4 text-slate-400">{rule.description}</div>
              {canEditRules && (
                <div className="col-span-2 flex items-center justify-end gap-2">
                  <button onClick={() => handleToggleRule(rule)} className={`text-[10px] px-2 py-0.5 rounded ${rule.enabled !== false ? 'bg-green-900/30 text-green-300' : 'bg-slate-800 text-slate-500'}`}>{rule.enabled !== false ? 'ON' : 'OFF'}</button>
                  <button onClick={() => handleDeleteRule(rule.id)} className="text-slate-600 hover:text-red-400" title="Delete rule"><Trash2 size={11}/></button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
