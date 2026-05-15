const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

if (!fs.existsSync(path.join(__dirname, 'node_modules'))) {
  console.log('\n📦 Installing backend dependencies...\n');
  try { execSync('npm install', { cwd: __dirname, stdio: 'inherit' }); } catch(e) { process.exit(1); }
}

try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch(_) {}
try { require('dotenv').config(); } catch(_) {}

const express = require('express');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3001;
const USE_DATABASE = process.env.USE_DATABASE !== 'false';

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '20mb' }));

// ── Auth routes (no auth required for login/register) ────────────────────────
if (USE_DATABASE) {
  const authRouter = require('./src/routes/auth');
  app.use('/api/auth', authRouter);
  app.use('/api', authRouter); // Also mount at /api for /api/users
}

// ── Main API routes ──────────────────────────────────────────────────────────
app.use('/api', require('./src/routes/api'));

// ── Project routes ───────────────────────────────────────────────────────────
if (USE_DATABASE) {
  try { app.use('/api/projects', require('./src/routes/projects')); } catch (_) {}
  try { app.use('/api/connector-templates', require('./src/routes/connectorTemplates')); } catch (_) {}
}

// Connector routes — inject catalog reference after data is loaded
const { catalog, approvalQueue } = require('./src/data/seedData');
const { router: connectorRouter, setCatalog, setApprovalQueue } = require('./src/routes/connectors');
setCatalog(catalog);
setApprovalQueue(approvalQueue);
// SQL Database connectors (structured data discovery) — mount BEFORE generic connectors
// so /api/connectors/sql/* routes are matched before the generic /:type/test catch-all
const sqlConnectorRouter = require('./src/routes/sqlConnectors');
app.use('/api/connectors/sql', sqlConnectorRouter);

app.use('/api/connectors', connectorRouter);

// Serve frontend dist if built
const DIST = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('*', (_, res) => res.sendFile(path.join(DIST, 'index.html')));
}

// Background agent simulation events
const { eventLog, pushEvent } = require('./src/data/seedData');
const eventBus = require('./src/services/eventBus');
const BG_MESSAGES = [
  ['Governance Monitor', 'Governance Monitor',    'Continuous compliance check — scanning for policy violations and SLA breaches'],
  ['Classification Arbiter', 'Classification Arbiter', 'Periodic confidence re-evaluation on supervised-zone assets'],
  ['Pipeline Orchestrator', 'Pipeline Orchestrator',  'Heartbeat: all discovery agents nominal, connectors reachable'],
  ['Governance Monitor', 'Governance Monitor',    'Checking approval queue SLA timers — flagging items approaching deadline'],
  ['Compliance Reporter', 'Compliance Reporter',   'Audit trail update — writing session activity to compliance log'],
  ['Pipeline Orchestrator', 'Pipeline Orchestrator',  'Connector poll: checking registered source systems for new or modified files'],
];
let bgIdx = 0;
setInterval(() => {
  const { catalog: liveCatalog } = require('./src/data/seedData');
  if (liveCatalog.length === 0) return;
  const [agentName, agentId, message] = BG_MESSAGES[bgIdx % BG_MESSAGES.length];
  bgIdx++;
  const ev = pushEvent('ScanStage', agentId, message, { background: true });
  eventBus.publish(ev);
}, 8000);

