import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle, Clock, Shield, FileSearch, TrendingUp, Database, Zap, Activity, ChevronRight, Plug, FolderKanban, BarChart3, Lock } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Spinner, ClassBadge } from '../components/UI';
import { API, CHART_COLORS, ZONE_META, DOMAIN_META, CLASS_META, formatDate } from '../utils/helpers';

const Tip = ({ active, payload }) => active && payload?.length
  ? <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs shadow-xl"><div className="text-slate-300">{payload[0].name}</div><div className="text-white font-bold">{payload[0].value}</div></div>
  : null;

function ComplianceRing({ score }) {
  const color = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  const label = score >= 75 ? 'GOOD STANDING' : score >= 50 ? 'NEEDS ATTENTION' : 'AT RISK';
  const r = 52, circ = 2 * Math.PI * r;
  const dash = circ * (score / 100);
  return (
    <div className="flex flex-col items-center justify-center">
      <svg width={136} height={136} viewBox="0 0 136 136">
        <circle cx={68} cy={68} r={r} fill="none" stroke="#1e293b" strokeWidth={12}/>
        <circle cx={68} cy={68} r={r} fill="none" stroke={color} strokeWidth={12}
          strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ * 0.25}
          strokeLinecap="round" style={{transition:'stroke-dasharray 1.2s ease'}}/>
        <text x={68} y={63} textAnchor="middle" fill="white" fontSize="26" fontWeight="800" fontFamily="Inter">{score}%</text>
        <text x={68} y={80} textAnchor="middle" fill="#64748b" fontSize="8.5" fontFamily="Inter">COMPLIANCE</text>
      </svg>
      <div className="text-xs font-bold" style={{color}}>{label}</div>
    </div>
  );
}

function ActionItem({ severity, title, description, count, to }) {
  const navigate = useNavigate();
  const s = { CRITICAL:{ bar:'bg-red-500', bg:'bg-red-950/20', border:'border-red-800/40', badge:'bg-red-900/50 text-red-300' }, HIGH:{ bar:'bg-orange-500', bg:'bg-orange-950/20', border:'border-orange-800/40', badge:'bg-orange-900/50 text-orange-300' }, MEDIUM:{ bar:'bg-yellow-500', bg:'bg-yellow-950/10', border:'border-yellow-800/30', badge:'bg-yellow-900/50 text-yellow-300' } }[severity] || { bar:'bg-slate-500', bg:'bg-slate-800/30', border:'border-slate-700', badge:'bg-slate-800 text-slate-400' };
  return (
    <div onClick={() => navigate(to)} className={`flex items-center gap-3 p-3 rounded-xl border ${s.border} ${s.bg} cursor-pointer hover:opacity-90 transition-opacity group`}>
      <div className={`w-1 h-12 rounded-full flex-shrink-0 ${s.bar}`}/>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-slate-200">{title}</span>
          <span className={`badge text-[10px] ${s.badge}`}>{severity}</span>
          <span className="text-xs font-bold text-white bg-slate-700 px-2 py-0.5 rounded-full">{count}</span>
        </div>
        <div className="text-xs text-slate-500 mt-0.5 truncate">{description}</div>
      </div>
      <ChevronRight size={14} className="text-slate-600 flex-shrink-0 group-hover:text-slate-400 transition-colors"/>
    </div>
  );
}

