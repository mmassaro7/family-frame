// Run with: node scripts/test-netlify.mjs
// Calls the Netlify functions exactly the way Netlify does (a web Request in, a Response out),
// with fake Google Calendar feeds and a fake Redis served from this script.
import assert from 'node:assert/strict';
import http from 'node:http';

const redis = new Map();
const ics = (title) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:${title}\r\nDTSTART:20300105T150000Z\r\nDTEND:20300105T160000Z\r\nSUMMARY:${title}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/redis')) {
    let b = ''; for await (const c of req) b += c;
    const [cmd, k, v, v2] = JSON.parse(b); let result = null;
    const hash = () => { if (!(redis.get(k) instanceof Map)) redis.set(k, new Map()); return redis.get(k); };
    if (cmd === 'GET') result = redis.get(k) ?? null; else if (cmd === 'SET') { redis.set(k, v); result = 'OK'; }
    else if (cmd === 'HSET') { hash().set(v, v2); result = 1; } else if (cmd === 'HINCRBY') { result = (+hash().get(v) || 0) + (+v2); hash().set(v, String(result)); } else if (cmd === 'HGET') result = hash().get(v) ?? null;
    else if (cmd === 'INCR') { result = (+redis.get(k) || 0) + 1; redis.set(k, String(result)); } else if (cmd === 'EXPIRE') result = 1; else if (cmd === 'TTL') result = 900; else if (cmd === 'DEL') { redis.delete(k); result = 1; }
    else if (cmd === 'HDEL') { JSON.parse(b).slice(2).forEach((f) => hash().delete(f)); result = 1; } else if (cmd === 'HGETALL') result = [...hash()].flat();
    res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ result }));
  }
  if (req.url.startsWith('/yahoo/v8/finance/chart/')) {
    const sym = decodeURIComponent(req.url.split('/chart/')[1].split('?')[0]);
    res.setHeader('content-type', 'application/json');
    if (sym === 'NOPE') { res.statusCode = 404; return res.end('{}'); }
    return res.end(JSON.stringify({ chart: { result: [{ meta: { shortName: sym + ' Inc', regularMarketPrice: 110, chartPreviousClose: 100, currency: 'USD' }, indicators: { quote: [{ close: [100, null, 105, 110] }] } }] } }));
  }
  res.setHeader('content-type', 'text/calendar'); res.end(ics(req.url.slice(1, -4)));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
process.env.CALENDARS = JSON.stringify([{ person: 'alex', url: `${base}/Dentist.ics` }, { person: 'jordan', color: '#8BD18F', url: `${base}/Shift.ics` }]);
process.env.TIMEZONE = 'America/New_York';
process.env.FRAME_KEY = 'secret';
process.env.ADD_KEY = 'addonly';
process.env.TODO_PIN = '2468';
process.env.QUOTES_BASE = `${base}/yahoo`;
process.env.UPSTASH_REDIS_REST_URL = `${base}/redis`;
process.env.UPSTASH_REDIS_REST_TOKEN = 't';
delete process.env.DRIVE_FOLDER_ID;

const call = async (name, path, init) => {
  const fn = (await import(`../netlify/functions/${name}.mjs`)).default;
  const r = await fn(new Request('https://site.test' + path, init));
  return { status: r.status, body: await r.json(), headers: r.headers };
};

// path routing is declared in each function's config
for (const n of ['calendar', 'photos', 'shopping', 'todo', 'pin', 'stocks']) {
  assert.equal((await import(`../netlify/functions/${n}.mjs`)).config.path, `/api/${n}`);
}

// auth
assert.equal((await call('calendar', '/api/calendar')).status, 401);
assert.equal((await call('calendar', '/api/calendar?key=wrong')).status, 401);

// calendar: both feeds read, colour passed through
let r = await call('calendar', '/api/calendar?key=secret&ahead=3650');
assert.equal(r.status, 200);
assert.deepEqual(r.body.events.map((e) => [e.title, e.people[0], e.color || null]).sort(), [['Dentist', 'alex', null], ['Shift', 'jordan', '#8BD18F']]);
r = await call('calendar', '/api/calendar?key=secret&debug=1&ahead=3650');
assert.equal(r.body.feeds.length, 2);

// photos not configured → 501
assert.equal((await call('photos', '/api/photos?key=secret')).status, 501);

// shopping: PUT then GET round-trips through the fake Redis
const items = [{ id: 'g1', name: 'Milk', cat: 'Dairy & Eggs', qty: 2, store: 'kroger', done: false, note: '' }];
r = await call('shopping', '/api/shopping?key=secret', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items }) });
assert.equal(r.status, 200);
r = await call('shopping', '/api/shopping?key=secret');
assert.deepEqual(r.body.items.map((i) => [i.name, i.qty]), [['Milk', 2]]);
assert.equal((await call('shopping', '/api/shopping?key=secret', { method: 'DELETE' })).status, 405);

