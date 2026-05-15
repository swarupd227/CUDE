const { v4: uuidv4 } = require('uuid');

// Live catalog — starts empty, populated entirely by connector scans
const catalog = [];

// Approval queue — starts empty
const approvalQueue = [];

// Agent registry with proper descriptive names — no alphanumeric codes shown to users
const agentRegistry = {
  A1_ORCHESTRATOR: { id:'A1_ORCHESTRATOR', name:'Pipeline Orchestrator',     label:'ORCH', color:'#3b82f6', status:'IDLE',  uptime_hours:0, jobs_processed:0, tool_calls_today:0, last_action:'Standing by — use Source Connectors to begin discovery' },
  A2_EDA:          { id:'A2_EDA',          name:'Circuit Drawing Scanner',   label:'EDA',  color:'#8b5cf6', status:'IDLE',     uptime_hours:0, jobs_processed:0, tool_calls_today:0, last_action:'Idle — activates when EDA or circuit files are discovered' },
  A2_PDF:          { id:'A2_PDF',          name:'PDF Document Scanner',      label:'PDF',  color:'#6366f1', status:'IDLE',     uptime_hours:0, jobs_processed:0, tool_calls_today:0, last_action:'Idle — activates when PDF files are discovered' },
  A2_OFFICE:       { id:'A2_OFFICE',       name:'Office Document Scanner',   label:'OFFC', color:'#0ea5e9', status:'IDLE',     uptime_hours:0, jobs_processed:0, tool_calls_today:0, last_action:'Idle — activates when Word, Excel, or PowerPoint files are found' },
  A2_AUDIO:        { id:'A2_AUDIO',        name:'Audio & Meeting Scanner',   label:'AUD',  color:'#10b981', status:'IDLE',     uptime_hours:0, jobs_processed:0, tool_calls_today:0, last_action:'Idle — activates when audio or meeting recordings are found' },
  A2_VIDEO:        { id:'A2_VIDEO',        name:'Video Content Scanner',     label:'VID',  color:'#14b8a6', status:'IDLE',     uptime_hours:0, jobs_processed:0, tool_calls_today:0, last_action:'Idle — activates when video files are discovered' },
  A3_INVESTIGATOR: { id:'A3_INVESTIGATOR', name:'Relationship Investigator', label:'INVS', color:'#f59e0b', status:'IDLE',     uptime_hours:0, jobs_processed:0, tool_calls_today:0, last_action:'Idle — click any asset in the Relationships page to investigate' },
  A4_ARBITER:      { id:'A4_ARBITER',      name:'Classification Arbiter',    label:'ARBT', color:'#ef4444', status:'IDLE',  uptime_hours:0, jobs_processed:0, tool_calls_today:0, last_action:'Standing by — resolves ambiguous classifications on demand' },
  A5_MONITOR:      { id:'A5_MONITOR',      name:'Governance Monitor',        label:'MON',  color:'#f97316', status:'IDLE',  uptime_hours:0, jobs_processed:0, tool_calls_today:0, last_action:'Standing by — monitors for compliance gaps and SLA breaches' },
  A6_REPORTER:     { id:'A6_REPORTER',     name:'Compliance Reporter',       label:'RPT',  color:'#ec4899', status:'IDLE',     uptime_hours:0, jobs_processed:0, tool_calls_today:0, last_action:'Idle — click "Generate Audit Report" on the Reports page' },
};

const pluginConfig = {
  ELECTRONIC_CIRCUIT: { enabled:true,  priority:'P1', confidence_auto:0.90, confidence_supervised:0.70, sources:['local_filesystem','cadence_dfii','aws_s3','nas'] },
  PDF_DOCUMENT:       { enabled:true,  priority:'P1', confidence_auto:0.90, confidence_supervised:0.70, sources:['local_filesystem','sharepoint','azure_blob'] },
  OFFICE_DOCUMENT:    { enabled:true,  priority:'P1', confidence_auto:0.90, confidence_supervised:0.70, sources:['local_filesystem','sharepoint','teams'] },
  AUDIO:              { enabled:true,  priority:'P2', confidence_auto:0.90, confidence_supervised:0.70, sources:['local_filesystem','teams','sharepoint'] },
  VIDEO:              { enabled:true,  priority:'P2', confidence_auto:0.90, confidence_supervised:0.70, sources:['local_filesystem','sharepoint','teams'] },
};

const eventLog = [];

// pushEvent(type, agentId, message, payload)
// message — mandatory human-readable string shown in the live event feed
// payload — optional structured data
const pushEvent = (type, agentId, message, payload = {}) => {
  const agentName = agentRegistry[agentId]?.name || agentId;
  const ev = { id:uuidv4(), type, agent:agentId, agentName, message, payload, timestamp:new Date().toISOString() };
  eventLog.unshift(ev);
  if (eventLog.length > 200) eventLog.pop();
  return ev;
};

const recordAgentActivity = (agentId, action) => {
  const a = agentRegistry[agentId];
  if (!a) return;
  a.jobs_processed += 1;
  a.tool_calls_today += 1;
  a.status = 'RUNNING';
  if (action) a.last_action = action;
  setTimeout(() => { if (agentRegistry[agentId]) agentRegistry[agentId].status = 'IDLE'; }, 8000);
};

module.exports = { catalog, approvalQueue, agentRegistry, pluginConfig, eventLog, pushEvent, recordAgentActivity };
