# Family Frame — setup guide

A wall dashboard for your Fully Kiosk photo frame: **Today**, **Calendar**, **Shopping**, **To Do** and **Photos**, with a
full-screen photo clock when nobody is touching it. Your frame loads it by URL.

```
Fully Kiosk  →  https://YOUR-APP.vercel.app/?key=SECRET
                    │
                    ├─ /api/calendar   reads your Google Calendar "secret iCal" links
                    ├─ /api/photos     reads a Google Drive folder
                    ├─ /api/shopping   shared list stored in Upstash Redis (Vercel Marketplace)
                    ├─ /api/todo       shared to-do list (same Redis); phone page at /add.html (QR code + PIN) - see docs/TODO-VOICE.md
                    └─ voice: an Alexa skill adds to the to-do and shopping lists - see docs/ALEXA.md
                    └─ weather         Open-Meteo (free, no key)
```

Everything is optional and degrades gracefully: no calendar set up → empty calendar; no Drive folder → sample
photos; no Redis → the shopping list lives on the frame only.

## 1. Make it yours (5 min)

Edit **`js/config.js`**: your family's names and colors, your latitude/longitude (for weather), your stores,
and the one-tap "Usuals" on the shopping screen. The person `id`s are what you'll use in step 2.

## 2. Google Calendar

For each calendar you want on the frame (one per person, plus an optional shared family calendar):

1. calendar.google.com → ⚙ Settings → click the calendar in the left list → **Integrate calendar**
2. Copy **Secret address in iCal format**. (Treat it like a password; anyone with it can read the calendar.)

Then set the `CALENDARS` environment variable (step 5) to a JSON list:

```json
[
  {"person":"family","url":"https://calendar.google.com/calendar/ical/…/basic.ics"},
  {"person":"alex","url":"https://calendar.google.com/calendar/ical/…/basic.ics"},
  {"person":"jordan","url":"https://calendar.google.com/calendar/ical/…/basic.ics"}
]
```

To draw a calendar in its own color (say, Jordan's work schedule in light green), add `"color"`:
`{"person":"jordan","color":"#8BD18F","url":"…"}` — its events stay in Jordan's lane but use that color. (Optional `"ink"` sets the text color, default dark.)

`"family"` shows the event in everyone's lane. If the same event is in two calendars it's merged automatically.
Google only refreshes these feeds every few hours (sometimes longer), so a brand-new event can take a while to appear.
The frame is **read-only** for the calendar — add events in Google Calendar as usual.

## 3. Photos (Google Drive folder)

Google closed the door on this in March 2025: apps can no longer read your Google Photos library or shared albums
([Google's notice](https://developers.google.com/photos/support/updates)). So the frame reads a **Google Drive folder** instead.

1. In Drive create a folder (e.g. *Frame Photos*) and put photos in it. Sub-folders become captions —
   a folder called *Cape Cod 2024* captions its photos "Cape Cod 2024".
   (From the Google Photos app: select photos → Share → **Save to Drive**, or use Google Takeout / Drive for desktop.)
2. Right-click the folder → Share → General access → **Anyone with the link → Viewer**.
3. The folder id is the last part of its link: `drive.google.com/drive/folders/`**`THIS_PART`** → `DRIVE_FOLDER_ID`.
4. console.cloud.google.com → new project → *APIs & Services* → enable **Google Drive API** → *Credentials* →
   **Create API key** → restrict it to the Drive API → `GOOGLE_API_KEY`.

## 4. Shopping list sync

Optional, but needed if phones/other frames should share the list: in Vercel → your project → **Storage** →
**Marketplace → Upstash Redis** → create (free tier is plenty) → connect to the project. Vercel adds the
`UPSTASH_REDIS_REST_*` variables for you. The frame polls every 20 s, last write wins.

## 5. Deploy on Vercel

1. Put this folder in a GitHub repo (`.env*` is git-ignored).
2. vercel.com → **Add New → Project** → import the repo. Framework preset **Vite** is auto-detected.
3. Add environment variables (see `.env.example`): `FRAME_KEY` (any long random string), `TIMEZONE`, `CALENDARS`,
   `DRIVE_FOLDER_ID`, `GOOGLE_API_KEY`. Deploy. Change a variable → **redeploy**.
4. Visit `https://YOUR-APP.vercel.app/?key=YOUR_FRAME_KEY` on your phone to check it works.

> The page itself (names, colors, store names) is public; the calendar, photos and list are protected by `FRAME_KEY`.
> Leave `FRAME_KEY` unset only if you're comfortable with anyone who finds the URL seeing your calendar.

## 6. Fully Kiosk settings

_(Menu names vary a little between Fully versions.)_

- **Web Content Settings → Start URL:** `https://YOUR-APP.vercel.app/?key=YOUR_FRAME_KEY`
- **Web Auto Reload → Reload on Network Reconnect:** on (the page also reloads itself if its script fails to load)
- **Device Management → Keep Screen On:** on. The dashboard dims itself to a night clock between 10:30 pm and 4:45 am (`App.NIGHT` in `js/app.js`), and switches back to the photo clock by itself at 4:45 am.
- **Web Content Settings → Enable Touch Interaction:** on. **Use Pull to Refresh / Reload on idle:** off
- If the layout looks broken on an old frame, update **Android System WebView** in the Play Store (the CSS targets Chrome 61+ / JS Chrome 106+).
- Fully's own screensaver/"Screen Off" timers aren't needed; the app has its own idle behaviour
  (back to Today after 60 s, photo clock after 120 s; change in `js/config.js`).

## Try it on your computer first

```bash
node scripts/dev-server.mjs --mock     # http://localhost:5173 with fake calendars + a fake list
node scripts/dev-server.mjs            # real /api routes (set the env vars first, e.g. export CALENDARS='[…]')
npm test                               # calendar parser tests;  node scripts/test-photos.mjs for the Drive route
```

## Troubleshooting

| Symptom | Check |
|---|---|
| Calendar empty | Open `/api/calendar?key=…` in a browser. `501` = `CALENDARS` not set; `401` = wrong key; `errors:[…]` lists feeds that failed |
| Events missing or an hour off | Set `TIMEZONE`; check the person's `id` matches `js/config.js` |
| Sample photos still showing | `/api/photos?key=…` → `501` means a variable is missing; a `502` message shows Google's reason (usually the API key isn't enabled for Drive or the folder isn't shared) |
| Shopping list doesn't sync | `/api/shopping?key=…` → `501` means Upstash isn't connected (list stays on the frame) |
| Stuck on an old version | Clear the browser cache from Fully's settings or remote admin, then reload |

## What changed from Wes Bos's version

Removed: chores/stars, smart-home controls, AI-usage screen, doorbell/leak alerts, demo drawer, presence, and the
rooted-frame tooling (you already have Fully Kiosk). Added: live data, the `api/` routes, `js/config.js`, a
dependency-free calendar parser (`lib/ics.js`), favourites that persist on the frame, and the snow icon.
