import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  GitMerge, Search, Database, KeyRound, ShieldAlert,
  AlertTriangle, ChevronRight,
} from 'lucide-react';
import { Spinner } from '../components/UI';

const API = '/api';

const LAYER_ORDER = ['source', 'staging', 'intermediate', 'mart'];
const LAYER_LABEL = { source: 'Source', staging: 'Staging', intermediate: 'Intermediate', mart: 'Mart' };
const LAYER_COLOR = { source: '#7d4a44', staging: '#5a7f6a', intermediate: '#5b6b8c', mart: '#86618c' };

const TRANSFORM_LABEL = {
  direct: 'direct', expression: 'expr', aggregation: 'agg',
  join: 'join', window: 'window', case: 'case', fk_reference: 'fk',
};

export default function Lineage() {
  const [searchParams] = useSearchParams();
  const [assets, setAssets] = useState([]);
  const [stats, setStats] = useState({ columns: 0, assets_with_columns: 0, lineage_edges: 0, pii_columns: 0 });
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [columns, setColumns] = useState([]);
  const [selectedColumn, setSelectedColumn] = useState(null);
  const [upstream, setUpstream] = useState([]);
  const [downstream, setDownstream] = useState([]);
  const [impact, setImpact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingLineage, setLoadingLineage] = useState(false);
  const [depth, setDepth] = useState(3);
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([
      fetch(`${API}/lineage/stats`).then(r => r.json()),
      fetch(`${API}/lineage/assets`).then(r => r.json()),
    ]).then(([s, r]) => {
      setStats(s);
      setAssets(r.assets || []);
      setLoading(false);
      const initialAssetId = searchParams.get('asset');
      if (initialAssetId) {
        const a = (r.assets || []).find(x => x.id === initialAssetId);
        if (a) setSelectedAsset(a);
      }
    });
  }, []);

  // Load columns when an asset is selected
  useEffect(() => {
    if (!selectedAsset) { setColumns([]); setSelectedColumn(null); return; }
    fetch(`${API}/lineage/columns/${selectedAsset.id}`).then(r => r.json())
      .then(d => {
        setColumns(d.columns || []);
        const initialColId = searchParams.get('column');
        if (initialColId) {
          const c = (d.columns || []).find(x => x.id === initialColId);
          if (c) setSelectedColumn(c);
        }
      });
  }, [selectedAsset]);

  // Load lineage for the selected column
  useEffect(() => {
    if (!selectedColumn) { setUpstream([]); setDownstream([]); setImpact(null); return; }
    setLoadingLineage(true);
    Promise.all([
      fetch(`${API}/lineage/column/${selectedColumn.id}/upstream?depth=${depth}`).then(r => r.json()),
      fetch(`${API}/lineage/column/${selectedColumn.id}/downstream?depth=${depth}`).then(r => r.json()),
      fetch(`${API}/lineage/column/${selectedColumn.id}/impact`).then(r => r.json()),
    ]).then(([up, dn, imp]) => {
      setUpstream(up.edges || []);
      setDownstream(dn.edges || []);
      setImpact(imp);
      setLoadingLineage(false);
    }).catch(() => setLoadingLineage(false));
  }, [selectedColumn, depth]);

  // Group assets by project, then layer
  const groupedAssets = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = search
      ? assets.filter(a =>
          a.file_name?.toLowerCase().includes(q) ||
          a.project?.toLowerCase().includes(q) ||
          a.layer?.toLowerCase().includes(q))
      : assets;
    const byProject = {};
    for (const a of filtered) {
      const proj = a.project || '(no project)';
      const layer = a.layer || 'other';
      (byProject[proj] = byProject[proj] || {})[layer] = (byProject[proj][layer] || []);
      byProject[proj][layer].push(a);
    }
    return byProject;
  }, [assets, search]);

  if (loading) return (
    <div className="p-6 flex items-center justify-center h-full">
      <Spinner size={24}/><span className="ml-3 text-slate-500">Loading column lineage...</span>
    </div>
  );

  return (
    <div className="flex h-full">
      {/* LEFT PANE — Asset Tree */}
      <div className="w-72 flex-shrink-0 border-r border-slate-800 bg-slate-900/50 flex flex-col">
        <div className="px-4 py-3 border-b border-slate-800 flex-shrink-0">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <GitMerge size={14} className="text-slate-500"/>Column Lineage
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">{stats.assets_with_columns} assets · {stats.columns} columns · {stats.lineage_edges} edges</p>
        </div>

        <div className="px-3 py-2 border-b border-slate-800">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600"/>
            <input className="input w-full pl-7 text-xs py-1.5" placeholder="Search assets..."
              value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {Object.keys(groupedAssets).length === 0 ? (
            <div className="text-xs text-slate-500 p-3 text-center">
              No assets with columns yet.
              <div className="mt-2 text-slate-600 leading-relaxed">
                Scan a database from <Link to="/connectors" className="text-slate-400 hover:text-slate-200 underline">Connectors</Link>.
              </div>
            </div>
          ) : Object.entries(groupedAssets).map(([project, layers]) => (
            <div key={project} className="mb-4">
              <div className="flex items-center gap-1.5 px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <Database size={10}/>{project}
              </div>
              {LAYER_ORDER.concat(['other']).map(layer => {
                const items = layers[layer];
                if (!items?.length) return null;
                return (
                  <div key={layer} className="mb-2">
                    {layer !== 'other' && (
                      <div className="px-2 text-[10px] font-medium mb-0.5" style={{ color: LAYER_COLOR[layer] || '#94a3b8' }}>
                        {LAYER_LABEL[layer] || layer}
                      </div>
                    )}
                    {items.map(a => {
                      const isSelected = selectedAsset?.id === a.id;
                      return (
                        <button key={a.id} onClick={() => { setSelectedAsset(a); setSelectedColumn(null); }}
                          className={`w-full text-left px-2 py-1.5 rounded mb-0.5 transition-colors flex items-center gap-2 ${
                            isSelected
                              ? 'bg-slate-800/80 border-l-2 border-slate-400'
                              : 'hover:bg-slate-800/50 border-l-2 border-transparent'
                          }`}>
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: LAYER_COLOR[layer] || '#64748b' }}/>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-slate-200 truncate font-mono">{a.file_name.split('.').pop()}</div>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">{a.column_count}</span>
                          {parseInt(a.pii_count) > 0 && (
                            <ShieldAlert size={10} className="text-amber-500 flex-shrink-0" title={`${a.pii_count} PII columns`}/>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* CENTER PANE — Columns + Lineage */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!selectedAsset ? (
          <EmptyState stats={stats}/>
        ) : (
          <>
            {/* Asset header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-900/30 flex-shrink-0">
              <div className="min-w-0">
                <div className="text-xs text-slate-500 font-mono">{selectedAsset.project}{selectedAsset.layer && ` · ${selectedAsset.layer}`}</div>
                <h1 className="text-base font-semibold text-slate-100 font-mono truncate">{selectedAsset.file_name}</h1>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-slate-500">Depth</span>
                <select className="input text-xs py-1" value={depth} onChange={e => setDepth(parseInt(e.target.value))}>
                  {[1, 2, 3, 5, 10].map(d => <option key={d} value={d}>{d} {d === 1 ? 'hop' : 'hops'}</option>)}
                </select>
              </div>
            </div>

            {/* Columns table */}
            <div className="flex-shrink-0 border-b border-slate-800 max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-900/60 sticky top-0">
                  <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="text-left px-6 py-2 font-medium">Column</th>
                    <th className="text-left px-3 py-2 font-medium">Type</th>
                    <th className="text-left px-3 py-2 font-medium">Flags</th>
                    <th className="text-left px-3 py-2 font-medium">Classification</th>
                    <th className="text-left px-3 py-2 font-medium w-1/3">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map(col => {
                    const isSelected = selectedColumn?.id === col.id;
                    return (
                      <tr key={col.id} onClick={() => setSelectedColumn(col)}
                        className={`border-t border-slate-800/40 cursor-pointer transition-colors ${
                          isSelected ? 'bg-slate-800/60' : 'hover:bg-slate-800/30'
                        }`}>
                        <td className="px-6 py-2 font-mono text-slate-100 text-xs">{col.column_name}</td>
                        <td className="px-3 py-2 font-mono text-slate-500 text-xs">{col.data_type || '—'}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            {col.is_primary_key && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/50 text-amber-300 font-mono" title="Primary Key">PK</span>}
                            {col.is_pii && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-950/50 text-red-300 font-mono" title={`PII: ${col.pii_type || 'detected'}`}>PII</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-400 font-mono">{col.classification || '—'}</td>
                        <td className="px-3 py-2 text-xs text-slate-500 truncate">{col.description || ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Lineage visualization for selected column */}
            <div className="flex-1 overflow-y-auto">
              {!selectedColumn ? (
                <div className="flex-1 flex items-center justify-center text-sm text-slate-500 py-12">
                  Select a column above to view its lineage.
                </div>
              ) : (
                <div className="p-6">
                  <LineageFlow
                    selectedAsset={selectedAsset}
                    selectedColumn={selectedColumn}
                    upstream={upstream}
                    downstream={downstream}
                    impact={impact}
                    loading={loadingLineage}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Empty state when no asset selected ──────────────────────────────────────
function EmptyState({ stats }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <GitMerge size={40} className="text-slate-700 mx-auto mb-4"/>
        <div className="text-base text-slate-300 font-medium mb-1">Column Lineage</div>
        <p className="text-sm text-slate-500 leading-relaxed mb-6">
          Select an asset on the left to view its columns and trace lineage.
        </p>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="text-center">
            <div className="text-2xl font-light text-slate-300">{stats.assets_with_columns}</div>
            <div className="text-[11px] text-slate-600 mt-1">Assets</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-light text-slate-300">{stats.columns}</div>
            <div className="text-[11px] text-slate-600 mt-1">Columns</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-light text-slate-300">{stats.lineage_edges}</div>
            <div className="text-[11px] text-slate-600 mt-1">Edges</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Horizontal lineage flow ─────────────────────────────────────────────────
// Three columns: Upstream | Selected | Downstream
function LineageFlow({ selectedAsset, selectedColumn, upstream, downstream, impact, loading }) {
  if (loading) {
    return <div className="flex items-center justify-center py-12 text-sm text-slate-500"><Spinner size={16}/><span className="ml-2">Computing lineage...</span></div>;
  }

  // Group edges by hop to render columns of nodes
  const upstreamByHop = groupByHop(upstream);
  const downstreamByHop = groupByHop(downstream);
  const upHops = Object.keys(upstreamByHop).map(Number).sort((a, b) => b - a); // furthest first
  const downHops = Object.keys(downstreamByHop).map(Number).sort((a, b) => a - b);

  return (
    <div>
      {/* Selected-column header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
          <span className="font-mono">{selectedAsset.file_name}</span>
          <ChevronRight size={11}/>
          <span>column lineage</span>
        </div>
        <div className="flex items-center gap-3 mb-2">
          <h2 className="text-lg font-mono text-slate-100">{selectedColumn.column_name}</h2>
          <span className="text-xs text-slate-500 font-mono">{selectedColumn.data_type}</span>
          {selectedColumn.is_primary_key && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/50 text-amber-300 font-mono">PK</span>}
          {selectedColumn.is_pii && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-950/50 text-red-300 font-mono">PII</span>}
        </div>
        {impact && impact.impacted_columns > 0 && (
          <div className="text-xs text-amber-400/90 flex items-center gap-1.5 mt-2">
            <AlertTriangle size={11}/>
            Dropping this column would affect <span className="font-semibold">{impact.impacted_columns} downstream columns</span> across <span className="font-semibold">{impact.impacted_assets} assets</span>.
          </div>
        )}
      </div>

      {/* Three-section flow: Upstream → Selected → Downstream */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
        {/* UPSTREAM column */}
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2 text-right pr-2">
            Upstream <span className="text-slate-600 font-mono">({upstream.length})</span>
          </div>
          {upstream.length === 0 ? (
            <div className="text-xs text-slate-600 italic text-right pr-2 py-2">No upstream sources — root column.</div>
          ) : (
            <div className="space-y-3">
              {upHops.map(hop => (
                <div key={hop}>
                  <div className="text-[10px] text-slate-600 mb-1 text-right pr-2 font-mono">hop {hop}</div>
                  <div className="space-y-1.5">
                    {upstreamByHop[hop].map((e, i) => (
                      <LineageNode key={i} edge={e} direction="upstream"/>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SELECTED column (center pill) */}
        <div className="flex flex-col items-center pt-6">
          <div className="px-3 py-2 rounded-md border-2 border-slate-500 bg-slate-800 shadow-lg">
            <div className="text-xs font-mono text-slate-100 whitespace-nowrap">{selectedColumn.column_name}</div>
            <div className="text-[10px] text-slate-500 font-mono text-center mt-0.5">{selectedColumn.data_type}</div>
          </div>
        </div>

        {/* DOWNSTREAM column */}
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2 pl-2">
            Downstream <span className="text-slate-600 font-mono">({downstream.length})</span>
          </div>
          {downstream.length === 0 ? (
            <div className="text-xs text-slate-600 italic pl-2 py-2">No downstream consumers — leaf column.</div>
          ) : (
            <div className="space-y-3">
              {downHops.map(hop => (
                <div key={hop}>
                  <div className="text-[10px] text-slate-600 mb-1 pl-2 font-mono">hop {hop}</div>
                  <div className="space-y-1.5">
                    {downstreamByHop[hop].map((e, i) => (
                      <LineageNode key={i} edge={e} direction="downstream"/>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function groupByHop(edges) {
  return edges.reduce((acc, e) => {
    const h = parseInt(e.hop) || 1;
    (acc[h] = acc[h] || []).push(e);
    return acc;
  }, {});
}

// ── A single lineage node (one column in upstream/downstream) ───────────────
function LineageNode({ edge, direction }) {
  const isUp = direction === 'upstream';
  const asset = isUp ? edge.upstream_asset : edge.downstream_asset;
  const col   = isUp ? edge.upstream_column : edge.downstream_column;
  const layer = isUp ? edge.upstream_layer : edge.downstream_layer;
  const tableName = asset?.split('.').pop() || asset;
  const transform = TRANSFORM_LABEL[edge.transformation_type] || edge.transformation_type;
  const layerColor = LAYER_COLOR[layer] || '#475569';

  return (
    <div className="px-2.5 py-1.5 rounded border border-slate-800 bg-slate-900/60 hover:border-slate-700 transition-colors">
      <div className="flex items-center gap-1.5">
        <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: layerColor }}/>
        <span className="text-[10px] text-slate-500 truncate" title={asset}>{tableName}</span>
        <span className="text-[9px] text-slate-700 font-mono ml-auto">{transform}</span>
      </div>
      <div className="text-xs font-mono text-slate-200 truncate" title={col}>{col}</div>
      {edge.transformation_sql && edge.transformation_type !== 'direct' && edge.transformation_type !== 'fk_reference' && (
        <div className="text-[10px] text-slate-500 mt-1 font-mono break-all opacity-70" title={edge.transformation_sql}>
          {edge.transformation_sql.length > 60 ? edge.transformation_sql.slice(0, 57) + '…' : edge.transformation_sql}
        </div>
      )}
    </div>
  );
}
