const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
let sharp;
try {
  sharp = require('sharp');
} catch (err) {
  console.warn('sharp not available, OG image generation disabled:', err.message);
}
const { getShutdownStatus, addShutdown } = require('./src/shutdowns');
const { scrapeAll } = require('./src/scraper');
const { fetchNews } = require('./src/news-scraper');
const { scrapeVotes } = require('./src/vote-scraper');
const { addSubscription, removeSubscription, sendNotificationToAll, VAPID_PUBLIC_KEY } = require('./src/push');

const app = express();
app.set('trust proxy', true);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json());
const PORT = process.env.PORT || 3000;

// Track last known shutdown state for push notifications
let lastKnownState = null;

// Cache scrape results for 15 minutes
let scrapeCache = { data: null, timestamp: 0 };
const CACHE_TTL = 15 * 60 * 1000;

// News cache (30 minutes)
let newsCache = { data: null, timestamp: 0 };
const NEWS_CACHE_TTL = 30 * 60 * 1000;

// Votes cache (30 minutes)
let votesCache = { data: null, timestamp: 0 };
const VOTES_CACHE_TTL = 30 * 60 * 1000;

// OG image cache
let ogCache = { buffer: null, cacheKey: null, timestamp: 0 };

// Load font files for Pango text rendering
const fontsDir = path.join(__dirname, 'fonts');
let fontFiles = {};
try {
  fontFiles = {
    outfit: path.join(fontsDir, 'Outfit-Regular.ttf'),
    outfitBold: path.join(fontsDir, 'Outfit-Bold.ttf'),
    instrumentSerif: path.join(fontsDir, 'InstrumentSerif-Regular.ttf'),
    spaceMono: path.join(fontsDir, 'SpaceMono-Regular.ttf'),
  };
  // Verify files exist
  Object.values(fontFiles).forEach(f => fs.accessSync(f));
} catch (err) {
  console.warn('Could not find OG image fonts:', err.message);
  fontFiles = {};
}

function formatDateForOg(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

async function buildOgImage(status) {
  const isClosed = status.isClosed;
  const type = status.type || 'full';
  const WIDTH = 1200;
  const HEIGHT = 630;

  let bgHex, answerText, answerColor, subtitle;
  if (!isClosed) {
    bgHex = '#07080c';
    answerText = 'No';
    answerColor = '#4ade80';
    subtitle = 'The government is open.';
  } else if (type === 'partial') {
    bgHex = '#0c0b06';
    answerText = 'Partially';
    answerColor = '#fbbf24';
    const days = status.since ? daysBetween(status.since, null) : null;
    subtitle = status.since
      ? `Since ${formatDateForOg(status.since)}` + (days ? ` \u00b7 ${days} day${days !== 1 ? 's' : ''}` : '')
      : 'A partial government shutdown is underway.';
  } else {
    bgHex = '#0c0606';
    answerText = 'Yes';
    answerColor = '#ef4444';
    const days = status.since ? daysBetween(status.since, null) : null;
    subtitle = status.since
      ? `Since ${formatDateForOg(status.since)}` + (days ? ` \u00b7 ${days} day${days !== 1 ? 's' : ''}` : '')
      : 'The government is shut down.';
  }

  // Parse background hex to RGB
  const bgR = parseInt(bgHex.slice(1, 3), 16);
  const bgG = parseInt(bgHex.slice(3, 5), 16);
  const bgB = parseInt(bgHex.slice(5, 7), 16);

  // Use Pango text rendering via sharp's text input
  const headerBuf = await sharp({
    text: {
      text: `<span foreground="#9ca3af" size="48000">Is the government closed?</span>`,
      fontfile: fontFiles.instrumentSerif || undefined,
      rgba: true,
      width: WIDTH - 80,
      align: 'centre',
    },
  }).png().toBuffer();

  const answerBuf = await sharp({
    text: {
      text: `<span foreground="${answerColor}" size="200000">${answerText}</span>`,
      fontfile: fontFiles.instrumentSerif || undefined,
      rgba: true,
      width: WIDTH - 80,
      align: 'centre',
    },
  }).png().toBuffer();

  // Add glow: blur a copy of the answer text and composite under original
  const answerMeta = await sharp(answerBuf).metadata();
  const glowBuf = await sharp(answerBuf)
    .blur(15)
    .toBuffer();

  const subtitleBuf = await sharp({
    text: {
      text: `<span foreground="#9ca3af" size="32000">${subtitle.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`,
      fontfile: fontFiles.outfit || undefined,
      rgba: true,
      width: WIDTH - 80,
      align: 'centre',
    },
  }).png().toBuffer();

  const domainBuf = await sharp({
    text: {
      text: '<span foreground="#6b7280" size="24000">isthegovernmentclosed.com</span>',
      fontfile: fontFiles.spaceMono || undefined,
      rgba: true,
      width: WIDTH - 80,
      align: 'centre',
    },
  }).png().toBuffer();

  // Get dimensions for centering
  const headerMeta = await sharp(headerBuf).metadata();
  const subtitleMeta = await sharp(subtitleBuf).metadata();
  const domainMeta = await sharp(domainBuf).metadata();

  // Layout: center everything horizontally, spread vertically
  const headerY = 60;
  const answerY = Math.round((HEIGHT - answerMeta.height) / 2) - 40;
  const subtitleY = answerY + answerMeta.height + 10;
  const domainY = HEIGHT - domainMeta.height - 20;

  return sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: { r: bgR, g: bgG, b: bgB, alpha: 255 },
    },
  })
    .composite([
      { input: headerBuf, left: Math.round((WIDTH - headerMeta.width) / 2), top: headerY },
      { input: glowBuf, left: Math.round((WIDTH - answerMeta.width) / 2), top: answerY },
      { input: answerBuf, left: Math.round((WIDTH - answerMeta.width) / 2), top: answerY },
      { input: subtitleBuf, left: Math.round((WIDTH - subtitleMeta.width) / 2), top: subtitleY },
      { input: domainBuf, left: Math.round((WIDTH - domainMeta.width) / 2), top: domainY },
    ])
    .png()
    .toBuffer();
}

