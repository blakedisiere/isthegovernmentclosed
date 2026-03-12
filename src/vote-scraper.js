const axios = require('axios');
const cheerio = require('cheerio');

const AXIOS_OPTS = {
  timeout: 15000,
  headers: {
    'User-Agent': 'IsTheGovernmentClosed/1.0 (public interest status checker)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  },
};

// Keywords indicating a vote is about government funding / reopening
const FUNDING_KEYWORDS = [
  'continuing resolution',
  'continuing appropriations',
  'appropriations act',
  'government funding',
  'full-year continuing',
  'further continuing',
  'making appropriations',
  'department of homeland security',
  'funding the government',
  'end the shutdown',
  'reopen the government',
  'lapse in appropriations',
  'stopgap',
];

// Keywords to reject (procedural motions, unrelated)
const EXCLUDE_KEYWORDS = [
  'journal',
  'quorum',
  'adjournment',
  'previous question on the rule',
];

function isFundingRelated(text) {
  const lower = text.toLowerCase();
  if (EXCLUDE_KEYWORDS.some((kw) => lower.includes(kw))) return false;
  return FUNDING_KEYWORDS.some((kw) => lower.includes(kw));
}

// --- House Clerk Roll Call Votes ---
// Scrapes the House Clerk's roll call index page for the current year,
// then fetches XML details for funding-related votes.
async function scrapeHouseVotes() {
  const year = new Date().getFullYear();
  const indexUrl = `https://clerk.house.gov/evs/${year}/index.asp`;

  const votes = [];

  try {
    const indexRes = await axios.get(indexUrl, AXIOS_OPTS);
    const $ = cheerio.load(indexRes.data);

    // Parse roll call table rows — each row has: Roll, Date, Issue, Question, Result
    const candidates = [];
    $('table tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 5) return;

      const rollNumber = $(cells[0]).text().trim();
      const date = $(cells[1]).text().trim();
      const issue = $(cells[2]).text().trim();
      const question = $(cells[3]).text().trim();
      const result = $(cells[4]).text().trim();

      const combined = `${issue} ${question}`;
      if (isFundingRelated(combined)) {
        candidates.push({ rollNumber, date, issue, question, result });
      }
    });

    // Take the most recent 5 candidates and fetch their XML for vote counts
    const recent = candidates.slice(-5).reverse();

    for (const candidate of recent) {
      try {
        const rollNum = candidate.rollNumber.replace(/\D/g, '').padStart(3, '0');
        const xmlUrl = `https://clerk.house.gov/evs/${year}/roll${rollNum}.xml`;
        const xmlRes = await axios.get(xmlUrl, AXIOS_OPTS);
        const x$ = cheerio.load(xmlRes.data, { xmlMode: true });

        const yea = parseInt(x$('yea-total, totals-by-vote yea').text()) || 0;
        const nay = parseInt(x$('nay-total, totals-by-vote nay').text()) || 0;
        const present = parseInt(x$('present-total, totals-by-vote present').text()) || 0;
        const notVoting = parseInt(x$('not-voting-total, totals-by-vote not-voting').text()) || 0;

        const billTitle = x$('vote-metadata legis-num').text().trim() ||
                          candidate.issue;
        const voteQuestion = x$('vote-metadata vote-question').text().trim() ||
                             candidate.question;
        const voteResult = x$('vote-metadata vote-result').text().trim() ||
                           candidate.result;

        votes.push({
          chamber: 'House',
          rollNumber: candidate.rollNumber,
          date: candidate.date,
          bill: billTitle,
          question: voteQuestion,
          result: voteResult,
          yea,
          nay,
          present,
          notVoting,
          threshold: 218, // Simple majority of 435
          thresholdLabel: '218 needed',
          url: `https://clerk.house.gov/evs/${year}/roll${rollNum}.xml`,
        });
      } catch {
        // If individual vote XML fails, use what we have from the index
        votes.push({
          chamber: 'House',
          rollNumber: candidate.rollNumber,
          date: candidate.date,
          bill: candidate.issue,
          question: candidate.question,
          result: candidate.result,
          yea: null,
          nay: null,
          present: null,
          notVoting: null,
          threshold: 218,
          thresholdLabel: '218 needed',
          url: null,
        });
      }
    }
  } catch (err) {
    console.error('House vote scrape failed:', err.message);
  }

  return votes;
}

