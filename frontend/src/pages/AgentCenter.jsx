import React, { useEffect, useState } from 'react';
import { Play, Bot, Zap, Activity } from 'lucide-react';
import { Spinner, ReasoningTrace, EventFeed, AgentBadge } from '../components/UI';
import { API, AGENT_META } from '../utils/helpers';

const AGENT_TASKS = {
  A1_ORCHESTRATOR: 'Scan all connected vaults and file systems for new or modified assets',
  A2_EDA:  'Discover and parse electronic circuit drawings from EDA vaults and file shares',
  A2_PDF:  'Discover and extract content from all PDF repositories (SharePoint, NAS, S3)',
  A2_OFFICE: 'Discover and analyse Office documents — roadmaps, specs, cost models',
  A2_AUDIO: 'Transcribe and classify audio recordings and meeting recordings',
  A2_VIDEO: 'Extract and classify video content — lab footage, demos, presentations',
  A3_INVESTIGATOR: 'Discover cross-domain relationships between related assets across all 5 content types',
  A4_ARBITER: 'Resolve classification ambiguity in Supervised zone assets by gathering evidence',
  A5_MONITOR: 'Run a full governance health check and generate prioritised alerts',
  A6_REPORTER: 'Generate a full compliance audit report across all 5 content domains',
};

