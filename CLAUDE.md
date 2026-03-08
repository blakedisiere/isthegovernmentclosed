# CLAUDE.md

## Project Overview

**isthegovernmentclosed** — A website that displays whether the US Federal government is currently closed (shutdown). The backend scrapes public sources to determine status and falls back on a curated list of historical shutdowns. The frontend shows a large "Yes" or "No" with contextual date information.

## Repository Structure

```
isthegovernmentclosed/
├── server.js            # Express server — API, SSR, OG image generation
├── src/
│   ├── shutdowns.js     # Historical shutdown data + status logic
│   └── scraper.js       # Scrapes OPM.gov and other public sources
├── public/
│   ├── index.html       # Single-page frontend (also used as SSR template)
│   ├── style.css        # Styles (dark theme, responsive)
│   └── app.js           # Client-side fetch + DOM updates
├── fonts/               # Bundled TTF fonts for OG image rendering
├── amplify.yml          # AWS Amplify build + routing config
├── package.json         # Dependencies and scripts
├── .gitignore
├── CLAUDE.md            # This file
└── README.md
```

## Tech Stack

- **Runtime:** Node.js
- **Server:** Express 4
- **Scraping:** Axios + Cheerio
- **Image generation:** Sharp (Pango text rendering for OG images)
- **Frontend:** Vanilla HTML/CSS/JS (no build step)
- **Hosting:** AWS Amplify (Web Compute / SSR)

## Commands

```bash
npm install          # Install dependencies
npm start            # Start production server (port 3000)
npm run dev          # Start dev server with --watch auto-reload
```

## Architecture

### Backend (`server.js` + `src/`)

- **`GET /`** — SSR route: injects `window.__STATUS__`, dynamic OG/Twitter meta tags, and replaces domain URLs with the request host
- **`GET /og-image.png`** — Dynamically generates a 1200×630 PNG preview image reflecting current status (green "No", red "Yes", amber "Partially" with glow effect). Uses Sharp + Pango text rendering with bundled fonts. Cached for 15 minutes
- **`GET /api/status`** — Returns JSON with shutdown status:
  - `isClosed` (boolean), `message` (string), `since` or `lastClosure` dates
  - `liveCheck` — result from live scraping (if available)
  - `lastScraped` — timestamp of last scrape
- **`GET /api/shutdowns`** — Returns full shutdown history with computed fields
- **Scrape cache:** Results cached for 15 minutes to avoid hammering sources
- **`src/shutdowns.js`** — Contains all historical US government shutdowns (1976–present). `getShutdownStatus()` checks if today falls within any shutdown range
- **`src/scraper.js`** — Scrapes OPM.gov for current federal operating status. Looks for shutdown-related keywords in page content

### Frontend (`public/`)

- Fetches `/api/status` on load and every 15 minutes
- Three display states: "Yes" (red), "No" (green), or "Partially" (amber)
- Background turns dark red during shutdowns
- Fully responsive

### Deployment (`amplify.yml`)

- **Compute-first routing:** `/`, `/index.html`, `/og-image.png`, and `/api/*` route to Express (Lambda). Static assets (`style.css`, `app.js`) served from CDN
- **Compute bundle includes:** `server.js`, `src/`, `fonts/`, `public/`, `node_modules/`
- `fonts/` must be bundled — the Lambda environment has no system fonts for OG image rendering

## Key Conventions

- Keep the codebase simple — this is a single-purpose status site
- **Adding a new shutdown:** Add an entry to the `SHUTDOWNS` array in `src/shutdowns.js` with `{ start: 'YYYY-MM-DD', end: 'YYYY-MM-DD', type: 'full' | 'partial', detail: '...', description: '...' }`. Use `end: null` for ongoing shutdowns. `type` defaults to `'full'` when omitted
- **Adding a new scrape source:** Add an entry to the `SOURCES` array in `src/scraper.js` with a `name`, `url`, and `check` function
- No build step required — edit files and restart the server
- Prefer vanilla JS on the frontend; no frameworks needed for this scope

## Development Workflow

### Branches

- `main` — Primary branch (remote default)
- Feature branches use the `claude/` prefix convention

### Git Conventions

- Commit messages should be clear and descriptive
- Use feature branches for all new work
- Push with `git push -u origin <branch-name>`
