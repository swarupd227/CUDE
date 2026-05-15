export const API = '/api';

export const DOMAIN_META = {
  ELECTRONIC_CIRCUIT: { label:'Electronic Circuit', icon:'🔲', color:'bg-purple-900/50 text-purple-300 border-purple-700/40', dot:'bg-purple-400' },
  PDF_DOCUMENT:       { label:'PDF Document',       icon:'📄', color:'bg-red-900/50 text-red-300 border-red-700/40', dot:'bg-red-400' },
  OFFICE_DOCUMENT:    { label:'Office Document',    icon:'📊', color:'bg-blue-900/50 text-blue-300 border-blue-700/40', dot:'bg-blue-400' },
  AUDIO:              { label:'Audio',              icon:'🎙️', color:'bg-green-900/50 text-green-300 border-green-700/40', dot:'bg-green-400' },
  VIDEO:              { label:'Video',              icon:'🎬', color:'bg-teal-900/50 text-teal-300 border-teal-700/40', dot:'bg-teal-400' },
  STRUCTURED_DATA:    { label:'Database Table',     icon:'🗃️', color:'bg-orange-900/50 text-orange-300 border-orange-700/40', dot:'bg-orange-400' },
};

export const CLASS_META = {
  PUBLIC:       { color:'bg-green-900/50 text-green-300', ring:'border-green-700/40' },
  INTERNAL:     { color:'bg-blue-900/50 text-blue-300', ring:'border-blue-700/40' },
  CONFIDENTIAL: { color:'bg-yellow-900/50 text-yellow-300', ring:'border-yellow-700/40' },
  RESTRICTED:   { color:'bg-orange-900/50 text-orange-300', ring:'border-orange-700/40' },
  TRADE_SECRET: { color:'bg-red-900/50 text-red-300', ring:'border-red-700/40' },
};

export const ZONE_META = {
  AUTONOMOUS:     { label:'Autonomous',    cls:'zone-auto',       icon:'🟢', desc:'Auto-classified ≥0.90 confidence' },
  SUPERVISED:     { label:'Supervised',    cls:'zone-supervised', icon:'🟡', desc:'Human review — 0.70–0.89 confidence' },
  GATED:          { label:'Gated',         cls:'zone-gated',      icon:'🔴', desc:'Hard gate — awaiting legal approval' },
  PENDING_REVIEW: { label:'Pending',       cls:'zone-pending',    icon:'🟠', desc:'Low confidence — manual classification' },
};

export const AGENT_META = {
  A1_ORCHESTRATOR: { label:'Pipeline Orchestrator',        short:'ORCH', icon:'🔄', color:'#3b82f6', bg:'bg-blue-900/30 border-blue-700/40',    role:'Coordinates all discovery agents, manages retries and scheduling' },
  A2_EDA:          { label:'Circuit Drawing Scanner',      short:'EDA',  icon:'🔲', color:'#8b5cf6', bg:'bg-purple-900/30 border-purple-700/40', role:'Discovers and parses electronic circuit files from EDA vaults' },
  A2_PDF:          { label:'PDF Document Scanner',         short:'PDF',  icon:'📄', color:'#6366f1', bg:'bg-indigo-900/30 border-indigo-700/40', role:'Extracts text, tables, and entities from PDF documents' },
  A2_OFFICE:       { label:'Office Document Scanner',      short:'OFFC', icon:'📊', color:'#0ea5e9', bg:'bg-sky-900/30 border-sky-700/40',      role:'Analyses Word, Excel, and PowerPoint files including speaker notes' },
  A2_AUDIO:        { label:'Audio & Meeting Scanner',      short:'AUD',  icon:'🎙️', color:'#10b981', bg:'bg-green-900/30 border-green-700/40',  role:'Transcribes audio recordings and detects sensitive disclosures' },
  A2_VIDEO:        { label:'Video Content Scanner',        short:'VID',  icon:'🎬', color:'#14b8a6', bg:'bg-teal-900/30 border-teal-700/40',   role:'Classifies video frames and extracts audio transcript' },
  A3_INVESTIGATOR: { label:'Relationship Investigator',    short:'INVS', icon:'🔍', color:'#f59e0b', bg:'bg-amber-900/30 border-amber-700/40',  role:'Discovers cross-domain links between related assets' },
  A4_ARBITER:      { label:'Classification Arbiter',       short:'ARBT', icon:'⚖️', color:'#ef4444', bg:'bg-red-900/30 border-red-700/40',      role:'Resolves ambiguous classifications by gathering evidence' },
  A5_MONITOR:      { label:'Governance Monitor',           short:'MON',  icon:'🛡️', color:'#f97316', bg:'bg-orange-900/30 border-orange-700/40', role:'Continuously checks for compliance gaps and SLA breaches' },
  A6_REPORTER:     { label:'Compliance Reporter',          short:'RPT',  icon:'📋', color:'#ec4899', bg:'bg-pink-900/30 border-pink-700/40',    role:'Builds audit-ready compliance reports on demand' },
};

export const CHART_COLORS = ['#3b82f6','#8b5cf6','#ef4444','#10b981','#f59e0b','#06b6d4','#ec4899','#f97316','#84cc16','#6366f1'];

export function formatBytes(mb) { if(!mb) return '—'; if(mb<1) return `${Math.round(mb*1024)}KB`; if(mb<1024) return `${mb.toFixed(1)}MB`; return `${(mb/1024).toFixed(1)}GB`; }
export function formatDate(iso) { if(!iso) return '—'; return new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
export function formatTime(iso) { if(!iso) return '—'; return new Date(iso).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}); }
export function confColor(c) { if(c>=0.90) return 'text-green-400'; if(c>=0.70) return 'text-yellow-400'; return 'text-red-400'; }
export function confBg(c) { if(c>=0.90) return 'bg-green-500'; if(c>=0.70) return 'bg-yellow-500'; return 'bg-red-500'; }
export function secToHms(s) { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60); return h>0?`${h}h ${m}m`:`${m}m`; }