// to-do: add-only key can add but not read/modify; full key can do everything
r = await call('todo', '/api/todo');                           assert.equal(r.status, 401);
assert.equal((await call('calendar', '/api/calendar?key=addonly')).status, 401);   // the add-only key opens nothing else
assert.equal((await call('shopping', '/api/shopping?key=addonly')).status, 403);                      // add-only key can't read the shopping list either
r = await call('todo', '/api/todo?key=addonly');               assert.equal(r.status, 403);            // add-only key cannot read
r = await call('todo', '/api/todo?key=addonly&add=hang%20the%20shelf&who=Jordan&source=alexa');
assert.equal(r.status, 200); assert.equal(r.body.item.text, 'Hang the shelf'); assert.equal(r.body.item.who, 'jordan');
assert.match(r.body.message, /Added "Hang the shelf"/);
const id1 = r.body.item.id;
r = await call('todo', '/api/todo?key=addonly&add=HANG%20THE%20SHELF'); assert.equal(r.body.duplicate, true);   // voice repeats don't double up
r = await call('todo', '/api/todo?key=secret', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'add', text: '  Fix   the gate ', who: 'alex' }) });
assert.equal(r.body.item.text, 'Fix the gate');
const id2 = r.body.item.id;
r = await call('todo', '/api/todo?key=addonly', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'toggle', id: id1 }) });
assert.equal(r.status, 403);                                                                      // add-only key cannot toggle
r = await call('todo', '/api/todo?key=secret', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'toggle', id: id1 }) });
assert.equal(r.body.item.done, true);
r = await call('todo', '/api/todo?key=secret');
assert.deepEqual(r.body.items.map((i) => [i.text, i.done]), [['Fix the gate', false], ['Hang the shelf', true]]);   // open first, then done
r = await call('todo', '/api/todo?key=secret', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'delete', id: id2 }) });
r = await call('todo', '/api/todo?key=secret'); assert.equal(r.body.items.length, 1);
r = await call('todo', '/api/todo?key=addonly&add=%20%20'); assert.equal(r.status, 400);          // empty text rejected
// clear-done: only finished items go; add-only key cannot
await call('todo', '/api/todo?key=secret', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'add', text: 'Keep me', who: 'alex' }) });
r = await call('todo', '/api/todo?key=addonly', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'clear-done' }) });
assert.equal(r.status, 403);
r = await call('todo', '/api/todo?key=secret', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'clear-done' }) });
assert.equal(r.body.cleared, 1);                                                                    // the checked-off 'Hang the shelf'
r = await call('todo', '/api/todo?key=secret');
assert.deepEqual(r.body.items.map((i) => i.text), ['Keep me']);

// shopping: add one item with the add-only key, without disturbing the rest of the list
r = await call('shopping', '/api/shopping?key=addonly&add=batteries'); assert.equal(r.status, 200);
assert.equal(r.body.item.name, 'Batteries'); assert.equal(r.body.item.cat, 'Other'); assert.equal(r.body.item.store, '');
assert.equal(r.body.message, 'Added Batteries to the shopping list');
r = await call('shopping', '/api/shopping?key=addonly&add=BATTERIES'); assert.equal(r.body.item.qty, 2);
assert.match(r.body.message, /already on the shopping list. Now two/);
r = await call('shopping', '/api/shopping?key=addonly', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'add', name: 'paper towels', store: 'sams' }) });
assert.equal(r.body.item.store, 'sams');
r = await call('shopping', '/api/shopping?key=secret');
assert.deepEqual(r.body.items.map((i) => [i.name, i.qty]), [['Milk', 2], ['Batteries', 2], ['Paper towels', 1]]);   // Milk from the earlier PUT is still there
r = await call('shopping', '/api/shopping?key=addonly&add=%20'); assert.equal(r.status, 400);
r = await call('shopping', '/api/shopping?key=addonly', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [] }) });
assert.equal(r.status, 403);                                                                         // add-only key can't overwrite the list

