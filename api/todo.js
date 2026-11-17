// The shared to-do list.
//
//   GET  /api/todo                      -> { items }                      (full key)
//   POST /api/todo {action:'add', text, who?, source?}   -> { ok, item, message }
//   GET  /api/todo?add=Fix the gate&who=alex             -> same as the POST above (for tools that can only
//                                                           open a link: Siri shortcuts, IFTTT, Voice Monkey ...)
//   POST /api/todo {action:'toggle', id, done?}          -> { ok, item }   (full key)
//   POST /api/todo {action:'delete', id}                 -> { ok }         (full key)
//   POST /api/todo {action:'clear-done', who?}           -> { ok, cleared } (full key; removes finished items)
//
// Keys:  FRAME_KEY can do everything. A phone that entered the family PIN (TODO_PIN, /api/pin) can do everything on the list.  ADD_KEY (optional; TODO_ADD_KEY also works) can ONLY add items, so it is the one
// to give to a phone page, a voice assistant or any automation service. Pass either as ?key=...
//
// Stored in Upstash Redis as a hash (one field per item), so two people adding at the same moment
// never overwrite each other. Finished items are removed automatically after 3 days.
import { access, deny, json } from '../lib/auth.js';

const URL_ = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const KEY = 'family-frame:todo';
const KEEP_DONE_MS = 3 * 24 * 3600 * 1000;
const MAX_OPEN = 200;
const NOBODY = ['anyone', 'everyone', 'family', 'nobody', 'none', 'all'];

async function redis(cmd) {
  const r = await fetch(URL_(), { method: 'POST', headers: { authorization: 'Bearer ' + TOKEN(), 'content-type': 'application/json' }, body: JSON.stringify(cmd) });
  if (!r.ok) throw new Error('Redis ' + r.status);
  return (await r.json()).result;
}

function cleanText(t) {
  const s = String(t || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function cleanWho(w) {
  w = String(w || '').toLowerCase().trim();
  return /^[a-z0-9-]{1,20}$/.test(w) && !NOBODY.includes(w) ? w : '';
}

async function list() {
  const flat = (await redis(['HGETALL', KEY])) || [];
  const now = Date.now(), items = [], expired = [];
  for (let i = 1; i < flat.length; i += 2) {
    let it; try { it = JSON.parse(flat[i]); } catch { continue; }
    if (it.done && now - (it.doneAt || it.created) > KEEP_DONE_MS) expired.push(it.id); else items.push(it);
  }
  if (expired.length) redis(['HDEL', KEY, ...expired]).catch(() => {});
  items.sort((a, b) => (a.done - b.done) || (a.done ? (b.doneAt || 0) - (a.doneAt || 0) : a.created - b.created));
  return items;
}

async function add(textRaw, whoRaw, source) {
  const text = cleanText(textRaw);
  if (!text) return { status: 400, body: { error: 'empty-text' } };
  const items = await list();
  const open = items.filter((i) => !i.done);
  const dup = open.find((i) => i.text.toLowerCase() === text.toLowerCase());
  if (dup) return { status: 200, body: { ok: true, duplicate: true, item: dup, message: `"${dup.text}" is already on the to-do list` } };
  if (open.length >= MAX_OPEN) return { status: 409, body: { error: 'list-full' } };
  const item = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text, who: cleanWho(whoRaw), done: false, created: Date.now(), source: String(source || '').slice(0, 20) };
  await redis(['HSET', KEY, item.id, JSON.stringify(item)]);
  return { status: 200, body: { ok: true, item, message: `Added "${text}" to the to-do list` } };
}

export default async function handler(req, res) {
  const level = access(req);
  if (!level) return deny(res);
  if (!URL_() || !TOKEN()) return json(res, 501, { error: 'storage-not-configured' });
  try {
    const q = new URL(req.url, 'http://x').searchParams;
    if (req.method === 'GET') {
      if (q.has('add')) { const r = await add(q.get('add'), q.get('who'), q.get('source') || 'link'); return json(res, r.status, r.body); }
      if (level === 'add') return json(res, 403, { error: 'add-only-key' });
      return json(res, 200, { items: await list(), updated: Date.now() });
    }
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
      if (!body || typeof body !== 'object') return json(res, 400, { error: 'bad body' });
      if (body.action === 'add') { const r = await add(body.text, body.who, body.source || 'api'); return json(res, r.status, r.body); }
      if (level === 'add') return json(res, 403, { error: 'add-only-key' });
      if (body.action === 'clear-done') {                       // remove finished items (optionally only one person's)
        const w = body.who ? cleanWho(body.who) : null;
        const gone = (await list()).filter((i) => i.done && (w === null || i.who === w)).map((i) => i.id);
        if (gone.length) await redis(['HDEL', KEY, ...gone]);
        return json(res, 200, { ok: true, cleared: gone.length });
      }
      const id = String(body.id || '').slice(0, 40);
      if (!id) return json(res, 400, { error: 'missing id' });
      if (body.action === 'toggle') {
        const raw = await redis(['HGET', KEY, id]);
        if (!raw) return json(res, 404, { error: 'not-found' });
        const it = JSON.parse(raw);
        it.done = typeof body.done === 'boolean' ? body.done : !it.done;
        it.doneAt = it.done ? Date.now() : 0;
        await redis(['HSET', KEY, id, JSON.stringify(it)]);
        return json(res, 200, { ok: true, item: it });
      }
      if (body.action === 'delete') { await redis(['HDEL', KEY, id]); return json(res, 200, { ok: true }); }
      return json(res, 400, { error: 'unknown action' });
    }
    res.setHeader('allow', 'GET, POST');
    json(res, 405, { error: 'method not allowed' });
  } catch (err) {
    json(res, 502, { error: String(err.message || err) });
  }
}
