const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { getShutdownStatus } = require('./src/shutdowns');
const { scrapeAll } = require('./src/scraper');

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      upgradeInsecureRequests: null,
    },
  },
}));

// Rate limiting on API routes
app.use('/api/', rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
}));

// Cache scrape results for 15 minutes
let scrapeCache = { data: null, timestamp: 0 };
const CACHE_TTL = 15 * 60 * 1000;

// Read index.html template once at startup
const indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

// Serve static files (but not index.html — we handle that below)
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Helper: days between two dates (or today if end is null)
function daysBetween(startStr, endStr) {
  const start = new Date(startStr + 'T00:00:00');
  const end = endStr ? new Date(endStr + 'T00:00:00') : new Date();
  return Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
}

// API endpoint: full shutdown history with computed fields
app.get('/api/shutdowns', (req, res) => {
  const { SHUTDOWNS } = require('./src/shutdowns');
  const shutdowns = SHUTDOWNS.map((s) => ({
    start: s.start,
    end: s.end,
    type: s.type || 'full',
    days: daysBetween(s.start, s.end),
    description: s.description || null,
  }));
  const totalDays = shutdowns.reduce((sum, s) => sum + s.days, 0);
  const maxDays = Math.max(...shutdowns.map((s) => s.days));
  res.json({ shutdowns, count: shutdowns.length, totalDays, maxDays });
});

// API endpoint: get current shutdown status
app.get('/api/status', async (req, res) => {
  const status = getShutdownStatus();

  // Try live scraping (with cache)
  let liveSignal = null;
  const now = Date.now();

  if (!scrapeCache.data || now - scrapeCache.timestamp > CACHE_TTL) {
    try {
      const results = await scrapeAll();
      scrapeCache = { data: results, timestamp: now };
    } catch (err) {
      console.error('Scrape failed:', err.message);
    }
  }

  if (scrapeCache.data) {
    const closedSignals = scrapeCache.data.filter((r) => r.closed === true);
    const errorSignals = scrapeCache.data.filter((r) => r.error);
    if (closedSignals.length > 0) {
      // If any source says 'full', treat as full; otherwise 'partial'
      const hasFullSignal = closedSignals.some((s) => s.type === 'full');
      const hasPartialSignal = closedSignals.some((s) => s.type === 'partial');
      const liveType = hasFullSignal ? 'full' : hasPartialSignal ? 'partial' : undefined;

      liveSignal = {
        closed: true,
        type: liveType,
        sources: closedSignals.map((s) => ({
          name: s.source,
          detail: s.detail || null,
        })),
      };
    }
    if (errorSignals.length > 0) {
      liveSignal = liveSignal || { closed: false, sources: [] };
      liveSignal.errors = errorSignals.map((s) => ({
        name: s.name,
        error: s.error,
      }));
    }
  }

  res.json({
    ...status,
    daysClosed: status.since ? daysBetween(status.since, null) : null,
    liveCheck: liveSignal,
    sourceCount: scrapeCache.data ? scrapeCache.data.length : 0,
    lastScraped: scrapeCache.timestamp
      ? new Date(scrapeCache.timestamp).toISOString()
      : null,
  });
});

// Serve index.html with injected initial status
app.get('/', (req, res) => {
  const status = getShutdownStatus();
  const initialData = {
    ...status,
    daysClosed: status.since ? daysBetween(status.since, null) : null,
  };
  const script = `<script>window.__STATUS__=${JSON.stringify(initialData)}</script>`;
  res.send(indexHtml.replace('</head>', script + '</head>'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

// Export for Amplify Web Compute
module.exports = app;
