// GET /api/shopping → { items, updated }     PUT /api/shopping { items } → { ok, updated }
// Add ONE item (for voice assistants etc.):  GET /api/shopping?add=batteries[&store=kroger]
//                                            POST /api/shopping {action:'add', name, store?}   → { ok, item, message }
// The add-only key (ADD_KEY) may do that and nothing else. The phone PIN may also read the list and check items off
// (POST {action:'toggle', id, done?}); FRAME_KEY can do everything.
// Stores the shared shopping list in Upstash Redis (add it from the Vercel Marketplace → Storage).
// Env (set automatically by that integration): UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN,
//      or KV_REST_API_URL + KV_REST_API_TOKEN.
// Without it the frame still works: the list is kept in the frame's own browser storage.
import { access, deny, json } from '../lib/auth.js';

const URL_ = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const KEY = 'family-frame:shopping';
// How often each item has been added (lower-case name -> count). The "Usuals" tiles are ranked by it.
const COUNTS = 'family-frame:shopping-counts';
const bump = (name) => redis(['HINCRBY', COUNTS, String(name).toLowerCase().slice(0, 80), 1]).catch(() => {});
async function counts() {
  const flat = (await redis(['HGETALL', COUNTS]).catch(() => null)) || [], out = {};
  for (let i = 0; i + 1 < flat.length; i += 2) out[flat[i]] = Number(flat[i + 1]) || 0;
  return out;
}

async function redis(cmd) {
  const r = await fetch(URL_(), { method: 'POST', headers: { authorization: 'Bearer ' + TOKEN(), 'content-type': 'application/json' }, body: JSON.stringify(cmd) });
  if (!r.ok) throw new Error('Redis ' + r.status);
  return (await r.json()).result;
}

function cleanName(t) {
  const s = String(t || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const SPOKEN = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

// Add one item without touching the rest of the list (read, change, write straight back).
async function addItem(nameRaw, storeRaw) {
  const name = cleanName(nameRaw);
  if (!name) return { status: 400, body: { error: 'empty-name' } };
  const raw = await redis(['GET', KEY]);
  const state = raw ? JSON.parse(raw) : { items: [], updated: 0 };
  const items = state.items || [];
  const lower = name.toLowerCase();
  let item = items.find((g) => !g.done && String(g.name).toLowerCase() === lower), message;
  if (item) {
    item.qty = Math.min(99, (+item.qty || 1) + 1);
    message = `${item.name} was already on the shopping list. Now ${SPOKEN[item.qty] || item.qty}`;
  } else if ((item = items.find((g) => g.done && String(g.name).toLowerCase() === lower))) {
    item.done = false; item.qty = 1;
    message = `Added ${item.name} back to the shopping list`;
  } else {
    if (items.length >= 500) return { status: 409, body: { error: 'list-full' } };
    const store = /^[a-z0-9-]{1,30}$/.test(String(storeRaw || '')) ? String(storeRaw) : '';   // blank = the frame's first store
    item = { id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name, cat: 'Other', qty: 1, store, done: false, note: '' };
    items.push(item);
    message = `Added ${name} to the shopping list`;
  }
  const next = { items, updated: Date.now() };
  await redis(['SET', KEY, JSON.stringify(next)]);
  await bump(name);
  return { status: 200, body: { ok: true, item, message } };
}

export default async function handler(req, res) {
  const level = access(req);
  if (!level) return deny(res);                                  // the phone PIN code may read, add to and check off the list (not replace it)
  if (!URL_() || !TOKEN()) return json(res, 501, { error: 'storage-not-configured' });
  try {
    const q = new URL(req.url, 'http://x').searchParams;
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
    if (req.method === 'GET' && q.has('add')) { const r = await addItem(q.get('add'), q.get('store')); return json(res, r.status, r.body); }
    if (req.method === 'POST' && body && body.action === 'add') { const r = await addItem(body.name, body.store); return json(res, r.status, r.body); }
    if (level === 'add') return json(res, 403, { error: 'add-only-key' });
    if (req.method === 'POST' && body && body.action === 'bump') {        // the frame / phone app adding an item itself
      const n = cleanName(body.name); if (!n) return json(res, 400, { error: 'empty-name' });
      await bump(n); return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && body && body.action === 'toggle') {
      const raw = await redis(['GET', KEY]);
      const state = raw ? JSON.parse(raw) : { items: [], updated: 0 };
      const item = (state.items || []).find((g) => g.id === String(body.id));
      if (!item) return json(res, 404, { error: 'not-found' });
      item.done = body.done === undefined ? !item.done : !!body.done;
      const next = { items: state.items, updated: Date.now() };
      await redis(['SET', KEY, JSON.stringify(next)]);
      return json(res, 200, { ok: true, item });
    }
    if (req.method === 'GET') {
      const [raw, c] = await Promise.all([redis(['GET', KEY]), counts()]);
      return json(res, 200, { ...(raw ? JSON.parse(raw) : { items: [], updated: 0 }), counts: c });
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      if (level === 'todo') return json(res, 403, { error: 'pin-cannot-replace-list' });
      if (!body || !Array.isArray(body.items) || body.items.length > 500) return json(res, 400, { error: 'bad body' });
      const items = body.items.map((g) => ({
        id: String(g.id).slice(0, 40), name: String(g.name).slice(0, 80), cat: String(g.cat || 'Other').slice(0, 30),
        qty: Math.max(1, Math.min(99, +g.qty || 1)), store: String(g.store || '').slice(0, 30), done: !!g.done, note: String(g.note || '').slice(0, 120),
      }));
      const state = { items, updated: Date.now() };
      await redis(['SET', KEY, JSON.stringify(state)]);
      return json(res, 200, { ok: true, updated: state.updated });
    }
    res.setHeader('allow', 'GET, PUT');
    json(res, 405, { error: 'method not allowed' });
  } catch (err) {
    json(res, 502, { error: String(err.message || err) });
  }
}
