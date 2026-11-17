# Family Frame

A wall dashboard for a family photo frame: **Today**, **Calendar**, **Shopping** and **Photos** screens, plus a
full-screen photo clock when idle. It's based on Wes Bos's photo-frame-dashboard. The frame runs Wes's **Home HQ**
kiosk app (`com.wesbos.homehq`), which loads the dashboard by URL.

## Layout

All paths below are relative to the repo root, and the `npm` and `node` commands run from there.

- `js/config.js`: family names and colors, lat/long for weather, stores, shopping "Usuals", idle timings
  (back to Today after 60 s, photo clock after 120 s), and the morning tour (`tour`: 5:00 to 7:00 the idle
  frame steps through Today, each calendar view, Shopping, To Do, Weather and Photos, 60 s each, instead of the
  photo clock; a touch stops it; `App.TOUR` in `js/app.js`)
- `api/`: serverless routes
  - `/api/calendar`: reads Google Calendar secret iCal feeds (`CALENDARS` env var)
  - `/api/photos`: reads a public Google Drive folder (`DRIVE_FOLDER_ID`, `GOOGLE_API_KEY`)
  - `/api/shopping` and the To Do list: stored in Upstash Redis
- `netlify/functions/`: the Netlify versions of the API routes, for the Netlify copy of the site
- `alexa/`: the Alexa skill for the To Do and shopping lists (invocation name "list keeper")
- `lib/ics.js`: dependency-free calendar parser (has tests)
- `js/holidays.js`: holidays shown on the calendar, on the day they really fall; the ORNL list picks which ones (test: `node scripts/test-holidays.mjs`)
- `docs/`, `public/`, `scripts/`: documentation, static files, the dev server and test scripts
- Weather tab (`js/views/weather.js`, cartoon style) and Stocks tab (`js/views/stocks.js`, `/api/stocks`, `lib/quotes.js`): quotes come from Yahoo Finance's unofficial chart feed (no key), but Yahoo answers Node's fetch (so Vercel) with 429, so in practice Nasdaq's quote API serves them (regular close outside market hours), then Stooq. The Add sheet suggests stocks as you type (`/api/stocks?search=`, Yahoo search then Nasdaq's symbol lookup; stocks and ETFs only). The watchlist is stored in Redis (or on the frame if Redis is missing).
- Weather comes from Open-Meteo (no key). Every data source is optional and degrades gracefully.

## Hosting and deploys

- **Live:** Vercel, `https://YOUR-APP.vercel.app`. Pushing to `main` on GitHub deploys automatically.
- **Netlify copy:** `YOUR-SITE.netlify.app`. Deploys are paused (free credits ran out), but the site still
  serves. The Alexa skill calls the Netlify address.
- Both hosts share the same Upstash Redis database, so the shopping and To Do lists are identical on both.
- After changing an environment variable on Vercel, redeploy.

## Environment variables

`FRAME_KEY`, `ADD_KEY`, `TODO_PIN`, `TIMEZONE`, `CALENDARS`, `DRIVE_FOLDER_ID`, `GOOGLE_API_KEY`,
`UPSTASH_REDIS_REST_*`. See `.env.example`.

- `FRAME_KEY` is the full-access key the frame uses.
- `ADD_KEY` is the add-only key for Alexa. It returns **401** on calendar/photos and **403** on lists. Never use it
  in the frame URL.

**Secrets:** keep all real values in `.env` (git-ignored) or the Vercel dashboard. Never write keys, iCal URLs or
the frame URL with a real `?key=` into tracked files, commits, or this file.

## Commands

```bash
node scripts/dev-server.mjs --mock   # http://localhost:5173 with fake calendars and a fake list
node scripts/dev-server.mjs          # real /api routes (needs env vars set)
npm test                             # calendar parser tests
node scripts/test-photos.mjs         # Drive photos route
```

## Browser targets

The frame's WebView is version 106. The CSS must work in Chrome 61+ and the JS in Chrome 106+. Don't use newer
syntax or APIs without checking.

## Phone layout

