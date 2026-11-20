import { Redis } from '@upstash/redis';

let redis;
function client() {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!url || !token) {
      const e = new Error('DB_NOT_CONFIGURED');
      throw e;
    }
    redis = new Redis({ url, token });
  }
  return redis;
}

export async function getJSON(key, fallback) {
  const v = await client().get(key);
  return v === null || v === undefined ? fallback : v;
}
export async function setJSON(key, value) {
  await client().set(key, value);
}
export async function delKey(key) {
  await client().del(key);
}
export async function hset(key, obj) {
  await client().hset(key, obj);
}
export async function hgetall(key) {
  return (await client().hgetall(key)) || {};
}
export async function hdel(key, ...fields) {
  if (fields.length) await client().hdel(key, ...fields);
}
