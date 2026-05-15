import React, { useEffect, useState, useRef } from 'react';
import { Plug, CheckCircle, XCircle, AlertCircle, Play, RefreshCw, FolderOpen, ChevronDown, ChevronUp, Settings2, Zap, Clock, Plus, Trash2, X } from 'lucide-react';
import { Spinner, DomainBadge, ClassBadge, ZoneBadge, ConfBar } from '../components/UI';
import { API, DOMAIN_META, formatBytes, formatDate } from '../utils/helpers';

const CATEGORY_ORDER = ['File System','Microsoft 365','EDA Tools','Cloud Storage','Collaboration','Database','Custom'];

const STATUS_STYLE = {
  CONFIGURED: 'border-green-700/50 bg-green-950/20',
  NOT_CONFIGURED: 'border-slate-700 bg-slate-800/20',
  DISABLED: 'border-slate-800 bg-slate-900/30 opacity-60',
  SCANNING: 'border-blue-700/50 bg-blue-950/20',
  ERROR: 'border-red-700/50 bg-red-950/20',
};

const STATUS_BADGE = {
  CONFIGURED: 'bg-green-900/50 text-green-300 border-green-700/40',
  NOT_CONFIGURED: 'bg-slate-800 text-slate-400 border-slate-700',
  DISABLED: 'bg-slate-900 text-slate-600 border-slate-800',
  SCANNING: 'bg-blue-900/50 text-blue-300 border-blue-700/40',
  ERROR: 'bg-red-900/50 text-red-300 border-red-700/40',
};

const AUTH_LABELS = {
  NONE: '🔓 No auth required',
  CREDENTIALS: '🔑 Username & Password',
  OAUTH2: '🔐 OAuth 2.0 / Azure AD',
  API_TOKEN: '🗝️ API Token',
  AWS_CREDENTIALS: '☁️ AWS Access Keys',
  AZURE_IDENTITY: '☁️ Azure Managed Identity',
  UNIX_CREDENTIALS: '🖥️ Unix Service Account',
};

