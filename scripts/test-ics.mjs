// Run with: node scripts/test-ics.mjs
import assert from 'node:assert/strict';
import { parseICS, expand } from '../lib/ics.js';

const ics = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-TIMEZONE:America/New_York',
  // 1. one-off with TZID, folded summary
  'BEGIN:VEVENT', 'UID:one', 'DTSTART;TZID=America/New_York:20261105T150000', 'DTEND;TZID=America/New_York:20261105T160000',
  'SUMMARY:Dentist\\, Dr. Lee and a very long title that is',
  '  folded onto the next line', 'LOCATION:123 Main St', 'END:VEVENT',
  // 2. all-day multi-day (DTEND exclusive)
  'BEGIN:VEVENT', 'UID:trip', 'DTSTART;VALUE=DATE:20261110', 'DTEND;VALUE=DATE:20261113', 'SUMMARY:Grandma visits', 'END:VEVENT',
  // 3. weekly Tue/Thu across the Nov 1 2026 DST change, with an EXDATE and an override
  'BEGIN:VEVENT', 'UID:soccer', 'DTSTART;TZID=America/New_York:20261027T163000', 'DTEND;TZID=America/New_York:20261027T180000',
  'RRULE:FREQ=WEEKLY;BYDAY=TU,TH', 'EXDATE;TZID=America/New_York:20261112T163000', 'SUMMARY:Soccer', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:soccer', 'RECURRENCE-ID;TZID=America/New_York:20261105T163000', 'DTSTART;TZID=America/New_York:20261105T173000',
  'DTEND;TZID=America/New_York:20261105T190000', 'SUMMARY:Soccer (moved)', 'END:VEVENT',
  // 4. monthly first Monday, last day of month, yearly birthday, daily COUNT, UNTIL
  'BEGIN:VEVENT', 'UID:pta', 'DTSTART;TZID=America/New_York:20260105T190000', 'DTEND;TZID=America/New_York:20260105T200000', 'RRULE:FREQ=MONTHLY;BYDAY=1MO', 'SUMMARY:PTA', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:rent', 'DTSTART;VALUE=DATE:20260131', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=-1', 'SUMMARY:Rent due', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:bday', 'DTSTART;VALUE=DATE:20150620', 'RRULE:FREQ=YEARLY', 'SUMMARY:Birthday', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:daily', 'DTSTART:20261102T130000Z', 'DTEND:20261102T133000Z', 'RRULE:FREQ=DAILY;COUNT=3', 'SUMMARY:Meds', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:until', 'DTSTART;TZID=America/New_York:20261101T080000', 'DURATION:PT1H', 'RRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20261108T235959Z', 'SUMMARY:Walk', 'END:VEVENT',
  // 5. cancelled and a Windows-style zone name
  'BEGIN:VEVENT', 'UID:gone', 'DTSTART:20261106T150000Z', 'DTEND:20261106T160000Z', 'STATUS:CANCELLED', 'SUMMARY:Nope', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:win', 'DTSTART;TZID=Pacific Standard Time:20261107T090000', 'DTEND;TZID=Pacific Standard Time:20261107T100000', 'SUMMARY:West coast call', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const parsed = parseICS(ics, 'America/New_York');
const from = Date.UTC(2026, 10, 1), to = Date.UTC(2026, 11, 1);
const ev = expand(parsed, from, to, 'America/New_York');
const by = (t) => ev.filter((e) => e.title === t);
const local = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// 1
const dentist = ev.find((e) => e.title.startsWith('Dentist'));
assert.equal(dentist.title, 'Dentist, Dr. Lee and a very long title that is folded onto the next line');
assert.equal(dentist.start, '2026-11-05T20:00:00.000Z'); // 3 PM EST = 20:00Z
assert.equal(dentist.loc, '123 Main St');
// 2
const trip = by('Grandma visits')[0];
assert.deepEqual([trip.allDay, trip.start, trip.end], [true, '2026-11-10', '2026-11-13']);
// 3  Tue/Thu from Nov 1 (post DST): Nov 3, 5(override), 10, 12(excluded), 17, 19, 24, 26
const soc = by('Soccer').map((e) => local(e.start));
assert.deepEqual(soc, ['11/3, 16:30', '11/10, 16:30', '11/17, 16:30', '11/19, 16:30', '11/24, 16:30', '11/26, 16:30']);
assert.deepEqual(by('Soccer (moved)').map((e) => local(e.start)), ['11/5, 17:30']);
// instant check: Nov 3 is EST (UTC-5) → 21:30Z
assert.equal(by('Soccer')[0].start, '2026-11-03T21:30:00.000Z');
// 4
assert.equal(by('PTA').length, 1); assert.equal(local(by('PTA')[0].start), '11/2, 19:00');
assert.deepEqual(by('Rent due').map((e) => e.start), ['2026-11-30']);
assert.equal(by('Birthday').length, 0); // June birthday: nothing in November
assert.equal(by('Meds').length, 3);
assert.deepEqual(by('Walk').map((e) => local(e.start)), ['11/1, 08:00', '11/3, 08:00', '11/5, 08:00', '11/7, 08:00']);
assert.equal(by('Walk')[0].end.slice(11, 16), '14:00'); // 1h duration, 8 AM EDT→ at Nov 1 02:00 local DST ended, 08:00 EST = 13:00Z → 14:00Z
// 5
assert.equal(by('Nope').length, 0);
assert.equal(by('West coast call')[0].start, '2026-11-07T17:00:00.000Z'); // 9 AM PST = 17:00Z

// Yearly birthday shows up in June
const june = expand(parsed, Date.UTC(2026, 5, 1), Date.UTC(2026, 6, 1), 'America/New_York').filter((e) => e.title === 'Birthday');
assert.deepEqual(june.map((e) => e.start), ['2026-06-20']);
console.log('ics tests passed:', ev.length, 'events in Nov 2026');
