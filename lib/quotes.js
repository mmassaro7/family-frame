// Stock quotes from Yahoo Finance's public chart feed (unofficial, no key needed).
// Each symbol is one small request; results are cached for a minute so a frame, a phone and a
// screensaver asking at once cost a single trip. A symbol that fails comes back with error:true
// instead of breaking the rest.
const BASE = () => process.env.QUOTES_BASE || 'https://query1.finance.yahoo.com';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const TTL = 60 * 1000;
const cache = new Map();

export function cleanSymbol(s) {
  s = String(s || '').toUpperCase().trim().replace(/^\$/, '');
  return /^[A-Z0-9][A-Z0-9.\-^=]{0,11}$/.test(s) ? s : '';
}

const get = (url, accept) => fetch(url, { headers: { 'user-agent': UA, accept: accept || 'application/json' }, signal: AbortSignal.timeout(7000) })
  .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r; });
const num = (v) => { const n = parseFloat(String(v).replace(/[$,%+\s]/g, '')); return Number.isFinite(n) ? n : null; };
function build(sym, name, price, prev, spark, state, currency) {
  const change = typeof prev === 'number' ? price - prev : 0;
  const step = Math.max(1, Math.ceil(spark.length / 40));
  return { symbol: sym, name: name || sym, price, prev: prev ?? null, change, pct: prev ? (change / prev) * 100 : 0, currency: currency || 'USD', state: state || '', spark: spark.filter((_, i) => i % step === 0) };
}

// 1. Yahoo Finance chart feed (intraday sparkline)
async function yahoo(sym, host) {
  const j = await (await get(`${host}/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=5m`)).json();
  const res = j?.chart?.result?.[0], m = res?.meta;
  if (!m || typeof m.regularMarketPrice !== 'number') throw new Error('no data');
  const spark = (res.indicators?.quote?.[0]?.close || []).filter((v) => typeof v === 'number');
  return build(sym, m.shortName || m.longName, m.regularMarketPrice, m.chartPreviousClose ?? m.previousClose, spark, m.marketState, m.currency);
}
// 2. Nasdaq's public quote API (stocks, then ETFs)
async function nasdaq(sym) {
  let last;
  for (const cls of ['stocks', 'etf']) {
    try {
      const j = await (await get(`https://api.nasdaq.com/api/quote/${encodeURIComponent(sym)}/info?assetclass=${cls}`)).json();
      const d = j?.data;
      // Outside regular hours Nasdaq's primaryData is the pre-market or after-hours trade, and the
      // regular session's close moves to secondaryData ("Closed at Nov 13, 2026 4:00 PM ET"). Show the
      // regular close, as Yahoo does, so the frame matches the closing prices other sites quote.
      const s = d?.secondaryData;
      const p = s && num(s.lastSalePrice) !== null && /^closed/i.test(s.lastTradeTimestamp || '') ? s : d?.primaryData;
      const price = num(p?.lastSalePrice);
      if (price === null) throw new Error('no data');
      const ch = num(p.netChange) ?? 0;
      const name = String(d.companyName || sym).replace(/\s+(Common Stock|Class [A-Z].*|Inc\.?|Corporation)$/i, '').trim();
      return build(sym, name, price, price - ch, [], d.marketStatus === 'Open' ? 'REGULAR' : 'CLOSED');
    } catch (e) { last = e; }
  }
  throw last;
}
// 3. Stooq daily closes (end-of-day; the last 30 days make the sparkline)
async function stooq(sym) {
  if (!/^[A-Z]+$/.test(sym)) throw new Error('n/a');
  const rows = (await (await get(`https://stooq.com/q/d/l/?s=${sym.toLowerCase()}.us&i=d`, 'text/csv')).text()).trim().split('\n').slice(1).map((l) => l.split(',')).filter((r) => num(r[4]) !== null);
  if (rows.length < 2) throw new Error('no data');
  const closes = rows.slice(-30).map((r) => num(r[4]));
  return build(sym, sym, closes[closes.length - 1], closes[closes.length - 2], closes, 'CLOSED');
}

