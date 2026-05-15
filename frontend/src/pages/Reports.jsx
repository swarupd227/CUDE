import React, { useState } from 'react';
import { FileText, Sparkles, Printer, Download, RefreshCw, AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';
import { Spinner, ReasoningTrace } from '../components/UI';
import { API, DOMAIN_META } from '../utils/helpers';

function RiskGauge({ score }) {
  const color = score >= 70 ? '#ef4444' : score >= 40 ? '#f59e0b' : '#10b981';
  const label = score >= 70 ? 'HIGH RISK' : score >= 40 ? 'MEDIUM RISK' : 'LOW RISK';
  const circ = 2 * Math.PI * 60;
  const dash = circ * 0.75 * (score / 100);
  const offset = -circ * 0.625;
  return (
    <div className="flex flex-col items-center">
      <svg width={160} height={105} viewBox="0 0 160 115">
        <circle cx={80} cy={80} r={60} fill="none" stroke="#1e293b" strokeWidth={12} strokeDasharray={circ*0.75} strokeDashoffset={offset} strokeLinecap="round"/>
        <circle cx={80} cy={80} r={60} fill="none" stroke={color} strokeWidth={12} strokeDasharray={`${dash} ${circ}`} strokeDashoffset={offset} strokeLinecap="round" style={{transition:'stroke-dasharray 1.2s ease'}}/>
        <text x={80} y={76} textAnchor="middle" fill="white" fontSize="24" fontWeight="800" fontFamily="Inter">{score}</text>
        <text x={80} y={94} textAnchor="middle" fill="#64748b" fontSize="9" fontFamily="Inter">RISK SCORE</text>
      </svg>
      <div className="text-xs font-bold mt-1" style={{color}}>{label}</div>
    </div>
  );
}

function printReport(report) {
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>CUDE Compliance Report</title>
<style>body{font-family:Arial,sans-serif;padding:40px;color:#111;max-width:900px;margin:0 auto;}h1{color:#1B3A6B;border-bottom:3px solid #2E5FA3;padding-bottom:10px;}h2{color:#2E5FA3;margin-top:28px;font-size:16px;}
table{width:100%;border-collapse:collapse;margin:12px 0;}th{background:#1B3A6B;color:#fff;padding:7px 12px;text-align:left;font-size:12px;}td{padding:6px 12px;border-bottom:1px solid #e5e7eb;font-size:12px;}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin:16px 0;}.stat{border:1px solid #e5e7eb;padding:14px;border-radius:8px;}.stat-val{font-size:26px;font-weight:800;color:#1B3A6B;}
ul{margin:8px 0;padding-left:20px;}li{margin:4px 0;font-size:12px;}@media print{@page{margin:20mm;}}</style></head><body>
<h1>CUDE Governance Compliance Report</h1><p style="color:#666;font-size:12px">Generated: ${new Date(report.generated_at).toLocaleString()} · Report ID: ${report.report_id} · Powered by CUDE Platform + Claude AI</p>
<div class="grid">
<div class="stat"><div class="stat-val">${report.stats?.total}</div><div style="color:#666;font-size:11px">Total Assets</div></div>
<div class="stat"><div class="stat-val">${report.compliance_score}%</div><div style="color:#666;font-size:11px">Compliance Score</div></div>
<div class="stat"><div class="stat-val">${report.risk_score}</div><div style="color:#666;font-size:11px">Risk Score</div></div>
</div>
<h2>Executive Summary</h2><p>${report.executive_summary}</p>
<h2>Domain Distribution</h2><table><thead><tr><th>Domain</th><th>Asset Count</th></tr></thead><tbody>
${Object.entries(report.stats?.by_domain||{}).map(([d,v])=>`<tr><td>${d}</td><td>${v}</td></tr>`).join('')}</tbody></table>
<h2>Top Risks</h2><ul>${report.top_risks?.map(r=>`<li>${r}</li>`).join('')||''}</ul>
<h2>Priority Actions</h2><ul>${report.priority_actions?.map(a=>`<li>${a}</li>`).join('')||''}</ul>
<h2>Recommendations</h2><ul>${report.recommendations?.map(r=>`<li>${r}</li>`).join('')||''}</ul>
<h2>Domain Insights</h2>${Object.entries(report.domain_insights||{}).map(([d,v])=>`<p><strong>${d}:</strong> ${v}</p>`).join('')}
<p style="margin-top:40px;border-top:1px solid #e5e7eb;padding-top:12px;color:#9ca3af;font-size:10px">Confidential — Internal Use Only · CUDE Platform v3.0</p>
<script>window.print();</script></body></html>`);
  w.document.close();
}

export default function Reports() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  const generate = async () => {
    setLoading(true); setError(null);
    try {
      const d = await fetch(`${API}/reports/generate`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({type:'FULL_AUDIT'}) }).then(r => r.json());
      setReport(d);
    } catch(e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Compliance Reports</h1>
          <p className="text-slate-500 text-sm mt-0.5">Compliance Reporter — autonomous evidence trail construction across all 5 content domains</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <button onClick={() => window.open(`${API}/export/csv`)} className="btn-secondary"><Download size={13}/>Export CSV</button>
          {report && <button onClick={() => printReport(report)} className="btn-secondary"><Printer size={13}/>Print / PDF</button>}
          <button onClick={generate} disabled={loading} className="btn-primary">
            {loading ? <><Spinner size={14}/>A6 Reporter Running…</> : <><Sparkles size={14}/>{report ? 'Regenerate' : 'Generate Audit Report'}</>}
          </button>
        </div>
      </div>

      {error && <div className="card border-red-800/50 p-4 text-red-400 text-sm">{error}</div>}

      {!report && !loading && (
        <div className="card p-16 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-600/20 to-blue-600/20 border border-pink-700/30 flex items-center justify-center mb-5">
            <FileText size={30} className="text-pink-400"/>
          </div>
          <div className="text-slate-300 font-semibold text-xl mb-2">Compliance Reporter</div>
          <div className="text-slate-600 text-sm max-w-md mb-6">The Reporter Agent autonomously traverses the catalog, access logs, and lineage graph to build a full compliance audit. It follows the ReAct pattern — observe, reason, query tools, synthesize.</div>
          <div className="grid grid-cols-3 gap-3 text-xs text-slate-500 max-w-lg">
            {[['📋','Export Control Analysis'],['🛡️','ITAR Flag Summary'],['🤖','AI Risk Scoring'],['📊','Domain Coverage'],['🔒','PII Governance'],['📈','Compliance Score']].map(([i,l])=>(
              <div key={l} className="flex flex-col items-center gap-1 p-3 rounded-lg bg-slate-800/30 border border-slate-800"><span className="text-lg">{i}</span><span>{l}</span></div>
            ))}
          </div>
        </div>
      )}

      {loading && <div className="card p-20 flex flex-col items-center gap-4"><Spinner size={36}/><div className="text-slate-400 text-sm">Compliance Reporter is traversing the catalog and constructing your compliance report…</div></div>}

      {report && (
        <div className="space-y-5">
          {/* Report header */}
          <div className="card p-5 border-pink-800/30 bg-pink-950/10">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-slate-500 mb-1">Report ID: <span className="font-mono text-slate-400">{report.report_id}</span></div>
                <div className="text-lg font-bold text-slate-100">CUDE Governance Audit — All 5 Domains</div>
                <div className="text-sm text-slate-500 mt-0.5">Generated {new Date(report.generated_at).toLocaleString()}</div>
                {report.mock && <div className="text-xs text-amber-500/70 mt-1 italic">⚠ Mock AI assessment — set ANTHROPIC_API_KEY for live Claude analysis</div>}
              </div>
              <div className={`px-4 py-2 rounded-lg text-sm font-bold ${report.risk_level==='HIGH'||report.risk_level==='CRITICAL'?'bg-red-900/40 text-red-300':report.risk_level==='MEDIUM'?'bg-yellow-900/40 text-yellow-300':'bg-green-900/40 text-green-300'}`}>{report.risk_level} RISK</div>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label:'Total Assets', value:report.stats?.total },
              { label:'Compliance Score', value:`${report.compliance_score}%`, cls:report.compliance_score>=70?'text-green-400':report.compliance_score>=50?'text-yellow-400':'text-red-400' },
              { label:'Export Control', value:report.export_control_status, cls:report.export_control_status==='COMPLIANT'?'text-green-400':'text-orange-400' },
              { label:'Pending Review', value:report.stats?.pending_review, cls:report.stats?.pending_review>0?'text-orange-400':'text-green-400' },
              { label:'AI Enriched', value:`${Math.round((report.stats?.by_zone?.AUTONOMOUS||0)/(report.stats?.total||1)*100)}%` },
              { label:'ITAR Flagged', value:report.stats?.itar_flagged, cls:report.stats?.itar_flagged>0?'text-red-400':'text-green-400' },
              { label:'PII Detected', value:report.stats?.pii_assets },
              { label:'Risk Score', value:report.risk_score },
            ].map(({ label, value, cls }) => (
              <div key={label} className="card p-4">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">{label}</div>
                <div className={`text-2xl font-bold tabular-nums ${cls || 'text-slate-100'}`}>{value ?? '—'}</div>
              </div>
            ))}
          </div>

          {/* Risk gauge + executive summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card p-5 flex flex-col items-center justify-center">
              <RiskGauge score={report.risk_score || 0}/>
              <div className="text-xs text-slate-500 text-center mt-2">Compliance: {report.compliance_score}%</div>
            </div>
            <div className="card p-5 md:col-span-2">
              <div className="label mb-2">Executive Summary</div>
              <p className="text-sm text-slate-300 leading-relaxed">{report.executive_summary}</p>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="label mb-2">Top Risks</div>
                  {report.top_risks?.map((r,i) => <div key={i} className="flex gap-2 text-xs text-slate-400 mb-1.5"><span className="text-red-400 flex-shrink-0">⚠</span>{r}</div>)}
                </div>
                <div>
                  <div className="label mb-2">Priority Actions</div>
                  {report.priority_actions?.map((a,i) => <div key={i} className="flex gap-2 text-xs text-slate-400 mb-1.5"><span className="text-orange-400 flex-shrink-0">{i+1}.</span>{a}</div>)}
                </div>
              </div>
            </div>
          </div>

          {/* Domain insights */}
          <div className="card p-5">
            <div className="label mb-3">Domain-by-Domain Intelligence</div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {Object.entries(report.domain_insights || {}).map(([domain, insight]) => {
                const m = DOMAIN_META[domain] || {};
                return (
                  <div key={domain} className="border border-slate-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2 text-sm font-medium text-slate-300">
                      <span>{m.icon || '📁'}</span>{m.label || domain}
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{insight}</p>
                    <div className="mt-2 text-xs text-slate-600">{report.stats?.by_domain?.[domain] || 0} assets</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recommendations */}
          <div className="card p-5">
            <div className="label mb-3">Recommendations</div>
            <div className="space-y-2">
              {report.recommendations?.map((r, i) => (
                <div key={i} className="flex gap-2 text-sm text-slate-400 p-2 rounded-lg bg-slate-800/30">
                  <CheckCircle size={15} className="text-green-400 flex-shrink-0 mt-0.5"/>
                  {r}
                </div>
              ))}
            </div>
          </div>

          {/* Agent Reasoning trace */}
          <div className="card p-5">
            <div className="label mb-3">Compliance Reporter — Reasoning Trace</div>
            <ReasoningTrace steps={report.reasoning_steps}/>
          </div>
        </div>
      )}
    </div>
  );
}
