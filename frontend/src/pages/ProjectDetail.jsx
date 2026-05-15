import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FolderKanban, Users, Plug, FolderSearch, Settings2, Plus, Trash2, Play, Zap, CheckCircle, XCircle, X, ArrowLeft, Pencil, Save } from 'lucide-react';
import { Spinner, DomainBadge, ClassBadge, ZoneBadge, ConfBar } from '../components/UI';
import { API, DOMAIN_META, formatDate, formatBytes } from '../utils/helpers';
import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';

const CONNECTOR_TYPES = [
  { type:'local_filesystem', name:'Local Filesystem', icon:'💾', category:'File System', auth_type:'NONE', domains:['ELECTRONIC_CIRCUIT','PDF_DOCUMENT','OFFICE_DOCUMENT','AUDIO','VIDEO'],
    configFields: [{ key:'scan_path', label:'Folder Path', placeholder:'/data/scan/Test or C:\\folder', type:'text' }, { key:'recursive', label:'Scan Sub-folders', type:'toggle', default:true }, { key:'file_size_limit_mb', label:'Max File Size (MB)', type:'number', default:5000 }] },
  { type:'nas_smb', name:'NAS / Network Share', icon:'🗄️', category:'File System', auth_type:'CREDENTIALS', domains:['ELECTRONIC_CIRCUIT','PDF_DOCUMENT','OFFICE_DOCUMENT'],
    configFields: [{ key:'share_path', label:'UNC Path', placeholder:'\\\\server\\share', type:'text' }, { key:'username', label:'Username', type:'text' }, { key:'password', label:'Password', type:'password' }, { key:'domain', label:'Domain', type:'text' }] },
  { type:'sharepoint', name:'Microsoft SharePoint', icon:'📋', category:'Microsoft 365', auth_type:'OAUTH2', domains:['PDF_DOCUMENT','OFFICE_DOCUMENT','AUDIO','VIDEO'], scannable:true,
    configFields: [{ key:'tenant_id', label:'Tenant ID', placeholder:'From Azure Entra → App Registration', type:'text' }, { key:'client_id', label:'Client ID', placeholder:'From App Registration → Overview', type:'text' }, { key:'client_secret', label:'Client Secret', type:'password', placeholder:'From Certificates & secrets' }, { key:'site_url', label:'SharePoint Site URL', placeholder:'https://tenant.sharepoint.com/sites/SiteName', type:'text' }, { key:'library_names', label:'Document Libraries (optional, comma separated)', placeholder:'Leave empty to scan all libraries', type:'text' }] },
  { type:'onedrive', name:'Microsoft OneDrive', icon:'☁️', category:'Microsoft 365', auth_type:'OAUTH2', domains:['PDF_DOCUMENT','OFFICE_DOCUMENT','AUDIO','VIDEO'], scannable:true,
    configFields: [{ key:'tenant_id', label:'Tenant ID', placeholder:'e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', type:'text' }, { key:'client_id', label:'Client ID (App Registration)', placeholder:'e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', type:'text' }, { key:'client_secret', label:'Client Secret', type:'password', placeholder:'From Certificates & secrets in Entra' }, { key:'user_email', label:'User Email (OneDrive owner)', placeholder:'e.g. user@domain.onmicrosoft.com', type:'text' }, { key:'folder_paths', label:'Folder Paths (comma separated)', placeholder:'/ or /Documents,/Projects', type:'text' }] },
  { type:'aws_s3', name:'AWS S3', icon:'☁️', category:'Cloud Storage', auth_type:'AWS_CREDENTIALS', domains:['ELECTRONIC_CIRCUIT','PDF_DOCUMENT','OFFICE_DOCUMENT','AUDIO','VIDEO'], scannable:true,
    configFields: [{ key:'bucket_name', label:'S3 Bucket Name', placeholder:'e.g. my-data-bucket', type:'text' }, { key:'aws_region', label:'AWS Region (code only)', type:'text', default:'us-east-1', placeholder:'us-east-1, eu-west-1, ap-south-1 (code only)' }, { key:'access_key_id', label:'Access Key ID', placeholder:'From IAM → Users → Security credentials', type:'text' }, { key:'secret_access_key', label:'Secret Access Key', type:'password', placeholder:'Shown once when creating access key' }, { key:'prefix', label:'Key Prefix / Folder (optional)', placeholder:'e.g. documents/ or uploads/2026/', type:'text' }] },
  { type:'azure_blob', name:'Azure Blob Storage', icon:'☁️', category:'Cloud Storage', auth_type:'AZURE_IDENTITY', domains:['ELECTRONIC_CIRCUIT','PDF_DOCUMENT','OFFICE_DOCUMENT','AUDIO','VIDEO'], scannable:true,
    configFields: [{ key:'account_name', label:'Storage Account Name', placeholder:'e.g. mystorageaccount', type:'text' }, { key:'account_key', label:'Account Key', type:'password', placeholder:'From Storage account → Access keys → Key1' }, { key:'container_name', label:'Container Name', placeholder:'e.g. documents', type:'text' }, { key:'prefix', label:'Folder Prefix (optional)', placeholder:'e.g. uploads/ or leave empty for all', type:'text' }, { key:'connection_string', label:'Or Full Connection String (alternative to above)', type:'password', placeholder:'DefaultEndpointsProtocol=https;AccountName=...' }] },
  { type:'confluence', name:'Atlassian Confluence', icon:'📚', category:'Collaboration', auth_type:'API_TOKEN', domains:['PDF_DOCUMENT','OFFICE_DOCUMENT'],
    configFields: [{ key:'base_url', label:'Confluence URL', placeholder:'https://company.atlassian.net/wiki', type:'text' }, { key:'api_token', label:'API Token', type:'password' }, { key:'user_email', label:'Email', type:'text' }, { key:'space_keys', label:'Space Keys (comma separated)', type:'text' }] },
  { type:'mysql', name:'MySQL Database', icon:'🗄️', category:'Database', auth_type:'CREDENTIALS', domains:['STRUCTURED_DATA'], scannable:true,
    configFields: [{ key:'host', label:'Host', placeholder:'mysql or IP address', type:'text', default:'mysql' }, { key:'port', label:'Port', type:'number', default:3306 }, { key:'user', label:'Username', type:'text', default:'cude' }, { key:'password', label:'Password', type:'password', default:'cude_demo_pass' }, { key:'database', label:'Database Name', placeholder:'e.g. adventureworks', type:'text', default:'adventureworks' }] },
  { type:'postgresql_db', name:'PostgreSQL Database', icon:'🐘', category:'Database', auth_type:'CREDENTIALS', domains:['STRUCTURED_DATA'], scannable:true,
    configFields: [{ key:'host', label:'Host', placeholder:'localhost or IP', type:'text' }, { key:'port', label:'Port', type:'number', default:5432 }, { key:'user', label:'Username', type:'text' }, { key:'password', label:'Password', type:'password' }, { key:'database', label:'Database Name', type:'text' }] },
  { type:'snowflake', name:'Snowflake', icon:'❄️', category:'Cloud Data Warehouse', auth_type:'CREDENTIALS', domains:['STRUCTURED_DATA'],
    configFields: [{ key:'account', label:'Account Identifier', placeholder:'e.g. xy12345.us-east-1', type:'text' }, { key:'username', label:'Username', type:'text' }, { key:'password', label:'Password', type:'password' }, { key:'warehouse', label:'Warehouse', placeholder:'e.g. COMPUTE_WH', type:'text' }, { key:'database', label:'Database', type:'text' }, { key:'schema', label:'Schema', type:'text', default:'PUBLIC' }, { key:'role', label:'Role (optional)', placeholder:'e.g. SYSADMIN', type:'text' }] },
  { type:'databricks', name:'Databricks', icon:'🧱', category:'Cloud Data Warehouse', auth_type:'TOKEN', domains:['STRUCTURED_DATA'],
    configFields: [{ key:'host', label:'Workspace URL', placeholder:'e.g. adb-1234567890.1.azuredatabricks.net', type:'text' }, { key:'http_path', label:'SQL Warehouse HTTP Path', placeholder:'e.g. /sql/1.0/warehouses/abc123', type:'text' }, { key:'token', label:'Personal Access Token', type:'password' }, { key:'catalog', label:'Unity Catalog Name', placeholder:'e.g. main', type:'text' }, { key:'schema', label:'Schema', type:'text', default:'default' }] },
];