async function one(sym) {
  const hit = cache.get(sym);
  if (hit && Date.now() - hit.at < TTL) return hit.q;
  const custom = !!process.env.QUOTES_BASE;           // tests and the mock server only talk to their own fake feed
  const tries = custom ? [() => yahoo(sym, BASE())] : [() => yahoo(sym, BASE()), () => yahoo(sym, 'https://query2.finance.yahoo.com'), () => nasdaq(sym), () => stooq(sym)];
  const why = [];
  for (const t of tries) {
    try { const q = await t(); cache.set(sym, { at: Date.now(), q }); return q; } catch (e) { why.push(String(e.message || e)); }
  }
  if (hit) return hit.q;                               // keep showing the last good numbers
  const q = { symbol: sym, name: sym, error: true, why: why.join(' | ') };
  cache.set(sym, { at: Date.now() - TTL + 10000, q }); // retry a failed symbol after 10 s, not 60
  return q;
}

export function quotes(symbols) { return Promise.all(symbols.map(one)); }

// ------------------------------------------------------------ search (the Add sheet's suggestions)
// Company names and tickers that match what's typed: [{ symbol, name, exch }], best match first.
// Yahoo's search ranks well-known companies first, but Yahoo answers Node's fetch (so Vercel) with
// 429 Too Many Requests; Nasdaq's symbol lookup is the fallback that usually answers.
// Only plain stocks and ETFs: those are what the quote sources above can price.
const searchCache = new Map();
const SEARCH_TTL = 10 * 60 * 1000;
// Preferred shares (JPM.PRC, JPM^C), warrants, units and rights clutter the list; leave them out.
const OTHER = /\.PR|\^|\//;
const OTHER_NAME = /\b(Warrants?|Units?|Rights?)\s*$|Depositary Shares,? each|Preferred/i;
const tidy = (n) => String(n).replace(/\s+(Common Stock|Common Shares|Ordinary Shares|Class [A-Z] (Common|Ordinary).*)$/i, '').trim();

async function yahooSearch(q, host) {
  const j = await (await get(`${host}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&listsCount=0`)).json();
  if (!Array.isArray(j?.quotes)) throw new Error('no data');
  return j.quotes.filter((x) => (x.quoteType === 'EQUITY' || x.quoteType === 'ETF') && cleanSymbol(x.symbol) && !OTHER.test(x.symbol))
    .map((x) => ({ symbol: x.symbol, name: tidy(x.shortname || x.longname || x.symbol), exch: x.exchDisp || x.exchange || '' }));
}
async function nasdaqSearch(q) {
  const j = await (await get(`https://api.nasdaq.com/api/autocomplete/slookup/50?search=${encodeURIComponent(q)}`)).json();
  if (!Array.isArray(j?.data)) throw new Error('no data');
  const Q = q.toUpperCase(), low = q.toLowerCase();
  // Nasdaq's matches come unranked: the exact ticker, then tickers starting with the text, then
  // companies whose name starts with it, then the rest (sort keeps Nasdaq's order within each).
  const rank = (x) => (x.symbol === Q ? 0 : x.symbol.startsWith(Q) ? 1 : x.name.toLowerCase().startsWith(low) ? 2 : 3);
  return j.data
    .filter((x) => (x.asset === 'STOCKS' || x.asset === 'ETF') && cleanSymbol(x.symbol) && !OTHER.test(x.symbol) && !OTHER_NAME.test(x.name || ''))
    .map((x) => ({ symbol: x.symbol, name: tidy(x.name || x.symbol), exch: x.exchange || '' }))
    .sort((a, b) => rank(a) - rank(b));
}

export async function search(text) {
  const q = String(text || '').trim().replace(/^\$/, '').slice(0, 40);
  if (!q) return [];
  const k = q.toLowerCase(), hit = searchCache.get(k);
  if (hit && Date.now() - hit.at < SEARCH_TTL) return hit.list;
  const tries = process.env.QUOTES_BASE ? [() => yahooSearch(q, BASE())]
    : [() => yahooSearch(q, BASE()), () => yahooSearch(q, 'https://query2.finance.yahoo.com'), () => nasdaqSearch(q)];
  for (const t of tries) {
    try {
      const seen = new Set(), list = (await t()).filter((x) => !seen.has(x.symbol) && seen.add(x.symbol)).slice(0, 8);
      searchCache.set(k, { at: Date.now(), list });
      return list;
    } catch { /* try the next source */ }
  }
  return [];
}
