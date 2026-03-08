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
    if (closedSignals.length > 0) {
      liveSignal = { closed: true, sources: closedSignals.map((s) => s.source) };
    }
  }

  res.json({
    ...status,
    liveCheck: liveSignal,
    lastScraped: scrapeCache.timestamp
      ? new Date(scrapeCache.timestamp).toISOString()
      : null,
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
