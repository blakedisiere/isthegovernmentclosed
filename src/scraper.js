const axios = require('axios');
const cheerio = require('cheerio');

const SOURCES = [
  {
    name: 'OPM JSON API',
    url: 'https://www.opm.gov/json/operatingstatus.json',
    check: checkOPMJson,
  },
  {
    name: 'OPM HTML Status',
    url: 'https://www.opm.gov/policy-data-oversight/snow-dismissal-procedures/current-status/',
    check: checkOPMHtml,
  },
  {
    name: 'CRS Appropriations Table',
    url: 'https://www.congress.gov/crs-appropriations-status-table',
    check: checkCRSTable,
  },
  {
    name: 'Wikipedia Shutdown Article',
    url: null, // URL determined dynamically based on fiscal year
    check: null, // handled separately
    scrape: scrapeWikipedia,
  },
];

// --- OPM JSON API (primary source) ---
// Returns structured JSON — no HTML parsing needed.
// Caveat: only reflects DC-area status, may show "Open" during partial shutdowns.
async function checkOPMJson(data) {
  const json = typeof data === 'string' ? JSON.parse(data) : data;

  const shutdownKeywords = [
    'shutdown',
    'lapse in appropriations',
    'furlough',
    'government closure',
  ];

  const textFields = [
    json.StatusSummary,
    json.ShortStatusMessage,
    json.LongStatusMessage,
    json.Title,
  ]
    .filter(Boolean)
    .map((s) => s.toLowerCase())
    .join(' ');

  const hasShutdownSignal = shutdownKeywords.some((kw) =>
    textFields.includes(kw)
  );

  const isPartial = textFields.includes('partial');

  return {
    closed: hasShutdownSignal,
    type: hasShutdownSignal ? (isPartial ? 'partial' : 'full') : undefined,
    source: 'OPM.gov (JSON API)',
    detail: json.StatusSummary || json.ShortStatusMessage || null,
  };
}

// --- OPM HTML page (fallback) ---
async function checkOPMHtml(html) {
  const $ = cheerio.load(html);
  const statusText = $('body').text().toLowerCase();

  const shutdownKeywords = [
    'shutdown',
    'lapse in appropriations',
    'furlough',
    'government closure',
  ];
  const openKeywords = ['open', 'operating', 'normal operations'];

  const hasShutdownSignal = shutdownKeywords.some((kw) =>
    statusText.includes(kw)
  );
  const hasOpenSignal = openKeywords.some((kw) => statusText.includes(kw));

  const isPartial = statusText.includes('partial');

  if (hasShutdownSignal && !hasOpenSignal) {
    return { closed: true, type: isPartial ? 'partial' : 'full', source: 'OPM.gov' };
  }
  return { closed: false, source: 'OPM.gov' };
}

// --- CRS Appropriations Status Table ---
// Detects partial shutdowns by checking individual bill funding status.
// If any appropriations bill lacks enacted status and its CR has expired,
// the agencies under that bill are unfunded.
async function checkCRSTable(html) {
  const $ = cheerio.load(html);
  const pageText = $('body').text().toLowerCase();

  // Look for explicit shutdown/lapse language on the page
  const shutdownPhrases = [
    'lapse in appropriations',
    'government shutdown',
    'partial shutdown',
    'funding gap',
  ];

  const hasShutdownLanguage = shutdownPhrases.some((phrase) =>
    pageText.includes(phrase)
  );

  // Check tables for bills without "enacted" or "signed" status
  const unfundedBills = [];
  $('table tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length > 0) {
      const billName = $(cells[0]).text().trim();
      const rowText = $(row).text().toLowerCase();
      // If the row mentions a bill but has no "enacted" or "public law" marker
      if (
        billName &&
        !rowText.includes('enacted') &&
        !rowText.includes('public law') &&
        !rowText.includes('signed')
      ) {
        unfundedBills.push(billName);
      }
    }
  });

  // Count total bills to determine if shutdown is partial or full
  const totalBills = $('table tr').filter((_, row) => $(row).find('td').length > 0).length;
  const isPartial = unfundedBills.length > 0 && unfundedBills.length < totalBills;

  return {
    closed: hasShutdownLanguage,
    type: hasShutdownLanguage ? (isPartial ? 'partial' : 'full') : undefined,
    source: 'Congress.gov (CRS)',
    detail:
      unfundedBills.length > 0
        ? `Potentially unfunded: ${unfundedBills.slice(0, 3).join(', ')}`
        : null,
    unfundedBills,
  };
}

