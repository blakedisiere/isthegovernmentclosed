const axios = require('axios');
const cheerio = require('cheerio');

const SOURCES = [
  {
    name: 'OPM Status',
    url: 'https://www.opm.gov/policy-data-oversight/snow-dismissal-procedures/current-status/',
    check: checkOPMStatus,
  },
];

// Scrape OPM (Office of Personnel Management) for federal operating status
async function checkOPMStatus(html) {
  const $ = cheerio.load(html);
  const statusText = $('body').text().toLowerCase();

  // OPM uses phrases like "shutdown", "closed", "lapse in appropriations"
  const shutdownKeywords = [
    'shutdown',
    'closed',
    'lapse in appropriations',
    'furlough',
    'government closure',
  ];

  const openKeywords = ['open', 'operating', 'normal operations'];

  const hasShutdownSignal = shutdownKeywords.some((kw) =>
    statusText.includes(kw)
  );
  const hasOpenSignal = openKeywords.some((kw) => statusText.includes(kw));

  if (hasShutdownSignal && !hasOpenSignal) {
    return { closed: true, source: 'OPM.gov' };
  }

  return { closed: false, source: 'OPM.gov' };
}

async function scrapeAll() {
  const results = [];

  for (const source of SOURCES) {
    try {
      const response = await axios.get(source.url, {
        timeout: 10000,
        headers: {
          'User-Agent':
            'IsTheGovernmentClosed/1.0 (public interest status checker)',
        },
      });
      const result = await source.check(response.data);
      results.push({ ...result, name: source.name });
    } catch (err) {
      console.error(`Failed to scrape ${source.name}: ${err.message}`);
      results.push({
        name: source.name,
        closed: null,
        source: source.name,
        error: err.message,
      });
    }
  }

  return results;
}

module.exports = { scrapeAll };
