# Family Frame

A wall dashboard for a hacked Android photo frame: **Today**, **Calendar**, **Shopping**, **To Do**,
**Weather**, **Stocks** and **Photos** screens, plus a full-screen photo clock when idle and a night
clock overnight. It's built on [Wes Bos's photo-frame-dashboard](https://github.com/wesbos/photo-frame-dashboard)
and runs in his Home HQ kiosk app on a 10.1" moonka ZN-DP1002 (Rockchip RK3326, Android 8.1, WebView 106).

- **Calendar:** Google Calendar's secret iCal feeds, read by a small dependency-free parser (`lib/ics.js`,
  with tests), with recurring events, a lane and color per person, and holidays.
- **Shopping and To Do:** shared lists in Upstash Redis. Family members add items from the frame, a phone
  page, or Alexa ("Alexa, ask List Keeper we need milk"), through an add-only key that can't read anything.
- **Photos:** a public Google Drive folder.
- **Weather** from Open-Meteo and **stocks** from free quote feeds, no API keys needed.
- **Morning tour:** from 5 to 7 am the idle frame steps through every screen, a minute each.
- **Phone layout:** the same site works in a phone's browser, with tabs along the bottom.
- **Hosting:** Vercel's free plan (a Netlify version of the API routes is included too). Every data source is
  optional and the dashboard still works without it.

Start with [SETUP.md](SETUP.md). `node scripts/dev-server.mjs --mock` runs it locally with fake data at
http://localhost:5173. Family names, colors, location and stores are in `js/config.js`.

This is a public copy of a family's private repo, with names and location replaced by placeholders.
MIT licensed, like the project it's based on: see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
