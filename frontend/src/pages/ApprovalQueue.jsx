import React, { useEffect, useState } from 'react';
import { ClipboardCheck, CheckCircle, XCircle, AlertTriangle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { Spinner, DomainBadge, ClassBadge, ZoneBadge, ReasoningTrace } from '../components/UI';
import { API, formatDate, formatTime } from '../utils/helpers';

const PRIORITY_COLORS = { CRITICAL:'border-red-700/60 bg-red-950/20', HIGH:'border-orange-700/60 bg-orange-950/20', MEDIUM:'border-yellow-700/60 bg-yellow-950/20', LOW:'border-slate-700 bg-slate-800/20' };
const CLASSES = ['PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED','TRADE_SECRET'];

function QueueItem({ item, onApprove, onReject, onEscalate, processing }) {
  const [expanded, setExpanded] = useState(false);
  const [overrideTier, setOverrideTier] = useState(item.proposed_tier);
  const hoursLeft = item.hours_remaining || 0;
  const isExpired = hoursLeft <= 0;
  const isGated = item.zone === 'GATED';

  return (
    <div className={`border rounded-xl overflow-hidden ${PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.LOW}`}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm ${isGated ? 'bg-red-900/50' : 'bg-yellow-900/50'}`}>
              {isGated ? '🔴' : '🟡'}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-200 truncate">{item.asset?.file_name || item.asset_id}</div>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {item.asset && <DomainBadge domain={item.asset.content_domain}/>}
                <ZoneBadge zone={item.zone}/>
                <span className={`badge ${item.priority==='CRITICAL'?'bg-red-900/50 text-red-300':item.priority==='HIGH'?'bg-orange-900/50 text-orange-300':'bg-yellow-900/50 text-yellow-300'}`}>{item.priority}</span>
              </div>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className={`text-xs font-medium flex items-center gap-1 justify-end ${isExpired?'text-red-400':hoursLeft<12?'text-orange-400':'text-slate-500'}`}>
              <Clock size={11}/>{isExpired ? 'EXPIRED' : `${hoursLeft}h remaining`}
            </div>
            <div className="text-[10px] text-slate-600 mt-0.5">{item.agent}</div>
          </div>
        </div>

        {/* Summary */}
        <p className="text-xs text-slate-400 mt-3 leading-relaxed">{item.reasoning_summary}</p>

        {/* Signals */}
        {item.evidence?.signals_detected?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {item.evidence.signals_detected.map(s => (
              <span key={s} className="badge bg-slate-800 text-slate-400 border border-slate-700 font-mono text-[10px]">{s.replace(/_/g,' ')}</span>
            ))}
          </div>
        )}

        {/* Classification proposal */}
        <div className="flex items-center gap-3 mt-3 p-2.5 rounded-lg bg-slate-900/50 border border-slate-800">
          <div className="flex-1 text-xs">
            <span className="text-slate-500">Current: </span><ClassBadge cls={item.current_tier}/>
            <span className="text-slate-600 mx-2">→</span>
            <span className="text-slate-500">Proposed: </span><ClassBadge cls={item.proposed_tier}/>
          </div>
          <div className="text-xs"><span className="text-slate-500">Confidence: </span><span className={`font-bold ${item.confidence>=0.85?'text-green-400':item.confidence>=0.70?'text-yellow-400':'text-red-400'}`}>{Math.round(item.confidence*100)}%</span></div>
        </div>
      </div>

      {/* Expandable reasoning */}
      <div className="border-t border-slate-800">
        <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-between px-4 py-2 text-xs text-slate-500 hover:text-slate-300 transition-colors hover:bg-slate-800/20">
          <span>Agent reasoning trace & evidence</span>
          {expanded ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
        </button>
        {expanded && (
          <div className="px-4 pb-4 space-y-3">
            {item.evidence?.reasoning_steps && <ReasoningTrace steps={item.evidence.reasoning_steps}/>}
            {item.evidence?.transcript_excerpt && (
              <div className="border border-slate-800 rounded-lg p-3 bg-slate-950">
                <div className="text-[10px] text-slate-500 mb-1 font-medium uppercase">Transcript Excerpt</div>
                <div className="text-xs text-slate-400 italic">"{item.evidence.transcript_excerpt}"</div>
              </div>
            )}
            {item.evidence?.measurement_screens && (
              <div className="text-xs text-orange-400">⚠ {item.evidence.measurement_screens} measurement screens detected — potential sensitive data</div>
            )}
            {item.evidence?.legal_hold_candidate && (
              <div className="text-xs text-red-400 font-medium">🔒 Legal hold candidate — escalate to legal team before any action</div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="border-t border-slate-800 p-4 space-y-3">
        {/* Override tier select for reject */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 flex-shrink-0">Override tier on reject:</span>
          <select className="input flex-1 py-1 text-xs" value={overrideTier} onChange={e => setOverrideTier(e.target.value)}>
            {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex gap-2">
          <button onClick={() => onApprove(item.id)} disabled={processing || isGated} title={isGated ? 'GATED — legal approval required first' : ''}
            className={`btn-success flex-1 justify-center text-xs ${isGated ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <CheckCircle size={13}/>Approve {item.proposed_tier}
          </button>
          <button onClick={() => onReject(item.id, overrideTier)} disabled={processing} className="btn-danger flex-1 justify-center text-xs">
            <XCircle size={13}/>Reject → {overrideTier}
          </button>
          <button onClick={() => onEscalate(item.id)} disabled={processing} className="btn-secondary text-xs px-3">
            <AlertTriangle size={13}/>Escalate
          </button>
        </div>
        {isGated && <div className="text-[10px] text-red-400/70 text-center">GATED zone — cannot auto-approve. Escalate to legal team.</div>}
      </div>
    </div>
  );
}

export default function ApprovalQueue() {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [resolved, setResolved] = useState([]);

  const load = async () => {
    setLoading(true);
    const d = await fetch(`${API}/queue`).then(r => r.json());
    setQueue(d.queue || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (id) => {
    setProcessing(true);
    await fetch(`${API}/queue/${id}/approve`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({approver:'steward@company.com'}) });
    setResolved(p => [...p, { id, action:'APPROVED' }]);
    setQueue(q => q.filter(i => i.id !== id));
    setProcessing(false);
  };

  const handleReject = async (id, overrideTier) => {
    setProcessing(true);
    await fetch(`${API}/queue/${id}/reject`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ approver:'steward@company.com', override_tier:overrideTier }) });
    setResolved(p => [...p, { id, action:'REJECTED', override_tier:overrideTier }]);
    setQueue(q => q.filter(i => i.id !== id));
    setProcessing(false);
  };

  const handleEscalate = async (id) => {
    await fetch(`${API}/queue/${id}/escalate`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ reason:'Legal review required' }) });
    setQueue(q => q.map(i => i.id === id ? { ...i, priority:'CRITICAL' } : i));
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2"><ClipboardCheck size={22} className="text-blue-400"/>Human Approval Queue</h1>
          <p className="text-slate-500 text-sm mt-0.5">SUPERVISED and GATED zone decisions require steward review. Agents cannot act on these autonomously.</p>
        </div>
        <button onClick={load} className="btn-secondary"><ClipboardCheck size={14}/>Refresh</button>
      </div>

      {/* HITL explanation */}
      <div className="grid grid-cols-3 gap-3 text-xs">
        {[
          { zone:'🟢 AUTONOMOUS', desc:'≥0.90 confidence · Agent acts independently · Human notified by digest', cls:'border-green-800/40 bg-green-950/10 text-green-300' },
          { zone:'🟡 SUPERVISED', desc:'0.70–0.89 confidence · Arbiter gathers evidence · Steward reviews within 48h SLA', cls:'border-yellow-800/40 bg-yellow-950/10 text-yellow-300' },
          { zone:'🔴 GATED', desc:'TRADE SECRET / ITAR / Access change · Hard gate · Legal approval mandatory · No autonomous action', cls:'border-red-800/40 bg-red-950/10 text-red-300' },
        ].map(z => (
          <div key={z.zone} className={`border rounded-lg p-3 ${z.cls}`}>
            <div className="font-semibold mb-1">{z.zone}</div>
            <div className="opacity-80 leading-relaxed">{z.desc}</div>
          </div>
        ))}
      </div>

      {/* Resolved notifications */}
      {resolved.length > 0 && (
        <div className="space-y-2">
          {resolved.map((r, i) => (
            <div key={i} className={`flex items-center gap-2 text-xs p-2.5 rounded-lg border ${r.action==='APPROVED'?'border-green-800/40 bg-green-950/20 text-green-300':'border-orange-800/40 bg-orange-950/20 text-orange-300'}`}>
              {r.action === 'APPROVED' ? <CheckCircle size={13}/> : <XCircle size={13}/>}
              {r.action === 'APPROVED' ? 'Approved — classification written to catalog' : `Rejected — reverted to ${r.override_tier}`}
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size={28}/></div>
      ) : queue.length === 0 ? (
        <div className="card p-16 text-center">
          <CheckCircle size={40} className="text-green-500 mx-auto mb-4"/>
          <div className="text-slate-300 font-semibold text-lg">Queue is clear</div>
          <div className="text-slate-600 text-sm mt-1">All assets have been reviewed. Agents are classifying autonomously where confidence allows.</div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">{queue.length} items awaiting review</span>
            <span className="text-xs text-slate-600">SLA: 48h for SUPERVISED · Legal approval for GATED</span>
          </div>
          {queue.sort((a,b) => { const order={CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3}; return (order[a.priority]||3)-(order[b.priority]||3); }).map(item => (
            <QueueItem key={item.id} item={item} onApprove={handleApprove} onReject={handleReject} onEscalate={handleEscalate} processing={processing}/>
          ))}
        </div>
      )}
    </div>
  );
}
