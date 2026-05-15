// Event bus with Redis pub/sub for cross-process events + SSE subscriber support
// Falls back to in-process pub/sub if Redis is not available

const subscribers = new Set();
let redisPub = null;
let redisSub = null;
let useRedis = false;

async function initRedis() {
  try {
    const Redis = require('ioredis');
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    redisPub = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
    redisSub = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });

    await redisPub.connect();
    await redisSub.connect();

    // Subscribe to the CUDE events channel
    await redisSub.subscribe('cude:events');
    redisSub.on('message', (channel, message) => {
      if (channel === 'cude:events') {
        broadcastToSSE(message);
      }
    });

    useRedis = true;
    return true;
  } catch (e) {
    // Redis not available — fall back to in-process
    useRedis = false;
    return false;
  }
}

function subscribe(res) {
  subscribers.add(res);
  res.on('close', () => subscribers.delete(res));
}

function publish(event) {
  const data = JSON.stringify(event);
  if (useRedis && redisPub) {
    redisPub.publish('cude:events', data).catch(() => {
      // Redis publish failed — fall back to direct broadcast
      broadcastToSSE(`data: ${data}\n\n`);
    });
  } else {
    broadcastToSSE(`data: ${data}\n\n`);
  }
}

function broadcastToSSE(message) {
  // Ensure message is in SSE format
  const sseMsg = message.startsWith('data:') ? message : `data: ${message}\n\n`;
  for (const res of subscribers) {
    try { res.write(sseMsg); } catch (_) { subscribers.delete(res); }
  }
}

module.exports = { subscribe, publish, initRedis };