// ── Domain breakdown bar ──────────────────────────────────────────────────────
function DomainBar({ summary, total }) {
  const colors = { ELECTRONIC_CIRCUIT:'#8b5cf6', PDF_DOCUMENT:'#ef4444', OFFICE_DOCUMENT:'#3b82f6', AUDIO:'#10b981', VIDEO:'#14b8a6', STRUCTURED_DATA:'#f97316' };
  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
        {Object.entries(summary).map(([d, count]) => (
          <div key={d} className="h-full rounded-sm transition-all duration-700" title={`${DOMAIN_META[d]?.label}: ${count}`}
            style={{ width:`${(count/total)*100}%`, background: colors[d] || '#64748b' }}/>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {Object.entries(summary).map(([d, count]) => (
          <div key={d} className="flex items-center gap-1.5 text-xs">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background: colors[d] || '#64748b'}}/>
            <span className="text-slate-400">{DOMAIN_META[d]?.icon} {DOMAIN_META[d]?.label}</span>
            <span className="text-slate-500 font-medium">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Config field renderer ─────────────────────────────────────────────────────
function ConfigField({ fieldKey, value, onChange }) {
  const label = fieldKey.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());

  if (typeof value === 'boolean') return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-400">{label}</span>
      <button onClick={() => onChange(!value)} className={`relative w-10 h-5 rounded-full transition-colors ${value?'bg-blue-600':'bg-slate-700'}`}>
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value?'translate-x-5':''}`}/>
      </button>
    </div>
  );

  if (Array.isArray(value)) return (
    <div>
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <input className="input w-full text-xs" value={value.join(', ')} placeholder={`Comma-separated ${label.toLowerCase()}...`}
        onChange={e => onChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}/>
    </div>
  );

  const isSecret = fieldKey.includes('secret') || fieldKey.includes('password') || fieldKey.includes('token') || fieldKey.includes('key');

  return (
    <div>
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <input className="input w-full text-xs" type={isSecret?'password':'text'}
        value={value || ''} placeholder={`Enter ${label.toLowerCase()}...`}
        onChange={e => onChange(e.target.value)}/>
    </div>
  );
}

// ── Local Filesystem Scanner ──────────────────────────────────────────────────
function LocalScanner({ connector, onScanComplete, onSaveTemplate }) {
  const [scanPath, setScanPath] = useState(connector.config.scan_path || '');
  const [recursive, setRecursive] = useState(connector.config.recursive !== false);
  const [testResult, setTestResult] = useState(null);
  const [folderSuggestions, setFolderSuggestions] = useState([]);

  // Save template with the CURRENT form values (not the stale connector.config)
  const handleSaveTemplate = () => {
    const currentConfig = { ...connector, config: { ...connector.config, scan_path: scanPath, recursive } };
    onSaveTemplate?.(currentConfig);
  };

  useEffect(() => {
    fetch(`${API}/folders/suggestions`).then(r => r.json()).then(d => setFolderSuggestions(d.suggestions || [])).catch(() => {});
  }, []);

  const handleTest = async () => {
    if (!scanPath.trim()) return;
    setTestResult(null);
    const r = await fetch(`${API}/connectors/local_filesystem/test`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ scan_path: scanPath })
    }).then(r => r.json());
    setTestResult(r);
  };

  return (
    <div className="space-y-4">
      <div className="border border-blue-800/40 rounded-xl p-4 bg-blue-950/10 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-blue-300">
          <FolderOpen size={16}/>Local Filesystem Configuration
        </div>

        <div>
          <div className="text-xs text-slate-400 mb-1.5">Folder Path to Scan</div>
          <div className="flex gap-2">
            <input className="input flex-1 font-mono text-xs"
              placeholder={navigator.platform?.startsWith('Win') ? 'e.g. C:\\Users\\YourName\\Downloads' : 'e.g. /home/user/documents'}
              value={scanPath} onChange={e => setScanPath(e.target.value)}/>
            <button onClick={handleTest} disabled={!scanPath.trim()} className="btn-secondary text-xs">
              <Zap size={13}/>Test Path
            </button>
          </div>
          {/* Quick-pick folder suggestions */}
          {folderSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-[10px] text-slate-600 mr-1 self-center">Quick pick:</span>
              {folderSuggestions.map(s => (
                <button key={s.label} onClick={() => setScanPath(s.path)}
                  className="text-[10px] px-2 py-1 rounded-md border border-slate-700 bg-slate-800/50 text-slate-400 hover:text-blue-300 hover:border-blue-700/40 transition-colors">
                  📁 {s.label}
                </button>
              ))}
            </div>
          )}
          {testResult && (
            <div className={`mt-2 flex items-center gap-2 text-xs p-2 rounded-lg border ${testResult.success ? 'border-green-800/40 bg-green-950/20 text-green-300' : 'border-red-800/40 bg-red-950/20 text-red-300'}`}>
              {testResult.success ? <CheckCircle size={13}/> : <XCircle size={13}/>}
              {testResult.message}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">Scan Sub-folders</span>
          <button onClick={() => setRecursive(r => !r)} className={`relative w-10 h-5 rounded-full transition-colors ${recursive?'bg-blue-600':'bg-slate-700'}`}>
            <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${recursive?'translate-x-5':''}`}/>
          </button>
        </div>

        <div className="text-xs text-slate-600 leading-relaxed">
          <span className="text-slate-500 font-medium">Supported formats: </span>
          GDSII · OASIS · Verilog · SPICE · SDC · KiCad · PDF · DOCX · XLSX · PPTX · MP3 · MP4 · WAV · MOV
        </div>

        <button onClick={handleSaveTemplate} disabled={!scanPath.trim()} className="btn-secondary text-xs w-full justify-center" title="Save this config as a reusable template for projects">
          <Zap size={12}/>Save as Template
        </button>
      </div>

    </div>
  );
}

// ── Single Connector Card ─────────────────────────────────────────────────────
function ConnectorCard({ connector, onUpdate, onScanComplete, onDelete, onSaveTemplate }) {
  const [expanded, setExpanded] = useState(connector.id === 'local_filesystem');
  const [config, setConfig] = useState({ ...connector.config });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);

  const isLocal = connector.id === 'local_filesystem';

  const handleSave = async () => {
    setSaving(true);
    await fetch(`${API}/connectors/${connector.id}`, {
      method: 'PATCH', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ config })
    }).then(r => r.json());
    onUpdate?.();
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    const r = await fetch(`${API}/connectors/${connector.id}/test`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(config)
    }).then(r => r.json());
    setTestResult(r);
    setTesting(false);
  };

  const updateField = (key, val) => setConfig(p => ({ ...p, [key]: val }));

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${STATUS_STYLE[connector.status] || STATUS_STYLE.NOT_CONFIGURED}`}>
      {/* Header */}
      <div className="p-4 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="text-2xl">{connector.icon}</div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-200">{connector.name}</span>
                <span className={`badge border text-[10px] ${STATUS_BADGE[connector.status] || STATUS_BADGE.NOT_CONFIGURED}`}>
                  {connector.status === 'CONFIGURED' && '● '}{connector.status.replace('_',' ')}
                </span>
                {connector.id === 'local_filesystem' && <span className="badge bg-blue-900/40 text-blue-300 border border-blue-700/40 text-[10px]">✦ LIVE</span>}
                {connector.built_in === false && <span className="badge bg-purple-900/40 text-purple-300 border border-purple-700/40 text-[10px]">CUSTOM</span>}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{connector.description}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <span className="text-xs text-slate-600">{AUTH_LABELS[connector.auth_type]}</span>
            {connector.built_in === false && (
              <button onClick={(e) => { e.stopPropagation(); onDelete?.(connector.id); }} className="text-slate-600 hover:text-red-400 transition-colors p-1" title="Delete custom connector"><Trash2 size={13}/></button>
            )}
            {expanded ? <ChevronUp size={14} className="text-slate-600"/> : <ChevronDown size={14} className="text-slate-600"/>}
          </div>
        </div>

        {/* Supported domains */}
        <div className="flex flex-wrap gap-1 mt-2">
          {connector.supported_domains.map(d => (
            <span key={d} className="text-[10px] flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800/50 text-slate-500">
              {DOMAIN_META[d]?.icon} {DOMAIN_META[d]?.label}
            </span>
          ))}
        </div>

        {/* Stats row */}
        {connector.files_discovered > 0 && (
          <div className="flex gap-4 mt-2 text-xs text-slate-500">
            <span>📁 {connector.files_discovered} files discovered</span>
            {connector.last_scan && <span><Clock size={10} className="inline mr-1"/>{formatDate(connector.last_scan)}</span>}
          </div>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-slate-800 p-4 space-y-5">
          {isLocal ? (
            <div className="space-y-4">
              <LocalScanner connector={connector} onScanComplete={onScanComplete} onSaveTemplate={onSaveTemplate}/>
            </div>
          ) : (
            <>
              {/* Setup guide */}
              <div className="border border-slate-800 rounded-lg p-3 bg-slate-950/30">
                <div className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5"><Settings2 size={12}/>Setup Steps</div>
                <ol className="space-y-1.5">
                  {connector.setup_steps.map((s, i) => (
                    <li key={i} className="flex gap-2 text-xs text-slate-500">
                      <span className="text-slate-600 flex-shrink-0 font-mono">{i+1}.</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Config fields */}
              <div>
                <div className="text-xs font-medium text-slate-400 mb-3">Configuration</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(config).map(([k, v]) => (
                    <ConfigField key={k} fieldKey={k} value={v} onChange={val => updateField(k, val)}/>
                  ))}
                </div>
              </div>

              {/* Test result */}
              {testResult && (
                <div className={`flex items-start gap-2 text-xs p-3 rounded-lg border ${testResult.success ? 'border-green-800/40 bg-green-950/20 text-green-300' : 'border-red-800/40 bg-red-950/20 text-red-300'}`}>
                  {testResult.success ? <CheckCircle size={14} className="flex-shrink-0 mt-0.5"/> : <XCircle size={14} className="flex-shrink-0 mt-0.5"/>}
                  <div><div className="font-medium">{testResult.success ? 'Connection Successful' : 'Connection Failed'}</div><div className="opacity-80 mt-0.5">{testResult.message}</div></div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <button onClick={handleTest} disabled={testing} className="btn-secondary text-xs">
                  {testing ? <><Spinner size={12}/>Testing…</> : <><Zap size={12}/>Test Connection</>}
                </button>
                <button onClick={handleSave} disabled={saving} className="btn-primary text-xs">
                  {saving ? <><Spinner size={12}/>Saving…</> : <><CheckCircle size={12}/>Save Config</>}
                </button>
                <button onClick={() => onSaveTemplate?.(connector)} className="btn-secondary text-xs" title="Save this config as a reusable template for projects">
                  <Zap size={12}/>Save as Template
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add Connector Modal ──────────────────────────────────────────────────────
const ALL_DOMAINS = ['ELECTRONIC_CIRCUIT','PDF_DOCUMENT','OFFICE_DOCUMENT','AUDIO','VIDEO'];
const AUTH_TYPES = ['NONE','CREDENTIALS','OAUTH2','API_TOKEN','AWS_CREDENTIALS','AZURE_IDENTITY'];
const CATEGORIES = ['File System','Microsoft 365','EDA Tools','Cloud Storage','Collaboration','Database','Custom'];

function AddConnectorModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name:'', category:'Custom', icon:'🔌', description:'', auth_type:'NONE', supported_domains:[], config_fields:[] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const toggleDomain = (d) => setForm(f => ({ ...f, supported_domains: f.supported_domains.includes(d) ? f.supported_domains.filter(x=>x!==d) : [...f.supported_domains, d] }));

  const addConfigField = () => setForm(f => ({ ...f, config_fields: [...f.config_fields, { key:'', default_value:'' }] }));
  const removeConfigField = (i) => setForm(f => ({ ...f, config_fields: f.config_fields.filter((_,j)=>j!==i) }));
  const updateConfigField = (i, field, val) => setForm(f => ({ ...f, config_fields: f.config_fields.map((cf,j) => j===i ? {...cf, [field]:val} : cf) }));

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (form.supported_domains.length === 0) { setError('Select at least one domain'); return; }
    setSaving(true); setError(null);
    try {
      const r = await fetch(`${API}/connectors/create`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(form)
      }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      onCreated?.(r);
      onClose();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto m-4" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2"><Plus size={18} className="text-blue-400"/>Add Custom Connector</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={18}/></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Name + Icon */}
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-3">
              <div className="text-xs text-slate-400 mb-1.5">Connector Name *</div>
              <input className="input w-full" placeholder="e.g. Google Drive, JIRA, Custom FTP" value={form.name} onChange={e => setForm(f=>({...f, name:e.target.value}))}/>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1.5">Icon</div>
              <input className="input w-full text-center text-lg" placeholder="🔌" value={form.icon} onChange={e => setForm(f=>({...f, icon:e.target.value}))} maxLength={2}/>
            </div>
          </div>

          {/* Category + Auth */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-slate-400 mb-1.5">Category</div>
              <select className="input w-full" value={form.category} onChange={e => setForm(f=>({...f, category:e.target.value}))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1.5">Authentication</div>
              <select className="input w-full" value={form.auth_type} onChange={e => setForm(f=>({...f, auth_type:e.target.value}))}>
                {AUTH_TYPES.map(a => <option key={a} value={a}>{a.replace(/_/g,' ')}</option>)}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <div className="text-xs text-slate-400 mb-1.5">Description</div>
            <textarea className="input w-full h-16 resize-none" placeholder="What does this connector do?" value={form.description} onChange={e => setForm(f=>({...f, description:e.target.value}))}/>
          </div>

          {/* Supported Domains */}
          <div>
            <div className="text-xs text-slate-400 mb-2">Supported Content Domains *</div>
            <div className="flex flex-wrap gap-2">
              {ALL_DOMAINS.map(d => {
                const m = DOMAIN_META[d] || {};
                const active = form.supported_domains.includes(d);
                return (
                  <button key={d} onClick={() => toggleDomain(d)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${active ? 'border-blue-600 bg-blue-600/20 text-blue-300' : 'border-slate-700 bg-slate-800/50 text-slate-500 hover:text-slate-300'}`}>
                    {m.icon} {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Config Fields */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-slate-400">Configuration Fields</div>
              <button onClick={addConfigField} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"><Plus size={12}/>Add Field</button>
            </div>
            {form.config_fields.length === 0 && (
              <div className="text-xs text-slate-600 p-3 border border-dashed border-slate-800 rounded-lg text-center">No config fields yet. Add fields like "server_url", "api_key", etc.</div>
            )}
            <div className="space-y-2">
              {form.config_fields.map((cf, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input className="input flex-1 text-xs font-mono" placeholder="field_name" value={cf.key} onChange={e => updateConfigField(i, 'key', e.target.value)}/>
                  <input className="input flex-1 text-xs" placeholder="Default value" value={cf.default_value} onChange={e => updateConfigField(i, 'default_value', e.target.value)}/>
                  <button onClick={() => removeConfigField(i)} className="text-slate-600 hover:text-red-400 flex-shrink-0"><Trash2 size={13}/></button>
                </div>
              ))}
            </div>
          </div>

          {error && <div className="text-xs text-red-400 p-2 border border-red-800/40 rounded-lg bg-red-950/20">{error}</div>}
        </div>

        <div className="p-5 border-t border-slate-800 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-xs">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="btn-primary text-xs">
            {saving ? <><Spinner size={12}/>Creating…</> : <><Plus size={13}/>Create Connector</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page — Connector Library ─────────────────────────────────────────────
export default function Connectors() {
  const [connectors, setConnectors] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recentAssets, setRecentAssets] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(null);

  const token = localStorage.getItem('cude_token');
  const authHeaders = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };

  const load = async () => {
    const [d, t] = await Promise.all([
      fetch(`${API}/connectors`).then(r => r.json()).catch(() => []),
      fetch(`${API}/connector-templates`, { headers: authHeaders }).then(r => r.json()).catch(() => ({ templates: [] })),
    ]);
    setConnectors(d);
    setTemplates(t.templates || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    await fetch(`${API}/connectors/${id}`, { method:'DELETE' });
    load();
  };

  const handleScanComplete = (assets) => {
    setRecentAssets(prev => [...assets.slice(0, 20), ...prev].slice(0, 30));
  };

  // Save a connector's current config as a reusable template
  const handleSaveAsTemplate = async (connector) => {
    setSavingTemplate(connector.id);
    try {
      const config = typeof connector.config === 'string' ? JSON.parse(connector.config) : connector.config;
      await fetch(`${API}/connector-templates`, {
        method: 'POST', headers: authHeaders,
        body: JSON.stringify({
          type: connector.id || connector.type || 'custom',
          name: connector.name + ' (Template)',
          category: connector.category,
          icon: connector.icon,
          description: connector.description,
          config: config,
          auth_type: connector.auth_type,
          supported_domains: connector.supported_domains,
        }),
      });
      load();
    } catch (_) {}
    setSavingTemplate(null);
  };

  const handleDeleteTemplate = async (templateId) => {
    await fetch(`${API}/connector-templates/${templateId}`, { method: 'DELETE', headers: authHeaders });
    load();
  };

  const byCategory = connectors.reduce((acc, c) => {
    (acc[c.category] ||= []).push(c);
    return acc;
  }, {});

  if (loading) return <div className="flex items-center justify-center h-96"><Spinner size={32}/></div>;

  return (
    <div className="p-5 space-y-6 max-w-screen-xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2"><Plug size={22} className="text-blue-400"/>Connector Library</h1>
          <p className="text-slate-500 text-sm mt-0.5">Configure connector templates here. Add them to projects for discovery. {templates.length > 0 ? `${templates.length} saved template${templates.length > 1 ? 's' : ''}.` : ''}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAddModal(true)} className="btn-primary text-xs"><Plus size={13}/>Add Connector</button>
          <button onClick={load} className="btn-secondary"><RefreshCw size={13}/>Refresh</button>
        </div>
      </div>

      {/* Saved Templates */}
      {templates.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
            <Zap size={14} className="text-purple-400"/>Saved Templates
            <span className="text-[10px] text-slate-500 font-normal">— ready to add to projects with pre-filled config</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {templates.map(t => {
              const cfg = typeof t.config === 'string' ? JSON.parse(t.config) : (t.config || {});
              const configSummary = Object.entries(cfg).filter(([k,v]) => v && !k.includes('secret') && !k.includes('password') && !k.includes('key')).slice(0,2).map(([k,v]) => `${k}: ${String(v).substring(0,20)}`).join(', ');
              return (
                <div key={t.id} className="border border-purple-800/30 rounded-lg p-3 bg-purple-950/10 hover:border-purple-700/40 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{t.icon || '🔌'}</span>
                      <div>
                        <div className="text-xs font-medium text-slate-200">{t.name}</div>
                        <div className="text-[10px] text-slate-500">{t.category} · {t.type}</div>
                      </div>
                    </div>
                    {!t.is_builtin && <button onClick={() => handleDeleteTemplate(t.id)} className="text-slate-600 hover:text-red-400 p-1" title="Delete template"><Trash2 size={11}/></button>}
                  </div>
                  {configSummary && <div className="text-[10px] text-slate-600 truncate">{configSummary}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Status summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label:'Total Connectors', value: connectors.length },
          { label:'Configured', value: connectors.filter(c=>c.status==='CONFIGURED').length, cls:'text-green-400' },
          { label:'Not Configured', value: connectors.filter(c=>c.status==='NOT_CONFIGURED').length, cls:'text-slate-400' },
          { label:'Files Discovered', value: connectors.reduce((s,c)=>s+(c.files_discovered||0),0), cls:'text-blue-400' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="card p-4 text-center">
            <div className={`text-2xl font-bold tabular-nums ${cls || 'text-slate-100'}`}>{value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Add Connector Modal */}
      {showAddModal && <AddConnectorModal onClose={() => setShowAddModal(false)} onCreated={() => load()}/>}

      {/* Available Connector Types Reference */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-1 flex items-center gap-2">Available Connector Types</h3>
        <p className="text-[10px] text-slate-500 mb-3">Add these to your projects for data discovery. Configure credentials and run discovery from the Project detail page.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
          {[
            { icon:'💾', name:'Local Filesystem', category:'File System', desc:'Scan local or mounted folders' },
            { icon:'☁️', name:'Microsoft OneDrive', category:'Microsoft 365', desc:'OAuth2 user drive scanning' },
            { icon:'📋', name:'Microsoft SharePoint', category:'Microsoft 365', desc:'Document library discovery' },
            { icon:'☁️', name:'AWS S3', category:'Cloud Storage', desc:'S3 bucket object scanning' },
            { icon:'☁️', name:'Azure Blob Storage', category:'Cloud Storage', desc:'Container blob scanning' },
            { icon:'📚', name:'Atlassian Confluence', category:'Collaboration', desc:'Wiki page extraction' },
            { icon:'🗄️', name:'MySQL Database', category:'Database', desc:'Schema discovery + NLQ queries', highlight:true },
            { icon:'🐘', name:'PostgreSQL Database', category:'Database', desc:'Schema discovery + NLQ queries', highlight:true },
            { icon:'❄️', name:'Snowflake', category:'Cloud Data Warehouse', desc:'Warehouse schema discovery', highlight:true },
            { icon:'🧱', name:'Databricks', category:'Cloud Data Warehouse', desc:'Unity Catalog schema discovery', highlight:true },
          ].map(ct => (
            <div key={ct.name} className={`p-2.5 rounded-lg border transition-colors ${ct.highlight ? 'border-orange-800/30 bg-orange-950/10' : 'border-slate-800 bg-slate-900/30'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">{ct.icon}</span>
                <span className="text-[11px] font-medium text-slate-200">{ct.name}</span>
              </div>
              <div className="text-[9px] text-slate-500">{ct.category}</div>
              <div className="text-[9px] text-slate-600 mt-0.5">{ct.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Connector groups */}
      {[...new Set([...CATEGORY_ORDER, ...Object.keys(byCategory)])].filter(cat => byCategory[cat]).map(category => (
        <div key={category} className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">{category}</h2>
            <div className="flex-1 h-px bg-slate-800"/>
            <span className="text-xs text-slate-600">{byCategory[category]?.length} connector{byCategory[category]?.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-3">
            {byCategory[category]?.map(c => (
              <ConnectorCard key={c.id} connector={c} onUpdate={load} onScanComplete={handleScanComplete} onDelete={handleDelete} onSaveTemplate={handleSaveAsTemplate}/>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
