// Run with: node scripts/test-photos.mjs   (stubs the Google Drive API)
import assert from 'node:assert/strict';
process.env.DRIVE_FOLDER_ID = 'root'; process.env.GOOGLE_API_KEY = 'k';
const pages = {
  root: { files: [
    { id: 'p1', mimeType: 'image/jpeg', thumbnailLink: 'https://lh3.googleusercontent.com/abc=s220', createdTime: '2024-05-01T10:00:00Z', imageMediaMetadata: { width: 4000, height: 3000, time: '2023:08:12 14:22:10' } },
    { id: 'p2', mimeType: 'image/jpeg', thumbnailLink: 'https://lh3.googleusercontent.com/def=s220', createdTime: '2024-05-02T10:00:00Z', imageMediaMetadata: { width: 4000, height: 3000, rotation: 1 } },
    { id: 'sub', name: 'Cape Cod 2024', mimeType: 'application/vnd.google-apps.folder' },
    { id: 'doc', mimeType: 'image/png' }, // no thumbnail → skipped
  ] },
  sub: { files: [{ id: 'p3', mimeType: 'image/heic', thumbnailLink: 'https://lh3.googleusercontent.com/ghi=s220', imageMediaMetadata: { width: 3000, height: 4000, time: '2024:07:04 09:00:00' } }] },
};
globalThis.fetch = async (u) => {
  const q = decodeURIComponent(new URL(u).searchParams.get('q'));
  const id = q.match(/'([^']+)' in parents/)[1];
  return { ok: true, json: async () => pages[id] };
};
const { default: handler } = await import('../api/photos.js');
let out;
await handler({ url: '/api/photos' }, { setHeader() {}, end(b) { out = JSON.parse(b); } });
assert.deepEqual(out.photos.map((p) => [p.id, p.o, p.date, p.place]), [
  ['p1', 'l', '2023-08-12', ''], ['p2', 'p', '2024-05-02', ''], ['p3', 'p', '2024-07-04', 'Cape Cod 2024'],
]);
assert.equal(out.photos[0].base, 'https://lh3.googleusercontent.com/abc');
console.log('photos handler ok');
