import React, { useEffect, useState, useCallback } from 'react';
import { Search, Filter, RefreshCw, ChevronLeft, ChevronRight, Download, Network, Plug, Sparkles, MessageSquare } from 'lucide-react';
import { FolderSearch } from 'lucide-react';
import { AssetCard, AssetDetailPanel, Spinner, EmptyState, ErrorBoundary } from '../components/UI';
import { API, DOMAIN_META } from '../utils/helpers';
import { useNavigate } from 'react-router-dom';

const DOMAINS = Object.keys(DOMAIN_META);
const CLASSES = ['PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','TRADE_SECRET'];
const ZONES = ['AUTONOMOUS','SUPERVISED','GATED','PENDING_REVIEW'];

export default function Catalog() {
  const [assets, setAssets] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [enriching, setEnriching] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [activeDomain, setActiveDomain] = useState('');
  const [filters, setFilters] = useState({ search:'', classification:'', zone:'', project:'' });
  const [nlqQuery, setNlqQuery] = useState('');
  const [nlqResult, setNlqResult] = useState(null);
  const [nlqLoading, setNlqLoading] = useState(false);
  const navigate = useNavigate();

  const handleNlq = async () => {
    if (!nlqQuery.trim()) return;
    setNlqLoading(true); setNlqResult(null);
    try {
      const d = await fetch(`${API}/nlq`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ query:nlqQuery }) }).then(r=>r.json());
      setNlqResult(d);
      setAssets(d.results || []); setTotal(d.total || 0); setPages(1); setPage(1);
    } catch(e) { setNlqResult({ interpretation:'Search failed', suggestion:e.message }); }
    setNlqLoading(false);
  };

  const clearNlq = () => { setNlqQuery(''); setNlqResult(null); fetchAssets(1); };

  const fetchAssets = useCallback(async (p = 1) => {
    setLoading(true);
    const params = new URLSearchParams({ page:p, limit:15, ...(activeDomain && {domain:activeDomain}), ...Object.fromEntries(Object.entries(filters).filter(([,v])=>v)) });
    const d = await fetch(`${API}/catalog?${params}`).then(r => r.json());
    setAssets(d.assets || []); setTotal(d.total || 0); setPages(d.pages || 1); setPage(p);
    setLoading(false);
  }, [activeDomain, filters]);

  useEffect(() => { fetchAssets(1); }, [activeDomain, filters]);

  const [analyzing, setAnalyzing] = useState(false);

  const handleEnrich = async (id) => {
    setEnriching(true);
    const d = await fetch(`${API}/enrich/${id}`, { method:'POST' }).then(r => r.json());
    setSelected(d.asset);
    setAssets(prev => prev.map(a => a.id === id ? d.asset : a));
    setEnriching(false);
  };

  const handleAnalyze = async (id) => {
    setAnalyzing(true);
    const d = await fetch(`${API}/analyze/${id}`, { method:'POST' }).then(r => r.json());
    setSelected(d.asset);
    setAssets(prev => prev.map(a => a.id === id ? d.asset : a));
    setAnalyzing(false);
  };

  const handleInvestigate = (id) => navigate(`/investigate?asset=${id}`);

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 pb-3 border-b border-slate-800 space-y-3 flex-shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-slate-100">Asset Catalog</h1>
            <span className="text-xs text-slate-500">{total} assets</span>
            <div className="flex-1"/>
            <button onClick={() => window.open(`${API}/export/csv`)} className="btn-secondary"><Download size={13}/>CSV</button>
            <button onClick={() => fetchAssets(page)} className="btn-ghost"><RefreshCw size={13}/></button>
            <button onClick={() => setShowFilters(s => !s)} className={`btn-secondary ${showFilters ? 'border-blue-600 text-blue-400' : ''}`}><Filter size={13}/>Filters</button>
          </div>

          {/* NLQ Search Bar */}
          <div className="relative">
            <MessageSquare size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-400"/>
            <input className="input w-full pl-9 pr-24 border-purple-800/30 focus:border-purple-600/50"
              placeholder="Ask anything… e.g. 'show me all confidential PDFs' or 'which files need review?'"
              value={nlqQuery}
              onChange={e => setNlqQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleNlq()}/>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
              {nlqResult && <button onClick={clearNlq} className="text-[10px] text-slate-500 hover:text-slate-300 px-1.5">Clear</button>}
              <button onClick={handleNlq} disabled={nlqLoading || !nlqQuery.trim()} className="btn-primary text-[10px] px-2 py-1">
                {nlqLoading ? <Spinner size={10}/> : <><Sparkles size={10}/>Ask AI</>}
              </button>
            </div>
          </div>
          {nlqResult && (
            <div className="border border-purple-800/30 rounded-lg p-3 bg-purple-950/10 space-y-1.5">
              <div className="flex items-start gap-2">
                <Sparkles size={13} className="text-purple-400 flex-shrink-0 mt-0.5"/>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-purple-300 font-medium">{nlqResult.interpretation}</div>
                  {nlqResult.suggestion && <div className="text-[10px] text-slate-500 mt-1">{nlqResult.suggestion}</div>}
                </div>
                <div className="text-xs text-slate-500 flex-shrink-0">{nlqResult.total} result{nlqResult.total !== 1 ? 's' : ''}</div>
              </div>
              {nlqResult.filters && Object.keys(nlqResult.filters).filter(k => nlqResult.filters[k]).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(nlqResult.filters).filter(([,v]) => v).map(([k,v]) => (
                    <span key={k} className="badge bg-purple-900/30 text-purple-300 border border-purple-700/30 text-[10px]">{k}: {String(v)}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Domain tabs */}
          <div className="flex gap-1 overflow-x-auto pb-1">
            <button onClick={() => setActiveDomain('')} className={`px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0 transition-all ${!activeDomain ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>All ({total})</button>
            {DOMAINS.map(d => {
              const m = DOMAIN_META[d];
              return (
                <button key={d} onClick={() => setActiveDomain(activeDomain === d ? '' : d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0 flex items-center gap-1.5 transition-all ${activeDomain === d ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
                  <span>{m.icon}</span>{m.label}
                </button>
              );
            })}
          </div>

          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"/>
            <input className="input w-full pl-9" placeholder="Search files, projects…" value={filters.search} onChange={e => setFilters(p => ({...p, search:e.target.value}))}/>
          </div>

          {showFilters && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <select className="input" value={filters.classification} onChange={e => setFilters(p=>({...p,classification:e.target.value}))}>
                <option value="">All Classifications</option>
                {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="input" value={filters.zone} onChange={e => setFilters(p=>({...p,zone:e.target.value}))}>
                <option value="">All Zones</option>
                {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
              <input className="input" placeholder="Project code…" value={filters.project} onChange={e => setFilters(p=>({...p,project:e.target.value}))}/>
              <button onClick={() => setFilters({search:'',classification:'',zone:'',project:''})} className="btn-ghost text-slate-500 text-xs">Clear filters</button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? <div className="flex justify-center py-20"><Spinner size={28}/></div>
          : assets.length === 0 ? <EmptyState icon={FolderSearch} title="No assets found" desc="Try adjusting your filters."/>
          : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {assets.map(a => <AssetCard key={a.id} asset={a} onClick={setSelected} selected={selected?.id === a.id}/>)}
            </div>}
        </div>

        {pages > 1 && (
          <div className="border-t border-slate-800 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <span className="text-xs text-slate-500">Page {page} of {pages} · {total} assets</span>
            <div className="flex gap-1">
              <button onClick={() => fetchAssets(page-1)} disabled={page===1} className="btn-ghost px-2 disabled:opacity-30"><ChevronLeft size={14}/></button>
              {Array.from({length:Math.min(5,pages)},(_,i)=>{const pg=Math.max(1,Math.min(pages-4,page-2))+i; return <button key={pg} onClick={()=>fetchAssets(pg)} className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${pg===page?'bg-blue-600 text-white':'text-slate-400 hover:bg-slate-800'}`}>{pg}</button>;}).filter(Boolean)}
              <button onClick={() => fetchAssets(page+1)} disabled={page===pages} className="btn-ghost px-2 disabled:opacity-30"><ChevronRight size={14}/></button>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <div className="w-80 flex-shrink-0 border-l border-slate-800 flex flex-col">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
            <span className="text-sm font-medium text-slate-300">Asset Details</span>
            <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-slate-300 text-xs">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <ErrorBoundary key={selected?.id}>
              <AssetDetailPanel asset={selected} onEnrich={handleEnrich} enriching={enriching} onInvestigate={handleInvestigate} onAnalyze={handleAnalyze} analyzing={analyzing}/>
            </ErrorBoundary>
          </div>
        </div>
      )}
    </div>
  );
}
