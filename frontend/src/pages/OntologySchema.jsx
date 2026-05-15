import React, { useState, useEffect, useMemo } from 'react';
import { Network, Plus, Trash2, Sparkles, Check, X, Layers, GitBranch } from 'lucide-react';

const API = '/api';

export default function OntologySchema() {
  const [domains, setDomains] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [tab, setTab] = useState('domains');
  const [loading, setLoading] = useState(true);
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [showAddRel, setShowAddRel] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [applyingTemplate, setApplyingTemplate] = useState(null);
  const [domainForm, setDomainForm] = useState({ domain_code: '', label: '', description: '', color: '#8b5cf6', initials: '', icon: '📄' });
  const [relForm, setRelForm] = useState({ relationship_code: '', label: '', description: '', color: '#8b5cf6', abbreviation: '' });

  const token = localStorage.getItem('cude_token');
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  const load = async () => {
    try {
      const [d, r, t] = await Promise.all([
        fetch(`${API}/ontology/domains`).then(r => r.json()),
        fetch(`${API}/ontology/relationships`).then(r => r.json()),
        fetch(`${API}/ontology/templates`).then(r => r.json()),
      ]);
      setDomains(d.domains || []);
      setRelationships(r.relationships || []);
      setTemplates(t.templates || []);
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const saveDomain = async () => {
    if (!domainForm.label) return;
    const code = domainForm.domain_code || domainForm.label.toUpperCase().replace(/[^A-Z]/g, '_');
    await fetch(`${API}/ontology/domains`, { method: 'POST', headers, body: JSON.stringify({ ...domainForm, domain_code: code, initials: domainForm.initials || domainForm.label[0] }) });
    setShowAddDomain(false); setDomainForm({ domain_code: '', label: '', description: '', color: '#8b5cf6', initials: '', icon: '📄' }); load();
  };

  const saveRel = async () => {
    if (!relForm.label) return;
    const code = relForm.relationship_code || relForm.label.toUpperCase().replace(/[^A-Z]/g, '_');
    await fetch(`${API}/ontology/relationships`, { method: 'POST', headers, body: JSON.stringify({ ...relForm, relationship_code: code, abbreviation: relForm.abbreviation || relForm.label.substring(0, 3).toUpperCase() }) });
    setShowAddRel(false); setRelForm({ relationship_code: '', label: '', description: '', color: '#8b5cf6', abbreviation: '' }); load();
  };

  const deleteDomain = async (id) => { await fetch(`${API}/ontology/domains/${id}`, { method: 'DELETE', headers }); load(); };
  const deleteRel = async (id) => { await fetch(`${API}/ontology/relationships/${id}`, { method: 'DELETE', headers }); load(); };
  const toggleDomain = async (d) => { await fetch(`${API}/ontology/domains/${d.id}`, { method: 'PATCH', headers, body: JSON.stringify({ enabled: !d.enabled }) }); load(); };
  const toggleRel = async (r) => { await fetch(`${API}/ontology/relationships/${r.id}`, { method: 'PATCH', headers, body: JSON.stringify({ enabled: !r.enabled }) }); load(); };

  const applyTemplate = async (key) => {
    setApplyingTemplate(key);
    await fetch(`${API}/ontology/apply-template`, { method: 'POST', headers, body: JSON.stringify({ template: key }) });
    setApplyingTemplate(null); setShowTemplates(false); load();
  };

  // Schema preview: circular layout with rich interconnections
  const previewLayout = useMemo(() => {
    const activeDomains = domains.filter(d => d.enabled !== false);
    const activeRels = relationships.filter(r => r.enabled !== false && !r.is_structural);
    if (!activeDomains.length) return { nodes: [], edges: [] };

    // Circular layout — nodes evenly spaced around an ellipse
    const cx = 420, cy = 210;
    const count = activeDomains.length;
    // Scale radius based on node count for breathing room
    const rx = Math.min(340, 100 + count * 30);
    const ry = Math.min(170, 60 + count * 15);
    const nodes = activeDomains.map((d, i) => {
      const angle = (2 * Math.PI * i / count) - Math.PI / 2;
      return { ...d, x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
    });

    // Build edges: each relationship connects MULTIPLE domain pairs to show a rich schema
    const edges = [];
    const domCodes = activeDomains.map(d => d.domain_code);
    activeRels.forEach((r, i) => {
      if (r.source_domain && r.target_domain && domCodes.includes(r.source_domain) && domCodes.includes(r.target_domain)) {
        edges.push({ source: r.source_domain, target: r.target_domain, rel: r });
      } else {
        // Spread each relationship across 2-3 different domain pairs for a connected look
        const pairsPerRel = Math.min(3, Math.floor(count / 2));
        for (let p = 0; p < pairsPerRel; p++) {
          const s = (i * 2 + p) % count;
          const t = (s + 1 + p + Math.floor(i / 2)) % count;
          if (s !== t) {
            const key = `${domCodes[Math.min(s,t)]}-${domCodes[Math.max(s,t)]}-${r.relationship_code}`;
            if (!edges.find(e => `${e.source}-${e.target}-${e.rel.relationship_code}` === key)) {
              edges.push({ source: domCodes[s], target: domCodes[t], rel: r });
            }
          }
        }
      }
    });

    return { nodes, edges };
  }, [domains, relationships]);

  const COLORS = ['#8b5cf6','#ef4444','#3b82f6','#10b981','#14b8a6','#f59e0b','#ec4899','#6366f1','#06b6d4','#f97316','#a855f7','#84cc16'];

  if (loading) return <div className="p-6 text-slate-500">Loading ontology schema...</div>;

  return (
    <div className="p-5 space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-header"><Network size={22} className="text-purple-400"/>Ontology Schema</h1>
          <p className="page-subtitle">Define entity types and relationship types that structure your knowledge graph.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowTemplates(!showTemplates)}
            className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium transition-all shadow-lg shadow-purple-900/30">
            <Sparkles size={13}/>Industry Templates
          </button>
        </div>
      </div>

      {/* Template Picker */}
      {showTemplates && (
        <div className="card p-4 border-purple-800/30 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-purple-300">Apply Industry Template</div>
            <button onClick={() => setShowTemplates(false)} className="text-slate-500 hover:text-slate-300"><X size={14}/></button>
          </div>
          <p className="text-[10px] text-slate-500">Select a template to auto-populate domain types, relationship types, and glossary terms optimized for your industry.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {templates.map(t => (
              <button key={t.key} onClick={() => applyTemplate(t.key)} disabled={!!applyingTemplate}
                className={`p-3 rounded-xl border text-left transition-all hover:border-purple-600/50 hover:bg-purple-950/20 ${applyingTemplate === t.key ? 'border-purple-500 bg-purple-950/30' : 'border-slate-800'}`}>
                <div className="text-xs font-semibold text-white mb-1">{t.name}</div>
                <div className="text-[9px] text-slate-500 mb-2">{t.description}</div>
                <div className="flex gap-2 text-[9px] text-slate-600">
                  <span>{t.domains} domains</span>
                  <span>{t.relationships} rels</span>
                  <span>{t.glossary} terms</span>
                </div>
                {applyingTemplate === t.key && <div className="text-[9px] text-purple-400 mt-1 animate-pulse">Applying...</div>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800">
        {[
          { id: 'domains', label: 'Entity Types', icon: Layers, count: domains.filter(d => d.enabled !== false).length },
          { id: 'relationships', label: 'Relationship Types', icon: GitBranch, count: relationships.filter(r => r.enabled !== false && !r.is_structural).length },
          { id: 'preview', label: 'Schema Preview', icon: Network },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-all ${tab === t.id ? 'border-purple-500 text-purple-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
            <t.icon size={13}/>{t.label}
            {t.count !== undefined && <span className="text-[10px] text-slate-600">({t.count})</span>}
          </button>
        ))}
      </div>

      {/* Domain Types Tab */}
      {tab === 'domains' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setShowAddDomain(!showAddDomain)} className="btn-primary text-xs"><Plus size={13}/>{showAddDomain ? 'Cancel' : 'Add Entity Type'}</button>
          </div>

          {showAddDomain && (
            <div className="card p-4 border-purple-800/30 space-y-3">
              <div className="text-sm font-semibold text-purple-300">New Entity Type</div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="label">Label *</label><input className="input w-full text-xs" placeholder="e.g. Clinical Data" value={domainForm.label} onChange={e => setDomainForm({ ...domainForm, label: e.target.value })}/></div>
                <div><label className="label">Code</label><input className="input w-full text-xs font-mono" placeholder="Auto-generated" value={domainForm.domain_code} onChange={e => setDomainForm({ ...domainForm, domain_code: e.target.value })}/></div>
                <div><label className="label">Initials</label><input className="input w-full text-xs text-center" maxLength={2} placeholder="C" value={domainForm.initials} onChange={e => setDomainForm({ ...domainForm, initials: e.target.value })}/></div>
              </div>
              <div><label className="label">Description</label><input className="input w-full text-xs" placeholder="What kind of files does this domain contain?" value={domainForm.description} onChange={e => setDomainForm({ ...domainForm, description: e.target.value })}/></div>
              <div>
                <label className="label">Color</label>
                <div className="flex gap-1.5 mt-1">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setDomainForm({ ...domainForm, color: c })}
                      className={`w-6 h-6 rounded-full border-2 transition-transform ${domainForm.color === c ? 'border-white scale-125' : 'border-transparent hover:scale-110'}`}
                      style={{ background: c }}/>
                  ))}
                </div>
              </div>
              <button onClick={saveDomain} disabled={!domainForm.label} className="btn-primary text-xs">Save Entity Type</button>
            </div>
          )}

          <div className="space-y-2">
            {domains.map(d => (
              <div key={d.id} className={`card p-3 flex items-center gap-3 group transition-opacity ${d.enabled === false ? 'opacity-50' : ''}`}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: d.color + '20', border: `2px solid ${d.color}` }}>
                  <span style={{ color: d.color }} className="text-sm font-bold">{d.initials}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{d.label}</span>
                    <span className="text-[9px] font-mono text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">{d.domain_code}</span>
                    {d.enabled === false && <span className="text-[9px] text-slate-600">(disabled)</span>}
                  </div>
                  {d.description && <div className="text-[10px] text-slate-500 mt-0.5">{d.description}</div>}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => toggleDomain(d)} className="p-1.5 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300" title={d.enabled === false ? 'Enable' : 'Disable'}>
                    {d.enabled === false ? <Check size={13}/> : <X size={13}/>}
                  </button>
                  <button onClick={() => deleteDomain(d.id)} className="p-1.5 rounded hover:bg-red-900/30 text-slate-500 hover:text-red-400" title="Delete"><Trash2 size={13}/></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Relationship Types Tab */}
      {tab === 'relationships' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setShowAddRel(!showAddRel)} className="btn-primary text-xs"><Plus size={13}/>{showAddRel ? 'Cancel' : 'Add Relationship Type'}</button>
          </div>

          {showAddRel && (
            <div className="card p-4 border-purple-800/30 space-y-3">
              <div className="text-sm font-semibold text-purple-300">New Relationship Type</div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="label">Label *</label><input className="input w-full text-xs" placeholder="e.g. Validates" value={relForm.label} onChange={e => setRelForm({ ...relForm, label: e.target.value })}/></div>
                <div><label className="label">Code</label><input className="input w-full text-xs font-mono" placeholder="Auto-generated" value={relForm.relationship_code} onChange={e => setRelForm({ ...relForm, relationship_code: e.target.value })}/></div>
                <div><label className="label">Abbreviation</label><input className="input w-full text-xs text-center" maxLength={3} placeholder="VAL" value={relForm.abbreviation} onChange={e => setRelForm({ ...relForm, abbreviation: e.target.value })}/></div>
              </div>
              <div><label className="label">Description</label><input className="input w-full text-xs" placeholder="What does this relationship mean?" value={relForm.description} onChange={e => setRelForm({ ...relForm, description: e.target.value })}/></div>
              <div>
                <label className="label">Color</label>
                <div className="flex gap-1.5 mt-1">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setRelForm({ ...relForm, color: c })}
                      className={`w-6 h-6 rounded-full border-2 transition-transform ${relForm.color === c ? 'border-white scale-125' : 'border-transparent hover:scale-110'}`}
                      style={{ background: c }}/>
                  ))}
                </div>
              </div>
              <button onClick={saveRel} disabled={!relForm.label} className="btn-primary text-xs">Save Relationship Type</button>
            </div>
          )}

          <div className="space-y-2">
            {relationships.filter(r => !r.is_structural).map(r => (
              <div key={r.id} className={`card p-3 flex items-center gap-3 group transition-opacity ${r.enabled === false ? 'opacity-50' : ''}`}>
                <div className="w-10 h-4 rounded flex-shrink-0 flex items-center justify-center" style={{ background: r.color }}>
                  <span className="text-[8px] font-bold text-white">{r.abbreviation}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{r.label}</span>
                    <span className="text-[9px] font-mono text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">{r.relationship_code}</span>
                  </div>
                  {r.description && <div className="text-[10px] text-slate-500 mt-0.5">{r.description}</div>}
                  {(r.source_domain || r.target_domain) && <div className="text-[9px] text-slate-600 mt-0.5">{r.source_domain || '*'} → {r.target_domain || '*'}</div>}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => toggleRel(r)} className="p-1.5 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300">
                    {r.enabled === false ? <Check size={13}/> : <X size={13}/>}
                  </button>
                  <button onClick={() => deleteRel(r.id)} className="p-1.5 rounded hover:bg-red-900/30 text-slate-500 hover:text-red-400"><Trash2 size={13}/></button>
                </div>
              </div>
            ))}
            {relationships.filter(r => r.is_structural).length > 0 && (
              <div className="mt-4">
                <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-2">Structural (System-Managed)</div>
                {relationships.filter(r => r.is_structural).map(r => (
                  <div key={r.id} className="card p-2.5 flex items-center gap-3 opacity-40 mb-1.5">
                    <div className="w-8 h-3 rounded flex-shrink-0" style={{ background: r.color }}/>
                    <span className="text-[10px] text-slate-500">{r.label}</span>
                    <span className="text-[9px] font-mono text-slate-700 ml-auto">{r.relationship_code}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Schema Preview Tab */}
      {tab === 'preview' && (
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <div className="p-3 border-b border-slate-800">
              <div className="text-xs font-semibold text-slate-300">Ontology Schema Graph</div>
              <div className="text-[10px] text-slate-600">{domains.filter(d=>d.enabled!==false).length} entity types · {relationships.filter(r=>r.enabled!==false&&!r.is_structural).length} relationship types</div>
            </div>
            <div style={{ height: 450, background: '#080e1a' }} className="relative">
              <svg width="100%" height="100%" viewBox="0 0 840 450" preserveAspectRatio="xMidYMid meet">
                <defs>
                  <pattern id="preview-chess" width="40" height="40" patternUnits="userSpaceOnUse">
                    <rect width="40" height="40" fill="#080e1a"/>
                    <rect width="20" height="20" fill="#0a1225"/>
                    <rect x="20" y="20" width="20" height="20" fill="#0a1225"/>
                  </pattern>
                  <marker id="schema-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                    <polygon points="0 0, 8 3, 0 6" fill="#475569" opacity="0.5"/>
                  </marker>
                </defs>
                <rect width="100%" height="100%" fill="url(#preview-chess)"/>

                {/* Edges — curved lines between domain nodes */}
                {previewLayout.edges.map((e, i) => {
                  const s = previewLayout.nodes.find(n => n.domain_code === e.source);
                  const t = previewLayout.nodes.find(n => n.domain_code === e.target);
                  if (!s || !t) return null;
                  const color = e.rel?.color || '#475569';
                  // Curve control point offset — stagger by edge index to separate overlapping edges
                  const dx = t.x - s.x, dy = t.y - s.y;
                  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                  const perpX = -dy / dist, perpY = dx / dist;
                  const offset = 30 + (i % 3) * 15; // Stagger parallel edges
                  const mx = (s.x + t.x) / 2 + perpX * offset;
                  const my = (s.y + t.y) / 2 + perpY * offset;
                  // Label angle
                  let labelAngle = Math.atan2(t.y - s.y, t.x - s.x) * 180 / Math.PI;
                  if (labelAngle > 90) labelAngle -= 180;
                  if (labelAngle < -90) labelAngle += 180;
                  return (
                    <g key={i} opacity={0.55}>
                      <path d={`M${s.x},${s.y} Q${mx},${my} ${t.x},${t.y}`} fill="none" stroke={color} strokeWidth={1.5} markerEnd="url(#schema-arrow)"/>
                      <text x={mx} y={my - 5} fill={color} fontSize="8" fontWeight="600" textAnchor="middle"
                        transform={`rotate(${labelAngle}, ${mx}, ${my - 5})`}>
                        {e.rel?.abbreviation || '?'}
                      </text>
                    </g>
                  );
                })}

                {/* Nodes — circles on the ellipse */}
                {previewLayout.nodes.map(n => {
                  const color = n.color || '#64748b';
                  return (
                    <g key={n.domain_code}>
                      {/* Outer glow */}
                      <circle cx={n.x} cy={n.y} r={38} fill="none" stroke={color} strokeWidth={0.5} opacity={0.15}/>
                      {/* Main circle */}
                      <circle cx={n.x} cy={n.y} r={32} fill={color + '12'} stroke={color} strokeWidth={2}/>
                      {/* Initials */}
                      <text x={n.x} y={n.y + 1} textAnchor="middle" dominantBaseline="middle"
                        fill={color} fontSize="20" fontWeight="700" fontFamily="Inter, system-ui, sans-serif">
                        {n.initials || '?'}
                      </text>
                      {/* Label below */}
                      <text x={n.x} y={n.y + 50} textAnchor="middle"
                        fill="#94a3b8" fontSize="10" fontWeight="500" fontFamily="Inter, system-ui, sans-serif">
                        {n.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Schema Summary */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card p-4">
              <div className="label mb-2">Entity Types</div>
              <div className="space-y-1.5">
                {domains.filter(d => d.enabled !== false).map(d => (
                  <div key={d.id} className="flex items-center gap-2 text-[10px]">
                    <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: d.color + '30', border: `1.5px solid ${d.color}` }}/>
                    <span className="text-slate-300">{d.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card p-4">
              <div className="label mb-2">Relationship Types</div>
              <div className="space-y-1.5">
                {relationships.filter(r => r.enabled !== false && !r.is_structural).map(r => (
                  <div key={r.id} className="flex items-center gap-2 text-[10px]">
                    <div className="w-5 h-1 rounded flex-shrink-0" style={{ background: r.color }}/>
                    <span className="text-slate-300">{r.label}</span>
                    <span className="text-slate-600 ml-auto">{r.abbreviation}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
