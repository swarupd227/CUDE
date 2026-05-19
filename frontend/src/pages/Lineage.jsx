import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  GitMerge, Search, Database, Layers, KeyRound, ShieldAlert,
  ArrowRight, ArrowLeft, AlertTriangle, ChevronRight, ChevronDown, Upload,
  RefreshCw, ExternalLink, Sparkles, Info,
} from 'lucide-react';
import { Spinner } from '../components/UI';

const API = '/api';

// Layer ordering for left→right "swim lane" visualization
const LAYER_ORDER = ['source', 'staging', 'intermediate', 'mart'];
const LAYER_LABEL = { source: 'Source', staging: 'Staging', intermediate: 'Intermediate', mart: 'Mart' };
const LAYER_COLOR = { source: '#7d4a44', staging: '#5a7f6a', intermediate: '#5b6b8c', mart: '#86618c' };

const TRANSFORM_LABEL = {
  direct: 'Direct',
  expression: 'Expression',
  aggregation: 'Aggregation',
  join: 'Join',
  window: 'Window',
  case: 'CASE',
};

export default function Lineage() {
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [reseedingState, setReseedingState] = useState(null);
  const [showImpact, setShowImpact] = useState(false);

  const loadStats = async () => {
    const s = await fetch(`${API}/lineage/stats`).then(r => r.json());
    setStats(s);
  };

  const loadAssets = async () => {
    const r = await fetch(`${API}/lineage/assets`).then(r => r.json());
    setAssets(r.assets || []);
    setLoading(false);
    return r.assets || [];
  };

  useEffect(() => {
    loadStats();
    loadAssets().then((rows) => {
      const initialAssetId = searchParams.get('asset');
      if (initialAssetId) {
        const a = rows.find(r => r.id === initialAssetId);
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

  // Load upstream + downstream lineage when a column is selected
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

  // Group assets by project, then by layer
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

  const reseed = async () => {
    setReseedingState('reseeding');
    try {
      await fetch(`${API}/lineage/seed-samples`, { method: 'POST' });
      await Promise.all([loadStats(), loadAssets()]);
      setReseedingState('done');
      setTimeout(() => setReseedingState(null), 1500);
    } catch { setReseedingState(null); }
  };

  if (loading) return (
    <div className="p-6 flex items-center justify-center h-full">
      <Spinner size={24}/><span className="ml-3 text-slate-500">Loading column lineage...</span>
    </div>
  );

  return (
    <div className="flex h-full">
      {/* LEFT PANE — Asset Tree by Project & Layer */}
      <div className="w-72 flex-shrink-0 border-r border-slate-800 bg-slate-900/50 flex flex-col">
        <div className="p-3 border-b border-slate-800 flex-shrink-0">
          <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-2">
            <Layers size={13} className="text-slate-500"/>Models & Tables
          </h3>
          <p className="text-[9px] text-slate-600 mt-0.5">{stats.assets_with_columns} assets · {stats.columns} columns · {stats.lineage_edges} edges</p>
        </div>

        <div className="p-2 border-b border-slate-800">
          <div className="relative">
            <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600"/>
            <input className="input w-full pl-7 text-[10px] py-1.5" placeholder="Search models..."
              value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5">
          {Object.keys(groupedAssets).length === 0 ? (
            <div className="text-[10px] text-slate-600 p-3 text-center">
              No models indexed yet.<br/>
              <button onClick={reseed} className="text-slate-400 hover:text-slate-200 underline mt-2">Load sample dbt projects</button>
            </div>
          ) : Object.entries(groupedAssets).map(([project, layers]) => (
            <div key={project} className="mb-3">
              <div className="text-[9px] text-slate-500 uppercase tracking-wider px-2 mb-1 flex items-center gap-1">
                <Database size={9}/>{project}
              </div>
              {LAYER_ORDER.map(layer => {
                const items = layers[layer];
                if (!items?.length) return null;
                return (
                  <div key={layer} className="mb-1.5">
                    <div className="px-2 text-[9px] font-medium mb-0.5" style={{ color: LAYER_COLOR[layer] }}>
                      {LAYER_LABEL[layer]} <span className="text-slate-600 font-mono">({items.length})</span>
                    </div>
                    {items.map(a => {
                      const isSelected = selectedAsset?.id === a.id;
                      return (
                        <button key={a.id} onClick={() => { setSelectedAsset(a); setSelectedColumn(null); }}
                          className={`w-full text-left p-1.5 rounded mb-0.5 transition-colors flex items-center gap-2 ${
                            isSelected
                              ? 'bg-slate-800/70 border-l-2 border-slate-400'
                              : 'hover:bg-slate-800/40 border-l-2 border-transparent'
                          }`}>
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: LAYER_COLOR[layer] }}/>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] text-slate-200 truncate font-mono">{a.file_name.split('.').pop()}</div>
                            <div className="text-[9px] text-slate-600 truncate">{a.file_name}</div>
                          </div>
                          <div className="flex flex-col items-end text-[9px] flex-shrink-0">
                            <span className="text-slate-500 font-mono">{a.column_count}</span>
                            {parseInt(a.pii_count) > 0 && (
                              <span className="text-amber-500 flex items-center gap-0.5" title={`${a.pii_count} PII column(s)`}>
                                <ShieldAlert size={8}/>{a.pii_count}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="p-2 border-t border-slate-800 flex-shrink-0 space-y-1">
          <button onClick={reseed} disabled={reseedingState === 'reseeding'}
            className="w-full text-[10px] py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center gap-1 disabled:opacity-50">
            <RefreshCw size={10} className={reseedingState === 'reseeding' ? 'animate-spin' : ''}/>
            {reseedingState === 'done' ? 'Reseeded ✓' : reseedingState === 'reseeding' ? 'Reseeding...' : 'Reseed Samples'}
          </button>
        </div>
      </div>

      {/* CENTER PANE — Columns + Lineage */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-900/30 flex-shrink-0">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <GitMerge size={16} className="text-slate-500"/>Column-Level Lineage
            </h1>
            <p className="text-[10px] text-slate-500">
              {selectedAsset ? <span className="font-mono">{selectedAsset.file_name}</span> : 'Select a model on the left to inspect its columns'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-slate-500 flex items-center gap-1">
              Depth:
              <select className="input text-[10px] py-1" value={depth} onChange={e => setDepth(parseInt(e.target.value))}>
                <option value="1">1 hop</option><option value="2">2 hops</option><option value="3">3 hops</option><option value="5">5 hops</option><option value="10">10 hops</option>
              </select>
            </label>
          </div>
        </div>

        {!selectedAsset ? (
          /* Welcome view */
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-md text-center">
              <div className="w-16 h-16 rounded-full bg-slate-800/60 border border-slate-700 flex items-center justify-center mx-auto mb-4">
                <GitMerge size={28} className="text-slate-400"/>
              </div>
              <div className="text-base font-semibold text-slate-200 mb-1">Column-Level Lineage</div>
              <p className="text-xs text-slate-500 leading-relaxed mb-4">
                See exactly where each column comes from and what depends on it.
                The platform ingests <span className="text-slate-300 font-mono">dbt manifest.json</span>,
                MySQL view definitions, and Snowflake <span className="text-slate-300 font-mono">ACCESS_HISTORY</span>
                to build a full data-flow graph.
              </p>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="p-2.5 rounded border border-slate-800 bg-slate-900/50">
                  <div className="text-xl font-semibold text-slate-200">{stats.columns}</div>
                  <div className="text-slate-600 mt-0.5">Columns indexed</div>
                </div>
                <div className="p-2.5 rounded border border-slate-800 bg-slate-900/50">
                  <div className="text-xl font-semibold text-slate-200">{stats.lineage_edges}</div>
                  <div className="text-slate-600 mt-0.5">Lineage edges</div>
                </div>
                <div className="p-2.5 rounded border border-slate-800 bg-slate-900/50">
                  <div className="text-xl font-semibold text-slate-200">{stats.assets_with_columns}</div>
                  <div className="text-slate-600 mt-0.5">Models indexed</div>
                </div>
                <div className="p-2.5 rounded border border-slate-800 bg-slate-900/50">
                  <div className="text-xl font-semibold text-amber-400">{stats.pii_columns}</div>
                  <div className="text-slate-600 mt-0.5">PII columns flagged</div>
                </div>
              </div>
              <div className="mt-5 text-[10.5px] text-slate-500 leading-relaxed">
                <span className="text-slate-300">Why this matters:</span> When a CDO asks
                "if we deprecate <span className="font-mono">orders.amount</span>, what breaks?" —
                this is the page that answers in 2 seconds instead of 2 weeks.
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Column list for selected asset */}
            <div className="border-b border-slate-800">
              <div className="px-4 py-2 bg-slate-900/40 text-[10px] uppercase tracking-wider text-slate-500 flex items-center justify-between">
                <span>Columns ({columns.length})</span>
                <span className="text-slate-600">Click a column to see its lineage</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-x divide-slate-800/40">
                {columns.map(col => {
                  const isSelected = selectedColumn?.id === col.id;
                  return (
                    <button key={col.id} onClick={() => setSelectedColumn(col)}
                      className={`text-left p-2.5 border-b border-slate-800/60 transition-colors hover:bg-slate-800/40 ${
                        isSelected ? 'bg-slate-800/70 border-l-2 border-l-slate-400' : 'border-l-2 border-l-transparent'
                      }`}>
                      <div className="flex items-center gap-2 mb-0.5">
                        {col.is_primary_key && <KeyRound size={10} className="text-amber-500 flex-shrink-0" title="Primary Key"/>}
                        {col.is_pii && <ShieldAlert size={10} className="text-red-500 flex-shrink-0" title={`PII: ${col.pii_type || 'detected'}`}/>}
                        <span className="text-[11px] font-mono text-slate-200 truncate">{col.column_name}</span>
                        <span className="text-[9px] text-slate-600 font-mono">{col.data_type}</span>
                      </div>
                      {col.description && <div className="text-[10px] text-slate-500 line-clamp-1">{col.description}</div>}
                      <div className="flex items-center gap-1.5 mt-1">
                        {col.classification && (
                          <span className="text-[8.5px] px-1 py-0 rounded bg-slate-800 text-slate-400 font-mono">{col.classification}</span>
                        )}
                        {col.pii_type && (
                          <span className="text-[8.5px] px-1 py-0 rounded bg-red-950/50 text-red-300 font-mono">{col.pii_type}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lineage visualization for selected column */}
            {selectedColumn && (
              <div className="p-4">
                {/* Column header */}
                <div className="mb-4 p-3 rounded-lg border border-slate-700 bg-slate-800/40">
                  <div className="flex items-center gap-2 mb-1">
                    {selectedColumn.is_primary_key && <KeyRound size={11} className="text-amber-500"/>}
                    {selectedColumn.is_pii && <ShieldAlert size={11} className="text-red-500"/>}
                    <span className="text-sm font-mono text-slate-100">{selectedAsset.file_name.split('.').pop()}.{selectedColumn.column_name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">({selectedColumn.data_type})</span>
                  </div>
                  {selectedColumn.description && <div className="text-[11px] text-slate-400 mb-1.5">{selectedColumn.description}</div>}
                  {impact && impact.impacted_columns > 0 && (
                    <div className="text-[10px] text-amber-400/90 flex items-center gap-1.5">
                      <AlertTriangle size={10}/>
                      <span><span className="font-semibold">Impact:</span> {impact.impacted_columns} downstream columns across {impact.impacted_assets} assets ({impact.max_depth} hops max).</span>
                      <button onClick={() => setShowImpact(!showImpact)} className="ml-auto text-slate-400 hover:text-slate-200 underline">
                        {showImpact ? 'hide details' : 'view impact'}
                      </button>
                    </div>
                  )}
                </div>

                {loadingLineage ? (
                  <div className="flex items-center justify-center py-8 text-slate-500 text-xs"><Spinner size={16}/><span className="ml-2">Computing lineage...</span></div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {/* Upstream */}
                    <div>
                      <div className="flex items-center gap-2 mb-2 text-[10.5px] uppercase tracking-wider text-slate-500">
                        <ArrowLeft size={11} className="text-slate-400"/>
                        Upstream <span className="text-slate-600 normal-case">— where this came from</span>
                        <span className="ml-auto text-slate-600 font-mono normal-case">{upstream.length} edges</span>
                      </div>
                      {upstream.length === 0 ? (
                        <div className="text-[10.5px] text-slate-600 italic p-3 border border-dashed border-slate-800 rounded">
                          No upstream lineage — this column is a source / root.
                        </div>
                      ) : (
                        <LineageEdgeList edges={upstream} direction="upstream"/>
                      )}
                    </div>
                    {/* Downstream */}
                    <div>
                      <div className="flex items-center gap-2 mb-2 text-[10.5px] uppercase tracking-wider text-slate-500">
                        <ArrowRight size={11} className="text-slate-400"/>
                        Downstream <span className="text-slate-600 normal-case">— what depends on this</span>
                        <span className="ml-auto text-slate-600 font-mono normal-case">{downstream.length} edges</span>
                      </div>
                      {downstream.length === 0 ? (
                        <div className="text-[10.5px] text-slate-600 italic p-3 border border-dashed border-slate-800 rounded">
                          No downstream consumers — this column is a leaf / final output.
                        </div>
                      ) : (
                        <LineageEdgeList edges={downstream} direction="downstream"/>
                      )}
                    </div>
                  </div>
                )}

                {/* Impact details panel */}
                {showImpact && impact && impact.details.length > 0 && (
                  <div className="mt-4 p-3 rounded-lg border border-amber-900/40 bg-amber-950/10">
                    <div className="text-[11px] font-semibold text-amber-300 mb-2 flex items-center gap-1.5">
                      <AlertTriangle size={11}/>Downstream Impact Analysis
                    </div>
                    <div className="text-[10px] text-slate-400 mb-2">
                      If <span className="font-mono text-slate-200">{selectedColumn.column_name}</span> is dropped or renamed, these downstream columns will break:
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {impact.details.map((e, i) => (
                        <div key={i} className="text-[10px] p-1.5 rounded bg-slate-900/50 border border-slate-800/60 flex items-center gap-2">
                          <span className="text-[8.5px] px-1 py-0 rounded bg-slate-800 text-slate-500 font-mono">hop {e.hop}</span>
                          <span className="font-mono text-slate-300 truncate">{e.downstream_asset.split('.').pop()}.{e.downstream_column}</span>
                          <span className="ml-auto text-[8.5px] px-1 rounded bg-slate-800 text-slate-500 font-mono">{e.transformation_type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* RIGHT PANE — Ingest / Help */}
      <div className="w-72 flex-shrink-0 border-l border-slate-800 bg-slate-900/50 overflow-y-auto p-4 space-y-4">
        <div>
          <div className="text-[10.5px] uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1">
            <Sparkles size={11}/>Lineage Sources
          </div>
          <div className="space-y-1.5 text-[10.5px]">
            <div className="p-2 rounded border border-slate-800 bg-slate-900/40">
              <div className="text-slate-200 font-medium">dbt Manifest</div>
              <div className="text-slate-500 text-[10px]">Upload <span className="font-mono">manifest.json</span> from any dbt project — sources, staging, marts.</div>
              <button className="mt-1 text-[10px] text-slate-400 hover:text-slate-200 flex items-center gap-1" onClick={() => alert('Ingest API ready: POST /api/lineage/dbt/ingest with { manifest, project_name }. UI for file upload arriving in next sprint.')}>
                <Upload size={10}/>Ingest manifest
              </button>
            </div>
            <div className="p-2 rounded border border-slate-800 bg-slate-900/40 opacity-60">
              <div className="text-slate-300 font-medium">MySQL / Postgres Introspection</div>
              <div className="text-slate-500 text-[10px]">Auto-extract FKs and view definitions from existing connectors.</div>
              <div className="text-[9.5px] text-slate-600 mt-0.5 italic">Roadmap</div>
            </div>
            <div className="p-2 rounded border border-slate-800 bg-slate-900/40 opacity-60">
              <div className="text-slate-300 font-medium">Snowflake ACCESS_HISTORY</div>
              <div className="text-slate-500 text-[10px]">Column-level lineage from actual executed queries.</div>
              <div className="text-[9.5px] text-slate-600 mt-0.5 italic">Roadmap</div>
            </div>
          </div>
        </div>

        <div>
          <div className="text-[10.5px] uppercase tracking-wider text-slate-500 mb-2">Demo Story</div>
          <div className="text-[11px] text-slate-400 leading-relaxed space-y-2">
            <p>
              The sample data shipped here is a <span className="text-slate-300">FIBO-aligned banking warehouse</span> and a
              <span className="text-slate-300"> CDISC-aligned clinical trial warehouse</span>.
            </p>
            <p>Try this:</p>
            <ol className="list-decimal pl-4 space-y-1 text-slate-500">
              <li>Open <span className="font-mono text-slate-300">fact_trades</span> → click <span className="font-mono text-slate-300">notional_usd</span>.</li>
              <li>See the upstream chain: <span className="font-mono">raw_trades.notional × FX rate</span>.</li>
              <li>See downstream: it powers <span className="font-mono">mart_risk_exposure</span> and <span className="font-mono">mart_concentration_report</span>.</li>
              <li>Click "view impact" — proves the value in one screen.</li>
            </ol>
          </div>
        </div>

        <div className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/40 text-[10.5px] text-slate-400 leading-relaxed">
          <div className="flex items-center gap-1.5 text-slate-300 font-semibold mb-1">
            <Info size={11}/>Why Column-Level?
          </div>
          <p className="mb-1">
            Asset-level lineage (table → table) is the bare minimum.
            <span className="text-slate-200"> Column-level</span> answers the questions auditors and CDOs actually ask:
          </p>
          <ul className="list-disc pl-4 text-slate-500 space-y-0.5">
            <li>"Where does this PII flow?"</li>
            <li>"If I deprecate this column, what breaks?"</li>
            <li>"Can I prove this number came from approved data?"</li>
          </ul>
        </div>

        <Link to="/knowledge-graph" className="text-[10.5px] text-slate-400 hover:text-slate-200 flex items-center gap-1">
          <ExternalLink size={10}/>Open asset-level Knowledge Graph
        </Link>
      </div>
    </div>
  );
}

// ── Edge list renderer ───────────────────────────────────────────────────────
function LineageEdgeList({ edges, direction }) {
  // Group edges by hop, then by counterpart asset
  const byHop = edges.reduce((acc, e) => {
    (acc[e.hop] = acc[e.hop] || []).push(e);
    return acc;
  }, {});
  const hops = Object.keys(byHop).sort((a, b) => parseInt(a) - parseInt(b));

  return (
    <div className="space-y-2">
      {hops.map(hop => (
        <div key={hop}>
          <div className="text-[9px] text-slate-600 uppercase tracking-wider mb-1 font-mono">
            Hop {hop}
          </div>
          <div className="space-y-1">
            {byHop[hop].map((e, i) => {
              const counterpartAsset = direction === 'upstream' ? e.upstream_asset : e.downstream_asset;
              const counterpartCol   = direction === 'upstream' ? e.upstream_column : e.downstream_column;
              const counterpartLayer = direction === 'upstream' ? e.upstream_layer : e.downstream_layer;
              const tableName = counterpartAsset?.split('.').pop() || counterpartAsset;
              return (
                <div key={i} className="p-2 rounded border border-slate-800 bg-slate-900/40">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {counterpartLayer && (
                      <span className="text-[8.5px] px-1 py-0 rounded font-mono"
                        style={{ background: (LAYER_COLOR[counterpartLayer] || '#475569') + '22', color: LAYER_COLOR[counterpartLayer] || '#94a3b8' }}>
                        {counterpartLayer}
                      </span>
                    )}
                    <span className="text-[10.5px] text-slate-300 font-mono truncate">{tableName}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10.5px] font-mono text-slate-100">{counterpartCol}</span>
                    <span className="text-[8.5px] px-1 rounded bg-slate-800 text-slate-500 font-mono ml-auto">
                      {TRANSFORM_LABEL[e.transformation_type] || e.transformation_type}
                    </span>
                  </div>
                  {e.transformation_sql && (
                    <div className="text-[9.5px] text-slate-500 mt-1 p-1 rounded bg-slate-950/60 font-mono break-all">
                      {e.transformation_sql}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
