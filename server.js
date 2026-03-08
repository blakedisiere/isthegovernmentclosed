const express = require('express');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { getShutdownStatus } = require('./src/shutdowns');
const { scrapeAll } = require('./src/scraper');

const app = express();
const PORT = process.env.PORT || 3000;

// Cache scrape results for 15 minutes
let scrapeCache = { data: null, timestamp: 0 };
const CACHE_TTL = 15 * 60 * 1000;

// Load fonts for OG image generation (embedded as base64 in SVG)
const fontsDir = path.join(__dirname, 'fonts');
const fontOutfitRegular = fs.readFileSync(path.join(fontsDir, 'Outfit-Regular.ttf')).toString('base64');
const fontOutfitBold = fs.readFileSync(path.join(fontsDir, 'Outfit-Bold.ttf')).toString('base64');
const fontInstrumentSerif = fs.readFileSync(path.join(fontsDir, 'InstrumentSerif-Regular.ttf')).toString('base64');
const fontSpaceMono = fs.readFileSync(path.join(fontsDir, 'SpaceMono-Regular.ttf')).toString('base64');

// OG image cache
let ogCache = { buffer: null, cacheKey: null, timestamp: 0 };

function formatDateForOg(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function buildOgSvg(status) {
  const isClosed = status.isClosed;
  const type = status.type || 'full';

  let bg, answerText, answerColor, subtitle;
  if (!isClosed) {
    bg = '#07080c';
    answerText = 'No';
    answerColor = '#4ade80';
    subtitle = 'The government is open.';
  } else if (type === 'partial') {
    bg = '#0c0b06';
    answerText = 'Partially';
    answerColor = '#fbbf24';
    const days = status.since ? daysBetween(status.since, null) : null;
    subtitle = status.since
      ? `Since ${formatDateForOg(status.since)}` + (days ? ` · ${days} day${days !== 1 ? 's' : ''}` : '')
      : 'A partial government shutdown is underway.';
  } else {
    bg = '#0c0606';
    answerText = 'Yes';
    answerColor = '#ef4444';
    const days = status.since ? daysBetween(status.since, null) : null;
    subtitle = status.since
      ? `Since ${formatDateForOg(status.since)}` + (days ? ` · ${days} day${days !== 1 ? 's' : ''}` : '')
      : 'The government is shut down.';
  }

  return `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @font-face { font-family: 'Outfit'; font-weight: 400; src: url('data:font/ttf;base64,${fontOutfitRegular}') format('truetype'); }
      @font-face { font-family: 'Outfit'; font-weight: 700; src: url('data:font/ttf;base64,${fontOutfitBold}') format('truetype'); }
      @font-face { font-family: 'Instrument Serif'; src: url('data:font/ttf;base64,${fontInstrumentSerif}') format('truetype'); }
      @font-face { font-family: 'Space Mono'; src: url('data:font/ttf;base64,${fontSpaceMono}') format('truetype'); }
    </style>
    <filter id="glow">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="${bg}"/>
  <text x="600" y="160" text-anchor="middle" font-family="Outfit" font-size="36" fill="#9ca3af">Is the government closed?</text>
  <text x="600" y="370" text-anchor="middle" font-family="Instrument Serif" font-size="160" font-weight="bold" fill="${answerColor}" filter="url(#glow)">${answerText}</text>
  <text x="600" y="450" text-anchor="middle" font-family="Outfit" font-size="28" fill="#9ca3af">${subtitle}</text>
  <text x="600" y="590" text-anchor="middle" font-family="Space Mono" font-size="22" fill="#6b7280">isthegovernmentclosed.com</text>
</svg>`;
}

// Try to read index.html for SSR; if it fails, SSR is simply skipped
let indexHtml = null;
try {
  indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
} catch (err) {
  console.warn('Could not read index.html for SSR, falling back to static serving:', err.message);
}

// OG image route — must be before express.static
app.get('/og-image.png', async (req, res) => {
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

    const svg = buildOgSvg(status);
    const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
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
      // OG image tags are already in the static HTML — no injection needed

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
app.use(express.static(path.join(__dirname, 'public')));

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

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

// Export for Amplify Web Compute
module.exports = app;