export default function Dashboard({ events = [] }) {
  const [stats, setStats] = useState(null);
  const [queue, setQueue] = useState([]);
  const [gov, setGov] = useState(null);
  const [projects, setProjects] = useState([]);
  const [retention, setRetention] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      fetch(`${API}/stats`).then(r=>r.json()),
      fetch(`${API}/queue`).then(r=>r.json()),
      fetch(`${API}/governance`).then(r=>r.json()),
      fetch(`${API}/projects`, { headers: { Authorization: `Bearer ${localStorage.getItem('cude_token')}` } }).then(r=>r.json()).catch(()=>({ projects:[] })),
      fetch(`${API}/retention/summary`).then(r=>r.json()).catch(()=>null),
    ]).then(([s,q,g,p,ret]) => { setStats(s); setQueue(q.queue||[]); setGov(g); setProjects(p.projects||[]); setRetention(ret); setLoading(false); })
    .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-96"><Spinner size={32}/></div>;
  if (!stats) return <div className="p-8 text-slate-500">Backend not reachable — ensure backend is running on port 3001.</div>;

  if (stats.total === 0) return (
    <div className="flex flex-col items-center justify-center h-full min-h-screen text-center p-10">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-blue-700/30 flex items-center justify-center mb-6">
        <Database size={36} className="text-blue-400"/>
      </div>
      <h2 className="text-2xl font-bold text-slate-100 mb-2">No Assets Discovered Yet</h2>
      <p className="text-slate-500 text-sm max-w-md mb-8 leading-relaxed">
        Create a <strong className="text-blue-400">Project</strong>, configure connectors, and run discovery to start governing your unstructured data.
      </p>
      <div className="flex gap-3">
        <button onClick={() => navigate('/projects')} className="btn-primary text-sm px-6 py-3"><FolderKanban size={16}/>Create Project</button>
      </div>
    </div>
  );

  // ── Compliance Score — realistic calculation ──────────────────────────────
  // Based on: % classified (auto or approved), % reviewed, no outstanding critical items
  const totalAssets = stats.total || 1;
  const classifiedPct = stats.pipeline_health || 0; // % in AUTONOMOUS zone
  const pendingPct = Math.round((stats.pending_approvals || 0) / totalAssets * 100);
  const reviewedPct = Math.round(((stats.zone_counts?.AUTONOMOUS || 0) + (stats.zone_counts?.CATALOGUED || 0)) / totalAssets * 100);
  const hasCriticalIssues = (stats.itar_flagged || 0) > 0 || (queue.filter(q => q.zone === 'GATED').length > 0);

  let complianceScore = Math.round(
    (classifiedPct * 0.4) +                                    // 40% weight: auto-classified assets
    (Math.max(0, 100 - pendingPct * 2) * 0.3) +              // 30% weight: low pending queue
    ((stats.avg_confidence || 0) * 100 * 0.2) +              // 20% weight: average confidence
    (hasCriticalIssues ? 0 : 10)                               // 10% bonus: no critical issues
  );
  complianceScore = Math.max(10, Math.min(100, complianceScore));

  const gatedItems     = queue.filter(q => q.zone === 'GATED');
  const supervisedItems= queue.filter(q => q.zone === 'SUPERVISED' || q.zone === 'PENDING_REVIEW');
  const overdueItems   = queue.filter(q => q.hours_remaining <= 12 && q.hours_remaining >= 0);
  const highAlerts     = gov?.alerts?.filter(a => ['HIGH','CRITICAL'].includes(a.severity)) || [];

  const domainData = Object.entries(stats.domain_counts||{}).map(([name,value])=>({ name: DOMAIN_META[name]?.label||name, value, icon: DOMAIN_META[name]?.icon }));
  const classData  = Object.entries(stats.class_counts||{}).map(([name,value])=>({ name, value })).sort((a,b)=>b.value-a.value);

  const BAR_COLORS = { PUBLIC:'bg-green-500', INTERNAL:'bg-blue-500', CONFIDENTIAL:'bg-yellow-500', RESTRICTED:'bg-orange-500', TRADE_SECRET:'bg-red-500' };
  const ZONE_BAR   = { AUTONOMOUS:'bg-green-500', SUPERVISED:'bg-yellow-500', GATED:'bg-red-500', PENDING_REVIEW:'bg-orange-500' };

  return (
    <div className="p-5 space-y-5 max-w-screen-2xl">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Governance Overview</h1>
          <p className="text-slate-500 text-sm mt-0.5">{stats.total.toLocaleString()} assets under governance across {Object.keys(stats.domain_counts||{}).length} content domains</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {gatedItems.length > 0 && <button onClick={()=>navigate('/queue')} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-900/40 border border-red-700/50 text-red-300 text-xs font-medium hover:bg-red-900/60 transition-colors"><AlertTriangle size={12}/>{gatedItems.length} legal approval needed</button>}
          {overdueItems.length > 0 && <button onClick={()=>navigate('/queue')} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-900/30 border border-orange-800/40 text-orange-300 text-xs font-medium"><Clock size={12}/>{overdueItems.length} SLA expiring</button>}
        </div>
      </div>

      {/* Top Row: Compliance + Actions Today */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 flex flex-col items-center justify-center text-center gap-4">
          <ComplianceRing score={complianceScore}/>
          <div className="grid grid-cols-2 gap-3 w-full">
            <div className="bg-slate-800/50 rounded-xl p-3">
              <div className="text-xl font-bold text-slate-100">{classifiedPct}%</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Auto-Classified</div>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-3">
              <div className="text-xl font-bold text-slate-100">{Math.round((stats.avg_confidence||0)*100)}%</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Avg Confidence</div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2"><AlertTriangle size={14} className="text-orange-400"/>Actions Required</h3>
            <button onClick={()=>navigate('/queue')} className="text-xs text-blue-400 hover:text-blue-300">View queue →</button>
          </div>
          <div className="space-y-2">
            {gatedItems.length > 0 && <ActionItem severity="CRITICAL" title="Legal Approval Required" description={`${gatedItems.length} file${gatedItems.length>1?'s':''} in Gated zone — TRADE SECRET or ITAR content. Legal review mandatory.`} count={gatedItems.length} to="/queue"/>}
            {overdueItems.length > 0 && <ActionItem severity="HIGH" title="SLA Expiring" description={`${overdueItems.length} review${overdueItems.length>1?'s':''} approaching 48-hour deadline. Steward action needed.`} count={overdueItems.length} to="/queue"/>}
            {stats.itar_flagged > 0 && <ActionItem severity="HIGH" title="ITAR-Flagged Assets" description={`${stats.itar_flagged} asset${stats.itar_flagged>1?'s':''} flagged for export control review.`} count={stats.itar_flagged} to="/governance"/>}
            {supervisedItems.length > 0 && <ActionItem severity="MEDIUM" title="Classifications Pending Review" description={`${supervisedItems.length} asset${supervisedItems.length>1?'s':''} below confidence threshold. Your review determines final classification.`} count={supervisedItems.length} to="/queue"/>}
            {highAlerts.slice(0,2).map((a,i) => <ActionItem key={i} severity="MEDIUM" title={a.title} description={a.description} count={a.asset_count} to="/governance"/>)}
            {gatedItems.length===0 && stats.itar_flagged===0 && supervisedItems.length===0 && overdueItems.length===0 && (
              <div className="flex items-center gap-3 p-4 rounded-xl border border-green-800/30 bg-green-950/20">
                <CheckCircle size={20} className="text-green-400 flex-shrink-0"/>
                <div><div className="text-sm font-medium text-green-300">All clear — no urgent actions</div><div className="text-xs text-slate-500 mt-0.5">All assets are classified and approved. Governance posture is healthy.</div></div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI Bar — meaningful metrics only */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label:'Total Assets', value:stats.total.toLocaleString(), Icon:Database, a:'blue' },
          { label:'Content Domains', value:Object.keys(stats.domain_counts||{}).length, Icon:FileSearch, a:'purple' },
          { label:'Auto-Classified', value:`${classifiedPct}%`, Icon:Activity, a:'green' },
          { label:'Awaiting Review', value:stats.pending_approvals, Icon:Clock, a:'amber', alert:stats.pending_approvals>0 },
          { label:'ITAR Flagged', value:stats.itar_flagged, Icon:Shield, a:'red', alert:stats.itar_flagged>0 },
          { label:'Avg Confidence', value:`${Math.round((stats.avg_confidence||0)*100)}%`, Icon:TrendingUp, a:'teal' },
        ].map(({ label, value, Icon, a, alert }) => {
          const c = { blue:'text-blue-400 bg-blue-500/10', purple:'text-purple-400 bg-purple-500/10', teal:'text-teal-400 bg-teal-500/10', green:'text-green-400 bg-green-500/10', amber:'text-amber-400 bg-amber-500/10', red:'text-red-400 bg-red-500/10' }[a]||'text-blue-400 bg-blue-500/10';
          const [tc,bg] = c.split(' ');
          return (
            <div key={label} className={`card p-4 ${alert&&value>0?'border-red-800/50':''}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium leading-tight">{label}</div>
                <div className={`w-7 h-7 rounded-md ${bg} flex items-center justify-center flex-shrink-0`}><Icon size={13} className={tc}/></div>
              </div>
              <div className={`text-xl font-bold tabular-nums ${alert&&value>0?'text-red-400':'text-slate-100'}`}>{value}</div>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Sensitivity distribution */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2"><Shield size={14} className="text-blue-400"/>Sensitivity Distribution</h3>
          <div className="space-y-3">
            {classData.map(c => {
              const pct = Math.round(c.value / totalAssets * 100);
              return (
                <div key={c.name}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <ClassBadge cls={c.name}/>
                    <span className="text-slate-400 font-bold">{c.value} <span className="text-slate-600 font-normal">({pct}%)</span></span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${BAR_COLORS[c.name]||'bg-slate-500'} transition-all duration-1000`} style={{width:`${pct}%`}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Domain coverage */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2"><Database size={14} className="text-blue-400"/>Content Domain Coverage</h3>
          <div className="flex gap-3 items-center">
            <ResponsiveContainer width={120} height={130}>
              <PieChart><Pie data={domainData} cx="50%" cy="50%" outerRadius={55} dataKey="value" nameKey="name">
                {domainData.map((_,i)=><Cell key={i} fill={CHART_COLORS[i]}/>)}
              </Pie><Tooltip content={<Tip/>}/></PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2.5">
              {domainData.map((d,i) => (
                <div key={d.name} className="flex items-center gap-2 text-xs cursor-pointer hover:opacity-80" onClick={()=>navigate('/catalog')}>
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:CHART_COLORS[i]}}/>
                  <span className="text-slate-400 truncate flex-1">{d.icon} {d.name}</span>
                  <span className="text-slate-300 font-bold">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
          <button onClick={()=>navigate('/catalog')} className="mt-3 w-full text-xs text-center text-blue-400 hover:text-blue-300 transition-colors">Browse all assets →</button>
        </div>

        {/* Zone health */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2"><Activity size={14} className="text-blue-400"/>Classification Zone Health</h3>
          <div className="space-y-3">
            {Object.entries(ZONE_META).map(([zone, meta]) => {
              const count = stats.zone_counts?.[zone] || 0;
              const pct   = Math.round(count / totalAssets * 100);
              return (
                <div key={zone}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-300 flex items-center gap-1.5"><span>{meta.icon}</span>{meta.label}</span>
                    <span className="text-slate-400 font-bold">{count} <span className="text-slate-600 font-normal">({pct}%)</span></span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${ZONE_BAR[zone]||'bg-slate-500'}`} style={{width:`${pct}%`}}/>
                  </div>
                  <div className="text-[10px] text-slate-600 mt-0.5">{meta.desc}</div>
                </div>
              );
            })}
          </div>
          {stats.pending_approvals > 0 && (
            <button onClick={()=>navigate('/queue')} className="mt-4 btn-danger w-full justify-center text-xs">
              <Clock size={12}/>{stats.pending_approvals} pending — review now
            </button>
          )}
        </div>
      </div>

      {/* Bottom Row: Projects + Retention + Export Control */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Active Projects */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2"><FolderKanban size={14} className="text-blue-400"/>Active Projects</h3>
            <button onClick={()=>navigate('/projects')} className="text-xs text-blue-400 hover:text-blue-300">View all →</button>
          </div>
          {projects.length === 0 ? (
            <div className="text-center py-6">
              <div className="text-slate-600 text-sm">No projects created yet</div>
              <button onClick={()=>navigate('/projects')} className="btn-primary text-xs mt-3"><FolderKanban size={12}/>Create Project</button>
            </div>
          ) : (
            <div className="space-y-2">
              {projects.slice(0,4).map(p => (
                <div key={p.id} onClick={()=>navigate(`/projects/${p.id}`)} className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-800 hover:border-slate-700 cursor-pointer transition-colors">
                  <FolderKanban size={14} className="text-blue-400 flex-shrink-0"/>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-slate-300 truncate">{p.name}</div>
                    <div className="text-[10px] text-slate-600 font-mono">{p.code}</div>
                  </div>
                  <ClassBadge cls={p.sensitivity_ceiling}/>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Retention Overview */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2"><Lock size={14} className="text-blue-400"/>Retention & Legal Hold</h3>
          {retention ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/40 rounded-xl p-3 text-center">
                  <div className={`text-lg font-bold ${retention.on_legal_hold > 0 ? 'text-red-400' : 'text-green-400'}`}>{retention.on_legal_hold}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">On Legal Hold</div>
                </div>
                <div className="bg-slate-800/40 rounded-xl p-3 text-center">
                  <div className={`text-lg font-bold ${retention.review_overdue > 0 ? 'text-orange-400' : 'text-green-400'}`}>{retention.review_overdue}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Review Overdue</div>
                </div>
              </div>
              <div className="bg-slate-800/40 rounded-xl p-3 text-center">
                <div className={`text-lg font-bold ${retention.expiring_soon > 0 ? 'text-amber-400' : 'text-slate-100'}`}>{retention.expiring_soon}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Expiring Within 90 Days</div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-slate-600 text-sm">Retention data not available</div>
          )}
        </div>

        {/* Export Control Summary */}
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2"><Shield size={14} className="text-blue-400"/>Export Control (EAR)</h3>
          {gov?.eccnBreakdown ? (
            <div className="space-y-2">
              {Object.entries(gov.eccnBreakdown).sort(([,a],[,b])=>b-a).map(([eccn, count]) => (
                <div key={eccn} className="flex items-center justify-between p-2 rounded-lg bg-slate-800/30">
                  <span className={`text-xs font-mono ${eccn.startsWith('3E') ? 'text-orange-300' : 'text-slate-400'}`}>{eccn}</span>
                  <span className="text-xs text-slate-300 font-bold">{count}</span>
                </div>
              ))}
              {stats.itar_flagged > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-red-950/20 border border-red-800/30 text-xs text-red-300">
                  <AlertTriangle size={12}/> {stats.itar_flagged} ITAR-applicable asset{stats.itar_flagged > 1 ? 's' : ''}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-6 text-slate-600 text-sm">No export control data</div>
          )}
        </div>
      </div>

    </div>
  );
}
