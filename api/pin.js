// POST /api/pin {pin}  ->  { ok, token }
// The phone page (add.html) trades the family PIN for a code that opens only the to-do list.
// Set TODO_PIN (any 4-8 digits) in the site's environment variables. Changing it signs every phone out.
// Wrong guesses are limited: 5 per 15 minutes from one address, and 30 per hour overall.
import { timingSafeEqual, createHmac } from 'node:crypto';
import { json, todoToken } from '../lib/auth.js';
import { redis, redisConfigured } from '../lib/redis.js';

const PER_IP = 5, PER_IP_SECS = 900, OVERALL = 30, OVERALL_SECS = 3600;

function samePin(a, b) {                       // compare fixed-length digests so length can't leak
  const h = (x) => createHmac('sha256', 'pin').update(String(x)).digest();
  return timingSafeEqual(h(a), h(b));
}
function clientId(req) {
  const h = req.headers || {};
  const raw = h['x-nf-client-connection-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || h['x-real-ip'] || 'unknown';
  return String(raw).trim().slice(0, 64).replace(/[^a-zA-Z0-9:.\-]/g, '');
}
async function locked(key, max) {
  const n = +(await redis(['GET', key])) || 0;
  if (n < max) return 0;
  const ttl = +(await redis(['TTL', key]));
  return Math.max(1, Math.ceil((ttl > 0 ? ttl : 60) / 60));
}
async function miss(key, secs) {
  const n = await redis(['INCR', key]);
  if (n === 1) await redis(['EXPIRE', key, secs]);
  return n;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('allow', 'POST'); return json(res, 405, { error: 'method not allowed' }); }
  const pin = process.env.TODO_PIN;
  if (!pin || !process.env.FRAME_KEY) return json(res, 501, { error: 'pin-not-set' });
  if (!redisConfigured()) return json(res, 501, { error: 'storage-not-configured' });
  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
    const tried = String((body && body.pin) || '').trim().slice(0, 40);
    if (!tried) return json(res, 400, { error: 'enter-pin' });

    const ipKey = 'family-frame:pin-fails:' + clientId(req), allKey = 'family-frame:pin-fails:all';
    const wait = (await locked(ipKey, PER_IP)) || (await locked(allKey, OVERALL));
    if (wait) return json(res, 429, { error: 'too-many-tries', retryMinutes: wait });

    if (samePin(tried, pin)) { await redis(['DEL', ipKey]); return json(res, 200, { ok: true, token: todoToken() }); }
    const n = await miss(ipKey, PER_IP_SECS); await miss(allKey, OVERALL_SECS);
    return json(res, 401, { error: 'wrong-pin', triesLeft: Math.max(0, PER_IP - n) });
  } catch (err) {
    return json(res, 502, { error: String(err.message || err) });
  }
}
