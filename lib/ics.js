// Minimal, dependency-free iCalendar (.ics) reader for Google Calendar "secret address" feeds.
// Handles: line folding, TZID / UTC / all-day dates, DURATION, RRULE (DAILY / WEEKLY / MONTHLY /
// YEARLY with INTERVAL, COUNT, UNTIL, BYDAY (incl. ordinals), BYMONTHDAY, BYMONTH), EXDATE,
// RECURRENCE-ID overrides and cancelled events.

const DAY = 86400000;
const WD = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// ---------------------------------------------------------------- time zones
const dtfCache = {};
function dtf(tz) {
  return (dtfCache[tz] ||= new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
  }));
}
// Offset (ms) of `tz` from UTC at the given instant.
function offsetAt(instant, tz) {
  if (tz === 'UTC') return 0;
  const p = {};
  for (const x of dtf(tz).formatToParts(new Date(instant))) p[x.type] = +x.value;
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000;
}
// "Wall clock" ms (the fields read as if they were UTC) in tz → real instant.
function wallToInstant(wall, tz) {
  if (tz === 'UTC') return wall;
  const guess = wall - offsetAt(wall, tz);
  return wall - offsetAt(guess, tz);
}
function instantToWall(instant, tz) { return instant + offsetAt(instant, tz); }

const WINDOWS_TZ = {
  'Eastern Standard Time': 'America/New_York', 'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver', 'Pacific Standard Time': 'America/Los_Angeles',
  'US Mountain Standard Time': 'America/Phoenix', 'Alaskan Standard Time': 'America/Anchorage',
  'Hawaiian Standard Time': 'Pacific/Honolulu', 'GMT Standard Time': 'Europe/London',
  'W. Europe Standard Time': 'Europe/Berlin', 'Romance Standard Time': 'Europe/Paris',
  'AUS Eastern Standard Time': 'Australia/Sydney', 'UTC': 'UTC',
};
function validTz(name, fallback) {
  if (!name) return fallback;
  name = WINDOWS_TZ[name] || name;
  try { dtf(name); return name; } catch { return fallback; }
}

// ---------------------------------------------------------------- parsing
function unfold(text) { return text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/); }
function unescapeText(v) { return v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1'); }

function parseLine(line) {
  const i = line.indexOf(':');
  if (i < 0) return null;
  // Colons can appear inside quoted params; find the first colon outside quotes.
  let q = false, split = -1;
  for (let k = 0; k < line.length; k++) {
    if (line[k] === '"') q = !q;
    else if (line[k] === ':' && !q) { split = k; break; }
  }
  if (split < 0) return null;
  const head = line.slice(0, split).split(';');
  const params = {};
  for (const p of head.slice(1)) {
    const e = p.indexOf('=');
    if (e > 0) params[p.slice(0, e).toUpperCase()] = p.slice(e + 1).replace(/^"|"$/g, '');
  }
  return { name: head[0].toUpperCase(), params, value: line.slice(split + 1) };
}

// → { allDay, wall, tz }  wall = fields-as-UTC ms.  `instant` is derived when needed.
function parseDT(value, params, defaultTz) {
  const m = value.match(/^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (params.VALUE === 'DATE' || h === undefined) return { allDay: true, wall: Date.UTC(+y, +mo - 1, +d), tz: 'UTC' };
  const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0));
  if (z) return { allDay: false, wall, tz: 'UTC' };
  return { allDay: false, wall, tz: validTz(params.TZID, defaultTz) };
}
const instantOf = (dt) => (dt.allDay ? dt.wall : wallToInstant(dt.wall, dt.tz));

function parseDuration(v) {
  const m = v.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (((+m[2] || 0) * 7 + (+m[3] || 0)) * DAY + (+m[4] || 0) * 3600000 + (+m[5] || 0) * 60000 + (+m[6] || 0) * 1000);
}

function parseRRule(v, defaultTz) {
  const r = { freq: null, interval: 1, byday: [], bymonthday: [], bymonth: [], wkst: 1 };
  for (const part of v.split(';')) {
    const [k, val] = part.split('=');
    switch (k) {
      case 'FREQ': r.freq = val; break;
      case 'INTERVAL': r.interval = Math.max(1, +val || 1); break;
      case 'COUNT': r.count = +val; break;
      case 'UNTIL': r.until = parseDT(val, {}, defaultTz); break;
      case 'BYDAY': r.byday = val.split(',').map((x) => { const m = x.match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/); return m ? { n: m[1] ? +m[1] : 0, wd: WD.indexOf(m[2]) } : null; }).filter(Boolean); break;
      case 'BYMONTHDAY': r.bymonthday = val.split(',').map(Number); break;
      case 'BYMONTH': r.bymonth = val.split(',').map(Number); break;
      case 'WKST': r.wkst = Math.max(0, WD.indexOf(val)); break;
    }
  }
  return r.freq ? r : null;
}

