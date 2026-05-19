import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Share2, ZoomIn, ZoomOut, Maximize2, Sparkles, AlertTriangle, Route, Download, Target, Search } from 'lucide-react';
import { Spinner, DomainBadge, ClassBadge, ZoneBadge, ReasoningTrace, ConfBar } from '../components/UI';
import { API, DOMAIN_META, formatDate } from '../utils/helpers';
import { forceDirectedLayout, getNeighborhood } from '../utils/graphLayout';

// Default configs — overridden by ontology schema API at runtime
const DEFAULT_DOMAIN_COLORS = { ELECTRONIC_CIRCUIT:'#8b5cf6', PDF_DOCUMENT:'#ef4444', OFFICE_DOCUMENT:'#3b82f6', AUDIO:'#10b981', VIDEO:'#14b8a6', STRUCTURED_DATA:'#f97316' };
const DEFAULT_DOMAIN_INITIALS = { ELECTRONIC_CIRCUIT:'E', PDF_DOCUMENT:'P', OFFICE_DOCUMENT:'O', AUDIO:'A', VIDEO:'V', STRUCTURED_DATA:'D' };
const DEFAULT_DOMAIN_LABELS = { ELECTRONIC_CIRCUIT:'Circuit', PDF_DOCUMENT:'PDF', OFFICE_DOCUMENT:'Office', AUDIO:'Audio', VIDEO:'Video', STRUCTURED_DATA:'Database' };
const DEFAULT_REL_COLORS = { DOCUMENTS_CIRCUIT:'#8b5cf6', DISCUSSES_DESIGN:'#10b981', PRESENTS_DESIGN:'#3b82f6', REFERENCES_IP:'#f59e0b', DERIVED_FROM:'#ec4899', SHARES_ENTITY:'#6366f1', TAGGED_WITH:'#a855f7' };
const DEFAULT_REL_ABBREV = { DOCUMENTS_CIRCUIT:'DOC', DISCUSSES_DESIGN:'DIS', PRESENTS_DESIGN:'PRS', REFERENCES_IP:'REF', DERIVED_FROM:'DER', SHARES_ENTITY:'SHR', TAGGED_WITH:'TAG' };
const STRUCTURAL = new Set(['SAME_PROJECT', 'BELONGS_TO', 'SAME_ENTITY']);
const R = 26;

