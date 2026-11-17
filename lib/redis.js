// Minimal Upstash Redis REST client shared by the API routes that need counters.
const URL_ = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
export const redisConfigured = () => !!(URL_() && TOKEN());
export async function redis(cmd) {
  const r = await fetch(URL_(), { method: 'POST', headers: { authorization: 'Bearer ' + TOKEN(), 'content-type': 'application/json' }, body: JSON.stringify(cmd) });
  if (!r.ok) throw new Error('Redis ' + r.status);
  return (await r.json()).result;
}
