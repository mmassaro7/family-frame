# Moving Family Frame from Vercel to Netlify

Both platforms do the same job here: build the Vite site, host the files, and run three small server
routes (`/api/calendar`, `/api/photos`, `/api/shopping`). This branch makes the project run on **either**.
Nothing about Vercel was removed, so you can run both side by side and compare.

## How the two differ (what this branch changes)

| | Vercel | Netlify |
|---|---|---|
| Server routes live in | `api/*.js` (a folder name Vercel treats specially) | `netlify/functions/*.mjs` |
| Route function shape | `handler(req, res)` (Node-style) | `handler(request)` returns a `Response` (web standard) |
| URL of a route | the file path, `/api/calendar` | set in the file: `export const config = { path: '/api/calendar' }` |
| Project settings | `vercel.json`, dashboard "Root Directory" | `netlify.toml`, dashboard "Base directory" |
| Env variables | Settings → Environment Variables | Site configuration → Environment variables |
| Shopping-list database | Upstash through the Vercel Marketplace | Upstash directly (upstash.com) |
| Default function time limit | up to 30 s (set in `vercel.json`) | 10 s on the free plan (adjustable in the dashboard) |

**The trick used here:** the real logic stays in `api/*.js`. `lib/adapt.js` translates Netlify's `Request`/`Response`
into the Node-style objects those files expect, and each file in `netlify/functions/` is three lines: import the
handler, wrap it, say which URL it answers. One copy of the logic, two hosts.

## Steps

1. **Merge or keep the branch.** The Netlify site can deploy straight from the `netlify-migration` branch, so you
   don't have to merge it into `main` until you're happy.
2. **Create the site.** netlify.com → *Add new site → Import an existing project* → GitHub → choose the repo.
   - Branch to deploy: `netlify-migration` (or `main` once merged)
   - **Base directory: `family-frame`**
   - Build command and publish directory fill in from `netlify.toml` (`npm run build` / `dist`)
3. **Add environment variables** (Site configuration → Environment variables), the same names as on Vercel:
   `FRAME_KEY`, `TIMEZONE`, `CALENDARS`, `DRIVE_FOLDER_ID`, `GOOGLE_API_KEY`.
   Vercel hides values marked Sensitive, so re-paste them from your own notes.
4. **Shopping sync (optional):** create a free Redis database at upstash.com, then add its two REST values as
   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
5. **Deploy**, then open `https://YOUR-SITE.netlify.app/api/calendar?key=YOUR_KEY&debug=1`. You should see your feeds.
   (If it says `401`, the key doesn't match; `501` means a variable is missing.)
6. **Try the dashboard:** `https://YOUR-SITE.netlify.app/?key=YOUR_KEY`
7. **Switch the frame:** change Fully Kiosk's Start URL to the new address. Keep Vercel until you're sure.

## Things that can go wrong

- **Calendar times out:** Netlify's free plan allows 10 seconds per function. The code gives each feed 8 s, so
  it normally fits; if your big work calendar is slow, raise the limit in the site's Functions settings.
- **"Page not found" on `/api/...`:** the Base directory isn't `family-frame`, so Netlify didn't find the functions.
- **Build says Node too old:** `NODE_VERSION` is set to 22 in `netlify.toml`; make sure no dashboard override disagrees.
- **Test without deploying:** `node scripts/test-netlify.mjs` runs the functions against fake calendars and a fake Redis.
