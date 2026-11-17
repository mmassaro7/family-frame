// GET /api/photos  →  { photos: [...] }   Reads images from a Google Drive folder (and its sub-folders).
// Env: DRIVE_FOLDER_ID  – the folder's id (the last part of its share link)
//      GOOGLE_API_KEY   – an API key with the Google Drive API enabled
// The folder must be shared as "Anyone with the link → Viewer".
// Sub-folder names are used as captions, e.g. a folder called "Cape Cod 2024".
import { authorized, deny, json } from '../lib/auth.js';

const API = 'https://www.googleapis.com/drive/v3/files';
const MAX_PHOTOS = 800;

async function list(folderId, key) {
  const files = [];
  let pageToken = '';
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType = 'application/vnd.google-apps.folder')`);
    const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,thumbnailLink,createdTime,imageMediaMetadata(width,height,time,rotation))');
    const r = await fetch(`${API}?q=${q}&fields=${fields}&pageSize=1000&key=${key}${pageToken ? '&pageToken=' + pageToken : ''}`);
    if (!r.ok) throw new Error(`Drive API ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    files.push(...(j.files || []));
    pageToken = j.nextPageToken || '';
  } while (pageToken && files.length < 2000);
  return files;
}

export default async function handler(req, res) {
  if (!authorized(req)) return deny(res);
  const folder = process.env.DRIVE_FOLDER_ID, key = process.env.GOOGLE_API_KEY;
  if (!folder || !key) return json(res, 501, { error: 'photos-not-configured' });
  try {
    const photos = [];
    const walk = async (id, place, depth) => {
      const files = await list(id, key);
      for (const f of files) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          if (depth < 2) await walk(f.id, f.name, depth + 1);
          continue;
        }
        if (!f.thumbnailLink) continue;
        const m = f.imageMediaMetadata || {};
        let w = m.width || 0, h = m.height || 0;
        if (m.rotation === 1 || m.rotation === 3) [w, h] = [h, w]; // quarter turns
        const t = (m.time || '').match(/^(\d{4}):(\d\d):(\d\d)/);
        photos.push({
          id: f.id,
          base: f.thumbnailLink.replace(/=s\d+.*$/, ''),
          o: h > w ? 'p' : 'l',
          dated: !!t,                                  // false = no camera date (the date below is just the upload day)
          date: t ? `${t[1]}-${t[2]}-${t[3]}` : (f.createdTime || '').slice(0, 10),
          place,
        });
      }
    };
    await walk(folder, '', 0);
    photos.length = Math.min(photos.length, MAX_PHOTOS);
    // Thumbnail links expire after a few hours, so keep this cache short.
    json(res, 200, { photos }, 's-maxage=600, stale-while-revalidate=1200');
  } catch (err) {
    json(res, 502, { error: String(err.message || err) });
  }
}