export function parseICS(text, defaultTz = 'UTC') {
  const lines = unfold(text);
  let calTz = defaultTz;
  const events = [];
  let cur = null;
  for (const raw of lines) {
    const l = parseLine(raw);
    if (!l) continue;
    if (l.name === 'X-WR-TIMEZONE') calTz = validTz(l.value, calTz);
    if (l.name === 'BEGIN' && l.value === 'VEVENT') { cur = { exdates: [], props: {} }; continue; }
    if (l.name === 'END' && l.value === 'VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    switch (l.name) {
      case 'UID': cur.uid = l.value; break;
      case 'SUMMARY': cur.summary = unescapeText(l.value); break;
      case 'LOCATION': cur.location = unescapeText(l.value); break;
      case 'DESCRIPTION': cur.description = unescapeText(l.value); break;
      case 'STATUS': cur.status = l.value.toUpperCase(); break;
      case 'DTSTART': cur.dtstart = { value: l.value, params: l.params }; break;
      case 'DTEND': cur.dtend = { value: l.value, params: l.params }; break;
      case 'DURATION': cur.duration = parseDuration(l.value); break;
      case 'RRULE': cur.rruleRaw = l.value; break;
      case 'EXDATE': for (const v of l.value.split(',')) cur.exdates.push({ value: v, params: l.params }); break;
      case 'RECURRENCE-ID': cur.recId = { value: l.value, params: l.params }; break;
    }
  }
  // Resolve date-times now that the calendar's default time zone is known.
  const out = [];
  for (const e of events) {
    if (!e.dtstart || e.status === 'CANCELLED') { if (e.status === 'CANCELLED' && e.recId) out.push({ ...e, cancelled: true, _calTz: calTz }); continue; }
    e._calTz = calTz;
    out.push(e);
  }
  return { events: out, tz: calTz };
}

// ---------------------------------------------------------------- expansion
const ymd = (ms) => { const d = new Date(ms); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]; };
const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

// All dates (as UTC-midnight ms) inside month (y, m) matching BYDAY / BYMONTHDAY, or the fallback day.
function monthDates(y, m, rule, fallbackDay) {
  const dim = daysInMonth(y, m), days = new Set();
  if (rule.bymonthday.length) {
    for (const n of rule.bymonthday) { const d = n > 0 ? n : dim + n + 1; if (d >= 1 && d <= dim) days.add(d); }
    if (rule.byday.length) { // BYDAY acts as a filter when combined with BYMONTHDAY
      for (const d of [...days]) { const wd = new Date(Date.UTC(y, m, d)).getUTCDay(); if (!rule.byday.some((b) => b.wd === wd)) days.delete(d); }
    }
  } else if (rule.byday.length) {
    for (const b of rule.byday) {
      const matches = [];
      for (let d = 1; d <= dim; d++) if (new Date(Date.UTC(y, m, d)).getUTCDay() === b.wd) matches.push(d);
      if (!b.n) matches.forEach((d) => days.add(d));
      else { const d = b.n > 0 ? matches[b.n - 1] : matches[matches.length + b.n]; if (d) days.add(d); }
    }
  } else if (fallbackDay <= dim) days.add(fallbackDay);
  return [...days].sort((a, b) => a - b).map((d) => Date.UTC(y, m, d));
}

// Occurrence start "wall" values (ms, date part + start's time of day) for one event, up to `limitWall`.
function* occurrences(start, rule, limitWall) {
  const tod = start.wall % DAY; // time of day in wall ms (start.wall is UTC-fields so this is exact)
  const startDay = start.wall - tod;
  const [sy, sm, sd] = ymd(startDay);
  const untilWall = rule.until ? (rule.until.allDay ? rule.until.wall + DAY - 1 : rule.until.tz === 'UTC' && start.tz !== 'UTC' ? instantToWall(rule.until.wall, start.tz) : rule.until.wall) : Infinity;
  let emitted = 0, guard = 0;

  const emit = function* (dayMs) {
    const w = dayMs + tod;
    if (w < start.wall) return false;
    if (w > untilWall || w > limitWall) return 'stop';
    if (rule.count && emitted >= rule.count) return 'stop';
    emitted++;
    yield w;
    return true;
  };

  if (rule.freq === 'DAILY') {
    for (let k = 0; guard++ < 40000; k++) {
      const day = startDay + k * rule.interval * DAY;
      if (rule.bymonth.length && !rule.bymonth.includes(ymd(day)[1] + 1)) { if (day + tod > limitWall) return; continue; }
      if (rule.byday.length && !rule.byday.some((b) => b.wd === new Date(day).getUTCDay())) { if (day + tod > limitWall) return; continue; }
      const r = yield* emit(day); if (r === 'stop') return;
    }
  } else if (rule.freq === 'WEEKLY') {
    const wdays = rule.byday.length ? rule.byday.map((b) => b.wd) : [new Date(startDay).getUTCDay()];
    const weekStart = startDay - ((new Date(startDay).getUTCDay() - rule.wkst + 7) % 7) * DAY;
    for (let k = 0; guard++ < 20000; k++) {
      const ws = weekStart + k * rule.interval * 7 * DAY;
      const days = wdays.map((wd) => ws + ((wd - rule.wkst + 7) % 7) * DAY).sort((a, b) => a - b);
      if (ws > limitWall) return;
      for (const day of days) {
        if (rule.bymonth.length && !rule.bymonth.includes(ymd(day)[1] + 1)) continue;
        const r = yield* emit(day); if (r === 'stop') return;
      }
    }
  } else if (rule.freq === 'MONTHLY') {
    for (let k = 0; guard++ < 5000; k++) {
      const m0 = sm + k * rule.interval, y = sy + Math.floor(m0 / 12), m = ((m0 % 12) + 12) % 12;
      if (Date.UTC(y, m, 1) > limitWall) return;
      if (rule.bymonth.length && !rule.bymonth.includes(m + 1)) continue;
      for (const day of monthDates(y, m, rule, sd)) { const r = yield* emit(day); if (r === 'stop') return; }
    }
  } else if (rule.freq === 'YEARLY') {
    const months = rule.bymonth.length ? rule.bymonth.map((x) => x - 1) : [sm];
    for (let k = 0; guard++ < 500; k++) {
      const y = sy + k * rule.interval;
      if (Date.UTC(y, 0, 1) > limitWall) return;
      for (const m of months.sort((a, b) => a - b)) {
        for (const day of monthDates(y, m, rule, sd)) { const r = yield* emit(day); if (r === 'stop') return; }
      }
    }
  }
}

