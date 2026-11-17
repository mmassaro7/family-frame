// Run with: node scripts/test-qr.mjs  (prints the QR matrices; scripts/check-qr.py decodes them with OpenCV)
import '../js/qr.js';
import fs from 'node:fs';
const out = [];
for (const ecl of ['L', 'M', 'Q', 'H']) {
  for (const len of [5, 14, 15, 26, 27, 42, 43, 62, 63, 84, 106, 122, 152, 180, 213]) {
    let text; try { text = 'https://YOUR-SITE.netlify.app/add.html?x='.padEnd(len, 'abcXYZ019-_').slice(0, len); const q = QR.encode(text, ecl); out.push({ ecl, len, ver: q.version, text, size: q.size, rows: Array.from({ length: q.size }, (_, y) => Array.from({ length: q.size }, (_, x) => (q.get(x, y) ? 1 : 0)).join('')) }); }
    catch (e) { if (!/too long/.test(e.message)) throw e; }
  }
}
fs.writeFileSync(process.argv[2] || '/tmp/qr-cases.json', JSON.stringify(out));
console.log('wrote', out.length, 'cases; versions', [...new Set(out.map((c) => c.ver))].sort((a, b) => a - b).join(','));