export default function Investigation() {
  const [searchParams] = useSearchParams();
  const [graphData, setGraphData] = useState(null);
  const [selected, setSelected] = useState(null);
  // Dynamic ontology configs — loaded from API, fallback to defaults
  const [DOMAIN_COLORS, setDomainColors] = useState(DEFAULT_DOMAIN_COLORS);
  const [DOMAIN_INITIALS, setDomainInitials] = useState(DEFAULT_DOMAIN_INITIALS);
  const [DOMAIN_LABELS, setDomainLabels] = useState(DEFAULT_DOMAIN_LABELS);
  const [REL_COLORS, setRelColors] = useState(DEFAULT_REL_COLORS);
  const [REL_ABBREV, setRelAbbrev] = useState(DEFAULT_REL_ABBREV);
  const [investigating, setInvestigating] = useState(false);
  const [investResult, setInvestResult] = useState(null);
  const [zoom, setZoom] = useState(0.7);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [layoutNodes, setLayoutNodes] = useState([]);
  const [depth, setDepth] = useState(1);
  const [stats, setStats] = useState(null);
  const [topConnected, setTopConnected] = useState([]);
  const [orphaned, setOrphaned] = useState([]);
  const [pathResult, setPathResult] = useState(null);
  const [pathTarget, setPathTarget] = useState('');
  const [findingPath, setFindingPath] = useState(false);
  const [impactResult, setImpactResult] = useState(null);
  const [showCreateRel, setShowCreateRel] = useState(false);
  const [relForm, setRelForm] = useState({ target_id: '', relationship_type: 'REFERENCES_IP', confidence: 0.85 });
  const [creating, setCreating] = useState(false);
  const [leftPanel, setLeftPanel] = useState('stats');
  const [graphSearch, setGraphSearch] = useState('');
  const svgRef = useRef(null);

  // Load ontology schema configs (domains + relationships) from API
  useEffect(() => {
    fetch(`${API}/ontology/domains`).then(r => r.json()).then(d => {
      if (d.domains?.length) {
        const colors = {}, initials = {}, labels = {};
        d.domains.filter(dm => dm.enabled !== false).forEach(dm => {
          colors[dm.domain_code] = dm.color;
          initials[dm.domain_code] = dm.initials;
          labels[dm.domain_code] = dm.label;
        });
        setDomainColors(prev => ({ ...prev, ...colors }));
        setDomainInitials(prev => ({ ...prev, ...initials }));
        setDomainLabels(prev => ({ ...prev, ...labels }));
      }
    }).catch(() => {});
    fetch(`${API}/ontology/relationships`).then(r => r.json()).then(d => {
      if (d.relationships?.length) {
        const colors = {}, abbrevs = {};
        d.relationships.filter(rl => rl.enabled !== false && !rl.is_structural).forEach(rl => {
          colors[rl.relationship_code] = rl.color;
          abbrevs[rl.relationship_code] = rl.abbreviation;
        });
        setRelColors(prev => ({ ...prev, ...colors }));
        setRelAbbrev(prev => ({ ...prev, ...abbrevs }));
      }
    }).catch(() => {});
  }, []);

  const refreshGraph = useCallback(() => {
    fetch(`${API}/relationships`).then(r => r.json()).then(d => {
      // Filter out structural edges before setting state
      if (d.edges) d.edges = d.edges.filter(e => !STRUCTURAL.has(e.relationship));
      setGraphData(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { refreshGraph(); }, [refreshGraph]);

  // Compute stats from loaded graph data
  const computeLocalStats = useCallback(() => {
    if (!graphData?.nodes?.length) return null;
    const nodes = graphData.nodes;
    const edges = graphData.edges || [];
    const relTypes = {};
    const domainDist = {};
    edges.forEach(e => { relTypes[e.relationship] = (relTypes[e.relationship] || 0) + 1; });
    nodes.forEach(n => { if (n.domain) domainDist[n.domain] = (domainDist[n.domain] || 0) + 1; });
    const connectedIds = new Set();
    edges.forEach(e => { connectedIds.add(e.source); connectedIds.add(e.target); });
    const nc = nodes.length, ec = edges.length;
    return {
      available: true, nodeCount: nc, edgeCount: ec,
      density: nc > 1 ? parseFloat(((2 * ec) / (nc * (nc - 1))).toFixed(4)) : 0,
      avgDegree: nc > 0 ? parseFloat(((2 * ec) / nc).toFixed(2)) : 0,
      orphanedNodes: nodes.filter(n => !connectedIds.has(n.id)).length,
      relationshipTypes: relTypes, domainDistribution: domainDist, conceptNodes: 0,
    };
  }, [graphData]);

  useEffect(() => {
    fetch(`${API}/graph/stats`).then(r => r.json()).then(raw => {
      if (!raw?.available) { setStats(computeLocalStats() || { available: true, nodeCount: graphData?.nodes?.length || 0, edgeCount: 0 }); return; }
      const f = { ...raw };
      if (f.relationshipTypes) {
        const clean = {}; let sem = 0;
        for (const [t, c] of Object.entries(f.relationshipTypes)) { if (!STRUCTURAL.has(t)) { clean[t] = c; sem += c; } }
        f.relationshipTypes = clean; f.edgeCount = sem;
      }
      // Use the API's nodeCount (true asset count from Neo4j/PostgreSQL) — don't override with graphData (which is the visible subset)
      const n = f.nodeCount || 1;
      f.density = n > 1 ? parseFloat(((2 * f.edgeCount) / (n * (n - 1))).toFixed(4)) : 0;
      f.avgDegree = n > 0 ? parseFloat(((2 * f.edgeCount) / n).toFixed(2)) : 0;
      setStats(f);
    }).catch(() => { const l = computeLocalStats(); if (l) setStats(l); });

    fetch(`${API}/graph/top-connected?limit=8`).then(r => r.json()).then(d => setTopConnected(d.assets || [])).catch(() => {
      if (graphData?.edges?.length) {
        const deg = {};
        graphData.edges.forEach(e => { deg[e.source] = (deg[e.source] || 0) + 1; deg[e.target] = (deg[e.target] || 0) + 1; });
        setTopConnected(Object.entries(deg).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, d]) => {
          const nd = graphData.nodes.find(n => n.id === id);
          return nd ? { id, name: nd.full_name || nd.label, domain: nd.domain, degree: d, relationshipTypes: [] } : null;
        }).filter(Boolean));
      }
    });
    fetch(`${API}/graph/orphaned?limit=10`).then(r => r.json()).then(d => setOrphaned(d.assets || [])).catch(() => {
      if (graphData?.nodes?.length) {
        const conn = new Set();
        (graphData.edges || []).forEach(e => { conn.add(e.source); conn.add(e.target); });
        setOrphaned(graphData.nodes.filter(n => !conn.has(n.id)).slice(0, 10).map(n => ({ id: n.id, name: n.full_name || n.label, domain: n.domain })));
      }
    });
  }, [graphData, computeLocalStats]);

  // Force-directed layout
  useEffect(() => {
    if (!graphData?.nodes?.length) return;
    const laid = forceDirectedLayout(graphData.nodes, graphData.edges || [], {
      width: 1600, height: 1000, iterations: 120,
      repulsionForce: 15000,
      idealEdgeLength: 250,
      centerGravity: 0.008,
    });
    setLayoutNodes(laid);
  }, [graphData]);

  useEffect(() => {
    const assetId = searchParams.get('asset');
    if (assetId && graphData) {
      const node = graphData.nodes?.find(n => n.id === assetId);
      if (node) setSelected(node);
    }
    // Filter to a specific entity type when arriving from the Ontology page
    const domain = searchParams.get('domain');
    if (domain) {
      // Use the domain code (lowercased + spaces) — filteredNodes matches domain text
      setGraphSearch(domain.replace(/_/g, ' ').toLowerCase());
    }
  }, [searchParams, graphData]);

  // When depth changes and a node is selected, fetch expanded neighborhood
  useEffect(() => {
    if (!selected || depth <= 1) return;
    fetch(`${API}/graph/neighbors/${selected.id}?depth=${depth}&limit=50`).then(r => r.json()).then(d => {
      if (d.neighbors?.length && graphData) {
        // Merge new neighbors into graph data
        const existingIds = new Set(graphData.nodes.map(n => n.id));
        const newNodes = d.neighbors.filter(n => !existingIds.has(n.id)).map(n => ({
          id: n.id, full_name: n.name, label: n.name?.length > 28 ? n.name.substring(0, 25) + '...' : n.name,
          domain: n.domain, classification: n.classification, zone: n.zone, confidence: n.confidence, project: n.project,
        }));
        if (newNodes.length > 0) {
          setGraphData(prev => ({ ...prev, nodes: [...prev.nodes, ...newNodes] }));
        }
      }
    }).catch(() => {});
  }, [depth, selected?.id]);

  const onMouseDown = e => { if (e.button === 0) { setDragging(true); setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y }); } };
  const onMouseMove = e => { if (dragging && dragStart) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); };
  const onMouseUp = () => setDragging(false);

  const handleInvestigate = async () => {
    if (!selected) return;
    setInvestigating(true);
    try {
      const d = await fetch(`${API}/investigate/${selected.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }).then(r => r.json());
      setInvestResult(d); refreshGraph();
    } catch (_) {}
    setInvestigating(false);
  };
  const handleFindPath = async () => {
    if (!selected || !pathTarget) return;
    setFindingPath(true);
    try { const d = await fetch(`${API}/graph/shortest-path?source=${selected.id}&target=${pathTarget}`).then(r => r.json()); setPathResult(d); } catch (_) {}
    setFindingPath(false);
  };
  const handleImpact = async () => {
    if (!selected) return;
    try { const d = await fetch(`${API}/graph/impact/${selected.id}?depth=3`).then(r => r.json()); setImpactResult(d); } catch (_) {}
  };
  const handleExport = async () => {
    const d = await fetch(`${API}/graph/export?format=json`).then(r => r.json());
    const blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'knowledge-graph.json'; a.click(); URL.revokeObjectURL(url);
  };

  const nodeMap = useMemo(() => { const m = {}; layoutNodes.forEach(n => { m[n.id] = n; }); return m; }, [layoutNodes]);

  // Neighborhood/depth filtering — works both with and without a selected node
  const neighborhood = useMemo(() => {
    if (!graphData?.edges?.length) return null;
    const edges = graphData.edges;

    if (selected) {
      // Node selected: standard N-hop neighborhood from that node
      return getNeighborhood(graphData.nodes || [], edges, selected.id, depth);
    }

    // No selection: depth controls global edge density
    if (depth >= 3) return null; // Depth 3 = show everything

    // Build degree map (how many semantic edges each node has)
    const degree = {};
    edges.forEach(e => {
      degree[e.source] = (degree[e.source] || 0) + 1;
      degree[e.target] = (degree[e.target] || 0) + 1;
    });

    // Depth 1: only hub nodes (degree >= 2) — clean, sparse view
    // Depth 2: all connected nodes (degree >= 1) — full connected graph, orphans dimmed
    const minDegree = depth === 1 ? 2 : 1;
    const visibleNodeIds = new Set(
      Object.entries(degree).filter(([, d]) => d >= minDegree).map(([id]) => id)
    );
    const visibleEdgeIndices = new Set(
      edges.map((e, i) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target) ? i : -1).filter(i => i >= 0)
    );

    return { nodeIds: visibleNodeIds, edgeIndices: visibleEdgeIndices };
  }, [selected, graphData, depth]);

  const filteredNodes = useMemo(() => {
    if (!graphSearch) return layoutNodes;
    const q = graphSearch.toLowerCase();
    return layoutNodes.filter(n => n.full_name?.toLowerCase().includes(q) || n.label?.toLowerCase().includes(q) || n.domain?.toLowerCase().replace(/_/g, ' ').includes(q));
  }, [layoutNodes, graphSearch]);
  const highlightedNodeIds = useMemo(() => new Set(filteredNodes.map(n => n.id)), [filteredNodes]);

  if (loading) return <div className="p-6 flex items-center justify-center h-full"><Spinner size={24}/><span className="ml-3 text-slate-500">Loading Knowledge Graph...</span></div>;

  const nodeCount = graphData?.nodes?.length || 0;
  const edgeCount = (graphData?.edges || []).length;

  return (
    <div className="flex h-full">
      {/* LEFT PANEL */}
      <div className="w-60 flex-shrink-0 border-r border-slate-800 bg-slate-900/50 overflow-y-auto">
        <div className="p-3 border-b border-slate-800">
          <h2 className="text-sm font-bold text-white flex items-center gap-2"><Share2 size={15} className="text-blue-400"/>Knowledge Graph</h2>
          <p className="text-[10px] text-slate-600 mt-0.5">{nodeCount} assets · {edgeCount} relationships</p>
        </div>

        <div className="flex border-b border-slate-800">
          {[['stats', 'Stats'], ['top', 'Hubs'], ['orphan', 'Orphans']].map(([k, label]) => (
            <button key={k} onClick={() => setLeftPanel(k)}
              className={`flex-1 text-[10px] py-2 font-medium transition-colors ${leftPanel === k ? 'text-blue-400 border-b-2 border-blue-500' : 'text-slate-500 hover:text-slate-300'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="p-3 space-y-3">
          {leftPanel === 'stats' && stats && (
            <>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Assets', value: stats.nodeCount || 0, color: 'text-blue-400' },
                  { label: 'Relationships', value: stats.edgeCount || 0, color: 'text-green-400' },
                  { label: 'Density', value: (stats.density || 0).toFixed(3), color: 'text-purple-400' },
                  { label: 'Avg Degree', value: (stats.avgDegree || 0).toFixed(1), color: 'text-cyan-400' },
                  { label: 'Orphans', value: stats.orphanedNodes || 0, color: stats.orphanedNodes > 0 ? 'text-amber-400' : 'text-green-400' },
                  { label: 'Concepts', value: stats.conceptNodes || 0, color: 'text-purple-400' },
                ].map(s => (
                  <div key={s.label} className="rounded-lg border border-slate-800 p-2 text-center bg-slate-900/50">
                    <div className={`text-base font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-[8px] text-slate-600 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
              {stats.relationshipTypes && Object.keys(stats.relationshipTypes).length > 0 && (
                <div>
                  <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1.5">Relationship Types</div>
                  {Object.entries(stats.relationshipTypes).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between text-[10px] py-0.5">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: REL_COLORS[type] || '#64748b' }}/>
                        <span className="text-slate-400">{type.replace(/_/g, ' ')}</span>
                      </span>
                      <span className="text-slate-500 font-mono text-[9px]">{count}</span>
                    </div>
                  ))}
                </div>
              )}
              {stats.domainDistribution && Object.keys(stats.domainDistribution).length > 0 && (
                <div>
                  <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1.5">Domain Distribution</div>
                  {Object.entries(stats.domainDistribution).map(([domain, count]) => (
                    <div key={domain} className="flex items-center justify-between text-[10px] py-0.5">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: DOMAIN_COLORS[domain] || '#64748b' }}/>
                        <span className="text-slate-400">{DOMAIN_LABELS[domain] || domain.replace(/_/g, ' ')}</span>
                      </span>
                      <span className="text-slate-500 font-mono text-[9px]">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {leftPanel === 'top' && (
            <div className="space-y-1.5">
              <div className="text-[9px] text-slate-600 uppercase tracking-wider">Most Connected Assets</div>
              {topConnected.length === 0 && <div className="text-[10px] text-slate-600">No hub assets found</div>}
              {topConnected.map(a => (
                <button key={a.id} onClick={() => {
                  // Try to find in current graph first, fallback to constructing a node from hub data
                  const existing = graphData?.nodes?.find(nd => nd.id === a.id);
                  const node = existing || { id: a.id, label: a.name, full_name: a.name, domain: a.domain, classification: a.classification, zone: a.zone, project: a.project };
                  setSelected(node);
                  setInvestResult(null); setPathResult(null); setImpactResult(null);
                  const ln = nodeMap[a.id];
                  if (ln) setPan({ x: -ln.x * zoom + 400, y: -ln.y * zoom + 300 });
                }}
                  className="w-full text-left p-2 rounded-lg border border-slate-800 hover:border-blue-700/40 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-300 font-medium truncate">{a.name}</span>
                    <span className="text-[10px] font-bold text-blue-400 ml-1">{a.degree}</span>
                  </div>
                  <div className="text-[9px] text-slate-600 mt-0.5">{DOMAIN_LABELS[a.domain] || a.domain?.replace(/_/g, ' ')}</div>
                </button>
              ))}
            </div>
          )}

          {leftPanel === 'orphan' && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <AlertTriangle size={11} className="text-amber-400"/>
                <div className="text-[9px] text-slate-600 uppercase tracking-wider">Orphaned Assets ({orphaned.length})</div>
              </div>
              <div className="text-[10px] text-slate-500 mb-1">Assets with no semantic relationships.</div>
              {orphaned.map(a => (
                <button key={a.id} onClick={() => {
                  const existing = graphData?.nodes?.find(nd => nd.id === a.id);
                  const node = existing || { id: a.id, label: a.name, full_name: a.name, domain: a.domain, classification: a.classification, zone: a.zone, project: a.project };
                  setSelected(node);
                  setInvestResult(null); setPathResult(null); setImpactResult(null);
                  const ln = nodeMap[a.id];
                  if (ln) setPan({ x: -ln.x * zoom + 400, y: -ln.y * zoom + 300 });
                }}
                  className="w-full text-left p-2 rounded-lg border border-amber-900/30 bg-amber-950/10 text-[10px] hover:border-amber-700/50 hover:bg-amber-950/20 transition-colors">
                  <div className="text-slate-300 font-medium truncate">{a.name}</div>
                  <div className="text-slate-600">{DOMAIN_LABELS[a.domain] || a.domain?.replace(/_/g, ' ')}</div>
                  <div className="text-[9px] text-amber-500/70 mt-0.5">Click to investigate relationships</div>
                </button>
              ))}
              {orphaned.length === 0 && <div className="text-[10px] text-green-400">All assets have relationships</div>}
            </div>
          )}
        </div>

        {/* Graph Search */}
        <div className="p-3 border-t border-slate-800 space-y-1.5">
          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600"/>
            <input className="input w-full pl-7 text-[10px] py-1.5" placeholder="Search nodes..."
              value={graphSearch} onChange={e => {
                setGraphSearch(e.target.value);
                if (e.target.value) {
                  const q = e.target.value.toLowerCase();
                  const match = layoutNodes.find(n => n.full_name?.toLowerCase().includes(q) || n.label?.toLowerCase().includes(q));
                  if (match) { setSelected(match); setPan({ x: -match.x * zoom + 400, y: -match.y * zoom + 300 }); }
                }
              }}/>
          </div>
          {graphSearch && (
            <div className="text-[9px] text-slate-500">{filteredNodes.length} of {layoutNodes.length} match</div>
          )}
          {graphSearch && filteredNodes.length > 0 && filteredNodes.length <= 8 && (
            <div className="space-y-0.5 max-h-28 overflow-y-auto">
              {filteredNodes.map(n => (
                <button key={n.id} onClick={() => { setSelected(n); setPan({ x: -n.x * zoom + 400, y: -n.y * zoom + 300 }); }}
                  className={`w-full text-left text-[10px] px-2 py-1 rounded ${selected?.id === n.id ? 'bg-blue-900/30 text-blue-300' : 'text-slate-400 hover:bg-slate-800'}`}>
                  {n.full_name || n.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* CENTER — Graph Canvas */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/30">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-0.5 bg-slate-800 rounded-lg p-0.5">
              <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="p-1.5 rounded hover:bg-slate-700 text-slate-400"><ZoomIn size={13}/></button>
              <span className="text-[10px] text-slate-500 px-1 min-w-[35px] text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.max(0.2, z - 0.1))} className="p-1.5 rounded hover:bg-slate-700 text-slate-400"><ZoomOut size={13}/></button>
              <button onClick={() => { setZoom(0.7); setPan({ x: 0, y: 0 }); }} className="p-1.5 rounded hover:bg-slate-700 text-slate-400"><Maximize2 size={13}/></button>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-slate-500">
              <span>Depth:</span>
              {[1, 2, 3].map(d => (
                <button key={d} onClick={() => setDepth(d)}
                  className={`w-5 h-5 rounded text-[9px] font-medium transition-colors ${depth === d ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleExport} className="btn-secondary text-[10px] px-2 py-1">
            <Download size={11}/>Export
          </button>
        </div>

        {/* SVG Canvas */}
        <div className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing relative"
          style={{ background: '#080e1a' }}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
          onWheel={e => { e.preventDefault(); setZoom(z => Math.max(0.2, Math.min(2, z + (e.deltaY > 0 ? -0.05 : 0.05)))); }}>
          <svg ref={svgRef} width="100%" height="100%" className="select-none">
            <defs>
              {/* Chess-board pattern */}
              <pattern id="chess" width="40" height="40" patternUnits="userSpaceOnUse">
                <rect width="40" height="40" fill="#080e1a"/>
                <rect width="20" height="20" fill="#0a1225"/>
                <rect x="20" y="20" width="20" height="20" fill="#0a1225"/>
              </pattern>
              <marker id="arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="#334155" opacity="0.6"/>
              </marker>
              {/* Glow filter for selected node */}
              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            <rect width="100%" height="100%" fill="url(#chess)"/>
            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {/* Edges */}
              {(graphData?.edges || []).map((e, i) => {
                const s = nodeMap[e.source];
                const t = nodeMap[e.target];
                if (!s || !t) return null;
                const inN = !neighborhood || neighborhood.edgeIndices.has(i);
                // When a node is selected (via search or click), its neighborhood edges should be visible
                const inS = !graphSearch || (selected && neighborhood?.edgeIndices?.has(i)) || (highlightedNodeIds.has(e.source) && highlightedNodeIds.has(e.target));
                const color = REL_COLORS[e.relationship] || '#475569';
                const opacity = (inN && inS) ? 0.65 : 0.05;
                const isPathEdge = pathResult?.found && pathResult.nodes?.some(pn => pn.id === e.source) && pathResult.nodes?.some(pn => pn.id === e.target);

                const sx = s.x + R, sy = s.y + R;
                const tx = t.x + R, ty = t.y + R;
                // Offset control point perpendicular to the edge for curved lines
                const dx = tx - sx, dy = ty - sy;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const offsetScale = Math.min(0.25, 60 / dist); // Less curve for long edges
                const mx = (sx + tx) / 2 + dy * offsetScale;
                const my = (sy + ty) / 2 - dx * offsetScale;
                // Angle for label rotation
                let angle = Math.atan2(my - (sy + ty) / 2, mx - (sx + tx) / 2) * 180 / Math.PI + 90;
                let labelAngle = Math.atan2(ty - sy, tx - sx) * 180 / Math.PI;
                if (labelAngle > 90) labelAngle -= 180;
                if (labelAngle < -90) labelAngle += 180;

                return (
                  <g key={i} opacity={opacity} style={{ transition: 'opacity 0.3s ease' }}>
                    <path d={`M${sx},${sy} Q${mx},${my} ${tx},${ty}`} fill="none"
                      stroke={isPathEdge ? '#22c55e' : color}
                      strokeWidth={isPathEdge ? 3 : 1.5}
                      strokeDasharray={isPathEdge ? '' : ''}
                      markerEnd="url(#arrow)"/>
                    <text x={mx} y={my - 4} fill={color} fontSize="8" fontWeight="600" textAnchor="middle" opacity={0.9}
                      transform={`rotate(${labelAngle}, ${mx}, ${my - 4})`}>
                      {REL_ABBREV[e.relationship] || e.relationship?.substring(0, 3)}
                    </text>
                  </g>
                );
              })}

              {/* Nodes — Circles */}
              {layoutNodes.map(n => {
                const inN = !neighborhood || neighborhood.nodeIds.has(n.id);
                // When a node is selected via search, its neighbors should also be visible
                const inS = !graphSearch || (selected && neighborhood?.nodeIds?.has(n.id)) || highlightedNodeIds.has(n.id);
                const isSel = selected?.id === n.id;
                const opacity = (inN && inS) ? 1 : 0.1;
                const domColor = DOMAIN_COLORS[n.domain] || '#64748b';
                const isPath = pathResult?.found && pathResult.nodes?.some(pn => pn.id === n.id);
                const cx = n.x + R, cy = n.y + R;
                const displayName = (n.full_name || n.label || '');
                const truncName = displayName.length > 18 ? displayName.substring(0, 16) + '..' : displayName;

                return (
                  <g key={n.id} onClick={() => { setSelected(n); setInvestResult(null); setPathResult(null); setImpactResult(null); }}
                    className="cursor-pointer" opacity={opacity} style={{ transition: 'opacity 0.3s ease' }}>
                    {/* Outer glow for selected */}
                    {isSel && <circle cx={cx} cy={cy} r={R + 6} fill="none" stroke={domColor} strokeWidth={1.5} opacity={0.3} filter="url(#glow)"/>}
                    {/* Path highlight ring */}
                    {isPath && !isSel && <circle cx={cx} cy={cy} r={R + 4} fill="none" stroke="#22c55e" strokeWidth={2} opacity={0.5}/>}
                    {/* Main circle */}
                    <circle cx={cx} cy={cy} r={R}
                      fill={domColor + '18'}
                      stroke={isSel ? domColor : isPath ? '#22c55e' : domColor + '60'}
                      strokeWidth={isSel ? 2.5 : 1.5}/>
                    {/* Domain initial */}
                    <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
                      fill={domColor} fontSize="15" fontWeight="700" fontFamily="Inter, system-ui, sans-serif">
                      {DOMAIN_INITIALS[n.domain] || '?'}
                    </text>
                    {/* Classification dot */}
                    <circle cx={cx + R - 4} cy={cy - R + 4} r={4}
                      fill={n.classification === 'RESTRICTED' ? '#ef4444' : n.classification === 'CONFIDENTIAL' ? '#f59e0b' : n.classification === 'TRADE_SECRET' ? '#dc2626' : n.classification === 'INTERNAL' ? '#3b82f6' : '#22c55e'}
                      stroke="#0f172a" strokeWidth={1.5}/>
                    {/* Label below */}
                    <text x={cx} y={cy + R + 14} textAnchor="middle"
                      fill="#94a3b8" fontSize="8.5" fontWeight="500" fontFamily="Inter, system-ui, sans-serif">
                      {truncName}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Floating Legend — only shows entity/relationship types actually in the visible graph */}
          <FloatingLegend
            nodes={layoutNodes}
            edges={graphData?.edges || []}
            DOMAIN_COLORS={DOMAIN_COLORS}
            DOMAIN_LABELS={DOMAIN_LABELS}
            REL_COLORS={REL_COLORS}
          />
        </div>
      </div>

      {/* RIGHT PANEL — only visible when a node is selected */}
      {selected && (
      <div className="w-72 flex-shrink-0 border-l border-slate-800 bg-slate-900/50 overflow-y-auto" style={{ animation: 'slideInRight 0.2s ease-out' }}>
        {selected ? (
          <div className="p-3 space-y-3">
            {/* Entity Card */}
            <div className="border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: (DOMAIN_COLORS[selected.domain] || '#64748b') + '20', border: `2px solid ${DOMAIN_COLORS[selected.domain] || '#64748b'}` }}>
                  <span style={{ color: DOMAIN_COLORS[selected.domain] }} className="text-sm font-bold">{DOMAIN_INITIALS[selected.domain] || '?'}</span>
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{selected.full_name || selected.label}</div>
                  <div className="text-[10px] text-slate-500">{DOMAIN_LABELS[selected.domain] || selected.domain?.replace(/_/g, ' ')}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                <ClassBadge cls={selected.classification}/>
                <ZoneBadge zone={selected.zone}/>
              </div>
              <div className="grid grid-cols-2 gap-1 mt-2 text-[10px]">
                <div><span className="text-slate-600">Project</span><div className="text-slate-400">{selected.project || '—'}</div></div>
                <div><span className="text-slate-600">Confidence</span><div className="text-slate-400">{selected.confidence ? Math.round(selected.confidence * 100) + '%' : '—'}</div></div>
              </div>
            </div>

            {/* Connected Assets */}
            <div>
              <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1.5">
                Connections ({(graphData?.edges || []).filter(e => e.source === selected.id || e.target === selected.id).length})
              </div>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {(graphData?.edges || []).filter(e => e.source === selected.id || e.target === selected.id).map((e, i) => {
                  const peerId = e.source === selected.id ? e.target : e.source;
                  const peer = nodeMap[peerId];
                  if (!peer) return null;
                  const color = REL_COLORS[e.relationship] || '#64748b';
                  return (
                    <div key={i} onClick={() => { setSelected(peer); setPan({ x: -peer.x * zoom + 400, y: -peer.y * zoom + 300 }); }}
                      className="flex items-center gap-2 p-1.5 rounded-md border border-slate-800 hover:border-slate-700 cursor-pointer text-[10px] transition-colors">
                      <div className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[8px] font-bold"
                        style={{ background: (DOMAIN_COLORS[peer.domain] || '#64748b') + '20', color: DOMAIN_COLORS[peer.domain] }}>
                        {DOMAIN_INITIALS[peer.domain]}
                      </div>
                      <span className="text-slate-300 truncate flex-1">{peer.full_name || peer.label}</span>
                      <span className="text-[8px] px-1 py-0.5 rounded" style={{ color, background: color + '15' }}>
                        {REL_ABBREV[e.relationship] || e.relationship?.substring(0, 3)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-1.5">
              <button onClick={handleInvestigate} disabled={investigating} className="w-full text-[10px] py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium flex items-center justify-center gap-1.5 transition-colors">
                {investigating ? <><Spinner size={11}/>Investigating...</> : <><Sparkles size={11}/>Investigate Relationships</>}
              </button>
              <button onClick={handleImpact} className="w-full text-[10px] py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium flex items-center justify-center gap-1.5 transition-colors">
                <Target size={11}/>Impact Analysis
              </button>
              <button onClick={() => setShowCreateRel(!showCreateRel)} className="w-full text-[10px] py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium flex items-center justify-center gap-1.5 transition-colors">
                + Create Relationship
              </button>
            </div>

            {/* Path Finder */}
            <div className="border border-slate-800 rounded-lg p-2.5 space-y-2">
              <div className="text-[9px] text-slate-600 uppercase tracking-wider flex items-center gap-1"><Route size={10}/>Path Finder</div>
              <select className="input w-full text-[10px] py-1" value={pathTarget} onChange={e => setPathTarget(e.target.value)}>
                <option value="">Select target...</option>
                {(graphData?.nodes || []).filter(n => n.id !== selected.id).map(n => (
                  <option key={n.id} value={n.id}>{n.full_name || n.label}</option>
                ))}
              </select>
              <button onClick={handleFindPath} disabled={!pathTarget || findingPath}
                className="w-full text-[10px] py-1.5 rounded bg-cyan-800 hover:bg-cyan-700 text-cyan-100 font-medium transition-colors">
                {findingPath ? 'Finding...' : 'Find Shortest Path'}
              </button>
              {pathResult && (
                <div className={`text-[10px] p-2 rounded ${pathResult.found ? 'bg-green-950/20 border border-green-800/30 text-green-300' : 'bg-slate-800 text-slate-500'}`}>
                  {pathResult.found
                    ? <>Path: {pathResult.distance} hop(s)<br/>{pathResult.nodes?.map(n => n.name).join(' → ')}</>
                    : 'No path found'}
                </div>
              )}
            </div>

            {/* Create Relationship */}
            {showCreateRel && (
              <div className="border border-cyan-800/30 rounded-lg p-2.5 bg-cyan-950/10 space-y-2">
                <div className="text-[9px] text-cyan-300 uppercase tracking-wider">New Relationship</div>
                <select className="input w-full text-[10px] py-1" value={relForm.target_id} onChange={e => setRelForm({ ...relForm, target_id: e.target.value })}>
                  <option value="">Select target...</option>
                  {(graphData?.nodes || []).filter(n => n.id !== selected.id).map(n => (
                    <option key={n.id} value={n.id}>{n.full_name || n.label}</option>
                  ))}
                </select>
                <select className="input w-full text-[10px] py-1" value={relForm.relationship_type} onChange={e => setRelForm({ ...relForm, relationship_type: e.target.value })}>
                  {Object.keys(REL_COLORS).map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
                <button disabled={!relForm.target_id || creating} onClick={async () => {
                  setCreating(true);
                  const token = localStorage.getItem('cude_token');
                  await fetch(`${API}/relationships`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                    body: JSON.stringify({ source_asset_id: selected.id, target_asset_id: relForm.target_id, relationship_type: relForm.relationship_type, confidence: relForm.confidence }) });
                  setShowCreateRel(false); setRelForm({ target_id: '', relationship_type: 'REFERENCES_IP', confidence: 0.85 }); setCreating(false); refreshGraph();
                }} className="w-full text-[10px] py-1.5 rounded bg-cyan-700 hover:bg-cyan-600 text-white font-medium transition-colors">
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            )}

            {/* Impact Results */}
            {impactResult?.impacted?.length > 0 && (
              <div className="border border-orange-800/30 rounded-lg p-2.5 bg-orange-950/10 space-y-1.5">
                <div className="text-[9px] text-orange-300 uppercase tracking-wider">Impact — {impactResult.impacted.length} affected</div>
                {impactResult.impacted.slice(0, 10).map(a => (
                  <div key={a.id} className="flex items-center gap-2 text-[10px]">
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold flex-shrink-0 ${a.distance === 1 ? 'bg-red-900/50 text-red-300' : a.distance === 2 ? 'bg-amber-900/50 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>{a.distance}</span>
                    <span className="text-slate-300 truncate">{a.name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Investigation Results */}
            {investResult && (
              <div className="border border-amber-800/40 rounded-lg p-2.5 bg-amber-950/10 space-y-2">
                <div className="text-[10px] font-semibold text-amber-300">Investigation Results</div>
                <p className="text-[10px] text-slate-400">{investResult.summary}</p>
                {investResult.relationships?.map((r, i) => (
                  <div key={i} className="text-[10px] p-1.5 rounded bg-slate-900 border border-slate-800">
                    <span className="text-amber-400 font-medium">{r.relationship_type}</span> — <span className="text-slate-400">{r.asset_name}</span>
                  </div>
                ))}
                <ReasoningTrace steps={investResult.reasoning_steps} collapsed/>
                {investResult.mock && <div className="text-[9px] text-amber-500/60 italic">Mock — set ANTHROPIC_API_KEY for live AI</div>}
              </div>
            )}
          </div>
        ) : null}
      </div>
      )}
    </div>
  );
}

// ── Collapsible legend that filters down to entity/relationship types
// actually present in the currently-visible graph. Prevents the 30-entity
// industry-template legend from overwhelming the canvas.
function FloatingLegend({ nodes, edges, DOMAIN_COLORS, DOMAIN_LABELS, REL_COLORS }) {
  const [collapsed, setCollapsed] = React.useState(false);

  const presentDomains = React.useMemo(() => {
    const seen = new Set();
    (nodes || []).forEach(n => { if (n.domain) seen.add(n.domain); });
    return [...seen]
      .filter(d => DOMAIN_COLORS[d])
      .sort((a, b) => (DOMAIN_LABELS[a] || a).localeCompare(DOMAIN_LABELS[b] || b));
  }, [nodes, DOMAIN_COLORS, DOMAIN_LABELS]);

  const presentRels = React.useMemo(() => {
    const seen = new Set();
    (edges || []).forEach(e => { if (e.relationship) seen.add(e.relationship); });
    return [...seen]
      .filter(r => REL_COLORS[r])
      .sort();
  }, [edges, REL_COLORS]);

  if (collapsed) {
    return (
      <button onClick={() => setCollapsed(false)}
        className="absolute bottom-4 right-4 bg-slate-900/85 backdrop-blur-sm border border-slate-800 rounded-lg px-2 py-1.5 text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1.5">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>
        Legend
        <span className="text-slate-600 font-mono">({presentDomains.length + presentRels.length})</span>
      </button>
    );
  }

  return (
    <div className="absolute bottom-4 right-4 bg-slate-900/85 backdrop-blur-sm border border-slate-800 rounded-lg text-[10px] max-w-[260px]">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-800">
        <span className="text-slate-300 font-semibold text-[10px]">Legend</span>
        <span className="text-[9px] text-slate-600 font-mono">
          {presentDomains.length} types · {presentRels.length} rels
        </span>
        <button onClick={() => setCollapsed(true)} className="text-slate-500 hover:text-slate-300 ml-2" title="Collapse legend">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/></svg>
        </button>
      </div>
      <div className="p-2 max-h-[280px] overflow-y-auto">
        {presentDomains.length > 0 && (
          <div className="grid grid-cols-1 gap-y-1">
            {presentDomains.map(dom => (
              <div key={dom} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: DOMAIN_COLORS[dom] + '30', border: `1.5px solid ${DOMAIN_COLORS[dom]}` }}/>
                <span className="text-slate-400 truncate text-[10px]">{DOMAIN_LABELS[dom] || dom.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        )}
        {presentRels.length > 0 && (
          <div className="border-t border-slate-800 mt-1.5 pt-1.5 grid grid-cols-1 gap-y-0.5">
            {presentRels.map(rel => (
              <div key={rel} className="flex items-center gap-1.5">
                <div className="w-3 h-0.5 rounded flex-shrink-0" style={{ background: REL_COLORS[rel] }}/>
                <span className="text-slate-500 truncate text-[10px]">{rel.replace(/_/g, ' ').toLowerCase()}</span>
              </div>
            ))}
          </div>
        )}
        {presentDomains.length === 0 && presentRels.length === 0 && (
          <div className="text-slate-600 italic text-[10px]">No entities in the current view</div>
        )}
      </div>
    </div>
  );
}