// --- Senate Roll Call Votes ---
// Scrapes the Senate vote listing page for the current congress/session.
async function scrapeSenateVotes() {
  // 119th Congress, 2nd session (2025-2026)
  const now = new Date();
  const congress = 119;
  const session = now.getFullYear() <= 2025 ? 1 : 2;
  const menuUrl = `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${congress}_${session}.htm`;

  const votes = [];

  try {
    const res = await axios.get(menuUrl, AXIOS_OPTS);
    const $ = cheerio.load(res.data);

    const candidates = [];
    $('table tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 5) return;

      const voteNumber = $(cells[0]).text().trim();
      const date = $(cells[2]).text().trim();
      const issue = $(cells[3]).text().trim();
      const question = $(cells[3]).text().trim() + ' ' + $(cells[4]).text().trim();
      const resultText = $(cells[5])?.text()?.trim() || '';

      if (isFundingRelated(question)) {
        const link = $(cells[0]).find('a').attr('href');
        candidates.push({ voteNumber, date, issue, question, result: resultText, link });
      }
    });

    const recent = candidates.slice(-5).reverse();

    for (const candidate of recent) {
      // Try to fetch individual vote page for counts
      if (candidate.link) {
        try {
          const voteUrl = candidate.link.startsWith('http')
            ? candidate.link
            : `https://www.senate.gov${candidate.link}`;
          const voteRes = await axios.get(voteUrl, AXIOS_OPTS);
          const v$ = cheerio.load(voteRes.data);

          // Senate vote pages show totals in various formats
          const pageText = v$('body').text();
          const yeaMatch = pageText.match(/Yeas?\s*[-–:]\s*(\d+)/i);
          const nayMatch = pageText.match(/Nays?\s*[-–:]\s*(\d+)/i);

          const yea = yeaMatch ? parseInt(yeaMatch[1]) : null;
          const nay = nayMatch ? parseInt(nayMatch[1]) : null;

          // Determine if this was a cloture vote (60 needed) or passage (51 needed)
          const isCloture = candidate.question.toLowerCase().includes('cloture');
          const threshold = isCloture ? 60 : 51;
          const thresholdLabel = isCloture ? '60 needed (cloture)' : '51 needed';

          votes.push({
            chamber: 'Senate',
            voteNumber: candidate.voteNumber,
            date: candidate.date,
            bill: candidate.issue,
            question: candidate.question,
            result: candidate.result,
            yea,
            nay,
            present: null,
            notVoting: null,
            threshold,
            thresholdLabel,
            url: voteUrl,
          });
          continue;
        } catch {
          // Fall through to push without counts
        }
      }

      const isCloture = candidate.question.toLowerCase().includes('cloture');
      votes.push({
        chamber: 'Senate',
        voteNumber: candidate.voteNumber,
        date: candidate.date,
        bill: candidate.issue,
        question: candidate.question,
        result: candidate.result,
        yea: null,
        nay: null,
        present: null,
        notVoting: null,
        threshold: isCloture ? 60 : 51,
        thresholdLabel: isCloture ? '60 needed (cloture)' : '51 needed',
        url: null,
      });
    }
  } catch (err) {
    console.error('Senate vote scrape failed:', err.message);
  }

  return votes;
}

// --- Combined scrape ---
async function scrapeVotes() {
  const [houseVotes, senateVotes] = await Promise.all([
    scrapeHouseVotes(),
    scrapeSenateVotes(),
  ]);

  const allVotes = [...houseVotes, ...senateVotes];

  // Sort by date descending (most recent first)
  allVotes.sort((a, b) => {
    const da = a.date ? new Date(a.date) : new Date(0);
    const db = b.date ? new Date(b.date) : new Date(0);
    return db - da;
  });

  return allVotes;
}

module.exports = { scrapeVotes };
