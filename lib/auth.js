import { timingSafeEqual, createHmac } from 'node:crypto';

// If FRAME_KEY is set in Vercel, every /api call must carry ?key=<FRAME_KEY>.
// (Put that key in the frame's Fully Kiosk Start URL: https://your-app.vercel.app/?key=...)
function same(got, want) {
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function authorized(req) {
  const want = process.env.FRAME_KEY;
  if (!want) return true;
  return same(new URL(req.url, 'http://x').searchParams.get('key') || '', want);
}
// The code a phone receives after entering the family PIN (see api/pin.js). It is derived from
// FRAME_KEY + TODO_PIN, so it only opens /api/todo, and changing the PIN signs every phone out.
export function todoToken() {
  const pin = process.env.TODO_PIN, k = process.env.FRAME_KEY;
  return pin && k ? createHmac('sha256', k).update('todo-pin:' + pin).digest('hex') : '';
}
// For /api/todo and /api/shopping: 'full' (FRAME_KEY), 'todo' (PIN token: to-do list only), 'add' (ADD_KEY, which
// can only ADD items - safe to hand to a voice assistant or automation service) or null (no access).
export function access(req) {
  const want = process.env.FRAME_KEY, addKey = process.env.ADD_KEY || process.env.TODO_ADD_KEY;
  if (!want) return 'full';
  const got = new URL(req.url, 'http://x').searchParams.get('key') || '';
  if (same(got, want)) return 'full';
  if (addKey && same(got, addKey)) return 'add';
  const t = todoToken();
  if (t && same(got, t)) return 'todo';        // a phone that entered the PIN: everything on the to-do list
  return null;
}
export function deny(res) {
  res.statusCode = 401;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ error: 'unauthorized' }));
}
export function json(res, status, body, cache) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', cache || 'no-store');
  res.end(JSON.stringify(body));
}
