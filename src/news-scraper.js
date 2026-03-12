const axios = require('axios');
const cheerio = require('cheerio');

const RSS_SOURCES = [
  {
    name: 'Google News',
    url: 'https://news.google.com/rss/search?q=%22government+shutdown%22+OR+%22federal+shutdown%22+OR+%22funding+lapse%22+OR+%22continuing+resolution%22&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'Congress.gov',
    url: 'https://www.congress.gov/rss/most-viewed-bills.xml',
  },
];

// Strong keywords — match anywhere in title + description
const STRONG_KEYWORDS = [
  'shutdown',
  'government closed',
  'government closure',
  'funding lapse',
  'furlough',
  'continuing resolution',
  'appropriations bill',
  'spending bill',
  'stopgap funding',
  'cr expir',
];

// Weaker keywords — only match if found in the title
const TITLE_KEYWORDS = [
  'appropriations',
  'federal funding',
  'federal budget',
];

// Reject articles matching these patterns even if keywords match
const EXCLUDE_PATTERNS = [
  'state government',
  'state shutdown',
  'state budget',
  'uk government',
  'british government',
  'parliament shutdown',
  'canadian government',
];

// Only show articles from these outlets (matched case-insensitively)
const TRUSTED_SOURCES = new Set([
  'associated press',
  'ap news',
  'reuters',
  'cnn',
  'nbc news',
  'abc news',
  'cbs news',
  'npr',
  'pbs',
  'pbs newshour',
  'washington post',
  'the washington post',
  'new york times',
  'the new york times',
  'politico',
  'the hill',
  'usa today',
  'axios',
  'bloomberg',
  'wall street journal',
  'the wall street journal',
  'fox news',
  'bbc',
  'bbc news',
  'cnbc',
  'c-span',
  'the guardian',
  'los angeles times',
  'congress.gov',
]);

function matchesKeywords(title, description) {
  const fullText = (title + ' ' + (description || '')).toLowerCase();
  const titleLower = title.toLowerCase();

  if (STRONG_KEYWORDS.some((kw) => fullText.includes(kw))) return true;
  if (TITLE_KEYWORDS.some((kw) => titleLower.includes(kw))) return true;
  return false;
}

function isExcluded(title, description) {
  const fullText = (title + ' ' + (description || '')).toLowerCase();
  return EXCLUDE_PATTERNS.some((pat) => fullText.includes(pat));
}

function isTrustedSource(sourceName) {
  if (!sourceName) return false;
  return TRUSTED_SOURCES.has(sourceName.toLowerCase());
}

function parseRssItems(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const items = [];

  $('item').each((_, el) => {
    const title = $(el).find('title').text().trim();
    const link = $(el).find('link').text().trim();
    const pubDate = $(el).find('pubDate').text().trim();
    const description = $(el).find('description').text().trim();
    const sourceName = $(el).find('source').text().trim();

    items.push({ title, link, pubDate, description, sourceName });
  });

  return items;
}

async function fetchNews() {
  const allArticles = [];

  const promises = RSS_SOURCES.map(async (source) => {
    try {
      const response = await axios.get(source.url, {
        timeout: 20000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; IsTheGovernmentClosed/1.0; +https://isthegovernmentclosed.com)',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        },
        maxRedirects: 5,
      });

      const items = parseRssItems(response.data);

      const filtered = items.filter((item) => {
        if (!matchesKeywords(item.title, item.description)) return false;
        if (isExcluded(item.title, item.description)) return false;
        // For Google News, only allow trusted sources
        if (source.name === 'Google News' && !isTrustedSource(item.sourceName)) return false;
        return true;
      });

      filtered.forEach((item) => {
        allArticles.push({
          title: item.title,
          link: item.link,
          pubDate: item.pubDate || null,
          source: item.sourceName || source.name,
          description: item.description
            ? cheerio.load(item.description).text().slice(0, 200)
            : null,
        });
      });
    } catch (err) {
      console.error(`Failed to fetch news from ${source.name}: ${err.message}`);
    }
  });

  await Promise.all(promises);

  // Sort by date descending, return top 5
  allArticles.sort((a, b) => {
    const da = a.pubDate ? new Date(a.pubDate) : new Date(0);
    const db = b.pubDate ? new Date(b.pubDate) : new Date(0);
    return db - da;
  });

  return allArticles.slice(0, 5);
}

module.exports = { fetchNews };
