import React, { useEffect, useState } from 'react';
import { Shield, AlertTriangle, RefreshCw, CheckCircle, Clock, Lock } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Spinner, DomainBadge, ClassBadge } from '../components/UI';
import { API, CHART_COLORS, DOMAIN_META, formatDate } from '../utils/helpers';

const Tip = ({ active, payload }) => active && payload?.length
  ? <div className="bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-xs"><div className="text-slate-300">{payload[0].name}</div><div className="text-white font-bold">{payload[0].value}</div></div>
  : null;

const SEV_STYLE = { CRITICAL:'border-red-700/60 bg-red-950/20 text-red-300', HIGH:'border-orange-700/60 bg-orange-950/20 text-orange-300', MEDIUM:'border-yellow-700/60 bg-yellow-950/20 text-yellow-300', LOW:'border-slate-700 bg-slate-800/30 text-slate-400' };

export default function Governance() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [retention, setRetention] = useState(null);

  const load = async () => {
    setLoading(true);
    const [d, ret] = await Promise.all([
      fetch(`${API}/governance`).then(r => r.json()),
      fetch(`${API}/retention/summary`).then(r => r.json()).catch(() => null),
    ]);
    setData(d);
    setRetention(ret);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex items-center justify-center h-96"><Spinner size={32}/></div>;
  if (!data) return null;

  const retentionCards = retention ? [
    { label:'Total Assets', value:retention.total, cls:'text-slate-100' },
    { label:'On Legal Hold', value:retention.on_legal_hold, cls:retention.on_legal_hold > 0 ? 'text-red-400' : 'text-green-400', icon:Lock },
    { label:'Review Overdue', value:retention.review_overdue, cls:retention.review_overdue > 0 ? 'text-orange-400' : 'text-green-400', icon:AlertTriangle },
    { label:'Expiring < 90 Days', value:retention.expiring_soon, cls:retention.expiring_soon > 0 ? 'text-amber-400' : 'text-green-400', icon:Clock },
  ] : [];

  const eccnData = Object.entries(data.eccnBreakdown || {}).map(([name, value]) => ({ name, value }));
  const ipData = Object.entries(data.ipTierBreakdown || {}).map(([name, value]) => ({ name, value }));
  const covData = Object.entries(data.domainCoverage || {}).map(([name, pct]) => ({ name: DOMAIN_META[name]?.label || name, pct, icon: DOMAIN_META[name]?.icon }));

  return (
    <div className="p-6 space-y-6 max-w-screen-xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Governance & Compliance</h1>
          <p className="text-slate-500 text-sm mt-0.5">Governance Monitor Agent alerts · Export control · PII · Domain coverage across all 5 domains</p>
        </div>
        <button onClick={load} className="btn-secondary"><RefreshCw size={13}/>Refresh</button>
      </div>

      {/* Monitor Alerts */}
      {data.alerts?.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-4"><AlertTriangle size={15} className="text-orange-400"/>Governance Monitor Alerts ({data.alerts.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.alerts.map(a => (
              <div key={a.id} className={`border rounded-lg p-3 ${SEV_STYLE[a.severity] || SEV_STYLE.LOW}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="text-sm font-medium">{a.title}</div>
                  <span className={`badge flex-shrink-0 ${SEV_STYLE[a.severity]}`}>{a.severity}</span>
                </div>
                <div className="text-xs opacity-80 leading-relaxed">{a.description}</div>
                <div className="flex items-center justify-between mt-2 text-[10px] opacity-60">
                  <span>{a.agent}</span><span>{a.asset_count} assets affected</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Retention Policy Summary */}
      {retention && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-4"><Clock size={15} className="text-blue-400"/>Retention Policy Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {retentionCards.map(({ label, value, cls, icon: Icon }) => (
              <div key={label} className="bg-slate-800/40 rounded-xl p-4 text-center">
                <div className={`text-2xl font-bold tabular-nums ${cls}`}>{value}</div>
                <div className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-1">
                  {Icon && <Icon size={11}/>}{label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">ECCN Classification</h3>
          <div className="flex gap-3 items-center">
            <ResponsiveContainer width={120} height={120}>
              <PieChart><Pie data={eccnData} cx="50%" cy="50%" outerRadius={55} dataKey="value" nameKey="name">
                {eccnData.map((_,i)=><Cell key={i} fill={CHART_COLORS[i]}/>)}
              </Pie><Tooltip content={<Tip/>}/></PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1.5">
              {eccnData.map((e,i) => (
                <div key={e.name} className="flex items-center gap-1.5 text-xs">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:CHART_COLORS[i]}}/>
                  <span className="text-slate-400 font-mono">{e.name}</span>
                  <span className="text-slate-600 ml-auto">{e.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">IP Ownership Tiers</h3>
          <div className="flex gap-3 items-center">
            <ResponsiveContainer width={120} height={120}>
              <PieChart><Pie data={ipData} cx="50%" cy="50%" outerRadius={55} dataKey="value" nameKey="name">
                {ipData.map((_,i)=><Cell key={i} fill={CHART_COLORS[(i*3)%CHART_COLORS.length]}/>)}
              </Pie><Tooltip content={<Tip/>}/></PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1.5">
              {ipData.map((d,i) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:CHART_COLORS[(i*3)%CHART_COLORS.length]}}/>
                  <span className="text-slate-400 truncate">{d.name.replace('_',' ')}</span>
                  <span className="text-slate-600 ml-auto">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Domain Coverage</h3>
          <div className="space-y-3">
            {covData.map(({ name, pct, icon }) => (
              <div key={name}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-slate-400 flex items-center gap-1.5"><span>{icon}</span>{name}</span>
                  <span className="text-slate-400 font-medium">{pct}%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all" style={{width:`${pct}%`}}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ITAR + PII */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <AlertTriangle size={14} className="text-red-400"/>ITAR-Applicable Assets ({data.itarCount})
          </h3>
          {data.itarCount === 0
            ? <div className="flex items-center gap-2 text-green-400 text-sm"><CheckCircle size={16}/>No ITAR-flagged assets</div>
            : <div className="space-y-2">
                {data.itarAssets?.map(a => (
                  <div key={a.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-red-950/20 border border-red-800/30 text-xs">
                    <DomainBadge domain={a.content_domain}/><span className="text-slate-300 truncate">{a.file_name}</span>
                    <span className="text-red-400 ml-auto flex-shrink-0">ITAR</span>
                  </div>
                ))}
                {data.itarCount > 5 && <div className="text-xs text-slate-600 text-center">+ {data.itarCount - 5} more</div>}
              </div>
          }
        </div>

        <div className="card p-4">
          <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <Shield size={14} className="text-amber-400"/>PII-Detected Assets ({data.piiCount})
          </h3>
          {data.piiCount === 0
            ? <div className="flex items-center gap-2 text-green-400 text-sm"><CheckCircle size={16}/>No PII flagged</div>
            : <div className="space-y-2">
                {data.piiAssets?.map(a => (
                  <div key={a.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-950/20 border border-amber-800/30 text-xs">
                    <DomainBadge domain={a.content_domain}/>
                    <div className="min-w-0 flex-1"><div className="text-slate-300 truncate">{a.file_name}</div><div className="text-slate-600">{a.pii_flag?.pii_types?.join(', ')}</div></div>
                  </div>
                ))}
                {data.piiCount > 5 && <div className="text-xs text-slate-600 text-center">+ {data.piiCount - 5} more</div>}
              </div>
          }
        </div>
      </div>

      {/* Low quality */}
      {data.lowQualityCount > 0 && (
        <div className="card p-4 border-slate-700">
          <h3 className="text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2">
            <AlertTriangle size={14} className="text-yellow-400"/>Low Quality Score — {data.lowQualityCount} assets below 60%
          </h3>
          <p className="text-xs text-slate-500">These assets have incomplete metadata or low extraction confidence. Recommend scheduling a re-enrichment cycle with the Classification Arbiter Agent.</p>
        </div>
      )}
    </div>
  );
}
