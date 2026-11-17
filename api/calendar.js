// GET /api/calendar  →  { events: [...], errors: [...] }
// Env: CALENDARS = JSON array of { "person": "<id from js/config.js, or 'family'>", "url": "<secret iCal address>",
//        optional: "color": "#8BD18F" (draw this calendar's events in that color), "ink": "#111111", "label": "Jordan's Work" }
//      TIMEZONE  = e.g. America/New_York (used for events that have no time zone)
import { parseICS, expand } from '../lib/ics.js';
import { authorized, deny, json } from '../lib/auth.js';

export default async function handler(req, res) {
  if (!authorized(req)) return deny(res);
  let feeds;
  try { feeds = JSON.parse(process.env.CALENDARS || '[]'); } catch { return json(res, 500, { error: 'CALENDARS is not valid JSON' }); }
  if (!Array.isArray(feeds) || !feeds.length) return json(res, 501, { error: 'calendar-not-configured' });

  const tz = process.env.TIMEZONE || 'UTC';
  const u = new URL(req.url, 'http://x');
  const now = Date.now();
  const from = now - (+u.searchParams.get('back') || 45) * 86400000;
  // A year ahead, so paging Month view forward still shows events (90 days left March empty in November).
  const to = now + (+u.searchParams.get('ahead') || 366) * 86400000;

  const errors = [];
  const debug = u.searchParams.get('debug') === '1';
  const feedStats = [];
  const lists = await Promise.all(feeds.map(async (f) => {
    try {
      const r = await fetch(String(f.url).replace(/^webcal:/i, 'https:'), { headers: { 'user-agent': 'family-frame' }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const text = await r.text();
      const parsed = parseICS(text, tz);
      const out = expand(parsed, from, to, tz).map((e) => ({ ...e, person: f.person, color: f.color, ink: f.ink, label: f.label }));
      if (debug) {
        feedStats.push({
          person: f.person, http: r.status, contentType: r.headers.get('content-type'), bytes: text.length,
          looksLikeICS: text.includes('BEGIN:VCALENDAR'), vevents: (text.match(/BEGIN:VEVENT/g) || []).length,
          withRRULE: (text.match(/\nRRULE:/g) || []).length, parsed: parsed.events.length, inWindow: out.length,
          calendarTimezone: parsed.tz, firstBytes: text.slice(0, 40).replace(/[^\x20-\x7e]/g, '·'),
        });
      }
      return out;
    } catch (err) {
      errors.push({ person: f.person, error: String(err.message || err) });
      return [];
    }
  }));

  // The same event often appears in several calendars (invites). Merge those into one with several people.
  const merged = new Map();
  for (const e of lists.flat()) {
    const k = [e.title, e.start, e.end, e.allDay, e.color || ''].join('|');
    const m = merged.get(k);
    if (m) { if (!m.people.includes(e.person)) m.people.push(e.person); if (!m.loc && e.loc) m.loc = e.loc; }
    else merged.set(k, { id: e.id + ':' + e.person, title: e.title, loc: e.loc, notes: e.notes, allDay: e.allDay, start: e.start, end: e.end, people: [e.person], color: e.color, ink: e.ink, label: e.label });
  }
  if (debug) return json(res, 200, { feeds: feedStats, errors, window: { from: new Date(from).toISOString(), to: new Date(to).toISOString() }, total: merged.size });
  json(res, 200, { events: [...merged.values()], errors }, 's-maxage=120, stale-while-revalidate=600');
}
