# CLAUDE.md

## Project Overview

**isthegovernmentclosed** — A website that displays whether the US Federal government is currently closed (shutdown). The backend scrapes public sources to determine status and falls back on a curated list of historical shutdowns. The frontend shows a large "Yes" or "No" with contextual date information.

## Repository Structure

```
isthegovernmentclosed/
├── server.js            # Express server — serves API + static files
├── src/
│   ├── shutdowns.js     # Historical shutdown data + status logic
│   └── scraper.js       # Scrapes OPM.gov and other public sources
├── public/
│   ├── index.html       # Single-page frontend
│   ├── style.css        # Styles (dark theme, responsive)
│   └── app.js           # Client-side fetch + DOM updates
├── package.json         # Dependencies and scripts
├── .gitignore
├── CLAUDE.md            # This file
└── README.md
```

## Tech Stack

- **Runtime:** Node.js
- **Server:** Express 4
- **Scraping:** Axios + Cheerio
- **Frontend:** Vanilla HTML/CSS/JS (no build step)

## Commands

```bash
npm install          # Install dependencies
npm start            # Start production server (port 3000)
npm run dev          # Start dev server with --watch auto-reload
```

## Architecture

### Backend (`server.js` + `src/`)

- **`GET /api/status`** — Returns JSON with shutdown status:
  - `isClosed` (boolean), `message` (string), `since` or `lastClosure` dates
  - `liveCheck` — result from live scraping (if available)
  - `lastScraped` — timestamp of last scrape
- **Scrape cache:** Results cached for 15 minutes to avoid hammering sources
- **`src/shutdowns.js`** — Contains all historical US government shutdowns (1976–2019). `getShutdownStatus()` checks if today falls within any shutdown range
- **`src/scraper.js`** — Scrapes OPM.gov for current federal operating status. Looks for shutdown-related keywords in page content

### Frontend (`public/`)

- Fetches `/api/status` on load and every 15 minutes
- Displays giant "Yes" (red) or "No" (green) with date context
- Background turns dark red during shutdowns
- Fully responsive

## Key Conventions

- Keep the codebase simple — this is a single-purpose status site
- **Adding a new shutdown:** Add an entry to the `SHUTDOWNS` array in `src/shutdowns.js` with `{ start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }`. Use `end: null` for ongoing shutdowns
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
