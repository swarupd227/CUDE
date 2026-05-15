// BullMQ Workers — process async jobs for scanning, parsing, enrichment, and indexing
const { getConnection } = require('./queues');

let Worker;
let workers = [];

async function startWorkers() {
  try {
    Worker = require('bullmq').Worker;
  } catch (e) {
    console.log('⚠️  BullMQ not installed — workers disabled');
    return;
  }

  const connection = getConnection();
  if (!connection) return;

  // ── Parse Worker — run domain parsers on files ──────────────────────────
  const parseWorker = new Worker('cude-parse', async (job) => {
    const { assetId, filePath, domain, format, fileName, fileSizeMb } = job.data;
    const { parseAsset } = require('../services/domainParsers');
    const fs = require('fs');

    let fileBuffer = null;
    if (filePath && fileSizeMb <= 100) {
      try { fileBuffer = fs.readFileSync(filePath); } catch (_) {}
    }

    const result = await parseAsset(domain, format, fileName, fileSizeMb, fileBuffer, filePath);
    return { assetId, parseResult: result };
  }, { connection, concurrency: 4 });

  parseWorker.on('completed', (job) => {
    console.log(`  Parse job ${job.id} completed: ${job.data.fileName}`);
  });
  parseWorker.on('failed', (job, err) => {
    console.error(`  Parse job ${job?.id} failed: ${err.message}`);
  });
  workers.push(parseWorker);

  // ── Enrich Worker — run Classification Arbiter ──────────────────────────
  const enrichWorker = new Worker('cude-enrich', async (job) => {
    const { assetId } = job.data;
    const { arbitrate } = require('../services/claudeService');
    // Load asset from in-memory catalog (Phase 1 compatibility)
    const { catalog } = require('../data/seedData');
    const asset = catalog.find(a => a.id === assetId);
    if (!asset) throw new Error(`Asset ${assetId} not found`);
    const result = await arbitrate(asset);
    return { assetId, enrichResult: result };
  }, { connection, concurrency: 2 });

  enrichWorker.on('completed', (job) => {
    console.log(`  Enrich job ${job.id} completed`);
  });
  workers.push(enrichWorker);

  // ── Index Worker — index asset in Elasticsearch ─────────────────────────
  const indexWorker = new Worker('cude-index', async (job) => {
    const { asset } = job.data;
    const searchService = require('../services/searchService');
    if (searchService.isAvailable()) {
      await searchService.indexAsset(asset);
    }
    return { indexed: true, assetId: asset.id };
  }, { connection, concurrency: 5 });

  workers.push(indexWorker);

  // ── Analyze Worker — run AI content analysis ────────────────────────────
  const analyzeWorker = new Worker('cude-analyze', async (job) => {
    const { assetId } = job.data;
    const { analyzeContent } = require('../services/claudeService');
    const { catalog } = require('../data/seedData');
    const asset = catalog.find(a => a.id === assetId);
    if (!asset) throw new Error(`Asset ${assetId} not found`);

    const domKey = asset.content_domain?.toLowerCase().replace('_document','').replace('_circuit','').replace('_recording','') || '';
    const domMeta = (domKey && asset[`muas_${domKey}`]) || {};
    const text = domMeta.text_preview || '';
    const entities = domMeta.entities || {};

    const analysis = await analyzeContent(asset, text, entities);
    return { assetId, analysis };
  }, { connection, concurrency: 2 });

  workers.push(analyzeWorker);

  console.log(`  Workers started: ${workers.length} (parse, enrich, index, analyze)`);
}

async function stopWorkers() {
  for (const w of workers) {
    try { await w.close(); } catch (_) {}
  }
  workers = [];
}

module.exports = { startWorkers, stopWorkers };