/**
 * Expand events into concrete occurrences overlapping [fromMs, toMs).
 * Returns [{ id, title, loc, notes, allDay, start, end }] where timed events use ISO-8601 UTC strings
 * and all-day events use 'YYYY-MM-DD' (end is exclusive) so the display can use local midnight.
 */
export function expand(parsed, fromMs, toMs, defaultTz = 'UTC') {
  const out = [];
  const iso = (ms) => new Date(ms).toISOString();
  const dateStr = (ms) => new Date(ms).toISOString().slice(0, 10);
  const key = (dt) => (dt.allDay ? 'd' + dt.wall : 't' + instantOf(dt));

  // Overrides and cancellations of single occurrences, keyed by uid + original start.
  const overrides = new Map();
  for (const e of parsed.events) {
    if (e.recId) {
      const tz = parsed.tz || defaultTz;
      const rid = parseDT(e.recId.value, e.recId.params, tz);
      if (rid) overrides.set(e.uid + '|' + key(rid), e);
    }
  }

  const push = (e, startDt, durMs, idSuffix) => {
    const allDay = startDt.allDay;
    const s = instantOf(startDt);
    const en = s + durMs;
    if (Math.max(en, s + 1) <= fromMs) return; // ended before the window
    if (s >= toMs) return;
    out.push({
      id: (e.uid || 'x') + '@' + idSuffix,
      title: e.summary || '(no title)',
      loc: e.location || '',
      notes: (e.description || '').trim().slice(0, 300),
      allDay,
      start: allDay ? dateStr(s) : iso(s),
      end: allDay ? dateStr(en <= s ? s + DAY : en) : iso(en <= s ? s + 30 * 60000 : en),
    });
  };

  for (const e of parsed.events) {
    if (e.cancelled) continue;
    const tz = e._calTz || parsed.tz || defaultTz;
    const start = parseDT(e.dtstart.value, e.dtstart.params, tz);
    if (!start) continue;
    let durMs;
    if (e.dtend) { const end = parseDT(e.dtend.value, e.dtend.params, tz); durMs = end ? instantOf(end) - instantOf(start) : 0; }
    else if (e.duration != null) durMs = e.duration;
    else durMs = start.allDay ? DAY : 0;

    if (e.recId) { // an overriding instance stands on its own
      push(e, start, durMs, 'o' + instantOf(start));
      continue;
    }
    const rule = e.rruleRaw ? parseRRule(e.rruleRaw, tz) : null;
    if (!rule) { push(e, start, durMs, 's'); continue; }

    const ex = new Set(e.exdates.map((x) => { const d = parseDT(x.value, x.params, tz); return d ? key(d) : null; }));
    // Search limit in wall time (add a day of slack for zone offsets).
    const limitWall = toMs + DAY * 2;
    for (const wall of occurrences(start, rule, limitWall)) {
      const occ = { allDay: start.allDay, wall, tz: start.tz };
      const k = key(occ);
      if (ex.has(k)) continue;
      const ov = overrides.get(e.uid + '|' + k);
      if (ov) continue; // the override produces its own entry (or is cancelled)
      // Skip occurrences that end before the window without building them.
      push(e, occ, durMs, String(start.allDay ? wall : instantOf(occ)));
    }
  }
  return out;
}