// ── Start server ─────────────────────────────────────────────────────────────
async function start() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  CUDE Enterprise — Configurable Universal Discovery Engine   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Initialize database if enabled
  let dbConnected = false;
  if (USE_DATABASE) {
    try {
      require('pg'); // Check if pg is installed
      const { initDatabase } = require('./src/db/init');
      dbConnected = await initDatabase();
    } catch (e) {
      if (e.code === 'MODULE_NOT_FOUND') {
        console.log('⚠️  Database packages not installed. Run: cd backend && npm install');
      } else {
        console.log(`⚠️  Database init failed: ${e.message}`);
      }
      console.log('   Running in in-memory mode (demo).\n');
    }
  } else {
    console.log('ℹ️  Database disabled (USE_DATABASE=false) — running in demo/in-memory mode.\n');
  }

  // Check Redis connectivity
  let redisConnected = false;
  if (process.env.REDIS_URL) {
    try {
      // Lightweight Redis ping
      const net = require('net');
      const redisUrl = new URL(process.env.REDIS_URL);
      await new Promise((resolve, reject) => {
        const sock = net.createConnection(parseInt(redisUrl.port || 6379), redisUrl.hostname, () => { sock.end(); resolve(); });
        sock.on('error', reject);
        sock.setTimeout(2000, () => { sock.destroy(); reject(new Error('timeout')); });
      });
      redisConnected = true;
    } catch (_) {}
  }

  // Initialize Redis pub/sub for event bus
  if (redisConnected) {
    try {
      const { initRedis } = require('./src/services/eventBus');
      const redisPubSub = await initRedis();
      if (redisPubSub) console.log('✅  Redis pub/sub initialized for SSE events');
    } catch (_) {}
  }

  // Initialize Elasticsearch
  let esConnected = false;
  try {
    const searchService = require('./src/services/searchService');
    esConnected = await searchService.init();
  } catch (_) {}

  // Initialize BullMQ job queues
  let bullConnected = false;
  if (redisConnected) {
    try {
      const queues = require('./src/queue/queues');
      bullConnected = await queues.init();
      if (bullConnected) {
        const { startWorkers } = require('./src/queue/worker');
        await startWorkers();
      }
    } catch (_) {}
  }

  // Initialize Neo4j knowledge graph
  let neo4jConnected = false;
  try {
    const graphService = require('./src/services/graphService');
    neo4jConnected = await graphService.init();
  } catch (_) {}

  // Initialize pgvector embeddings
  let embeddingsAvailable = false;
  try {
    const embeddingService = require('./src/services/embeddingService');
    embeddingsAvailable = await embeddingService.init();
  } catch (_) {}

  // Initialize scheduler (cron jobs for SLA checks, retention reviews)
  if (bullConnected) {
    try {
      const scheduler = require('./src/services/scheduler');
      await scheduler.init();
    } catch (_) {}
  }

  // Check Python parser worker
  let pythonWorkerAvailable = false;
  if (redisConnected) {
    try {
      const bridge = require('./src/services/pythonParserBridge');
      pythonWorkerAvailable = await bridge.init();
    } catch (_) {}
  }

  // Check MinIO connectivity
  let minioConnected = false;
  if (process.env.MINIO_ENDPOINT) {
    try {
      const net = require('net');
      const port = parseInt(process.env.MINIO_PORT || 9000);
      await new Promise((resolve, reject) => {
        const sock = net.createConnection(port, process.env.MINIO_ENDPOINT, () => { sock.end(); resolve(); });
        sock.on('error', reject);
        sock.setTimeout(2000, () => { sock.destroy(); reject(new Error('timeout')); });
      });
      minioConnected = true;
    } catch (_) {}
  }

  const HOST = process.env.HOST || '0.0.0.0';
  app.listen(PORT, HOST, () => {
    console.log(`🚀  App:        http://localhost:${PORT} (listening on ${HOST})`);
    console.log(`📡  Connectors: http://localhost:${PORT}/api/connectors`);
    if (USE_DATABASE) {
      console.log(`🔑  Auth:       http://localhost:${PORT}/api/auth/login`);
    }
    console.log('');
    console.log('── Services ──────────────────────────────────────────────');
    console.log(`🗄️   PostgreSQL:     ${dbConnected ? '✅ Connected' : '⚠️  Not available (in-memory mode)'}`);
    console.log(`📮  Redis:          ${redisConnected ? '✅ Connected' : '⚠️  Not available'}`);
    console.log(`🔍  Elasticsearch:  ${esConnected ? '✅ Connected' : '⚠️  Not available (SQL fallback)'}`);
    console.log(`📋  BullMQ Workers: ${bullConnected ? '✅ Running' : '⚠️  Not available (sync mode)'}`);
    console.log(`📦  MinIO:          ${minioConnected ? '✅ Connected' : '⚠️  Not available'}`);
    console.log(`🕸️   Neo4j:          ${neo4jConnected ? '✅ Connected (knowledge graph)' : '⚠️  Not available'}`);
    console.log(`🧮  pgvector:       ${embeddingsAvailable ? '✅ Ready (semantic similarity)' : '⚠️  Not available'}`);
    console.log(`🔑  Claude:         ${process.env.ANTHROPIC_API_KEY ? '✅ Connected' : '⚠️  Not set'}`);
    console.log(`🎙️   Whisper:        ${process.env.OPENAI_API_KEY ? '✅ Connected' : '⚠️  Not set'}`);
    console.log(`🐍  Python Worker:  ${pythonWorkerAvailable ? '✅ Running (enhanced parsing)' : '⚠️  Not running (Node.js fallback)'}`);
    console.log(`🔐  Auth:           ${USE_DATABASE ? '✅ JWT enabled' : '⚠️  Disabled (demo mode)'}`);
    console.log('');
  });
}

start().catch(e => {
  console.error('Failed to start:', e.message);
  // Start anyway in fallback mode
  app.listen(PORT, () => {
    console.log(`🚀  App (fallback): http://localhost:${PORT}`);
  });
});
