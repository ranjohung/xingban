'use strict';

const { createClient } = require('redis');

const memoryBuckets = new Map();
let client = null;
let connecting = null;
let lastError = null;

async function connect() {
  if (!process.env.REDIS_URL) return status();
  if (client?.isReady) return status();
  if (connecting) return connecting;

  client = client || createClient({
    url: process.env.REDIS_URL,
    socket: {
      connectTimeout: 3000,
      reconnectStrategy: (retries) => (retries < 3 ? Math.min(retries * 200, 1000) : false),
    },
  });
  client.on('error', (error) => { lastError = error; });
  client.on('ready', () => { lastError = null; });

  connecting = client.connect()
    .then(() => status())
    .catch((error) => {
      lastError = error;
      return status();
    })
    .finally(() => { connecting = null; });
  return connecting;
}

function status() {
  if (client?.isReady) return { ready: true, mode: 'redis' };
  return {
    ready: true,
    mode: 'memory',
    fallback: Boolean(process.env.REDIS_URL),
    error: lastError ? lastError.message : undefined,
  };
}

function consumeMemory(key, limit, windowSeconds) {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  let entry = memoryBuckets.get(key);
  if (!entry || now - entry.startedAt >= windowMs) entry = { startedAt: now, count: 0 };
  entry.count += 1;
  memoryBuckets.set(key, entry);

  if (memoryBuckets.size > 5000) {
    for (const [bucketKey, bucket] of memoryBuckets) {
      if (now - bucket.startedAt >= windowMs) memoryBuckets.delete(bucketKey);
    }
  }
  return { allowed: entry.count <= limit, count: entry.count, source: 'memory' };
}

async function consumeRateLimit(key, limit, windowSeconds) {
  if (!client?.isReady) return consumeMemory(key, limit, windowSeconds);
  try {
    const namespacedKey = `xingban:rate:${key}`;
    const count = await client.incr(namespacedKey);
    if (count === 1) await client.expire(namespacedKey, windowSeconds);
    return { allowed: count <= limit, count, source: 'redis' };
  } catch (error) {
    lastError = error;
    return consumeMemory(key, limit, windowSeconds);
  }
}

module.exports = { connect, status, consumeRateLimit };
