// Holidays are shown on the day they really fall (not ORNL's observed/companion days). Good Friday and the other dates
// are also checked against the ORNL holiday schedule PDF, where that schedule lists the real day.
import fs from 'node:fs';
import assert from 'node:assert/strict';
globalThis.window = globalThis; globalThis.App = { esc: (x) => x, icon: () => '' };
new Function(fs.readFileSync(new URL('../js/holidays.js', import.meta.url), 'utf8'))();
const on = (y, m, d) => (App.holidayOn(new Date(y, m - 1, d)) || {}).id || null;
const expect = {
  2024: [[1,1,'newyear'],[1,15,'mlk'],[3,29,'goodfri'],[5,27,'memorial'],[7,4,'july4'],[9,2,'labor'],[11,28,'thanksgiving'],[12,25,'xmas']],
  2025: [[1,1,'newyear'],[1,20,'mlk'],[4,18,'goodfri'],[5,26,'memorial'],[7,4,'july4'],[9,1,'labor'],[11,27,'thanksgiving'],[12,25,'xmas']],
  2026: [[1,1,'newyear'],[1,19,'mlk'],[4,3,'goodfri'],[5,25,'memorial'],[7,4,'july4'],[9,7,'labor'],[11,26,'thanksgiving'],[12,25,'xmas']],
  2027: [[1,1,'newyear'],[1,18,'mlk'],[3,26,'goodfri'],[5,31,'memorial'],[7,4,'july4'],[9,6,'labor'],[11,25,'thanksgiving'],[12,25,'xmas']],
  2028: [[1,1,'newyear'],[1,17,'mlk'],[4,14,'goodfri'],[5,29,'memorial'],[7,4,'july4'],[9,4,'labor'],[11,23,'thanksgiving'],[12,25,'xmas']],
  2029: [[1,15,'mlk'],[3,30,'goodfri'],[5,28,'memorial'],[9,3,'labor'],[11,22,'thanksgiving']],
  2030: [[1,21,'mlk'],[4,19,'goodfri'],[5,27,'memorial'],[9,2,'labor'],[11,28,'thanksgiving']],
};
for (const [y, list] of Object.entries(expect)) for (const [m, d, id] of list) assert.equal(on(+y, m, d), id, `${y}-${m}-${d}`);
// ORNL's observed and companion days are not labeled
for (const [y, m, d] of [[2026,7,3],[2026,7,2],[2026,11,27],[2026,12,24],[2027,12,24],[2027,12,31],[2027,7,5],[2027,12,23],[2028,12,26]]) assert.equal(on(y, m, d), null, `${y}-${m}-${d}`);
console.log('holiday tests passed');
