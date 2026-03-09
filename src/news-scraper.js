const axios = require('axios');
const cheerio = require('cheerio');

const RSS_SOURCES = [
  {
    name: 'Google News',
    url: 'https://news.google.com/rss/search?q=government+shutdown+OR+funding+lapse+OR+appropriations&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'Congress.gov',
    url: 'https://www.congress.gov/rss/most-viewed-bills.xml',
  },
];

const KEYWORDS = [
  'shutdown',
  'government closed',
  'appropriations',
  'continuing resolution',
  'furlough',
  'funding lapse',
];

function matchesKeywords(text) {
  const lower = text.toLowerCase();
  return KEYWORDS.some((kw) => lower.includes(kw));
}

function parseRssItems(xml) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const items = [];

  $('item').each((_, el) => {
    const title = $(el).find('title').text().trim();
    const link = $(el).find('link').text().trim();
    const pubDate = $(el).find('pubDate').text().trim();
    const description = $(el).find('description').text().trim();

    items.push({ title, link, pubDate, description });
  });

  return items;
}

async function fetchNews() {
  const allArticles = [];

  const promises = RSS_SOURCES.map(async (source) => {
    try {
      const response = await axios.get(source.url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'IsTheGovernmentClosed/1.0 (public interest news aggregator)',
        },
      });

      const items = parseRssItems(response.data);

      // Filter by keywords for non-Congress.gov sources
      const filtered = source.name === 'Congress.gov'
        ? items.filter((item) => matchesKeywords(item.title + ' ' + item.description))
        : items;

      filtered.forEach((item) => {
        allArticles.push({
          title: item.title,
          link: item.link,
          pubDate: item.pubDate || null,
          source: source.name,
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