// Try to read index.html for SSR; if it fails, SSR is simply skipped
let indexHtml = null;
try {
  indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
} catch (err) {
  console.warn('Could not read index.html for SSR, falling back to static serving:', err.message);
}

// Sitemap route
app.get('/sitemap.xml', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  res.set('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://isthegovernmentclosed.com/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`);
});

// OG image route — must be before express.static
app.get('/og-image.png', async (req, res) => {
  if (!sharp) {
    return res.status(503).send('Image generation not available');
  }
  try {
    const status = getShutdownStatus();
    const days = status.since ? daysBetween(status.since, null) : 0;
    const key = `${status.isClosed}-${status.type || 'none'}-${days}`;
    const now = Date.now();

    if (ogCache.cacheKey === key && ogCache.buffer && now - ogCache.timestamp < CACHE_TTL) {
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'public, max-age=900');
      return res.send(ogCache.buffer);
    }

    const buffer = await buildOgImage(status);
    ogCache = { buffer, cacheKey: key, timestamp: now };

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=900');
    res.send(buffer);
  } catch (err) {
    console.error('OG image generation failed:', err.message);
    res.status(500).send('Image generation failed');
  }
});

// SSR route — inject initial status into HTML to avoid flash of loading state
if (indexHtml) {
  app.get('/', (req, res) => {
    try {
      const status = getShutdownStatus();
      const initialData = {
        ...status,
        daysClosed: status.since ? daysBetween(status.since, null) : null,
      };
      const script = `<script>window.__STATUS__=${JSON.stringify(initialData)}</script>`;
      let html = indexHtml.replace('</head>', script + '</head>');

      // Dynamic OG description
      let ogDescription;
      if (!status.isClosed) {
        ogDescription = 'No — the US Federal Government is currently open.';
      } else if (status.type === 'partial') {
        const days = status.since ? daysBetween(status.since, null) : null;
        ogDescription = `Partially — a partial shutdown has been underway` +
          (status.since ? ` since ${formatDateForOg(status.since)}` : '') +
          (days ? ` (${days} day${days !== 1 ? 's' : ''})` : '') + '.';
      } else {
        const days = status.since ? daysBetween(status.since, null) : null;
        ogDescription = `Yes — the government has been shut down` +
          (status.since ? ` since ${formatDateForOg(status.since)}` : '') +
          (days ? ` (${days} day${days !== 1 ? 's' : ''})` : '') + '.';
      }

      // Replace static OG/Twitter descriptions with dynamic ones
      html = html.replace(
        /<meta property="og:description" content="[^"]*">/,
        `<meta property="og:description" content="${ogDescription}">`
      );
      html = html.replace(
        /<meta name="twitter:description" content="[^"]*">/,
        `<meta name="twitter:description" content="${ogDescription}">`
      );
      // Upgrade twitter card to large image
      html = html.replace(
        /<meta name="twitter:card" content="[^"]*">/,
        '<meta name="twitter:card" content="summary_large_image">'
      );
      // Replace OG image and URL with the actual request host
      const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
      const origin = `${proto}://${req.get('host')}`;
      html = html.replace(/https:\/\/isthegovernmentclosed\.com/g, origin);

      // Inject answer text for search-engine crawlers
      const answerText = status.isClosed
        ? (status.type === 'partial' ? 'Partially' : 'Yes')
        : 'No';
      html = html.replace(
        'class="answer loading shimmer" aria-live="polite" aria-atomic="true">...</div>',
        `class="answer" aria-live="polite" aria-atomic="true">${answerText}</div>`
      );

      res.send(html);
    } catch (err) {
      console.error('SSR failed, serving static index.html:', err.message);
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
  });
}

