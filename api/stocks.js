// The family's stock watchlist and its quotes.
//
//   GET  /api/stocks                          -> { symbols, quotes }    (watchlist from storage)
//   GET  /api/stocks?symbols=AAPL,MSFT        -> { symbols, quotes }    (no storage set up: the frame keeps the list itself)
//   GET  /api/stocks?search=apple             -> { results: [{ symbol, name, exch }] }   (Add sheet suggestions)
//   POST /api/stocks {action:'add', symbol}   -> { ok, symbols, quotes }
//   POST /api/stocks {action:'remove', symbol}-> { ok, symbols }
//
// The list lives in Upstash Redis (same as the to-do list) so every screen shows the same stocks.
import { access, deny, json } from '../lib/auth.js';
import { quotes, cleanSymbol, search } from '../lib/quotes.js';

const URL_ = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const KEY = 'family-frame:stocks';
const DEFAULTS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'SPY'];
const MAX = 24;

async function redis(cmd) {
  const r = await fetch(URL_(), { method: 'POST', headers: { authorization: 'Bearer ' + TOKEN(), 'content-type': 'application/json' }, body: JSON.stringify(cmd) });
  if (!r.ok) throw new Error('Redis ' + r.status);
  return (await r.json()).result;
}
async function load() {
  const raw = await redis(['GET', KEY]);
  if (!raw) return DEFAULTS.slice();
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a : DEFAULTS.slice(); } catch { return DEFAULTS.slice(); }
}
const save = (list) => redis(['SET', KEY, JSON.stringify(list)]);

export default async function handler(req, res) {
  const level = access(req);
  if (level !== 'full') return deny(res);
  try {
    const q = new URL(req.url, 'http://x').searchParams;
    const stored = !!(URL_() && TOKEN());
    if (req.method === 'GET' && q.has('search')) return json(res, 200, { results: await search(q.get('search')) });
    if (req.method === 'GET') {
      let symbols;
      if (q.has('symbols')) symbols = [...new Set(q.get('symbols').split(',').map(cleanSymbol).filter(Boolean))].slice(0, MAX);
      else symbols = stored ? await load() : DEFAULTS.slice();
      return json(res, 200, { symbols, stored, quotes: await quotes(symbols) });
    }
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
      if (!body || typeof body !== 'object') return json(res, 400, { error: 'bad body' });
      const sym = cleanSymbol(body.symbol);
      if (!sym) return json(res, 400, { error: 'bad-symbol' });
      if (!stored) return json(res, 501, { error: 'storage-not-configured' });
      let list = await load();
      if (body.action === 'add') {
        if (!list.includes(sym)) {
          if (list.length >= MAX) return json(res, 409, { error: 'list-full' });
          const [qt] = await quotes([sym]);
          if (qt.error) return json(res, 404, { error: 'unknown-symbol', symbol: sym, why: qt.why });
          list.push(sym); await save(list);
          return json(res, 200, { ok: true, symbols: list, quotes: [qt] });
        }
        return json(res, 200, { ok: true, symbols: list, quotes: [] });
      }
      if (body.action === 'remove') { list = list.filter((s) => s !== sym); await save(list); return json(res, 200, { ok: true, symbols: list }); }
      return json(res, 400, { error: 'unknown action' });
    }
    res.setHeader('allow', 'GET, POST');
    json(res, 405, { error: 'method not allowed' });
  } catch (err) {
    json(res, 502, { error: String(err.message || err) });
  }
}
