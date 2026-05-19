import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Network, Plus, Trash2, Sparkles, Check, X, Layers, GitBranch, Search, Pencil, Save, Database, FileText, FolderTree, Activity, Download, AlertCircle, ShieldCheck, ListChecks, AlertTriangle, ExternalLink, Info } from 'lucide-react';
import { Spinner } from '../components/UI';

const API = '/api';

export default function OntologySchema() {
  const [domains, setDomains] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [stats, setStats] = useState({ domainCounts: {}, relationshipCounts: {}, matrix: [], totals: {} });
  const [loading, setLoading] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(null);
  const [selected, setSelected] = useState(null); // { type: 'domain' | 'relationship', code: '...' }
  const [search, setSearch] = useState('');
  const [editingField, setEditingField] = useState(null); // { id, field }
  const [editValue, setEditValue] = useState('');
  const [creating, setCreating] = useState(null); // 'domain' | 'relationship' | null
  const [newItem, setNewItem] = useState({ label: '', description: '', color: '#5b6b8c', initials: '', icon: '📄', abbreviation: '' });

  // Phase 2 — properties + violations
  const [properties, setProperties] = useState([]); // properties for the selected domain
  const [addingProp, setAddingProp] = useState(false);
  const [newProp, setNewProp] = useState({ property_name: '', property_label: '', data_type: 'text', is_required: false, is_unique: false, enum_values: '', description: '' });
  const [editingProp, setEditingProp] = useState(null); // property id being edited
  const [violations, setViolations] = useState(null); // { violations, summary }
  const [showViolations, setShowViolations] = useState(false);
  const [loadingViolations, setLoadingViolations] = useState(false);
  const [violationSeverity, setViolationSeverity] = useState('all'); // all | error | warning
  const [violationDomain, setViolationDomain] = useState('all');
  const [violationSearch, setViolationSearch] = useState('');
  const [violationsExpanded, setViolationsExpanded] = useState(false); // toggle full-screen overlay

  const token = localStorage.getItem('cude_token');
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  const load = async () => {
    try {
      const [d, r, t, s] = await Promise.all([
        fetch(`${API}/ontology/domains`).then(r => r.json()),
        fetch(`${API}/ontology/relationships`).then(r => r.json()),
        fetch(`${API}/ontology/templates`).then(r => r.json()),
        fetch(`${API}/ontology/stats`).then(r => r.json()),
      ]);
      setDomains(d.domains || []);
      setRelationships(r.relationships || []);
      setTemplates(t.templates || []);
      setStats(s);
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Load properties whenever a domain is selected
  useEffect(() => {
    if (selected?.type === 'domain' && selected.code) {
      fetch(`${API}/ontology/properties/${selected.code}`)
        .then(r => r.json()).then(d => setProperties(d.properties || []))
        .catch(() => setProperties([]));
    } else {
      setProperties([]);
    }
    setAddingProp(false);
    setEditingProp(null);
  }, [selected]);

  const loadViolations = async () => {
    setLoadingViolations(true);
    try {
      const r = await fetch(`${API}/ontology/violations`).then(r => r.json());
      setViolations(r);
      setShowViolations(true);
    } catch (_) { setViolations({ violations: [], summary: { total: 0, errors: 0, warnings: 0 } }); }
    setLoadingViolations(false);
  };

  const createProperty = async () => {
    if (!newProp.property_label || !selected?.code) return;
    const pn = newProp.property_name || newProp.property_label.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const enum_values = newProp.data_type === 'enum'
      ? newProp.enum_values.split(',').map(s => s.trim()).filter(Boolean)
      : null;
    await fetch(`${API}/ontology/properties`, {
      method: 'POST', headers,
      body: JSON.stringify({
        domain_code: selected.code,
        property_name: pn,
        property_label: newProp.property_label,
        data_type: newProp.data_type,
        is_required: newProp.is_required,
        is_unique: newProp.is_unique,
        enum_values,
        description: newProp.description,
      }),
    });
    setAddingProp(false);
    setNewProp({ property_name: '', property_label: '', data_type: 'text', is_required: false, is_unique: false, enum_values: '', description: '' });
    const r = await fetch(`${API}/ontology/properties/${selected.code}`).then(r => r.json());
    setProperties(r.properties || []);
  };

  const updateProperty = async (id, patch) => {
    await fetch(`${API}/ontology/properties/${id}`, { method: 'PATCH', headers, body: JSON.stringify(patch) });
    const r = await fetch(`${API}/ontology/properties/${selected.code}`).then(r => r.json());
    setProperties(r.properties || []);
  };

  const deleteProperty = async (id) => {
    if (!confirm('Delete this property?')) return;
    await fetch(`${API}/ontology/properties/${id}`, { method: 'DELETE', headers });
    setProperties(properties.filter(p => p.id !== id));
  };

  const saveInline = async (item, field, value, isRelationship) => {
    const endpoint = isRelationship ? 'relationships' : 'domains';
    await fetch(`${API}/ontology/${endpoint}/${item.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ [field]: value })
    });
    setEditingField(null);
    load();
  };

  const createNew = async () => {
    if (!newItem.label) return;
    if (creating === 'domain') {
      const code = newItem.label.toUpperCase().replace(/[^A-Z]/g, '_');
      await fetch(`${API}/ontology/domains`, { method: 'POST', headers, body: JSON.stringify({ ...newItem, domain_code: code, initials: newItem.initials || newItem.label[0] }) });
    } else if (creating === 'relationship') {
      const code = newItem.label.toUpperCase().replace(/[^A-Z]/g, '_');
      await fetch(`${API}/ontology/relationships`, { method: 'POST', headers, body: JSON.stringify({ ...newItem, relationship_code: code, abbreviation: newItem.abbreviation || newItem.label.substring(0, 3).toUpperCase() }) });
    }
    setCreating(null);
    setNewItem({ label: '', description: '', color: '#5b6b8c', initials: '', icon: '📄', abbreviation: '' });
    load();
  };

  const deleteItem = async (item, isRelationship) => {
    if (!confirm(`Delete "${item.label}"?`)) return;
    const endpoint = isRelationship ? 'relationships' : 'domains';
    await fetch(`${API}/ontology/${endpoint}/${item.id}`, { method: 'DELETE', headers });
    if (selected?.code === (item.domain_code || item.relationship_code)) setSelected(null);
    load();
  };

  const toggleEnabled = async (item, isRelationship) => {
    const endpoint = isRelationship ? 'relationships' : 'domains';
    await fetch(`${API}/ontology/${endpoint}/${item.id}`, { method: 'PATCH', headers, body: JSON.stringify({ enabled: !item.enabled }) });
    load();
  };

  const applyTemplate = async (key) => {
    setApplyingTemplate(key);
    await fetch(`${API}/ontology/apply-template`, { method: 'POST', headers, body: JSON.stringify({ template: key }) });
    setApplyingTemplate(null); setShowTemplates(false); load();
  };

  const exportOWL = async () => {
    // Fetch all properties for export
    let allProps = [];
    try {
      const r = await fetch(`${API}/ontology/properties`).then(r => r.json());
      allProps = r.properties || [];
    } catch (_) {}

    // Build OWL-style JSON-LD with full Phase 2 semantics
    const onto = {
      '@context': {
        '@vocab': 'http://cude.local/ontology#',
        'owl': 'http://www.w3.org/2002/07/owl#',
        'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
        'xsd': 'http://www.w3.org/2001/XMLSchema#',
      },
      '@graph': [
        ...domains.filter(d => d.enabled !== false).map(d => ({
          '@id': d.domain_code, '@type': 'owl:Class',
          'rdfs:label': d.label,
          'rdfs:comment': d.description || '',
          ...(d.parent_code ? { 'rdfs:subClassOf': d.parent_code } : {}),
          ...(d.is_abstract ? { 'owl:Abstract': true } : {}),
        })),
        ...allProps.map(p => ({
          '@id': `${p.domain_code}#${p.property_name}`,
          '@type': p.data_type === 'reference' ? 'owl:ObjectProperty' : 'owl:DatatypeProperty',
          'rdfs:label': p.property_label,
          'rdfs:comment': p.description || '',
          'rdfs:domain': p.domain_code,
          'rdfs:range': p.data_type === 'reference' && p.reference_domain ? p.reference_domain : `xsd:${p.data_type}`,
          ...(p.is_required ? { 'owl:minCardinality': 1 } : {}),
          ...(p.enum_values?.length ? { 'owl:oneOf': p.enum_values } : {}),
        })),
        ...relationships.filter(r => r.enabled !== false && !r.is_structural).map(r => ({
          '@id': r.relationship_code, '@type': 'owl:ObjectProperty',
          'rdfs:label': r.label, 'rdfs:comment': r.description || '',
          ...(r.source_domain ? { 'rdfs:domain': r.source_domain } : {}),
          ...(r.target_domain ? { 'rdfs:range': r.target_domain } : {}),
          ...(r.cardinality ? { 'cude:cardinality': r.cardinality } : {}),
          ...(r.inverse_code ? { 'owl:inverseOf': r.inverse_code } : {}),
          ...(r.parent_code ? { 'rdfs:subPropertyOf': r.parent_code } : {}),
        })),
      ],
    };
    const blob = new Blob([JSON.stringify(onto, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'cude-ontology.json-ld'; a.click();
    URL.revokeObjectURL(url);
  };

  // Filter domains by search
  const filteredDomains = useMemo(() => {
    if (!search) return domains;
    const q = search.toLowerCase();
    return domains.filter(d =>
      d.label?.toLowerCase().includes(q) ||
      d.domain_code?.toLowerCase().includes(q) ||
      d.description?.toLowerCase().includes(q)
    );
  }, [domains, search]);

  // Schema canvas layout: position entity types in a circle
  const canvasNodes = useMemo(() => {
    const active = domains.filter(d => d.enabled !== false);
    if (!active.length) return [];
    const cx = 380, cy = 280;
    const count = active.length;
    const radius = Math.min(220, 80 + count * 25);
    return active.map((d, i) => {
      const angle = (2 * Math.PI * i / count) - Math.PI / 2;
      return {
        ...d,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        assetCount: stats.domainCounts[d.domain_code] || 0,
      };
    });
  }, [domains, stats.domainCounts]);

  // Canvas edges: use real cross-domain matrix from PostgreSQL
  const canvasEdges = useMemo(() => {
    const enabledRels = new Set(relationships.filter(r => r.enabled !== false && !r.is_structural).map(r => r.relationship_code));
    // Group by source-target-type to dedupe
    const edgeMap = {};
    stats.matrix?.forEach(m => {
      if (!enabledRels.has(m.relationship)) return;
      const key = `${m.source}->${m.target}->${m.relationship}`;
      if (!edgeMap[key]) {
        edgeMap[key] = { source: m.source, target: m.target, relationship: m.relationship, count: 0 };
      }
      edgeMap[key].count += m.count;
    });
    return Object.values(edgeMap);
  }, [stats.matrix, relationships]);

  // Get relationships involving selected domain
  const relationshipsForDomain = (code) => {
    return canvasEdges.filter(e => e.source === code || e.target === code);
  };

  // Asset count getter
  const getAssetCount = (code) => stats.domainCounts[code] || 0;
  const getRelCount = (code) => stats.relationshipCounts[code] || 0;

  // Muted enterprise palette — desaturated, organized by hue family
  const COLORS = [
    // Slate / neutral
    '#64748b','#475569','#334155','#52525b',
    // Steel blue / indigo (primary accents)
    '#5b6b8c','#4f6080','#4c5d8a','#5468a3',
    // Teal / sage
    '#4d7c7a','#3f6b6b','#5a7f6a','#6b8e6b',
    // Muted earth (amber/ochre)
    '#8a7556','#9c7a4d','#a67c52','#856a3d',
    // Muted brick / terracotta
    '#8a5a52','#9c6358','#a05c4d','#7d4a44',
    // Muted plum / mauve
    '#6e5878','#7d5e8a','#86618c','#5e4a6b',
  ];

  if (loading) return <div className="p-6 flex items-center justify-center h-full"><Spinner size={24}/><span className="ml-3 text-slate-500">Loading ontology schema...</span></div>;

  const selectedDomain = selected?.type === 'domain' ? domains.find(d => d.domain_code === selected.code) : null;
  const selectedRel = selected?.type === 'relationship' ? relationships.find(r => r.relationship_code === selected.code) : null;

  return (
    <div className="flex h-full">
      {/* LEFT PANE — Entity Tree */}
      <div className="w-64 flex-shrink-0 border-r border-slate-800 bg-slate-900/50 overflow-y-auto flex flex-col">
        <div className="p-3 border-b border-slate-800 flex-shrink-0">
          <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-2"><FolderTree size={13} className="text-slate-500"/>Entity Types</h3>
          <p className="text-[9px] text-slate-600 mt-0.5">{domains.filter(d => d.enabled !== false).length} active · {stats.totals?.assets || 0} assets</p>
        </div>

        <div className="p-2 border-b border-slate-800">
          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600"/>
            <input className="input w-full pl-7 text-[10px] py-1.5" placeholder="Search entity types..."
              value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5">
          {filteredDomains.length === 0 && search && (
            <div className="text-[10px] text-slate-600 p-3 text-center">No matches</div>
          )}
          {filteredDomains.map(d => {
            const count = getAssetCount(d.domain_code);
            const isSelected = selected?.type === 'domain' && selected.code === d.domain_code;
            return (
              <button key={d.id}
                onClick={() => setSelected({ type: 'domain', code: d.domain_code })}
                className={`w-full text-left p-2 rounded-md mb-0.5 transition-all flex items-center gap-2 ${
                  isSelected ? 'bg-slate-800/70 border-l-2 border-slate-400' :
                  d.enabled === false ? 'opacity-40 hover:bg-slate-800/40' :
                  'hover:bg-slate-800/40 border-l-2 border-transparent'
                }`}>
                <div className="w-6 h-6 rounded flex-shrink-0 flex items-center justify-center text-[10px] font-semibold"
                  style={{ background: d.color + '18', color: d.color, border: `1px solid ${d.color}66` }}>
                  {d.initials || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-slate-200 truncate font-medium">{d.label}</div>
                  <div className="text-[9px] text-slate-600 font-mono">{d.domain_code}</div>
                </div>
                {count > 0 && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 flex-shrink-0">
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          <button onClick={() => { setCreating('domain'); setSelected(null); }}
            className="w-full mt-2 p-2 rounded-md border border-dashed border-slate-700 hover:border-slate-500 hover:bg-slate-800/40 text-[10px] text-slate-500 hover:text-slate-300 transition-colors flex items-center justify-center gap-1">
            <Plus size={11}/>Add Entity Type
          </button>
        </div>

        {/* Stats footer */}
        <div className="p-3 border-t border-slate-800 space-y-1.5 flex-shrink-0">
          <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1">Schema Stats</div>
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-500">Entity types</span>
            <span className="text-slate-300 font-mono">{domains.filter(d => d.enabled !== false).length}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-500">Relationships</span>
            <span className="text-slate-300 font-mono">{relationships.filter(r => r.enabled !== false && !r.is_structural).length}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-500">Total assets</span>
            <span className="text-slate-300 font-mono">{stats.totals?.assets || 0}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-500">Active edges</span>
            <span className="text-slate-300 font-mono">{stats.totals?.relationships || 0}</span>
          </div>
        </div>
      </div>

      {/* CENTER — Schema Canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/30">
          <div>
            <h1 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Network size={16} className="text-slate-500"/>Ontology Schema
            </h1>
            <p className="text-[10px] text-slate-500">Define entity types and the relationships allowed between them</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={loadViolations} disabled={loadingViolations}
              className="text-[10px] px-2 py-1.5 rounded bg-slate-800/70 hover:bg-slate-800 border border-slate-700 text-slate-300 flex items-center gap-1 transition-colors disabled:opacity-50">
              <ShieldCheck size={11}/>{loadingViolations ? 'Validating...' : 'Validate Schema'}
              {violations && violations.summary?.total > 0 && (
                <span className="ml-1 px-1.5 py-0 rounded-full bg-amber-900/60 text-amber-300 text-[9px] font-mono">
                  {violations.summary.total}
                </span>
              )}
            </button>
            <button onClick={exportOWL} className="text-[10px] px-2 py-1.5 rounded bg-slate-800/70 hover:bg-slate-800 border border-slate-700 text-slate-300 flex items-center gap-1 transition-colors">
              <Download size={11}/>Export JSON-LD
            </button>
            <button onClick={() => setShowTemplates(!showTemplates)}
              className="text-[10px] flex items-center gap-1 px-2.5 py-1.5 rounded bg-slate-700/60 hover:bg-slate-700 border border-slate-600 text-slate-200 font-medium transition-colors">
              <Sparkles size={11}/>Industry Templates
            </button>
          </div>
        </div>

        {/* Template Picker */}
        {showTemplates && (
          <div className="p-3 border-b border-slate-800 bg-slate-900/40 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-300">Apply Industry Template</div>
              <button onClick={() => setShowTemplates(false)} className="text-slate-500 hover:text-slate-300"><X size={12}/></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {templates.map(t => (
                <button key={t.key} onClick={() => applyTemplate(t.key)} disabled={!!applyingTemplate}
                  className={`p-3 rounded-lg border text-left transition-colors hover:border-slate-600 hover:bg-slate-800/60 ${applyingTemplate === t.key ? 'border-slate-500 bg-slate-800/80' : 'border-slate-800'}`}>
                  <div className="text-[11px] font-semibold text-slate-100 mb-0.5">{t.name}</div>
                  <div className="text-[9.5px] text-slate-500 mb-2 leading-snug line-clamp-2">{t.description}</div>
                  {t.standards && t.standards.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {t.standards.slice(0, 4).map(s => (
                        <span key={s} className="text-[8.5px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">{s}</span>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-4 gap-1 text-[9px] text-slate-600 pt-1.5 border-t border-slate-800">
                    <div className="text-center"><div className="text-slate-300 font-mono">{t.domains}</div><div>types</div></div>
                    <div className="text-center"><div className="text-slate-300 font-mono">{t.relationships}</div><div>rels</div></div>
                    <div className="text-center"><div className="text-slate-300 font-mono">{t.properties || 0}</div><div>props</div></div>
                    <div className="text-center"><div className="text-slate-300 font-mono">{t.glossary}</div><div>terms</div></div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Violations Panel — supports inline (collapsed) and expanded (overlay) modes */}
        {showViolations && violations && (() => {
          const filtered = violations.violations.filter(v => {
            if (violationSeverity !== 'all' && v.severity !== violationSeverity) return false;
            if (violationDomain !== 'all' && v.entity_type !== violationDomain) return false;
            if (violationSearch) {
              const q = violationSearch.toLowerCase();
              if (!(v.message?.toLowerCase().includes(q) || v.asset_name?.toLowerCase().includes(q) || v.kind?.toLowerCase().includes(q))) return false;
            }
            return true;
          });
          const groupedByDomain = filtered.reduce((acc, v) => {
            const k = v.entity_type || v.relationship || 'other';
            (acc[k] = acc[k] || []).push(v);
            return acc;
          }, {});
          const domainsInViolations = [...new Set(violations.violations.map(v => v.entity_type).filter(Boolean))];

          const containerClass = violationsExpanded
            ? 'absolute inset-0 z-30 bg-slate-950/95 backdrop-blur flex flex-col'
            : 'border-b border-slate-800 bg-slate-900/40 flex flex-col';
          const listMaxHeight = violationsExpanded ? '' : 'max-h-[420px]';

          return (
            <div className={containerClass}>
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-900/80 backdrop-blur flex-shrink-0">
                <div className="flex items-center gap-2 text-xs">
                  <ShieldCheck size={12} className="text-slate-400"/>
                  <span className="text-slate-200 font-semibold">Schema Validation</span>
                  <span className="text-[10px] text-slate-500">
                    {violations.summary.total === 0
                      ? 'No violations — ontology is consistent'
                      : <>showing <span className="text-slate-300 font-mono">{filtered.length}</span> of <span className="text-slate-300 font-mono">{violations.summary.total}</span> · <span className="text-red-400">{violations.summary.errors} errors</span> · <span className="text-amber-400">{violations.summary.warnings} warnings</span></>}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setViolationsExpanded(!violationsExpanded)}
                    className="text-[10px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300">
                    {violationsExpanded ? 'Collapse' : 'Expand'}
                  </button>
                  <button onClick={() => setShowViolations(false)} className="text-slate-500 hover:text-slate-300"><X size={12}/></button>
                </div>
              </div>

              {violations.violations.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800 bg-slate-900/60 flex-shrink-0">
                  <div className="relative flex-1 max-w-xs">
                    <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-600"/>
                    <input className="input w-full pl-6 text-[10px] py-1"
                      placeholder="Search violations..." value={violationSearch}
                      onChange={e => setViolationSearch(e.target.value)}/>
                  </div>
                  <select className="input text-[10px] py-1" value={violationSeverity}
                    onChange={e => setViolationSeverity(e.target.value)}>
                    <option value="all">All severities</option>
                    <option value="error">Errors only</option>
                    <option value="warning">Warnings only</option>
                  </select>
                  <select className="input text-[10px] py-1" value={violationDomain}
                    onChange={e => setViolationDomain(e.target.value)}>
                    <option value="all">All entity types</option>
                    {domainsInViolations.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  {(violationSeverity !== 'all' || violationDomain !== 'all' || violationSearch) && (
                    <button onClick={() => { setViolationSeverity('all'); setViolationDomain('all'); setViolationSearch(''); }}
                      className="text-[10px] text-slate-500 hover:text-slate-300">Clear</button>
                  )}
                </div>
              )}

              <div className={`flex-1 overflow-y-auto ${listMaxHeight}`}>
                {violations.violations.length === 0 ? (
                  <div className="px-3 py-6 text-center text-[11px] text-slate-500 flex flex-col items-center gap-2">
                    <Check size={18} className="text-emerald-500"/>
                    All assets satisfy the active schema constraints.
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="px-3 py-6 text-center text-[11px] text-slate-500">No violations match the current filters.</div>
                ) : (
                  <div>
                    {Object.entries(groupedByDomain).map(([group, items]) => (
                      <div key={group}>
                        <div className="px-3 py-1 bg-slate-900/80 border-b border-slate-800 sticky top-0 flex items-center gap-2 text-[10px]">
                          <span className="text-slate-300 font-semibold">
                            {domains.find(d => d.domain_code === group)?.label || group}
                          </span>
                          <span className="text-slate-600 font-mono">({items.length})</span>
                          {domains.find(d => d.domain_code === group) && (
                            <Link to={`/knowledge-graph?domain=${group}`}
                              className="ml-auto text-slate-500 hover:text-slate-200 flex items-center gap-0.5"
                              title="Open in Knowledge Graph">
                              <ExternalLink size={9}/>graph
                            </Link>
                          )}
                        </div>
                        <div className="divide-y divide-slate-800/60">
                          {items.map((v, i) => (
                            <div key={i} className="px-3 py-1.5 flex items-start gap-2 hover:bg-slate-800/40">
                              {v.severity === 'error'
                                ? <AlertCircle size={11} className="text-red-400 mt-0.5 flex-shrink-0"/>
                                : <AlertTriangle size={11} className="text-amber-400 mt-0.5 flex-shrink-0"/>}
                              <div className="flex-1 min-w-0">
                                <div className="text-[10.5px] text-slate-300 break-words">{v.message}</div>
                                <div className="text-[9px] text-slate-600 font-mono">
                                  {v.kind}
                                  {v.property ? ` · ${v.property}` : ''}
                                  {v.relationship ? ` · ${v.relationship}` : ''}
                                </div>
                              </div>
                              {v.asset_id && (
                                <Link to={`/catalog?asset=${v.asset_id}`}
                                  className="text-slate-600 hover:text-slate-300 flex-shrink-0"
                                  title="Open asset in Catalog">
                                  <ExternalLink size={10}/>
                                </Link>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* Canvas */}
        <div className="flex-1 overflow-hidden relative" style={{ background: '#0b121f' }}>
          {canvasNodes.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Network size={48} className="mx-auto text-slate-700 mb-3"/>
                <div className="text-sm text-slate-400 mb-1">No entity types defined</div>
                <div className="text-[10px] text-slate-600 mb-4">Add entity types or apply an industry template to get started</div>
                <button onClick={() => setShowTemplates(true)} className="btn-primary text-xs"><Sparkles size={11}/>Browse Templates</button>
              </div>
            </div>
          ) : (
            <svg width="100%" height="100%" viewBox="0 0 800 560" preserveAspectRatio="xMidYMid meet">
              <defs>
                <pattern id="schema-grid" width="48" height="48" patternUnits="userSpaceOnUse">
                  <rect width="48" height="48" fill="#0b121f"/>
                  <circle cx="0" cy="0" r="0.8" fill="#1e293b"/>
                  <circle cx="48" cy="0" r="0.8" fill="#1e293b"/>
                  <circle cx="0" cy="48" r="0.8" fill="#1e293b"/>
                  <circle cx="48" cy="48" r="0.8" fill="#1e293b"/>
                </pattern>
                <marker id="schema-arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#64748b"/>
                </marker>
              </defs>
              <rect width="100%" height="100%" fill="url(#schema-grid)"/>

              {/* Edges */}
              {canvasEdges.map((e, i) => {
                const s = canvasNodes.find(n => n.domain_code === e.source);
                const t = canvasNodes.find(n => n.domain_code === e.target);
                if (!s || !t || s.domain_code === t.domain_code) return null;
                const rel = relationships.find(r => r.relationship_code === e.relationship);
                const color = rel?.color || '#64748b';
                const isHighlighted = selected?.type === 'relationship' && selected.code === e.relationship;
                const dimmed = selected?.type === 'relationship' && !isHighlighted;
                const selectedDomainHighlight = selected?.type === 'domain' && (e.source === selected.code || e.target === selected.code);

                // Curved path with offset for parallel edges
                const dx = t.x - s.x, dy = t.y - s.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const offset = 25 + (i % 3) * 15;
                const mx = (s.x + t.x) / 2 + (-dy / dist) * offset;
                const my = (s.y + t.y) / 2 + (dx / dist) * offset;
                let labelAngle = Math.atan2(t.y - s.y, t.x - s.x) * 180 / Math.PI;
                if (labelAngle > 90) labelAngle -= 180;
                if (labelAngle < -90) labelAngle += 180;

                return (
                  <g key={i} onClick={() => setSelected({ type: 'relationship', code: e.relationship })}
                    className="cursor-pointer"
                    opacity={dimmed ? 0.15 : (selectedDomainHighlight || isHighlighted ? 1 : 0.6)}>
                    <path d={`M${s.x},${s.y} Q${mx},${my} ${t.x},${t.y}`} fill="none"
                      stroke={color} strokeWidth={isHighlighted ? 2.5 : 1.5} markerEnd="url(#schema-arrow)"/>
                    <text x={mx} y={my - 6} fill={color} fontSize="9" fontWeight="600" textAnchor="middle"
                      transform={`rotate(${labelAngle}, ${mx}, ${my - 6})`}>
                      {rel?.abbreviation || e.relationship?.substring(0, 3)}
                    </text>
                    <text x={mx} y={my + 6} fill="#64748b" fontSize="7" textAnchor="middle"
                      transform={`rotate(${labelAngle}, ${mx}, ${my + 6})`}>
                      ({e.count})
                    </text>
                  </g>
                );
              })}

              {/* Nodes — entity type boxes */}
              {canvasNodes.map(n => {
                const isSelected = selected?.type === 'domain' && selected.code === n.domain_code;
                const isRelHighlighted = selected?.type === 'relationship' &&
                  canvasEdges.some(e => e.relationship === selected.code && (e.source === n.domain_code || e.target === n.domain_code));
                const dimmed = (selected?.type === 'relationship' && !isRelHighlighted);
                const color = n.color || '#64748b';

                return (
                  <g key={n.domain_code} onClick={() => setSelected({ type: 'domain', code: n.domain_code })}
                    className="cursor-pointer" opacity={dimmed ? 0.25 : 1}>
                    {/* Selection glow */}
                    {isSelected && (
                      <rect x={n.x - 52} y={n.y - 28} width={104} height={56} rx={10}
                        fill="none" stroke={color} strokeWidth={2} opacity={0.4} strokeDasharray="4 2"/>
                    )}
                    {/* Main box */}
                    <rect x={n.x - 48} y={n.y - 24} width={96} height={48} rx={6}
                      fill="#0f172a" stroke={isSelected ? color : color + '99'} strokeWidth={isSelected ? 1.75 : 1}/>
                    {/* Initials circle */}
                    <circle cx={n.x - 32} cy={n.y} r={11} fill={color + '22'} stroke={color + '88'} strokeWidth={1}/>
                    <text x={n.x - 32} y={n.y + 4} textAnchor="middle" fill={color} fontSize="11" fontWeight="600">
                      {n.initials || '?'}
                    </text>
                    {/* Label */}
                    <text x={n.x - 14} y={n.y - 2} fill="#e2e8f0" fontSize="10" fontWeight="600">
                      {n.label?.length > 14 ? n.label.substring(0, 12) + '..' : n.label}
                    </text>
                    {/* Asset count badge */}
                    <text x={n.x - 14} y={n.y + 12} fill="#94a3b8" fontSize="8.5">
                      {n.assetCount} {n.assetCount === 1 ? 'asset' : 'assets'}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* Relationships list strip at bottom */}
        {relationships.filter(r => !r.is_structural).length > 0 && (
          <div className="border-t border-slate-800 bg-slate-900/30 p-2 flex-shrink-0">
            <div className="flex items-center gap-2 mb-1.5">
              <GitBranch size={11} className="text-slate-500"/>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Relationship Types</span>
              <span className="text-[9px] text-slate-700">click to highlight on canvas</span>
              <button onClick={() => { setCreating('relationship'); setSelected(null); }}
                className="ml-auto text-[9px] text-slate-400 hover:text-slate-200 flex items-center gap-0.5">
                <Plus size={9}/>Add
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {relationships.filter(r => r.enabled !== false && !r.is_structural).map(r => {
                const isSelected = selected?.type === 'relationship' && selected.code === r.relationship_code;
                const usage = getRelCount(r.relationship_code);
                return (
                  <button key={r.id} onClick={() => setSelected({ type: 'relationship', code: r.relationship_code })}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] border transition-colors ${
                      isSelected ? 'bg-slate-800/80 border-slate-500 text-slate-100' :
                      'border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}>
                    <div className="w-3 h-0.5 rounded" style={{ background: r.color }}/>
                    <span>{r.label}</span>
                    <span className="text-[9px] font-mono text-slate-600">({usage})</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* RIGHT PANE — Inspector */}
      <div className="w-80 flex-shrink-0 border-l border-slate-800 bg-slate-900/50 overflow-y-auto">
        {/* Creating new */}
        {creating && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">New {creating === 'domain' ? 'Entity Type' : 'Relationship Type'}</h3>
              <button onClick={() => setCreating(null)} className="text-slate-500 hover:text-slate-300"><X size={14}/></button>
            </div>
            <div>
              <label className="label">Label *</label>
              <input className="input w-full text-xs" autoFocus
                placeholder={creating === 'domain' ? 'e.g. Clinical Data' : 'e.g. Validates'}
                value={newItem.label} onChange={e => setNewItem({ ...newItem, label: e.target.value })}/>
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input w-full text-xs" rows={2}
                placeholder="What does this represent?"
                value={newItem.description} onChange={e => setNewItem({ ...newItem, description: e.target.value })}/>
            </div>
            {creating === 'domain' ? (
              <div>
                <label className="label">Initials (1-2 chars)</label>
                <input className="input w-full text-xs text-center" maxLength={2}
                  value={newItem.initials} onChange={e => setNewItem({ ...newItem, initials: e.target.value })}/>
              </div>
            ) : (
              <div>
                <label className="label">Abbreviation (3 chars)</label>
                <input className="input w-full text-xs text-center uppercase" maxLength={3}
                  value={newItem.abbreviation} onChange={e => setNewItem({ ...newItem, abbreviation: e.target.value })}/>
              </div>
            )}
            <div>
              <label className="label">Color</label>
              <div className="grid grid-cols-12 gap-1 mt-1">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setNewItem({ ...newItem, color: c })}
                    className={`aspect-square rounded border-2 transition-all ${newItem.color === c ? 'border-slate-300 scale-105' : 'border-transparent hover:scale-105'}`}
                    style={{ background: c }}/>
                ))}
              </div>
              <input type="text" className="input w-full text-xs mt-2 font-mono" placeholder="#hex"
                value={newItem.color} onChange={e => setNewItem({ ...newItem, color: e.target.value })}/>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={createNew} disabled={!newItem.label} className="btn-primary text-xs flex-1">
                <Save size={11}/>Create
              </button>
              <button onClick={() => setCreating(null)} className="btn-secondary text-xs">Cancel</button>
            </div>
          </div>
        )}

        {/* Entity Type Selected */}
        {!creating && selectedDomain && (
          <div className="p-4 space-y-4">
            {/* Header */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-11 h-11 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ background: selectedDomain.color + '18', border: `1px solid ${selectedDomain.color}88` }}>
                  <span style={{ color: selectedDomain.color }} className="text-base font-semibold">{selectedDomain.initials}</span>
                </div>
                <div className="flex-1 min-w-0">
                  {editingField?.id === selectedDomain.id && editingField?.field === 'label' ? (
                    <input className="input w-full text-sm" autoFocus
                      value={editValue} onChange={e => setEditValue(e.target.value)}
                      onBlur={() => saveInline(selectedDomain, 'label', editValue, false)}
                      onKeyDown={e => { if (e.key === 'Enter') saveInline(selectedDomain, 'label', editValue, false); if (e.key === 'Escape') setEditingField(null); }}/>
                  ) : (
                    <div className="text-sm font-bold text-white truncate cursor-pointer hover:text-slate-200"
                      onClick={() => { setEditingField({ id: selectedDomain.id, field: 'label' }); setEditValue(selectedDomain.label); }}>
                      {selectedDomain.label} <Pencil size={9} className="inline ml-1 opacity-30"/>
                    </div>
                  )}
                  <div className="text-[10px] text-slate-500 font-mono">{selectedDomain.domain_code}</div>
                </div>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 font-mono">Entity Type</span>
            </div>

            {/* Description */}
            <div>
              <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1">Description</div>
              {editingField?.id === selectedDomain.id && editingField?.field === 'description' ? (
                <textarea className="input w-full text-xs" rows={3} autoFocus
                  value={editValue} onChange={e => setEditValue(e.target.value)}
                  onBlur={() => saveInline(selectedDomain, 'description', editValue, false)}/>
              ) : (
                <div className="text-[11px] text-slate-400 leading-relaxed cursor-pointer hover:text-slate-300 p-2 rounded hover:bg-slate-800/40"
                  onClick={() => { setEditingField({ id: selectedDomain.id, field: 'description' }); setEditValue(selectedDomain.description || ''); }}>
                  {selectedDomain.description || <span className="italic text-slate-600">Click to add description...</span>}
                </div>
              )}
            </div>

            {/* Usage stats */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded-lg border border-slate-800 bg-slate-900/50 text-center">
                <div className="text-xl font-semibold text-slate-200">{getAssetCount(selectedDomain.domain_code)}</div>
                <div className="text-[9px] text-slate-600 mt-0.5">Assets</div>
              </div>
              <div className="p-2 rounded-lg border border-slate-800 bg-slate-900/50 text-center">
                <div className="text-xl font-semibold text-slate-200">{relationshipsForDomain(selectedDomain.domain_code).length}</div>
                <div className="text-[9px] text-slate-600 mt-0.5">Relationships</div>
              </div>
            </div>

            {/* Parent class (hierarchy) */}
            <div>
              <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1">Parent Class</div>
              <select className="input w-full text-xs"
                value={selectedDomain.parent_code || ''}
                onChange={e => saveInline(selectedDomain, 'parent_code', e.target.value || null, false)}>
                <option value="">— none —</option>
                {domains.filter(d => d.domain_code !== selectedDomain.domain_code).map(d => (
                  <option key={d.id} value={d.domain_code}>{d.label} ({d.domain_code})</option>
                ))}
              </select>
            </div>

            {/* Properties (schema attributes) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[9px] text-slate-600 uppercase tracking-wider flex items-center gap-1">
                  <ListChecks size={10}/>Properties <span className="text-slate-500">({properties.length})</span>
                </div>
                <button onClick={() => setAddingProp(true)} className="text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-0.5">
                  <Plus size={10}/>Add
                </button>
              </div>

              {properties.length === 0 && !addingProp && (
                <div className="text-[10px] text-slate-600 italic p-2 rounded border border-dashed border-slate-800">
                  No properties defined. Click <span className="text-slate-400">+ Add</span> to define attributes for this entity type.
                </div>
              )}

              <div className="space-y-1">
                {properties.map(p => (
                  <div key={p.id} className="p-2 rounded border border-slate-800 bg-slate-900/40">
                    {editingProp === p.id ? (
                      <div className="space-y-1.5">
                        <input className="input w-full text-[10.5px]" value={p.property_label}
                          onChange={e => setProperties(properties.map(x => x.id === p.id ? { ...x, property_label: e.target.value } : x))}
                          placeholder="Label"/>
                        <div className="grid grid-cols-2 gap-1">
                          <select className="input text-[10.5px]" value={p.data_type}
                            onChange={e => setProperties(properties.map(x => x.id === p.id ? { ...x, data_type: e.target.value } : x))}>
                            <option value="text">text</option>
                            <option value="number">number</option>
                            <option value="date">date</option>
                            <option value="boolean">boolean</option>
                            <option value="enum">enum</option>
                            <option value="reference">reference</option>
                            <option value="url">url</option>
                          </select>
                          <label className="flex items-center gap-1 text-[10px] text-slate-400">
                            <input type="checkbox" checked={p.is_required}
                              onChange={e => setProperties(properties.map(x => x.id === p.id ? { ...x, is_required: e.target.checked } : x))}/>
                            required
                          </label>
                        </div>
                        {p.data_type === 'enum' && (
                          <input className="input w-full text-[10px] font-mono" placeholder="comma,separated,values"
                            value={(p.enum_values || []).join(',')}
                            onChange={e => setProperties(properties.map(x => x.id === p.id ? { ...x, enum_values: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } : x))}/>
                        )}
                        <div className="flex gap-1">
                          <button onClick={() => { updateProperty(p.id, { property_label: p.property_label, data_type: p.data_type, is_required: p.is_required, enum_values: p.enum_values }); setEditingProp(null); }}
                            className="text-[10px] px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-100 flex items-center gap-1"><Save size={9}/>Save</button>
                          <button onClick={() => setEditingProp(null)} className="text-[10px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300">Cancel</button>
                          <button onClick={() => { setEditingProp(null); deleteProperty(p.id); }} className="text-[10px] px-2 py-1 rounded bg-red-900/30 hover:bg-red-900/50 text-red-400 ml-auto"><Trash2 size={9}/></button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setEditingProp(p.id)}>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] text-slate-200 font-medium flex items-center gap-1.5">
                            {p.property_label}
                            {p.is_required && <span className="text-[8px] px-1 rounded bg-amber-900/40 text-amber-300 font-mono">REQ</span>}
                            {p.is_unique && <span className="text-[8px] px-1 rounded bg-slate-700 text-slate-300 font-mono">UNQ</span>}
                          </div>
                          <div className="text-[9px] text-slate-500 font-mono">
                            {p.property_name} · {p.data_type}
                            {p.data_type === 'enum' && p.enum_values?.length ? ` [${p.enum_values.length}]` : ''}
                          </div>
                        </div>
                        <Pencil size={9} className="text-slate-600"/>
                      </div>
                    )}
                  </div>
                ))}

                {addingProp && (
                  <div className="p-2 rounded border border-slate-700 bg-slate-900/60 space-y-1.5">
                    <input className="input w-full text-[10.5px]" placeholder="Property label (e.g. Author)" autoFocus
                      value={newProp.property_label}
                      onChange={e => setNewProp({ ...newProp, property_label: e.target.value })}/>
                    <div className="grid grid-cols-2 gap-1">
                      <select className="input text-[10.5px]"
                        value={newProp.data_type}
                        onChange={e => setNewProp({ ...newProp, data_type: e.target.value })}>
                        <option value="text">text</option>
                        <option value="number">number</option>
                        <option value="date">date</option>
                        <option value="boolean">boolean</option>
                        <option value="enum">enum</option>
                        <option value="reference">reference</option>
                        <option value="url">url</option>
                      </select>
                      <label className="flex items-center gap-1 text-[10px] text-slate-400">
                        <input type="checkbox" checked={newProp.is_required}
                          onChange={e => setNewProp({ ...newProp, is_required: e.target.checked })}/>
                        required
                      </label>
                    </div>
                    {newProp.data_type === 'enum' && (
                      <input className="input w-full text-[10px] font-mono" placeholder="comma,separated,values"
                        value={newProp.enum_values}
                        onChange={e => setNewProp({ ...newProp, enum_values: e.target.value })}/>
                    )}
                    <div className="flex gap-1">
                      <button onClick={createProperty} disabled={!newProp.property_label}
                        className="text-[10px] px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-100 flex items-center gap-1 disabled:opacity-40">
                        <Save size={9}/>Add Property
                      </button>
                      <button onClick={() => { setAddingProp(false); setNewProp({ property_name: '', property_label: '', data_type: 'text', is_required: false, is_unique: false, enum_values: '', description: '' }); }}
                        className="text-[10px] px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Color */}
            <div>
              <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1.5">Color</div>
              <div className="grid grid-cols-12 gap-1">
                {COLORS.map(c => (
                  <button key={c}
                    onClick={() => saveInline(selectedDomain, 'color', c, false)}
                    className={`aspect-square rounded transition-all ${selectedDomain.color === c ? 'ring-2 ring-slate-300 scale-105' : 'hover:scale-105'}`}
                    style={{ background: c }}/>
                ))}
              </div>
            </div>

            {/* Connected relationships */}
            <div>
              <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1.5">Used in Relationships</div>
              {relationshipsForDomain(selectedDomain.domain_code).length === 0 ? (
                <div className="text-[10px] text-slate-600 italic p-2">No relationships involve this entity type yet</div>
              ) : (
                <div className="space-y-1">
                  {relationshipsForDomain(selectedDomain.domain_code).map((e, i) => {
                    const rel = relationships.find(r => r.relationship_code === e.relationship);
                    const isOutgoing = e.source === selectedDomain.domain_code;
                    const other = isOutgoing ? e.target : e.source;
                    const otherDomain = domains.find(d => d.domain_code === other);
                    return (
                      <button key={i} onClick={() => setSelected({ type: 'relationship', code: e.relationship })}
                        className="w-full text-left p-1.5 rounded text-[10px] hover:bg-slate-800/50 transition-colors flex items-center gap-1.5">
                        <div className="w-3 h-0.5 rounded flex-shrink-0" style={{ background: rel?.color || '#64748b' }}/>
                        <span className="text-slate-300">{rel?.label || e.relationship}</span>
                        <span className="text-slate-600">{isOutgoing ? '→' : '←'}</span>
                        <span className="text-slate-400 truncate">{otherDomain?.label || other}</span>
                        <span className="text-slate-700 ml-auto">{e.count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="pt-2 border-t border-slate-800 space-y-1.5">
              <Link to={`/knowledge-graph?domain=${selectedDomain.domain_code}`}
                className="w-full text-[10px] py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center justify-center gap-1">
                <Network size={11}/>View {getAssetCount(selectedDomain.domain_code)} asset{getAssetCount(selectedDomain.domain_code) === 1 ? '' : 's'} in Knowledge Graph
              </Link>
              <Link to={`/catalog?domain=${selectedDomain.domain_code}`}
                className="w-full text-[10px] py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center justify-center gap-1">
                <Database size={11}/>Browse in Catalog
              </Link>
              <button onClick={() => toggleEnabled(selectedDomain, false)}
                className="w-full text-[10px] py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">
                {selectedDomain.enabled === false ? 'Enable' : 'Disable'}
              </button>
              <button onClick={() => deleteItem(selectedDomain, false)}
                className="w-full text-[10px] py-2 rounded bg-red-900/30 hover:bg-red-900/50 text-red-400 transition-colors flex items-center justify-center gap-1">
                <Trash2 size={11}/>Delete
              </button>
            </div>
          </div>
        )}

        {/* Relationship Selected */}
        {!creating && selectedRel && (
          <div className="p-4 space-y-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-6 rounded flex items-center justify-center flex-shrink-0" style={{ background: selectedRel.color }}>
                  <span className="text-[9px] font-bold text-white">{selectedRel.abbreviation}</span>
                </div>
                <div className="flex-1 min-w-0">
                  {editingField?.id === selectedRel.id && editingField?.field === 'label' ? (
                    <input className="input w-full text-sm" autoFocus
                      value={editValue} onChange={e => setEditValue(e.target.value)}
                      onBlur={() => saveInline(selectedRel, 'label', editValue, true)}
                      onKeyDown={e => { if (e.key === 'Enter') saveInline(selectedRel, 'label', editValue, true); if (e.key === 'Escape') setEditingField(null); }}/>
                  ) : (
                    <div className="text-sm font-bold text-white cursor-pointer hover:text-slate-200"
                      onClick={() => { setEditingField({ id: selectedRel.id, field: 'label' }); setEditValue(selectedRel.label); }}>
                      {selectedRel.label} <Pencil size={9} className="inline ml-1 opacity-30"/>
                    </div>
                  )}
                  <div className="text-[10px] text-slate-500 font-mono">{selectedRel.relationship_code}</div>
                </div>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 font-mono">Relationship Type</span>
            </div>

            {/* Description */}
            <div>
              <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1">Description</div>
              {editingField?.id === selectedRel.id && editingField?.field === 'description' ? (
                <textarea className="input w-full text-xs" rows={3} autoFocus
                  value={editValue} onChange={e => setEditValue(e.target.value)}
                  onBlur={() => saveInline(selectedRel, 'description', editValue, true)}/>
              ) : (
                <div className="text-[11px] text-slate-400 leading-relaxed cursor-pointer hover:text-slate-300 p-2 rounded hover:bg-slate-800/40"
                  onClick={() => { setEditingField({ id: selectedRel.id, field: 'description' }); setEditValue(selectedRel.description || ''); }}>
                  {selectedRel.description || <span className="italic text-slate-600">Click to add description...</span>}
                </div>
              )}
            </div>

            {/* Usage */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded-lg border border-slate-800 bg-slate-900/50 text-center">
                <div className="text-xl font-semibold text-slate-200">{getRelCount(selectedRel.relationship_code)}</div>
                <div className="text-[9px] text-slate-600 mt-0.5">Active edges</div>
              </div>
              <div className="p-2 rounded-lg border border-slate-800 bg-slate-900/50 text-center">
                <div className="text-xl font-semibold text-slate-200">{canvasEdges.filter(e => e.relationship === selectedRel.relationship_code).length}</div>
                <div className="text-[9px] text-slate-600 mt-0.5">Entity pairs</div>
              </div>
            </div>

            {/* Domain / Range / Cardinality */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1">Source (Domain)</div>
                <select className="input w-full text-[10.5px]"
                  value={selectedRel.source_domain || ''}
                  onChange={e => saveInline(selectedRel, 'source_domain', e.target.value || null, true)}>
                  <option value="">— any —</option>
                  {domains.map(d => <option key={d.id} value={d.domain_code}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1">Target (Range)</div>
                <select className="input w-full text-[10.5px]"
                  value={selectedRel.target_domain || ''}
                  onChange={e => saveInline(selectedRel, 'target_domain', e.target.value || null, true)}>
                  <option value="">— any —</option>
                  {domains.map(d => <option key={d.id} value={d.domain_code}>{d.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1">Cardinality</div>
                <select className="input w-full text-[10.5px]"
                  value={selectedRel.cardinality || 'N:M'}
                  onChange={e => saveInline(selectedRel, 'cardinality', e.target.value, true)}>
                  <option value="1:1">1:1 — one-to-one</option>
                  <option value="1:N">1:N — one-to-many</option>
                  <option value="N:1">N:1 — many-to-one</option>
                  <option value="N:M">N:M — many-to-many</option>
                </select>
              </div>
              <div>
                <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1">Inverse</div>
                <select className="input w-full text-[10.5px]"
                  value={selectedRel.inverse_code || ''}
                  onChange={e => saveInline(selectedRel, 'inverse_code', e.target.value || null, true)}>
                  <option value="">— none —</option>
                  {relationships.filter(r => r.relationship_code !== selectedRel.relationship_code && !r.is_structural).map(r => (
                    <option key={r.id} value={r.relationship_code}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Connected entity pairs */}
            <div>
              <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1.5">Entity Type Pairs</div>
              {canvasEdges.filter(e => e.relationship === selectedRel.relationship_code).length === 0 ? (
                <div className="text-[10px] text-slate-600 italic p-2">Not used in any relationships yet</div>
              ) : (
                <div className="space-y-1">
                  {canvasEdges.filter(e => e.relationship === selectedRel.relationship_code).map((e, i) => {
                    const sourceDomain = domains.find(d => d.domain_code === e.source);
                    const targetDomain = domains.find(d => d.domain_code === e.target);
                    return (
                      <div key={i} className="flex items-center gap-1.5 p-1.5 rounded text-[10px] bg-slate-900/50">
                        <span className="px-1.5 py-0.5 rounded font-mono text-[9px]"
                          style={{ background: (sourceDomain?.color || '#64748b') + '20', color: sourceDomain?.color }}>
                          {sourceDomain?.label || e.source}
                        </span>
                        <span className="text-slate-600">→</span>
                        <span className="px-1.5 py-0.5 rounded font-mono text-[9px]"
                          style={{ background: (targetDomain?.color || '#64748b') + '20', color: targetDomain?.color }}>
                          {targetDomain?.label || e.target}
                        </span>
                        <span className="text-slate-500 font-mono ml-auto">{e.count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Color */}
            <div>
              <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1.5">Color</div>
              <div className="grid grid-cols-12 gap-1">
                {COLORS.map(c => (
                  <button key={c}
                    onClick={() => saveInline(selectedRel, 'color', c, true)}
                    className={`aspect-square rounded transition-all ${selectedRel.color === c ? 'ring-2 ring-slate-300 scale-105' : 'hover:scale-105'}`}
                    style={{ background: c }}/>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 space-y-1.5">
              <Link to={`/knowledge-graph?relationship=${selectedRel.relationship_code}`}
                className="w-full text-[10px] py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center justify-center gap-1">
                <GitBranch size={11}/>View {getRelCount(selectedRel.relationship_code)} edge{getRelCount(selectedRel.relationship_code) === 1 ? '' : 's'} in Knowledge Graph
              </Link>
              <button onClick={() => toggleEnabled(selectedRel, true)}
                className="w-full text-[10px] py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">
                {selectedRel.enabled === false ? 'Enable' : 'Disable'}
              </button>
              <button onClick={() => deleteItem(selectedRel, true)}
                className="w-full text-[10px] py-2 rounded bg-red-900/30 hover:bg-red-900/50 text-red-400 transition-colors flex items-center justify-center gap-1">
                <Trash2 size={11}/>Delete
              </button>
            </div>
          </div>
        )}

        {/* Nothing selected — Ontology overview */}
        {!creating && !selected && (
          <div className="p-4 space-y-4">
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-slate-800/60 border border-slate-700 flex items-center justify-center mx-auto mb-2">
                <Activity size={20} className="text-slate-400"/>
              </div>
              <div className="text-sm font-semibold text-slate-200">Ontology Overview</div>
              <div className="text-[10px] text-slate-500 mt-1">Click any entity type or relationship to inspect</div>
            </div>

            {/* Ontology ↔ Knowledge Graph explainer */}
            <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/50 text-[10.5px] text-slate-400 leading-relaxed">
              <div className="flex items-center gap-1.5 text-slate-300 font-semibold mb-1">
                <Info size={11}/>Ontology vs Knowledge Graph
              </div>
              <p className="mb-1.5">
                The <span className="text-slate-200">Ontology</span> defines the <span className="italic">schema</span> — what entity
                types exist, what properties they must have, and which relationships are allowed between them.
              </p>
              <p className="mb-1.5">
                The <span className="text-slate-200">Knowledge Graph</span> applies that schema to your
                actual assets — every node and edge in the graph conforms to one of the entity / relationship
                types defined here.
              </p>
              <p className="text-slate-500 italic">Change a type here → the graph automatically reclassifies. Disable a type → its edges are filtered out.</p>
              <Link to="/knowledge-graph"
                className="mt-2 inline-flex items-center gap-1 text-[10px] text-slate-300 hover:text-slate-100">
                <ExternalLink size={10}/>Open Knowledge Graph
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/50 text-center">
                <div className="text-2xl font-semibold text-slate-200">{domains.filter(d => d.enabled !== false).length}</div>
                <div className="text-[9px] text-slate-600 mt-0.5">Entity Types</div>
              </div>
              <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/50 text-center">
                <div className="text-2xl font-semibold text-slate-200">{relationships.filter(r => r.enabled !== false && !r.is_structural).length}</div>
                <div className="text-[9px] text-slate-600 mt-0.5">Relationship Types</div>
              </div>
              <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/50 text-center">
                <div className="text-2xl font-semibold text-slate-200">{stats.totals?.assets || 0}</div>
                <div className="text-[9px] text-slate-600 mt-0.5">Classified Assets</div>
              </div>
              <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/50 text-center">
                <div className="text-2xl font-semibold text-slate-200">{stats.totals?.relationships || 0}</div>
                <div className="text-[9px] text-slate-600 mt-0.5">Active Edges</div>
              </div>
            </div>

            {/* Top entity types by usage */}
            <div>
              <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1.5">Top Entity Types</div>
              <div className="space-y-1">
                {domains.filter(d => d.enabled !== false)
                  .map(d => ({ ...d, count: getAssetCount(d.domain_code) }))
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 5)
                  .map(d => (
                    <button key={d.id} onClick={() => setSelected({ type: 'domain', code: d.domain_code })}
                      className="w-full flex items-center gap-2 p-1.5 rounded text-[10px] hover:bg-slate-800/50 transition-colors">
                      <div className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                        style={{ background: d.color + '20', color: d.color }}>
                        {d.initials}
                      </div>
                      <span className="text-slate-300 truncate flex-1 text-left">{d.label}</span>
                      <span className="text-slate-500 font-mono">{d.count}</span>
                    </button>
                  ))}
              </div>
            </div>

            {/* Top relationships by usage */}
            <div>
              <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1.5">Top Relationship Types</div>
              <div className="space-y-1">
                {relationships.filter(r => r.enabled !== false && !r.is_structural)
                  .map(r => ({ ...r, count: getRelCount(r.relationship_code) }))
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 5)
                  .map(r => (
                    <button key={r.id} onClick={() => setSelected({ type: 'relationship', code: r.relationship_code })}
                      className="w-full flex items-center gap-2 p-1.5 rounded text-[10px] hover:bg-slate-800/50 transition-colors">
                      <div className="w-4 h-0.5 rounded flex-shrink-0" style={{ background: r.color }}/>
                      <span className="text-slate-300 truncate flex-1 text-left">{r.label}</span>
                      <span className="text-slate-500 font-mono">{r.count}</span>
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
