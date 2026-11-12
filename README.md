# kab-player

A personal streaming player for the fan-run [Kevin & Bean Archive](https://www.kevinandbeanarchive.com/):
every daily show from 2006 to today, plus about 65,000 clips and specials, with resume, favorites
and listening progress synced across devices. Installs to a phone's home screen as an app.

Not affiliated with the show, KROQ, KLOS, or the archive. Audio streams directly from the
archive's own server; this project stores no audio.

## How it works

- **`src/worker.js`**: a Cloudflare Worker. It serves the app from `site/`, and an API under `/api/*`
  (protected by a passphrase) for the episode list and for syncing progress and favorites in D1.
  A weekly cron re-reads the newest year of the archive page to pick up new shows.
- **`src/parse.js`**: parses the archive's Word-generated HTML page into an episode list. Dates come from
  the page structure, not file names (some are wrong); mislinked days are fixed by checking the server.
- **`site/`**: the app itself (plain JavaScript, no build step), a PWA with lock-screen controls.
- **`site/clips.json`**: a snapshot of the archive's clip folders (`audio.php`).

## Setup

Needs Node.js and a Cloudflare account.

```sh
npm install
npx wrangler login
npx wrangler d1 create kab-player          # put the id in wrangler.jsonc
npx wrangler d1 execute kab-player --remote --command "$(cat schema.sql)"
npx wrangler secret put APP_KEY            # the passphrase for the app
npx wrangler deploy                        # change "routes" in wrangler.jsonc to your own domain
KAB_KEY=<passphrase> node scripts/seed-catalog.mjs --upload https://<your-domain>
```

Local development: put `APP_KEY=devkey` in `.dev.vars`, run
`npx wrangler d1 execute kab-player --local --file schema.sql`, then `npx wrangler dev`.

## Scripts

| Script | What it does |
|---|---|
| `scripts/seed-catalog.mjs` | Builds the full episode list and uploads it |
| `scripts/crawl-clips.mjs` | Maps every clip folder (~40 min, gentle on the server) |
| `scripts/build-clips.mjs` | Turns the crawl into `site/clips.json` |
| `scripts/smoke-test.mjs` | Tests the API and assets of a running instance |
| `scripts/make-icons.mjs` | Draws the app icons |
| `scripts/key-logo.ps1` | Removes a solid background from a logo image |

## Artwork

The show logos (`site/logo.png`, `site/logos/*`) aren't included in this repo because they belong to
their owners. The app expects `kevin-and-bean.png`, `kevin-in-the-morning.png`, `kevin-and-sluggo.png`
and `kevin-ryder-kroq.jpg` in `site/logos/` (see `ERA` in `site/app.js`). Add your own images there,
or remove the `logo` entries from `ERA` to use plain date tiles instead.