// Static files — index.html still served normally as fallback
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));

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
    reopeningBill: s.reopeningBill || null,
  }));
  const totalDays = shutdowns.reduce((sum, s) => sum + s.days, 0);
  const maxDays = Math.max(...shutdowns.map((s) => s.days));
  res.json({ shutdowns, count: shutdowns.length, totalDays, maxDays });
});

// Push notification routes
app.get('/api/push/vapid-public-key', (req, res) => {
  res.json({ key: VAPID_PUBLIC_KEY || null });
});

app.post('/api/push/subscribe', (req, res) => {
  const subscription = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }
  addSubscription(subscription);
  res.json({ success: true });
});

app.post('/api/push/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) {
    return res.status(400).json({ error: 'Missing endpoint' });
  }
  removeSubscription(endpoint);
  res.json({ success: true });
});

// API endpoint: news feed
app.get('/api/news', async (req, res) => {
  const now = Date.now();
  if (newsCache.data && now - newsCache.timestamp < NEWS_CACHE_TTL) {
    return res.json(newsCache.data);
  }
  try {
    const articles = await fetchNews();
    newsCache = { data: { articles }, timestamp: now };
    res.json({ articles });
  } catch (err) {
    console.error('News fetch failed:', err.message);
    res.json({ articles: [] });
  }
});

// API endpoint: recent reopening votes
app.get('/api/votes', async (req, res) => {
  const now = Date.now();
  if (votesCache.data && now - votesCache.timestamp < VOTES_CACHE_TTL) {
    return res.json(votesCache.data);
  }
  try {
    const votes = await scrapeVotes();
    const response = { votes, lastScraped: new Date().toISOString() };
    votesCache = { data: response, timestamp: now };
    res.json(response);
  } catch (err) {
    console.error('Votes fetch failed:', err.message);
    res.json({ votes: [], lastScraped: null });
  }
});

// API endpoint: get current shutdown status
app.get('/api/status', async (req, res) => {
  let status = getShutdownStatus();

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
    const openSignals = scrapeCache.data.filter((r) => r.closed === false);
    const errorSignals = scrapeCache.data.filter((r) => r.error);

    // Auto-close stale ongoing shutdowns: if the data file still marks a
    // shutdown as ongoing but live sources reach consensus that the
    // government is open, mark it ended today and re-evaluate.
    if (
      status.isClosed &&
      status.since &&
      closedSignals.length === 0 &&
      openSignals.length >= 2
    ) {
      const today = new Date().toISOString().split('T')[0];
      addShutdown(status.since, today, status.type || 'full');
      status = getShutdownStatus();
    }

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

  const response = {
    ...status,
    daysClosed: status.since ? daysBetween(status.since, null) : null,
    liveCheck: liveSignal,
    sourceCount: scrapeCache.data ? scrapeCache.data.length : 0,
    lastScraped: scrapeCache.timestamp
      ? new Date(scrapeCache.timestamp).toISOString()
      : null,
  };

  // Check for status change and send push notifications
  const currentState = `${status.isClosed}-${status.type || 'none'}`;
  if (lastKnownState !== null && lastKnownState !== currentState) {
    const statusWord = status.isClosed
      ? (status.type === 'partial' ? 'partially closed' : 'closed')
      : 'open';
    sendNotificationToAll({
      title: 'Government Shutdown Update',
      body: `The US government is now ${statusWord}.`,
      url: '/',
    }).catch((err) => console.error('Push notification error:', err.message));
  }
  lastKnownState = currentState;

  res.json(response);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

// Export for Amplify Web Compute
module.exports = app;
