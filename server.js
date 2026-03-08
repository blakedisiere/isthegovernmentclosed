const express = require('express');
const path = require('path');
const { getShutdownStatus } = require('./src/shutdowns');
const { scrapeAll } = require('./src/scraper');

const app = express();
const PORT = process.env.PORT || 3000;

// Cache scrape results for 15 minutes
let scrapeCache = { data: null, timestamp: 0 };
const CACHE_TTL = 15 * 60 * 1000;

app.use(express.static(path.join(__dirname, 'public')));

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
    liveCheck: liveSignal,
    sourceCount: scrapeCache.data ? scrapeCache.data.length : 0,
    lastScraped: scrapeCache.timestamp
      ? new Date(scrapeCache.timestamp).toISOString()
      : null,
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