function AgentCard({ agent, onRun, running, result }) {
  const m = AGENT_META[agent.id] || {};
  const isRunning = running || agent.status === 'RUNNING';
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`card border rounded-xl overflow-hidden`} style={{ borderColor: m.color + '33' }}>
      {/* Header */}
      <div className="p-4" style={{ background: m.color + '11' }}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white shadow-lg" style={{ background: m.color }}>{m.short}</div>
            <div>
              <div className="text-sm font-semibold text-slate-200">{agent.name}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <div className={`w-1.5 h-1.5 rounded-full ${agent.status==='RUNNING'?'bg-green-400 animate-pulse':'bg-slate-600'}`}/>
                <span className="text-xs text-slate-500">{agent.status}</span>
                <span className="text-slate-700">·</span>
                <span className="text-xs text-slate-600">{agent.uptime_hours}h uptime</span>
              </div>
            </div>
          </div>
          <button onClick={() => onRun(agent.id)} disabled={running} className="btn-primary text-xs py-1.5 px-3"
            style={{ background: running ? undefined : m.color }}>
            {running ? <><Spinner size={12}/>Running…</> : <><Play size={12}/>Run</>}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3">
          {[['Jobs', agent.jobs_processed], ['Tool calls', agent.tool_calls_today], ['Status', agent.status]].map(([l, v]) => (
            <div key={l} className="text-center">
              <div className="text-xs font-bold text-slate-200">{v}</div>
              <div className="text-[10px] text-slate-600">{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Task */}
      <div className="px-4 py-2.5 border-t border-slate-800 text-xs text-slate-500">
        <span className="text-slate-600 font-medium">Task: </span>{AGENT_TASKS[agent.id]}
      </div>

      {/* Last action */}
      <div className="px-4 py-2 border-t border-slate-800 text-xs text-slate-600 truncate">
        <span className="text-slate-700">Last: </span>{agent.last_action}
      </div>

      {/* Result */}
      {result && (
        <div className="border-t border-slate-800">
          <button onClick={() => setExpanded(e => !e)} className="w-full text-left px-4 py-2 text-xs font-medium flex items-center justify-between hover:bg-slate-800/30 transition-colors" style={{ color: m.color }}>
            <span>✦ Agent Result</span><span>{expanded ? '▲' : '▼'}</span>
          </button>
          {expanded && (
            <div className="p-4 space-y-3 bg-slate-950/30">
              {result.conclusion && <p className="text-xs text-slate-400 leading-relaxed">{result.conclusion || result.summary || result.executive_summary}</p>}
              {result.reasoning_steps && <ReasoningTrace steps={result.reasoning_steps}/>}
              {result.alerts && (
                <div className="space-y-2">
                  {result.alerts.map(a => (
                    <div key={a.id} className={`p-2.5 rounded-lg text-xs border ${a.severity==='CRITICAL'?'border-red-800/50 bg-red-950/20 text-red-300':a.severity==='HIGH'?'border-orange-800/50 bg-orange-950/20 text-orange-300':'border-yellow-800/50 bg-yellow-950/20 text-yellow-300'}`}>
                      <div className="font-medium">{a.title}</div>
                      <div className="text-slate-500 mt-0.5">{a.description}</div>
                    </div>
                  ))}
                </div>
              )}
              {result.relationships && (
                <div className="space-y-1.5">
                  {result.relationships.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-amber-950/20 border border-amber-800/30">
                      <span className="text-amber-400 font-mono">{r.relationship_type}</span>
                      <span className="text-slate-400 truncate">{r.asset_name}</span>
                      <span className="text-slate-600 ml-auto flex-shrink-0">{Math.round(r.confidence*100)}%</span>
                    </div>
                  ))}
                </div>
              )}
              {result.mock && <div className="text-[10px] text-amber-500/60 italic">⚠ Mock response — set ANTHROPIC_API_KEY for live reasoning</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AgentCenter({ events = [] }) {
  const [agents, setAgents] = useState([]);
  const [running, setRunning] = useState({});
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/agents`).then(r => r.json()).then(a => { setAgents(a); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const handleRun = async (agentId) => {
    setRunning(p => ({ ...p, [agentId]: true }));
    try {
      const d = await fetch(`${API}/agents/${agentId}/run`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ task: AGENT_TASKS[agentId] }) }).then(r => r.json());
      setResults(p => ({ ...p, [agentId]: d.result }));
      setAgents(prev => prev.map(a => a.id === agentId ? { ...a, last_action: d.result?.conclusion || d.result?.summary || a.last_action } : a));
    } catch(e) { console.error(e); }
    setRunning(p => ({ ...p, [agentId]: false }));
  };

  if (loading) return <div className="flex items-center justify-center h-96"><Spinner size={32}/></div>;

  return (
    <div className="p-5 space-y-5 max-w-screen-xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Agent Control Center</h1>
          <p className="text-slate-500 text-sm mt-0.5">10 AI agents — ReAct reasoning · Tool manifests · Human-in-the-Loop gates</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-900/30 border border-blue-800/40">
          <Bot size={13} className="text-blue-400"/>
          <span className="text-xs text-blue-400 font-medium">{agents.filter(a=>a.status==='RUNNING').length} agents running</span>
        </div>
      </div>

      {/* Architecture callout */}
      <div className="border border-purple-800/40 rounded-xl p-4 bg-purple-950/10 text-sm">
        <div className="flex items-start gap-3">
          <div className="text-2xl">🧠</div>
          <div>
            <div className="font-semibold text-purple-300 mb-1">Agentic Framework — ReAct Pattern</div>
            <p className="text-slate-400 text-xs leading-relaxed">Each agent follows Reason → Act → Observe cycles. Agents use tool manifests to take bounded actions. <span className="text-red-400 font-medium">Hard Gates</span> always require human approval — TRADE SECRET classification, access control changes, legal hold, and deletion actions are never executed autonomously. Confidence thresholds determine the zone: ≥0.90 Autonomous, 0.70–0.89 Supervised, any TRADE SECRET → Gated.</p>
          </div>
        </div>
      </div>

      {/* Agent Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {agents.map(a => (
          <AgentCard key={a.id} agent={a} onRun={handleRun} running={!!running[a.id]} result={results[a.id]}/>
        ))}
      </div>

      {/* Event Feed */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/>Real-time Agent Event Stream
          </h3>
          <span className="text-[10px] text-slate-600 font-mono">SSE · LIVE</span>
        </div>
        <EventFeed events={events} maxHeight="max-h-40"/>
      </div>
    </div>
  );
}