// --- Wikipedia shutdown article ---
// Wikipedia titles shutdown articles by calendar year (singular or plural).
// Only the infobox is checked: an ongoing event's date reads "<start> – present".
// Scanning the whole article text would match historical prose like
// "partial shutdown" and report closures that already ended.
async function scrapeWikipedia() {
  const year = new Date().getFullYear();
  // Include last year so a shutdown that began in December is still found in January
  const titles = [year, year - 1].flatMap((y) => [
    `${y}_United_States_federal_government_shutdown`,
    `${y}_United_States_federal_government_shutdowns`,
  ]);

  let foundArticle = false;

  for (const title of titles) {
    try {
      const response = await axios.get('https://en.wikipedia.org/w/api.php', {
        params: { action: 'parse', page: title, prop: 'text', redirects: 1, format: 'json' },
        timeout: 10000,
        headers: { 'User-Agent': 'IsTheGovernmentClosed/1.0' },
      });

      if (response.data?.error) continue;
      foundArticle = true;

      const html = response.data?.parse?.text?.['*'] || '';
      const result = checkWikipediaHtml(html);
      if (result.closed) return result;
    } catch {
      continue;
    }
  }

  return {
    closed: foundArticle ? false : null,
    source: 'Wikipedia',
    name: 'Wikipedia Shutdown Article',
    ...(foundArticle ? {} : { error: 'No Wikipedia shutdown article found for this year' }),
  };
}

function checkWikipediaHtml(html) {
  const $ = cheerio.load(html);
  let ongoing = null;

  $('.infobox').each((_, box) => {
    // Join cells with spaces — .text() alone glues adjacent cells together
    const text = $(box)
      .find('th, td')
      .map((_, cell) => $(cell).text())
      .get()
      .join(' ')
      .replace(/\s+/g, ' ');
    if (/[–—-]\s*present\b/i.test(text)) {
      ongoing = { partial: /\bpartial\b/i.test(text) };
      return false;
    }
  });

  return {
    closed: !!ongoing,
    type: ongoing ? (ongoing.partial ? 'partial' : 'full') : undefined,
    source: 'Wikipedia',
    name: 'Wikipedia Shutdown Article',
    detail: ongoing ? 'Wikipedia lists a shutdown as ongoing' : null,
  };
}

async function scrapeAll() {
  const results = [];

  // Scrape standard sources (URL + check function)
  const standardSources = SOURCES.filter((s) => s.url && s.check);
  const customSources = SOURCES.filter((s) => s.scrape);

  // Run all sources concurrently
  const promises = [];

  for (const source of standardSources) {
    promises.push(
      (async () => {
        try {
          const response = await axios.get(source.url, {
            timeout: 10000,
            headers: {
              'User-Agent':
                'IsTheGovernmentClosed/1.0 (public interest status checker)',
            },
          });
          const result = await source.check(response.data);
          return { ...result, name: source.name };
        } catch (err) {
          console.error(`Failed to scrape ${source.name}: ${err.message}`);
          return {
            name: source.name,
            closed: null,
            source: source.name,
            error: err.message,
          };
        }
      })()
    );
  }

  for (const source of customSources) {
    promises.push(
      (async () => {
        try {
          return await source.scrape();
        } catch (err) {
          console.error(`Failed to scrape ${source.name}: ${err.message}`);
          return {
            name: source.name,
            closed: null,
            source: source.name,
            error: err.message,
          };
        }
      })()
    );
  }

  const settled = await Promise.all(promises);
  results.push(...settled);

  return results;
}

module.exports = { scrapeAll, checkWikipediaHtml };
