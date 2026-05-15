// BullMQ job queue definitions — async processing for scan, parse, enrich, index
// Falls back gracefully if Redis/BullMQ not available

let Queue, Worker, QueueEvents;
let queues = {};
let available = false;
let redisConnection = null;

function getRedisOpts() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname, port: parseInt(parsed.port || 6379) };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

async function init() {
  try {
    const bullmq = require('bullmq');
    Queue = bullmq.Queue;
    Worker = bullmq.Worker;
    QueueEvents = bullmq.QueueEvents;
    redisConnection = getRedisOpts();

    // Create queues
    queues.scan = new Queue('cude-scan', { connection: redisConnection });
    queues.parse = new Queue('cude-parse', { connection: redisConnection });
    queues.enrich = new Queue('cude-enrich', { connection: redisConnection });
    queues.index = new Queue('cude-index', { connection: redisConnection });
    queues.analyze = new Queue('cude-analyze', { connection: redisConnection });

    // Test connection
    await queues.scan.getJobCounts();
    available = true;
    return true;
  } catch (e) {
    console.log('⚠️  BullMQ not available:', e.message);
    available = false;
    return false;
  }
}

// Add a job to a queue
async function addJob(queueName, jobName, data, opts = {}) {
  if (!available || !queues[queueName]) return null;
  try {
    const job = await queues[queueName].add(jobName, data, {
      attempts: opts.attempts || 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { age: 86400, count: 100 },
      removeOnFail: { age: 604800, count: 200 },
      ...opts,
    });
    return { id: job.id, name: job.name, queue: queueName };
  } catch (e) {
    console.error(`Queue add error (${queueName}):`, e.message);
    return null;
  }
}

// Get job counts across all queues
async function getStats() {
  if (!available) return null;
  const stats = {};
  for (const [name, queue] of Object.entries(queues)) {
    try {
      stats[name] = await queue.getJobCounts();
    } catch { stats[name] = {}; }
  }
  return stats;
}

function isAvailable() { return available; }
function getQueues() { return queues; }
function getConnection() { return redisConnection; }

module.exports = { init, addJob, getStats, isAvailable, getQueues, getConnection, Worker };