Phones (screen's short side under 600px, or `?phone=1` to preview on a PC) get their own layout: a script in
`index.html` adds `.phone` to `<html>` and switches the viewport to the device width. Its styles are all in
`css/phone.css` (tabs along the bottom, each screen scrolls). `App.phone` turns off the stage scaling, idle photo
clock, morning tour and night clock, and the calendar offers a 14-day List plus Month instead of the time grids.
The frame never gets `.phone`, so check any change at 1280 x 800 too. A phone needs `?key=` once, like the frame.

## The frame (Windows PC + ADB over USB)

The Home HQ kiosk app is **not in this repo**. Its source and `build.ps1` live in a separate local copy of Wes's
project at `~\photo-frame-dashboard\dashboard\kiosk`. Kiosk changes are built and installed from there, not committed
here.

**Device:** moonka ZN-DP1002, Rockchip RK3326, Android 8.1 Go, firmware `SSA_Frame_20260420`, WebView 106,
density 160. It matches Wes's `docs/akimart-zn-dp1002.md`. Connect with a USB-A to USB-C **data** cable.

**PowerShell setup** (each new window):
```powershell
$env:Path = "C:\Program Files\Android\Android Studio\jbr\bin;$env:LOCALAPPDATA\Android\Sdk\platform-tools;" + $env:Path
$env:ANDROID_SERIAL = "YOUR-DEVICE-SERIAL"   # from `adb devices`
cd ~\photo-frame-dashboard\dashboard\kiosk
```

**Build and install the kiosk app.** Java 25 with build-tools 34's d8 crashes
(`NullPointerException ... String.length()`), so build with build-tools 36's d8 via a local copy of the script:
```powershell
(Get-Content .\build.ps1 -Raw).Replace('"$bt\d8.bat"', '"$sdk\build-tools\36.0.0\d8.bat"') | Set-Content .\build-local.ps1
powershell -ExecutionPolicy Bypass -File .\build-local.ps1
adb install -r build\homehq.apk
```

**Set the dashboard URL** (saved and used at every boot). The user supplies `FRAME_KEY`; ask rather than guessing:
```powershell
adb shell am start -n com.wesbos.homehq/.MainActivity --es url "'https://YOUR-APP.vercel.app/?key=FRAME_KEY'"
```

**Debug the WebView:** `adb shell am start -n com.wesbos.homehq/.MainActivity --ez debug true`, then open
`edge://inspect/#devices` on the PC.

### Current device configuration

| Change | Command | Undo |
|---|---|---|
| Floating Back/Dashboard buttons | `pm grant com.wesbos.homehq android.permission.WRITE_SECURE_SETTINGS`; `settings put secure enabled_accessibility_services com.wesbos.homehq/com.wesbos.homehq.NavigationService`; `settings put secure accessibility_enabled 1` | Turn off **Home HQ navigation** in Accessibility |
| Home HQ as Home app | `am start -n com.wesbos.homehq/.MainActivity --ez home true`; `cmd package set-home-activity --user 0 com.wesbos.homehq/.Home` | Pick another Home app, then `--ez home false` |
| Frameo and updaters off | `pm disable-user --user 0` for `net.frameo.frame`, `com.adups.fota`, `android.rockchip.update.service` | `pm default-state --user 0 <package>` |

### Rules for working on the device

- **Ask before** any `pm disable-user`, `set-home-activity`, `settings put`, uninstall or reboot. Small boards like
  this one can boot-loop or end up with no launcher.
- After changing package state or the Home app, **wait 30 s before rebooting**. For disables, confirm `enabled="3"`
  in `package-restrictions.xml` and run `sync` first.
- **Keep the screen on (dimmed), never let it sleep.** Wi-Fi drops while the screen is asleep on this board. The
  dashboard switches to a night clock from 10:30 pm to 4:45 am (`App.NIGHT` in `js/app.js`).
- Fully Kiosk is still installed but unused. Its free version re-enabled the paid Kiosk Mode after every reboot,
  which put a buy-a-license watermark on the dashboard. Don't switch back to it.
- **No motion sensor is fitted.** A PIR driver exists (`/sys/bnd/pir_sensor_status`), but it always reads `0`. The
  parked idea is to wake the dashboard from a Zigbee motion sensor through Hubitat.

**On the frame:** hold two fingers still about an inch apart for 1.5 s to open a menu with Open launcher, Android
settings, Wi-Fi settings and Reload dashboard. Use **Reload dashboard** if the frame is stuck on an old version.

## Troubleshooting

| Symptom | Check |
|---|---|
| Calendar empty | `/api/calendar?key=…`: `501` means `CALENDARS` is unset, `401` means a wrong key (or the `ADD_KEY`), and `errors:[…]` lists feeds that failed. Google refreshes iCal feeds only every few hours. |
| Events missing or an hour off | Set `TIMEZONE`, and check the person `id` matches `js/config.js`. |
| Sample photos still showing | `/api/photos?key=…`: `501` means a variable is missing, and `502` carries Google's reason (Drive API not enabled for the key, or the folder isn't shared). A wrong key saved in the browser also shows the samples, so reopen the page with the right `?key=`. |
| Shopping list doesn't sync | `/api/shopping?key=…`: `501` means Upstash isn't connected, and `403` means the add-only key was used. |

## Differences from Wes Bos's version

**Removed:** chores and stars, smart-home controls, the AI-usage screen, doorbell and leak alerts, the demo drawer,
presence, and the rooted-frame tooling.

**Added:** live data, the `api/` routes, `js/config.js`, `lib/ics.js`, favourites that persist on the frame, and a
snow icon.
