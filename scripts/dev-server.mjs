// Tiny local server for trying the frame without Vite/Vercel:  node scripts/dev-server.mjs
// Serves the static files and runs the /api handlers. With --mock it also fakes Google Calendar
// feeds and an Upstash Redis so every screen has data.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = +process.env.PORT || 5173;
const mock = process.argv.includes('--mock');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ics': 'text/calendar' };

if (mock) {
  const base = `http://127.0.0.1:${port}`;
  process.env.CALENDARS = JSON.stringify([
    { person: 'family', url: `${base}/__mock/family.ics` }, { person: 'alex', url: `${base}/__mock/alex.ics` }, { person: 'jordan', url: `${base}/__mock/jordan.ics` },
    { person: 'riley', url: `${base}/__mock/riley.ics` }, { person: 'casey', url: `${base}/__mock/casey.ics` },
    { person: 'jordan', color: '#8BD18F', label: "Jordan's Work", url: `${base}/__mock/work.ics` },
  ]);
  process.env.TIMEZONE = 'America/New_York';
  process.env.QUOTES_BASE = `${base}/__mock/yahoo`;
  process.env.UPSTASH_REDIS_REST_URL = `${base}/__mock/redis`;
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
}
const redisStore = new Map();

function mockIcs(who) {
  const d = new Date(); const pad = (n) => String(n).padStart(2, '0');
  const day = (off) => { const x = new Date(d.getTime() + off * 86400000); return `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}`; };
  const ev = (uid, off, s, e, title, extra = '') => `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTART;TZID=America/New_York:${day(off)}T${s}00\r\nDTEND;TZID=America/New_York:${day(off)}T${e}00\r\nSUMMARY:${title}\r\n${extra}END:VEVENT\r\n`;
  const body = {
    family: ev('f1', 0, '1830', '1930', 'Dinner at Nonna\'s', 'LOCATION:Nonna\'s\r\n') + `BEGIN:VEVENT\r\nUID:f2\r\nDTSTART;VALUE=DATE:${day(2)}\r\nDTEND;VALUE=DATE:${day(4)}\r\nSUMMARY:Grandma visits\r\nEND:VEVENT\r\n` + ev('f3', 3, '1900', '2100', 'Movie night'),
    alex: ev('a1', 0, '0815', '0840', 'School drop-off') + ev('a2', 0, '1300', '1400', 'Lunch with Chris', 'LOCATION:Café Rustica\r\n') + ev('a3', 1, '0900', '1000', 'Design review'),
    jordan: ev('s1', 0, '1200', '1245', 'Dentist') + ev('s2', 1, '1900', '2100', 'Book club') + `BEGIN:VEVENT\r\nUID:s3\r\nDTSTART;TZID=America/New_York:20260105T190000\r\nDTEND;TZID=America/New_York:20260105T200000\r\nRRULE:FREQ=WEEKLY;BYDAY=WE\r\nSUMMARY:Yoga\r\nEND:VEVENT\r\n`,
    riley: `BEGIN:VEVENT\r\nUID:j1\r\nDTSTART;TZID=America/New_York:20260105T163000\r\nDTEND;TZID=America/New_York:20260105T180000\r\nRRULE:FREQ=WEEKLY;BYDAY=TU,TH\r\nSUMMARY:Soccer practice\r\nLOCATION:Lakeshore Fields\r\nEND:VEVENT\r\n` + ev('j2', 0, '1600', '1645', 'Piano lesson'),
    work: ev('w1', 0, '1330', '1700', 'Clinic shift') + ev('w2', 1, '0700', '1530', 'Clinic shift') + `BEGIN:VEVENT\r\nUID:w3\r\nDTSTART;VALUE=DATE:${day(2)}\r\nDTEND;VALUE=DATE:${day(3)}\r\nSUMMARY:v\r\nEND:VEVENT\r\n`,
    casey: ev('r1', 0, '0900', '1500', 'Science Centre trip') + ev('r2', 1, '1600', '1800', 'Playdate with Leo'),
  }[who] || '';
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-TIMEZONE:America/New_York\r\n${body}END:VCALENDAR\r\n`;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (mock && url.pathname.startsWith('/__mock/redis')) {
      let b = ''; for await (const c of req) b += c;
      const cmd = JSON.parse(b); let result = null;
      const h = () => { if (!(redisStore.get(cmd[1]) instanceof Map)) redisStore.set(cmd[1], new Map()); return redisStore.get(cmd[1]); };
      if (cmd[0] === 'GET') result = redisStore.get(cmd[1]) ?? null; else if (cmd[0] === 'SET') { redisStore.set(cmd[1], cmd[2]); result = 'OK'; }
      else if (cmd[0] === 'HSET') { h().set(cmd[2], cmd[3]); result = 1; } else if (cmd[0] === 'HINCRBY') { result = (+h().get(cmd[2]) || 0) + (+cmd[3]); h().set(cmd[2], String(result)); } else if (cmd[0] === 'HGET') result = h().get(cmd[2]) ?? null;
      else if (cmd[0] === 'INCR') { result = (+redisStore.get(cmd[1]) || 0) + 1; redisStore.set(cmd[1], String(result)); } else if (cmd[0] === 'EXPIRE') result = 1; else if (cmd[0] === 'TTL') result = 900; else if (cmd[0] === 'DEL') { redisStore.delete(cmd[1]); result = 1; }
      else if (cmd[0] === 'HDEL') { cmd.slice(2).forEach((f) => h().delete(f)); result = 1; } else if (cmd[0] === 'HGETALL') result = [...h()].flat();
      res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ result }));
    }
    if (mock && url.pathname === '/__mock/yahoo/v1/finance/search') {            // fake Yahoo search (Add sheet)
      const all = [['AAPL', 'Apple Inc.'], ['APLE', 'Apple Hospitality REIT, Inc.'], ['MSFT', 'Microsoft Corporation'], ['MU', 'Micron Technology, Inc.'],
        ['AMD', 'Advanced Micro Devices, Inc.'], ['JPM', 'JPMorgan Chase & Co.'], ['KO', 'The Coca-Cola Company'], ['TSLA', 'Tesla, Inc.'], ['SPY', 'SPDR S&P 500 ETF Trust']];
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const quotes = all.filter(([s, n]) => s.toLowerCase().startsWith(q) || n.toLowerCase().includes(q))
        .map(([symbol, shortname]) => ({ symbol, shortname, quoteType: symbol === 'SPY' ? 'ETF' : 'EQUITY', exchDisp: 'NASDAQ' }));
      res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ quotes }));
    }
    if (mock && url.pathname.startsWith('/__mock/yahoo/v8/finance/chart/')) {   // fake Yahoo quotes
      const sym = decodeURIComponent(path.basename(url.pathname)); res.setHeader('content-type', 'application/json');
      if (sym === 'NOPE') { res.statusCode = 404; return res.end('{}'); }
      let h = 0; for (const c of sym) h = (h * 31 + c.charCodeAt(0)) % 9973;
      const prev = 40 + (h % 400) + 0.37, pct = ((h % 11) - 5) / 2.2, price = +(prev * (1 + pct / 100)).toFixed(2);
      const close = Array.from({ length: 78 }, (_, i) => +(prev + (price - prev) * (i / 77) + Math.sin(i / 5 + h) * prev * 0.004).toFixed(2));
      return res.end(JSON.stringify({ chart: { result: [{ meta: { symbol: sym, shortName: sym + ' Inc.', currency: 'USD', regularMarketPrice: price, chartPreviousClose: prev, marketState: 'REGULAR' }, indicators: { quote: [{ close }] } }] } }));
    }
    if (mock && url.pathname.startsWith('/__mock/') && url.pathname.endsWith('.ics')) {
      res.setHeader('content-type', 'text/calendar'); return res.end(mockIcs(path.basename(url.pathname, '.ics')));
    }
    if (url.pathname.startsWith('/api/')) {
      const file = path.join(root, url.pathname.replace(/\/$/, '') + '.js');
      if (!file.startsWith(path.join(root, 'api')) || !fs.existsSync(file)) { res.statusCode = 404; return res.end('{}'); }
      if (req.method !== 'GET') { let b = ''; for await (const c of req) b += c; try { req.body = JSON.parse(b); } catch { req.body = b; } }
      return (await import(pathToFileURL(file).href)).default(req, res);
    }
    let rel = decodeURIComponent(url.pathname); if (rel === '/') rel = '/index.html';
    for (const dir of [root, path.join(root, 'public')]) {
      const f = path.join(dir, rel);
      if (f.startsWith(dir) && fs.existsSync(f) && fs.statSync(f).isFile()) {
        res.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream'); return res.end(fs.readFileSync(f));
      }
    }
    res.statusCode = 404; res.end('not found');
  } catch (e) { res.statusCode = 500; res.end(String(e.stack || e)); }
}).listen(port, () => console.log(`Family Frame dev server: http://localhost:${port}${mock ? '  (mock data)' : ''}`));