const TABS = [
  { id:'overview', label:'Overview', icon:FolderKanban },
  { id:'connectors', label:'Connectors', icon:Plug },
  { id:'assets', label:'Assets', icon:FolderSearch },
  { id:'policies', label:'Policy Rules', icon:Settings2 },
  { id:'members', label:'Members', icon:Users },
];

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { selectProject } = useProject();
  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [connectors, setConnectors] = useState([]);
  const [assets, setAssets] = useState([]);
  const [assetStats, setAssetStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [showAddConnector, setShowAddConnector] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});

  const headers = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };

  const load = async () => {
    setLoading(true);
    try {
      const [projData, connData, assetData, statsData] = await Promise.all([
        fetch(`${API}/projects/${id}`, { headers }).then(r => r.json()),
        fetch(`${API}/projects/${id}/connectors`, { headers }).then(r => r.json()).catch(() => ({ connectors: [] })),
        fetch(`${API}/projects/${id}/assets?limit=10`, { headers }).then(r => r.json()).catch(() => ({ assets: [], total: 0 })),
        fetch(`${API}/projects/${id}/stats`, { headers }).then(r => r.json()).catch(() => ({})),
      ]);
      setProject(projData.project);
      setMembers(projData.members || []);
      setConnectors(connData.connectors || []);
      setAssets(assetData.assets || []);
      setAssetStats(statsData);
      selectProject(projData.project);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const [savedTemplates, setSavedTemplates] = useState([]);

  // Load saved templates
  useEffect(() => {
    fetch(`${API}/connector-templates`, { headers }).then(r => r.json()).then(d => setSavedTemplates(d.templates || [])).catch(() => {});
  }, []);

  const addConnector = async (connType) => {
    const body = { type: connType.type, name: connType.name, category: connType.category, icon: connType.icon, auth_type: connType.auth_type, supported_domains: connType.domains, config: {} };
    await fetch(`${API}/projects/${id}/connectors`, { method: 'POST', headers, body: JSON.stringify(body) });
    setShowAddConnector(false);
    load();
  };

  const addFromTemplate = async (template) => {
    const cfg = typeof template.config === 'string' ? JSON.parse(template.config) : (template.config || {});
    const body = { template_id: template.id, type: template.type, name: template.name.replace(' (Template)', ''), config: cfg };
    await fetch(`${API}/projects/${id}/connectors`, { method: 'POST', headers, body: JSON.stringify(body) });
    setShowAddConnector(false);
    load();
  };

  const deleteConnector = async (connectorId) => {
    await fetch(`${API}/projects/${id}/connectors/${connectorId}`, { method: 'DELETE', headers });
    load();
  };

  const addMember = async (email, role) => {
    const r = await fetch(`${API}/projects/${id}/members`, { method: 'POST', headers, body: JSON.stringify({ email, role }) });
    const d = await r.json();
    if (d.error) alert(d.error);
    else { setShowAddMember(false); load(); }
  };

  const [runningDiscovery, setRunningDiscovery] = useState(false);
  const [discoveryProgress, setDiscoveryProgress] = useState([]);
  const [discoveryResult, setDiscoveryResult] = useState(null);
  const discoveryRef = React.useRef(null);

  // Scan endpoint mapping for each connector type — use project.code (human-readable), not id (UUID)
  const pCode = project?.code || id;
  const SCAN_ENDPOINTS = {
    local_filesystem: (cfg) => ({ url: `${API}/connectors/local_filesystem/scan`, body: { scan_path: cfg.scan_path, recursive: cfg.recursive !== false, project_code: pCode, project_id: id } }),
    onedrive: (cfg) => ({ url: `${API}/connectors/onedrive/scan`, body: { ...cfg, project_code: pCode, project_id: id } }),
    sharepoint: (cfg) => ({ url: `${API}/connectors/sharepoint/scan`, body: { ...cfg, project_code: pCode, project_id: id } }),
    azure_blob: (cfg) => ({ url: `${API}/connectors/azure_blob/scan`, body: { ...cfg, project_code: pCode, project_id: id } }),
    aws_s3: (cfg) => ({ url: `${API}/connectors/aws_s3/scan`, body: { ...cfg, project_code: pCode, project_id: id } }),
    mysql: (cfg) => ({ url: `${API}/connectors/sql/scan`, body: { ...cfg, project_code: pCode, project_id: id } }),
    postgresql_db: (cfg) => ({ url: `${API}/connectors/sql/scan`, body: { ...cfg, project_code: pCode, project_id: id } }),
  };

  const startEditing = () => {
    setEditForm({
      name: project?.name || '',
      description: project?.description || '',
      sensitivity_ceiling: project?.sensitivity_ceiling || 'TRADE_SECRET',
      status: project?.status || 'ACTIVE',
    });
    setEditing(true);
  };

  const saveProject = async () => {
    try {
      await fetch(`${API}/projects/${id}`, { method: 'PATCH', headers, body: JSON.stringify(editForm) });
      setEditing(false);
      load();
    } catch (e) { alert('Failed to save: ' + e.message); }
  };

  const clearProjectAssets = async () => {
    if (!confirm(`Clear all ${totalAssets} assets from this project? This cannot be undone. You can re-run discovery afterward.`)) return;
    try {
      await fetch(`${API}/projects/${id}/assets/clear`, { method: 'DELETE', headers });
      load();
    } catch (e) { alert('Failed to clear assets: ' + e.message); }
  };

  // Per-connector discovery toggle state
  const [discoveryToggles, setDiscoveryToggles] = useState({});
  const isConnectorEnabled = (c) => discoveryToggles[c.id] !== false; // Default: enabled
  const toggleConnectorDiscovery = (connId) => setDiscoveryToggles(prev => ({ ...prev, [connId]: prev[connId] === false ? true : false }));

  const runProjectDiscovery = async () => {
    // Find configured connectors with scan support AND enabled for discovery
    const scannableTypes = Object.keys(SCAN_ENDPOINTS);
    const configuredConnectors = connectors.filter(c => scannableTypes.includes(c.type) && c.status === 'CONFIGURED' && isConnectorEnabled(c));

    if (configuredConnectors.length === 0) {
      alert('No configured connectors with scan support. Add and configure a connector first.');
      setTab('connectors');
      return;
    }

    setRunningDiscovery(true); setDiscoveryProgress([]); setDiscoveryResult(null);

    // SSE stream for progress
    const SCAN_TYPES = new Set(['ScanStarted','ScanStage','ScanProgress','AssetDiscovered','ParseComplete','ClassificationProposed','ScanComplete','AlertGenerated']);
    const es = new EventSource('/api/stream');
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === 'connected' || !SCAN_TYPES.has(ev.type)) return;
        const prefix = ev.type === 'ScanProgress' && ev.payload?.pct != null ? `[${String(ev.payload.pct).padStart(3)}%] ` : '';
        setDiscoveryProgress(p => [...p, prefix + (ev.message || ev.type)]);
        if (discoveryRef.current) discoveryRef.current.scrollTop = discoveryRef.current.scrollHeight;
      } catch (_) {}
    };

    let totalDiscovered = 0;
    for (const c of configuredConnectors) {
      const cfg = typeof c.config === 'string' ? JSON.parse(c.config) : (c.config || {});
      const scanInfo = SCAN_ENDPOINTS[c.type]?.(cfg);
      if (!scanInfo) continue;

      setDiscoveryProgress(p => [...p, `\n━━━ Scanning: ${c.name} (${c.type}) ━━━`]);

      try {
        const r = await fetch(scanInfo.url, {
          method: 'POST', headers,
          body: JSON.stringify(scanInfo.body),
        }).then(r => r.json());

        if (r.error) {
          setDiscoveryProgress(p => [...p, `❌ ${c.name}: ${r.error}`]);
        } else {
          totalDiscovered += (r.processed || 0);
          setDiscoveryProgress(p => [...p, `✅ ${c.name}: ${r.processed || 0} assets discovered`]);
        }
      } catch (e) {
        setDiscoveryProgress(p => [...p, `❌ ${c.name}: ${e.message}`]);
      }
    }

    es.close();
    setDiscoveryResult({ total: totalDiscovered, connectors: configuredConnectors.length });
    setRunningDiscovery(false);
    load();
  };

  if (loading) return <div className="flex items-center justify-center h-96"><Spinner size={32}/></div>;
  if (!project) return <div className="p-8 text-slate-500">Project not found.</div>;

  const totalAssets = assetStats?.total || assets.length || 0;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <button onClick={() => navigate('/projects')} className="text-xs text-slate-500 hover:text-blue-400 flex items-center gap-1 mb-2"><ArrowLeft size={12}/>All Projects</button>
          {editing ? (
            <input className="text-2xl font-bold text-slate-100 bg-transparent border-b border-blue-500 outline-none w-full mb-1"
              value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} autoFocus/>
          ) : (
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
              <FolderKanban size={24} className="text-blue-400"/>{project.name}
            </h1>
          )}
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs font-mono text-slate-500">{project.code}</span>
            <ClassBadge cls={editing ? editForm.sensitivity_ceiling : project.sensitivity_ceiling}/>
            <span className={`badge text-[10px] ${(editing ? editForm.status : project.status) === 'ACTIVE' ? 'bg-green-900/40 text-green-300 border-green-700/30' : 'bg-slate-800 text-slate-500'}`}>{editing ? editForm.status : project.status}</span>
          </div>
          {editing ? (
            <textarea className="input w-full text-sm mt-2" rows={2} placeholder="Project description..."
              value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})}/>
          ) : (
            project.description && <p className="text-sm text-slate-500 mt-2">{project.description}</p>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0 ml-4">
          {editing ? (
            <>
              <button onClick={() => setEditing(false)} className="btn-secondary text-xs"><X size={13}/>Cancel</button>
              <button onClick={saveProject} disabled={!editForm.name?.trim()} className="btn-primary text-xs bg-green-600 hover:bg-green-500 border-green-500"><Save size={13}/>Save</button>
            </>
          ) : (
            <>
              <button onClick={startEditing} className="btn-secondary text-xs" title="Edit project details">
                <Pencil size={13}/>Edit
              </button>
              {totalAssets > 0 && (
                <button onClick={clearProjectAssets} className="btn-secondary text-xs" title="Remove all discovered assets from this project to start fresh">
                  <Trash2 size={13}/>Clear Assets
                </button>
              )}
              <button onClick={runProjectDiscovery} disabled={runningDiscovery || connectors.length === 0}
                className="btn-primary" title="Run discovery scan on all configured connectors in this project">
                {runningDiscovery ? <><Spinner size={14}/>Scanning...</> : <><Play size={14}/>Run Discovery</>}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Discovery Progress */}
      {discoveryProgress.length > 0 && (
        <div className="border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${runningDiscovery ? 'bg-blue-400 animate-pulse' : 'bg-green-400'}`}/>
            <span className="text-xs font-medium text-slate-300">Discovery Agent Activity</span>
            {discoveryResult && <span className="text-xs text-green-400 ml-auto">{discoveryResult.total} assets discovered</span>}
          </div>
          <div ref={discoveryRef} className="p-3 max-h-40 overflow-y-auto space-y-0.5 bg-slate-950/50 font-mono">
            {discoveryProgress.map((p, i) => (
              <div key={i} className="text-[10px] text-slate-400">{p}</div>
            ))}
            {runningDiscovery && <div className="text-[10px] text-blue-400 animate-pulse">Processing...</div>}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800 pb-px">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-all ${tab === t.id ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
            <t.icon size={13}/>{t.label}
            {t.id === 'connectors' && connectors.length > 0 && <span className="text-[10px] text-slate-600">({connectors.length})</span>}
            {t.id === 'assets' && totalAssets > 0 && <span className="text-[10px] text-slate-600">({totalAssets})</span>}
            {t.id === 'members' && <span className="text-[10px] text-slate-600">({members.length})</span>}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Assets', value: assetStats?.total || 0 },
              { label: 'Connectors', value: connectors.length },
              { label: 'Members', value: members.length },
              { label: 'Pending Review', value: assetStats?.pending_approvals || 0, cls: assetStats?.pending_approvals > 0 ? 'text-orange-400' : 'text-green-400' },
            ].map(s => (
              <div key={s.label} className="card p-4 text-center">
                <div className={`text-2xl font-bold ${s.cls || 'text-slate-100'}`}>{s.value}</div>
                <div className="text-xs text-slate-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="card p-5">
            <div className="label mb-3">Project Settings</div>
            {editing ? (
              <div className="space-y-4">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Sensitivity Ceiling</div>
                  <div className="flex flex-wrap gap-1.5">
                    {['PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','TRADE_SECRET'].map(tier => (
                      <button key={tier} onClick={() => setEditForm({...editForm, sensitivity_ceiling: tier})}
                        className={`text-[10px] px-3 py-1.5 rounded-lg border font-medium transition-all ${
                          editForm.sensitivity_ceiling === tier
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'border-slate-700 text-slate-400 hover:border-blue-600 hover:text-blue-300'
                        }`}>
                        {tier}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Status</div>
                  <div className="flex gap-1.5">
                    {['ACTIVE','ARCHIVED','SUSPENDED'].map(st => (
                      <button key={st} onClick={() => setEditForm({...editForm, status: st})}
                        className={`text-[10px] px-3 py-1.5 rounded-lg border font-medium transition-all ${
                          editForm.status === st
                            ? st === 'ACTIVE' ? 'bg-green-600 border-green-500 text-white'
                              : st === 'ARCHIVED' ? 'bg-slate-600 border-slate-500 text-white'
                              : 'bg-red-600 border-red-500 text-white'
                            : 'border-slate-700 text-slate-400 hover:border-slate-500'
                        }`}>
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><div className="text-slate-600">Project Code</div><div className="text-slate-400 mt-0.5 font-mono">{project.code} <span className="text-slate-700">(immutable)</span></div></div>
                  <div><div className="text-slate-600">Owner</div><div className="text-slate-300 mt-0.5">{members.find(m => m.role === 'OWNER')?.email || '—'}</div></div>
                  <div><div className="text-slate-600">Created</div><div className="text-slate-300 mt-0.5">{formatDate(project.created_at)}</div></div>
                  <div><div className="text-slate-600">Last Updated</div><div className="text-slate-300 mt-0.5">{formatDate(project.updated_at)}</div></div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><div className="text-slate-600">Sensitivity Ceiling</div><div className="mt-0.5"><ClassBadge cls={project.sensitivity_ceiling}/></div></div>
                <div><div className="text-slate-600">Status</div><div className="text-slate-300 mt-0.5">{project.status}</div></div>
                <div><div className="text-slate-600">Owner</div><div className="text-slate-300 mt-0.5">{members.find(m => m.role === 'OWNER')?.email || '—'}</div></div>
                <div><div className="text-slate-600">Created</div><div className="text-slate-300 mt-0.5">{formatDate(project.created_at)}</div></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Connectors */}
      {tab === 'connectors' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-slate-400">{connectors.length} connector{connectors.length !== 1 ? 's' : ''} configured</div>
            <button onClick={() => setShowAddConnector(true)} className="btn-primary text-xs"><Plus size={13}/>Add Connector</button>
          </div>

          {showAddConnector && (
            <div className="card p-5 border-blue-800/40 bg-blue-950/10 space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-blue-300">Add Connector to Project</div>
                <button onClick={() => setShowAddConnector(false)} className="text-slate-500 hover:text-slate-300"><X size={16}/></button>
              </div>

              {/* From Library — saved templates with pre-filled config */}
              {savedTemplates.length > 0 && (
                <div>
                  <div className="text-xs text-purple-400 font-medium mb-2 flex items-center gap-1.5">⚡ From Library — pre-configured</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {savedTemplates.map(t => {
                      const cfg = typeof t.config === 'string' ? JSON.parse(t.config) : (t.config || {});
                      const configHint = Object.entries(cfg).filter(([k,v]) => v && !k.includes('secret') && !k.includes('password') && !k.includes('key')).slice(0,1).map(([k,v]) => `${k}: ${String(v).substring(0,25)}`).join('');
                      return (
                        <button key={t.id} onClick={() => addFromTemplate(t)}
                          className="flex items-center gap-3 p-3 rounded-lg border border-purple-700/30 hover:border-purple-500 bg-purple-950/20 hover:bg-purple-950/30 transition-all text-left">
                          <span className="text-xl">{t.icon || '🔌'}</span>
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-slate-200">{t.name}</div>
                            <div className="text-[10px] text-slate-500">{t.category}{configHint ? ` · ${configHint}` : ''}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* New Connector — configure from scratch */}
              <div>
                <div className="text-xs text-slate-400 font-medium mb-2">New Connector — configure from scratch</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {CONNECTOR_TYPES.map(ct => (
                    <button key={ct.type} onClick={() => addConnector(ct)}
                      className="flex items-center gap-3 p-3 rounded-lg border border-slate-700 hover:border-blue-600 bg-slate-800/30 hover:bg-blue-950/20 transition-all text-left">
                      <span className="text-xl">{ct.icon}</span>
                      <div>
                        <div className="text-xs font-medium text-slate-200">{ct.name}</div>
                        <div className="text-[10px] text-slate-500">{ct.category} · {ct.auth_type.replace('_',' ')}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {connectors.length === 0 && !showAddConnector && (
            <div className="card p-12 text-center">
              <Plug size={32} className="text-slate-700 mx-auto mb-3"/>
              <div className="text-slate-400 font-medium">No connectors configured</div>
              <div className="text-slate-600 text-sm mt-1">Add a connector to start discovering assets in this project.</div>
            </div>
          )}

          {connectors.map(c => (
            <ConnectorConfigCard key={c.id} connector={c} projectId={id} project={project} headers={headers}
              onDelete={() => deleteConnector(c.id)} onUpdated={load}
              discoveryEnabled={isConnectorEnabled(c)} onToggleDiscovery={() => toggleConnectorDiscovery(c.id)}/>
          ))}
        </div>
      )}

      {/* Tab: Assets */}
      {tab === 'assets' && (
        <div className="space-y-4">
          <div className="text-sm text-slate-400">{assetStats?.total || 0} assets in this project</div>
          {assets.length === 0 ? (
            <div className="card p-12 text-center">
              <FolderSearch size={32} className="text-slate-700 mx-auto mb-3"/>
              <div className="text-slate-400 font-medium">No assets discovered yet</div>
              <div className="text-slate-600 text-sm mt-1">Configure a connector and run a scan to discover assets.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {assets.map(a => (
                <div key={a.id} className="card p-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-sm text-slate-200 truncate">{a.file_name}</div>
                    <div className="flex gap-1.5 mt-1">
                      <DomainBadge domain={a.content_domain}/>
                      <ClassBadge cls={a.data_classification}/>
                      <ZoneBadge zone={a.classification_zone}/>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <div className="text-xs text-slate-500">{a.file_size_bytes ? formatBytes(a.file_size_bytes / 1024 / 1024) : '—'}</div>
                  </div>
                </div>
              ))}
              {(assetStats?.total || 0) > 10 && (
                <button onClick={() => navigate('/catalog')} className="text-xs text-blue-400 hover:text-blue-300 w-full text-center py-2">
                  View all {assetStats.total} assets in catalog →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab: Members */}
      {/* Tab: Policy Rules */}
      {tab === 'policies' && (
        <PolicyRulesTab projectId={id} headers={headers}/>
      )}

      {tab === 'members' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-slate-400">{members.length} member{members.length !== 1 ? 's' : ''}</div>
            <button onClick={() => setShowAddMember(true)} className="btn-primary text-xs"><Plus size={13}/>Add Member</button>
          </div>

          {showAddMember && <AddMemberForm onAdd={addMember} onCancel={() => setShowAddMember(false)}/>}

          {members.map(m => (
            <div key={m.id} className="card p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-400">
                  {(m.display_name || m.email || '?')[0].toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-200">{m.display_name || m.email}</div>
                  <div className="text-[10px] text-slate-500">{m.email}</div>
                </div>
              </div>
              <span className={`badge text-[10px] ${m.role === 'OWNER' ? 'bg-blue-900/40 text-blue-300' : m.role === 'STEWARD' ? 'bg-purple-900/40 text-purple-300' : 'bg-slate-800 text-slate-400'}`}>
                {m.role}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConnectorConfigCard({ connector, projectId, project, headers, onDelete, onUpdated, discoveryEnabled = true, onToggleDiscovery }) {
  const [expanded, setExpanded] = useState(false);
  const [config, setConfig] = useState(typeof connector.config === 'string' ? JSON.parse(connector.config) : (connector.config || {}));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [scanProgress, setScanProgress] = useState([]);
  const progressRef = React.useRef(null);

  const connType = CONNECTOR_TYPES.find(ct => ct.type === connector.type) || {};
  const fields = connType.configFields || [];

  const handleSave = async () => {
    setSaving(true);
    await fetch(`${API}/projects/${projectId}/connectors/${connector.id}`, {
      method:'PATCH', headers, body: JSON.stringify({ config, status:'CONFIGURED' })
    });
    setSaving(false);
    onUpdated?.();
  };

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      // Use the global connector test endpoint — pass type in body for project-scoped connectors
      // Route test to the correct connector type handler
      const isDb = ['mysql','postgresql_db'].includes(connector.type);
      const testUrl = isDb ? `${API}/connectors/sql/test` : `${API}/connectors/${['local_filesystem','onedrive','sharepoint','azure_blob','aws_s3'].includes(connector.type) ? connector.type : connector.id}/test`;
      const r = await fetch(testUrl, {
        method:'POST', headers, body: JSON.stringify({ ...config, type: connector.type })
      }).then(r => r.json());
      setTestResult(r);
    } catch (e) { setTestResult({ success:false, message:e.message }); }
    setTesting(false);
  };

  const handleScan = async () => {
    if (!['local_filesystem', 'onedrive', 'sharepoint', 'azure_blob', 'aws_s3'].includes(connector.type)) return;
    setScanning(true); setScanResult(null); setScanProgress([]);

    // Subscribe to SSE for real-time progress
    const SCAN_TYPES = new Set(['ScanStarted','ScanStage','ScanProgress','AssetDiscovered','ParseComplete','ClassificationProposed','ScanComplete']);
    const es = new EventSource('/api/stream');
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === 'connected' || !SCAN_TYPES.has(ev.type)) return;
        const prefix = ev.type === 'ScanProgress' && ev.payload?.pct != null ? `[${String(ev.payload.pct).padStart(3)}%] ` : '';
        setScanProgress(p => [...p, prefix + (ev.message || ev.type)]);
        if (progressRef.current) progressRef.current.scrollTop = progressRef.current.scrollHeight;
      } catch (_) {}
    };

    // Determine scan endpoint based on connector type
    const scanEndpoints = { local_filesystem: `${API}/connectors/local_filesystem/scan`, onedrive: `${API}/connectors/onedrive/scan`, sharepoint: `${API}/connectors/sharepoint/scan`, azure_blob: `${API}/connectors/azure_blob/scan`, aws_s3: `${API}/connectors/aws_s3/scan` };
    const scanEndpoint = scanEndpoints[connector.type];
    const scanBody = connector.type === 'local_filesystem'
      ? { scan_path: config.scan_path, recursive: config.recursive !== false, project_code: project?.code || projectId, project_id: projectId }
      : { ...config, project_code: project?.code || projectId, project_id: projectId };

    try {
      const r = await fetch(scanEndpoint, {
        method:'POST', headers,
        body: JSON.stringify(scanBody)
      }).then(r => r.json());
      es.close();
      setScanResult(r);
      onUpdated?.();
    } catch (e) { es.close(); setScanResult({ error: e.message }); }
    setScanning(false);
  };

  const updateField = (key, val) => setConfig(prev => ({ ...prev, [key]: val }));

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${connector.status === 'CONFIGURED' ? 'border-green-800/40 bg-green-950/10' : 'border-slate-700'}`}>
      <div className="p-4 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">{connector.icon || connType.icon || '🔌'}</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-200">{connector.name}</span>
                <span className={`badge text-[10px] ${connector.status === 'CONFIGURED' ? 'bg-green-900/40 text-green-300 border-green-700/30' : 'bg-slate-800 text-slate-500'}`}>{connector.status}</span>
              </div>
              <div className="text-[10px] text-slate-500">{connector.category} · {connector.auth_type?.replace('_',' ')}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {connector.supported_domains?.slice(0,5).map(d => (
              <span key={d} className="text-[10px] text-slate-600 cursor-default" title={DOMAIN_META[d]?.label || d}>{DOMAIN_META[d]?.icon}</span>
            ))}
            <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-slate-600 hover:text-red-400 p-1 ml-1" title="Delete connector"><Trash2 size={13}/></button>
            {/* Discovery toggle */}
            <button onClick={(e) => { e.stopPropagation(); onToggleDiscovery?.(); }}
              title={discoveryEnabled ? 'Included in Run Discovery — click to exclude' : 'Excluded from Run Discovery — click to include'}
              className={`ml-1 text-[9px] px-2 py-0.5 rounded-full font-medium transition-colors ${discoveryEnabled ? 'bg-green-900/40 text-green-300 border border-green-700/30' : 'bg-slate-800 text-slate-500 border border-slate-700'}`}>
              {discoveryEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-800 p-4 space-y-4">
          {/* Display name */}
          <div>
            <div className="text-xs text-slate-400 mb-1">Display Name</div>
            <input className="input w-full text-xs" value={connector.name || ''} placeholder="e.g. My S3 - Documents"
              onChange={e => {/* Name is read-only for now — editable after save redesign */}}
              readOnly/>
          </div>
          {/* Config fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {fields.map(f => (
              <div key={f.key}>
                <div className="text-xs text-slate-400 mb-1">{f.label}</div>
                {f.type === 'toggle' ? (
                  <button onClick={() => updateField(f.key, !(config[f.key] ?? f.default))}
                    className={`relative w-10 h-5 rounded-full transition-colors ${(config[f.key] ?? f.default) ? 'bg-blue-600' : 'bg-slate-700'}`}>
                    <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${(config[f.key] ?? f.default) ? 'translate-x-5' : ''}`}/>
                  </button>
                ) : (
                  <input className="input w-full text-xs"
                    type={f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : 'text'}
                    placeholder={f.placeholder || `Enter ${f.label.toLowerCase()}`}
                    value={config[f.key] ?? f.default ?? ''}
                    onChange={e => updateField(f.key, f.type === 'number' ? parseInt(e.target.value) || 0 : e.target.value)}/>
                )}
              </div>
            ))}
          </div>

          {/* Test result */}
          {testResult && (
            <div className={`flex items-center gap-2 text-xs p-2.5 rounded-lg border ${testResult.success ? 'border-green-800/40 bg-green-950/20 text-green-300' : 'border-red-800/40 bg-red-950/20 text-red-300'}`}>
              {testResult.success ? <CheckCircle size={13}/> : <XCircle size={13}/>}
              {testResult.message}
            </div>
          )}

          {/* Scan result */}
          {scanResult && !scanResult.error && (
            <div className="border border-green-800/30 rounded-lg p-3 bg-green-950/10 text-xs text-green-300">
              <CheckCircle size={13} className="inline mr-1.5"/>
              Scan complete: {scanResult.processed || scanResult.total_found || 0} files discovered and catalogued.
            </div>
          )}
          {scanResult?.error && (
            <div className="border border-red-800/30 rounded-lg p-3 bg-red-950/10 text-xs text-red-300">
              <XCircle size={13} className="inline mr-1.5"/>{scanResult.error}
            </div>
          )}

          {/* SSE Progress Log */}
          {scanProgress.length > 0 && (
            <div className="border border-slate-800 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${scanning ? 'bg-blue-400 animate-pulse' : 'bg-green-400'}`}/>
                <span className="text-[10px] font-medium text-slate-300">Agent Activity Log</span>
              </div>
              <div ref={progressRef} className="p-3 max-h-36 overflow-y-auto space-y-0.5 bg-slate-950/50 font-mono">
                {scanProgress.map((p, i) => (
                  <div key={i} className="text-[10px] text-slate-400">{p}</div>
                ))}
                {scanning && <div className="text-[10px] text-blue-400 animate-pulse">Processing files...</div>}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            <button onClick={handleTest} disabled={testing} className="btn-secondary text-xs" title="Test if the connector can reach the data source">
              {testing ? <><Spinner size={12}/>Testing...</> : <><Zap size={12}/>Test Connection</>}
            </button>
            <button onClick={handleSave} disabled={saving} className="btn-primary text-xs" title="Save connector configuration">
              {saving ? <><Spinner size={12}/>Saving...</> : <><CheckCircle size={12}/>Save Config</>}
            </button>
            {connector.type === 'local_filesystem' && (
              <button onClick={handleScan} disabled={scanning || !config.scan_path} className="btn-primary text-xs bg-green-600 hover:bg-green-500 border-green-500" title="Scan the configured folder and discover assets">
                {scanning ? <><Spinner size={12}/>Scanning...</> : <><Play size={12}/>Run Discovery</>}
              </button>
            )}
            {connector.type === 'onedrive' && (
              <button onClick={handleScan} disabled={scanning || !config.tenant_id || !config.client_id || !config.client_secret || !config.user_email} className="btn-primary text-xs bg-green-600 hover:bg-green-500 border-green-500" title="Connect to OneDrive and discover files">
                {scanning ? <><Spinner size={12}/>Scanning OneDrive...</> : <><Play size={12}/>Run OneDrive Discovery</>}
              </button>
            )}
            {connector.type === 'sharepoint' && (
              <button onClick={handleScan} disabled={scanning || !config.tenant_id || !config.client_id || !config.client_secret || !config.site_url} className="btn-primary text-xs bg-green-600 hover:bg-green-500 border-green-500" title="Connect to SharePoint and discover documents">
                {scanning ? <><Spinner size={12}/>Scanning SharePoint...</> : <><Play size={12}/>Run SharePoint Discovery</>}
              </button>
            )}
            {connector.type === 'azure_blob' && (
              <button onClick={handleScan} disabled={scanning || !config.container_name || (!config.connection_string && (!config.account_name || !config.account_key))} className="btn-primary text-xs bg-green-600 hover:bg-green-500 border-green-500" title="Connect to Azure Blob Storage and discover files">
                {scanning ? <><Spinner size={12}/>Scanning Azure Blob...</> : <><Play size={12}/>Run Azure Blob Discovery</>}
              </button>
            )}
            {connector.type === 'aws_s3' && (
              <button onClick={handleScan} disabled={scanning || !config.bucket_name || !config.access_key_id || !config.secret_access_key} className="btn-primary text-xs bg-green-600 hover:bg-green-500 border-green-500" title="Connect to AWS S3 and discover files">
                {scanning ? <><Spinner size={12}/>Scanning S3...</> : <><Play size={12}/>Run S3 Discovery</>}
              </button>
            )}
          </div>

          {/* Schedule Configuration */}
          <ScheduleConfig connectorId={connector.id} currentCron={connector.schedule_cron} headers={headers}/>
        </div>
      )}
    </div>
  );
}

const SCHEDULE_PRESETS = [
  { label: 'No schedule', value: '' },
  { label: 'Every 30 minutes', value: '*/30 * * * *' },
  { label: 'Hourly', value: '0 * * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Daily at 2 AM', value: '0 2 * * *' },
  { label: 'Weekly Mon 6 AM', value: '0 6 * * 1' },
];

function ScheduleConfig({ connectorId, currentCron, headers }) {
  const [schedule, setSchedule] = useState(currentCron || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    try {
      await fetch(`${API}/connectors/${connectorId}/schedule`, {
        method: 'PUT', headers, body: JSON.stringify({ cron_expression: schedule || null })
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (_) {}
    setSaving(false);
  };

  return (
    <div className="border-t border-slate-800 pt-3">
      <div className="text-xs text-slate-400 mb-2">Auto-Scan Schedule</div>
      <div className="flex gap-2 items-center">
        <select className="input text-xs flex-1" value={SCHEDULE_PRESETS.find(p => p.value === schedule) ? schedule : 'custom'}
          onChange={e => { if (e.target.value !== 'custom') setSchedule(e.target.value); }}>
          {SCHEDULE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          <option value="custom">Custom cron...</option>
        </select>
        {(!SCHEDULE_PRESETS.find(p => p.value === schedule) && schedule) && (
          <input className="input text-xs w-32 font-mono" value={schedule} onChange={e => setSchedule(e.target.value)} placeholder="* * * * *"/>
        )}
        <button onClick={handleSave} disabled={saving} className="btn-secondary text-xs">
          {saving ? <Spinner size={10}/> : saved ? <><CheckCircle size={11} className="text-green-400"/>Saved</> : 'Set'}
        </button>
      </div>
      {schedule && <div className="text-[10px] text-slate-600 mt-1">Cron: <span className="font-mono">{schedule}</span> — changes take effect on server restart</div>}
    </div>
  );
}

const TIERS = ['PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','TRADE_SECRET'];
const TIER_COLORS = { TRADE_SECRET:'bg-red-900/40 text-red-300', RESTRICTED:'bg-orange-900/40 text-orange-300', CONFIDENTIAL:'bg-yellow-900/40 text-yellow-300', INTERNAL:'bg-blue-900/40 text-blue-300', PUBLIC:'bg-green-900/40 text-green-300' };

function PolicyRulesTab({ projectId, headers }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showAddGlobal, setShowAddGlobal] = useState(false);
  const [form, setForm] = useState({ rule_code:'', description:'', signals:'', recommended_tier:'INTERNAL', priority:50 });
  const [saving, setSaving] = useState(false);

  // Read role from localStorage (same source as Sidebar role switcher)
  const viewAsRole = localStorage.getItem('cude_view_as') || 'ADMIN';
  const canEditGlobal = ['ADMIN', 'OWNER'].includes(viewAsRole);

  const load = async () => {
    setLoading(true);
    try {
      const d = await fetch(`${API}/projects/${projectId}/policies`, { headers }).then(r=>r.json());
      setRules(d.rules || []);
    } catch { setRules([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [projectId]);

  const handleAdd = async () => {
    if (!form.rule_code || !form.description || !form.signals) return;
    setSaving(true);
    await fetch(`${API}/projects/${projectId}/policies`, {
      method: 'POST', headers,
      body: JSON.stringify({ ...form, signals: form.signals.split(',').map(s=>s.trim()).filter(Boolean) })
    });
    setShowAdd(false); setForm({ rule_code:'', description:'', signals:'', recommended_tier:'INTERNAL', priority:50 });
    setSaving(false); load();
  };

  const handleToggle = async (rule) => {
    await fetch(`${API}/projects/${projectId}/policies/${rule.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ enabled: !rule.enabled })
    });
    load();
  };

  const handleDelete = async (ruleId) => {
    if (!confirm('Delete this policy rule?')) return;
    await fetch(`${API}/projects/${projectId}/policies/${ruleId}`, { method: 'DELETE', headers });
    load();
  };

  // Global rule actions (Admin/Owner only)
  const handleGlobalToggle = async (rule) => {
    await fetch(`${API}/policies/${rule.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ enabled: !rule.enabled })
    });
    load();
  };

  const handleGlobalDelete = async (ruleId) => {
    if (!confirm('Delete this global rule? This affects ALL projects.')) return;
    await fetch(`${API}/policies/${ruleId}`, { method: 'DELETE', headers });
    load();
  };

  const handleAddGlobal = async () => {
    if (!form.rule_code || !form.description || !form.signals) return;
    setSaving(true);
    await fetch(`${API}/policies`, {
      method: 'POST', headers,
      body: JSON.stringify({ ...form, signals: form.signals.split(',').map(s=>s.trim()).filter(Boolean) })
    });
    setShowAddGlobal(false); setForm({ rule_code:'', description:'', signals:'', recommended_tier:'INTERNAL', priority:50 });
    setSaving(false); load();
  };

  if (loading) return <div className="flex justify-center py-10"><Spinner size={24}/></div>;

  const projectRules = rules.filter(r => r.project_id);
  const globalRules = rules.filter(r => !r.project_id);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-slate-400">{rules.length} rule{rules.length!==1?'s':''} ({projectRules.length} project-specific, {globalRules.length} global)</div>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-xs"><Plus size={13}/>Add Rule</button>
      </div>

      {showAdd && (
        <div className="card p-4 border-blue-800/40 bg-blue-950/10 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-blue-300">New Classification Rule</div>
            <button onClick={() => setShowAdd(false)} className="text-slate-500 hover:text-slate-300"><X size={14}/></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><div className="text-xs text-slate-400 mb-1">Rule Code</div><input className="input w-full text-xs font-mono" placeholder="e.g. R-100" value={form.rule_code} onChange={e=>setForm(f=>({...f,rule_code:e.target.value}))}/></div>
            <div><div className="text-xs text-slate-400 mb-1">Classification Tier</div>
              <select className="input w-full text-xs" value={form.recommended_tier} onChange={e=>setForm(f=>({...f,recommended_tier:e.target.value}))}>
                {TIERS.map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="col-span-2"><div className="text-xs text-slate-400 mb-1">Description</div><input className="input w-full text-xs" placeholder="What triggers this rule" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/></div>
            <div><div className="text-xs text-slate-400 mb-1">Trigger Signals (comma separated)</div><input className="input w-full text-xs font-mono" placeholder="e.g. tapeout_schedule, customer_nda" value={form.signals} onChange={e=>setForm(f=>({...f,signals:e.target.value}))}/></div>
            <div><div className="text-xs text-slate-400 mb-1">Priority (lower = evaluated first)</div><input type="number" className="input w-full text-xs" value={form.priority} onChange={e=>setForm(f=>({...f,priority:parseInt(e.target.value)||50}))}/></div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="btn-secondary text-xs">Cancel</button>
            <button onClick={handleAdd} disabled={saving} className="btn-primary text-xs">{saving ? <Spinner size={10}/> : <><Plus size={12}/>Create Rule</>}</button>
          </div>
        </div>
      )}

      {/* Project-specific rules */}
      {projectRules.length > 0 && (
        <div>
          <div className="text-xs text-purple-400 font-medium mb-2">Project-Specific Rules</div>
          <div className="space-y-1">
            {projectRules.map(r => (
              <div key={r.id} className="card p-3 flex items-center gap-3">
                <span className="font-mono text-xs text-slate-400 w-12 flex-shrink-0">{r.rule_code}</span>
                <span className={`badge text-[10px] border ${TIER_COLORS[r.recommended_tier] || 'bg-slate-800 text-slate-400'} flex-shrink-0`}>{r.recommended_tier}</span>
                <div className="flex-1 min-w-0 text-xs text-slate-300 truncate">{r.description}</div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => handleToggle(r)} className={`text-[10px] px-2 py-0.5 rounded ${r.enabled ? 'bg-green-900/30 text-green-300' : 'bg-slate-800 text-slate-500'}`}>{r.enabled ? 'ON' : 'OFF'}</button>
                  <button onClick={() => handleDelete(r.id)} className="text-slate-600 hover:text-red-400"><Trash2 size={11}/></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Global rules — ON/OFF toggle only at project level. Add/Edit/Delete from Settings page. */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <div className="text-xs text-slate-500 font-medium">Global Rules (manage from Settings page)</div>
        </div>
        <div className="space-y-1">
          {globalRules.map(r => (
            <div key={r.id || r.rule_code} className="card p-3 flex items-center gap-3">
              <span className="font-mono text-xs text-slate-500 w-12 flex-shrink-0">{r.rule_code || r.id}</span>
              <span className={`badge text-[10px] border ${TIER_COLORS[r.recommended_tier || r.tier] || 'bg-slate-800 text-slate-400'} flex-shrink-0`}>{r.recommended_tier || r.tier}</span>
              <div className="flex-1 min-w-0 text-xs text-slate-400 truncate">{r.description}</div>
              <button onClick={() => handleGlobalToggle(r)} className={`text-[10px] px-2 py-0.5 rounded flex-shrink-0 ${r.enabled !== false ? 'bg-green-900/30 text-green-300' : 'bg-slate-800 text-slate-500'}`}>{r.enabled !== false ? 'ON' : 'OFF'}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AddMemberForm({ onAdd, onCancel }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('VIEWER');
  return (
    <div className="card p-4 border-blue-800/40 bg-blue-950/10 flex gap-3 items-end">
      <div className="flex-1">
        <div className="text-xs text-slate-400 mb-1">Email</div>
        <input className="input w-full text-xs" placeholder="user@company.com" value={email} onChange={e => setEmail(e.target.value)}/>
      </div>
      <div>
        <div className="text-xs text-slate-400 mb-1">Role</div>
        <select className="input text-xs" value={role} onChange={e => setRole(e.target.value)}>
          <option value="VIEWER">Viewer</option>
          <option value="STEWARD">Steward</option>
          <option value="AUDITOR">Auditor</option>
          <option value="OWNER">Owner</option>
        </select>
      </div>
      <button onClick={() => onAdd(email, role)} className="btn-primary text-xs"><Plus size={12}/>Add</button>
      <button onClick={onCancel} className="btn-secondary text-xs">Cancel</button>
    </div>
  );
}