// PIN: a phone trades the PIN for a token that opens only the to-do list
const post = (path, body, headers = {}) => call('pin', path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
r = await call('pin', '/api/pin');                                           assert.equal(r.status, 405);
r = await post('/api/pin', {});                                              assert.equal(r.status, 400);
r = await post('/api/pin', { pin: '1111' }, { 'x-nf-client-connection-ip': '9.9.9.9' });
assert.equal(r.status, 401); assert.equal(r.body.triesLeft, 4);
r = await post('/api/pin', { pin: ' 2468 ' }, { 'x-nf-client-connection-ip': '1.2.3.4' });
assert.equal(r.status, 200); const token = r.body.token; assert.match(token, /^[0-9a-f]{64}$/);
assert.equal((await call('todo', '/api/todo?key=' + token)).status, 200);                           // token reads the list
r = await call('todo', '/api/todo?key=' + token, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'add', text: 'From a phone' }) });
assert.equal(r.status, 200);
r = await call('todo', '/api/todo?key=' + token, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'toggle', id: r.body.item.id }) });
assert.equal(r.body.item.done, true);                                                               // and changes it
for (const n of ['calendar', 'photos']) assert.equal((await call(n, `/api/${n}?key=` + token)).status, 401);   // but opens no calendar or photos
// the PIN code also works on the shopping list: read, add, check off, but never replace it
assert.equal((await call('shopping', '/api/shopping?key=' + token)).status, 200);
r = await call('shopping', '/api/shopping?key=' + token, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'add', name: 'oat milk', store: 'kroger' }) });
assert.equal(r.status, 200);
r = await call('shopping', '/api/shopping?key=' + token, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'toggle', id: r.body.item.id }) });
assert.equal(r.body.item.done, true);
r = await call('shopping', '/api/shopping?key=' + token, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: [] }) });
assert.equal(r.status, 403);
// lock-out after 5 wrong guesses from one address, even for the right PIN
for (let i = 0; i < 4; i++) await post('/api/pin', { pin: '0000' }, { 'x-nf-client-connection-ip': '9.9.9.9' });   // 5 wrong in total
r = await post('/api/pin', { pin: '2468' }, { 'x-nf-client-connection-ip': '9.9.9.9' });
assert.equal(r.status, 429); assert.ok(r.body.retryMinutes >= 1);
r = await post('/api/pin', { pin: '2468' }, { 'x-nf-client-connection-ip': '5.5.5.5' });              // another address is unaffected
assert.equal(r.status, 200);
// changing the PIN invalidates old tokens
process.env.TODO_PIN = '1357';
assert.equal((await call('todo', '/api/todo?key=' + token)).status, 401);
process.env.TODO_PIN = '2468';
// no PIN configured -> 501
delete process.env.TODO_PIN;
assert.equal((await post('/api/pin', { pin: 'x' })).status, 501);
process.env.TODO_PIN = '2468';

// usuals: every add is counted (voice/phone adds and the app's own 'bump'), shared by all screens
const base0 = (await call('shopping', '/api/shopping?key=secret')).body.counts.batteries;
r = await call('shopping', '/api/shopping?key=addonly&add=batteries'); assert.equal(r.status, 200);
r = await call('shopping', '/api/shopping?key=addonly&add=Batteries');
r = await call('shopping', '/api/shopping?key=secret', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'bump', name: 'Batteries' }) }); assert.equal(r.status, 200);
assert.equal((await call('shopping', '/api/shopping?key=addonly', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'bump', name: 'x' }) })).status, 403);
r = await call('shopping', '/api/shopping?key=secret'); assert.equal(r.body.counts.batteries, base0 + 3);

// stocks: full key only; default list, add (validated against the feed), remove, explicit symbols
const sp = (b) => call('stocks', '/api/stocks?key=secret', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
assert.equal((await call('stocks', '/api/stocks')).status, 401);
assert.equal((await call('stocks', '/api/stocks?key=addonly')).status, 401);
r = await call('stocks', '/api/stocks?key=secret');
assert.equal(r.status, 200); assert.ok(r.body.symbols.includes('AAPL'));
const q0 = r.body.quotes[0]; assert.equal(q0.price, 110); assert.equal(q0.change, 10); assert.equal(q0.pct, 10); assert.deepEqual(q0.spark, [100, 105, 110]);
r = await sp({ action: 'add', symbol: ' $nflx ' }); assert.equal(r.status, 200); assert.ok(r.body.symbols.includes('NFLX'));
assert.equal((await sp({ action: 'add', symbol: 'NOPE' })).status, 404);
assert.equal((await sp({ action: 'add', symbol: 'bad symbol!' })).status, 400);
r = await sp({ action: 'remove', symbol: 'AAPL' }); assert.ok(!r.body.symbols.includes('AAPL') && r.body.symbols.includes('NFLX'));
r = await call('stocks', '/api/stocks?key=secret'); assert.ok(r.body.symbols.includes('NFLX') && !r.body.symbols.includes('AAPL'));
r = await call('stocks', '/api/stocks?key=secret&symbols=ibm,,x%20y'); assert.deepEqual(r.body.symbols, ['IBM']);

console.log('netlify function tests passed');
server.close();
