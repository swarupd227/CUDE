// Python Parser Bridge — communicates with Python worker via Redis lists
// Falls back gracefully if Python worker is not running

let available = false;
let redisClient = null;

async function init() {
  try {
    const Redis = require('ioredis');
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    redisClient = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
    await redisClient.connect();

    // Check if Python worker is alive via heartbeat key
    const heartbeat = await redisClient.get('cude:python-worker:heartbeat');
    available = heartbeat === 'alive';
    return available;
  } catch {
    available = false;
    return false;
  }
}

async function requestParse(jobId, filePath, parseType) {
  if (!available || !redisClient) return null;
  try {
    const job = JSON.stringify({ jobId, filePath, parseType });
    await redisClient.lpush('cude:python:jobs', job);
    return true;
  } catch { return null; }
}

async function awaitResult(jobId, timeoutMs = 30000) {
  if (!available || !redisClient) return null;
  try {
    const resultKey = `cude:python:results:${jobId}`;
    const result = await redisClient.brpop(resultKey, Math.ceil(timeoutMs / 1000));
    if (!result) return null; // Timeout
    return JSON.parse(result[1]);
  } catch { return null; }
}

async function parseWithPython(filePath, parseType) {
  if (!available) return null;

  // Re-check heartbeat (worker might have stopped)
  try {
    const heartbeat = await redisClient.get('cude:python-worker:heartbeat');
    if (heartbeat !== 'alive') { available = false; return null; }
  } catch { available = false; return null; }

  const jobId = `py_${Date.now()}_${Math.random().toString(36).substr(2,6)}`;
  const sent = await requestParse(jobId, filePath, parseType);
  if (!sent) return null;

  return await awaitResult(jobId, 30000);
}

function isAvailable() { return available; }

module.exports = { init, parseWithPython, isAvailable };
