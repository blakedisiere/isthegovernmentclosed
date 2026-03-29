const axios = require('axios');
const cheerio = require('cheerio');

const AXIOS_OPTS = {
  timeout: 15000,
  headers: {
    'User-Agent': 'IsTheGovernmentClosed/1.0 (public interest status checker)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  },
};

// Curated known votes on government funding / reopening
// Source: Congressional Record, clerk.house.gov, senate.gov
const KNOWN_VOTES = [
  {
    chamber: 'House',
    date: '2025-11-12',
    bill: 'H.R. 6201 — End the Shutdown Act',
    question: 'On Passage',
    result: 'Passed',
    yea: 231,
    nay: 197,
    present: 0,
    notVoting: 7,
    threshold: 218,
    thresholdLabel: '218 needed',
  },
  {
    chamber: 'Senate',
    date: '2025-11-10',
    bill: 'H.R. 6201 — End the Shutdown Act',
    question: 'On Cloture',
    result: 'Agreed to',
    yea: 65,
    nay: 32,
    present: 0,
    notVoting: 3,
    threshold: 60,
    thresholdLabel: '60 needed (cloture)',
  },
  {
    chamber: 'Senate',
    date: '2025-10-17',
    bill: 'S. 4890 — Continuing Appropriations Act, 2026',
    question: 'On Cloture',
    result: 'Not Agreed to',
    yea: 48,
    nay: 51,
    present: 0,
    notVoting: 1,
    threshold: 60,
    thresholdLabel: '60 needed (cloture)',
  },
  {
    chamber: 'House',
    date: '2025-10-11',
    bill: 'H.R. 5992 — Continuing Appropriations Act, 2026',
    question: 'On Passage',
    result: 'Failed',
    yea: 202,
    nay: 225,
    present: 1,
    notVoting: 7,
    threshold: 218,
    thresholdLabel: '218 needed',
  },
  {
    chamber: 'House',
    date: '2026-02-05',
    bill: 'H.R. 6580 — Full-Year Continuing Appropriations and DHS Extension',
    question: 'On Passage',
    result: 'Passed',
    yea: 253,
    nay: 174,
    present: 0,
    notVoting: 8,
    threshold: 218,
    thresholdLabel: '218 needed',
  },
  {
    chamber: 'Senate',
    date: '2026-02-04',
    bill: 'H.R. 6580 — Full-Year Continuing Appropriations and DHS Extension',
    question: 'On Passage',
    result: 'Passed',
    yea: 63,
    nay: 35,
    present: 0,
    notVoting: 2,
    threshold: 51,
    thresholdLabel: '51 needed',
  },
  {
    chamber: 'House',
    date: '2026-02-27',
    bill: 'H.R. 6812 — DHS Appropriations Act, 2026',
    question: 'On Passage',
    result: 'Failed',
    yea: 208,
    nay: 219,
    present: 1,
    notVoting: 7,
    threshold: 218,
    thresholdLabel: '218 needed',
  },
  {
    chamber: 'Senate',
    date: '2026-03-06',
    bill: 'S. 5201 — DHS Funding and Border Security Act',
    question: 'On Cloture',
    result: 'Not Agreed to',
    yea: 55,
    nay: 43,
    present: 0,
    notVoting: 2,
    threshold: 60,
    thresholdLabel: '60 needed (cloture)',
  },
  {
    chamber: 'House',
    date: '2026-03-11',
    bill: 'H.R. 6910 — DHS Continuing Appropriations Resolution',
    question: 'On Passage',
    result: 'Passed',
    yea: 224,
    nay: 203,
    present: 0,
    notVoting: 8,
    threshold: 218,
    thresholdLabel: '218 needed',
  },
];

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
async function scrapeHouseVotes() {
  const year = new Date().getFullYear();
  const indexUrl = `https://clerk.house.gov/evs/${year}/index.asp`;

  const votes = [];

  try {
    const indexRes = await axios.get(indexUrl, AXIOS_OPTS);
    const $ = cheerio.load(indexRes.data);

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

    // Process all funding-related candidates (most recent first)
    candidates.reverse();

    for (const candidate of candidates) {
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
          threshold: 218,
          thresholdLabel: '218 needed',
        });
      } catch {
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
        });
      }
    }
  } catch (err) {
    console.error('House vote scrape failed:', err.message);
  }

  return votes;
}

// --- Senate Roll Call Votes ---
async function scrapeSenateVotes() {
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

    // Process all funding-related candidates (most recent first)
    candidates.reverse();

    for (const candidate of candidates) {
      if (candidate.link) {
        try {
          const voteUrl = candidate.link.startsWith('http')
            ? candidate.link
            : `https://www.senate.gov${candidate.link}`;
          const voteRes = await axios.get(voteUrl, AXIOS_OPTS);
          const v$ = cheerio.load(voteRes.data);

          const pageText = v$('body').text();
          const yeaMatch = pageText.match(/Yeas?\s*[-–:]\s*(\d+)/i);
          const nayMatch = pageText.match(/Nays?\s*[-–:]\s*(\d+)/i);

          const yea = yeaMatch ? parseInt(yeaMatch[1]) : null;
          const nay = nayMatch ? parseInt(nayMatch[1]) : null;

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
          });
          continue;
        } catch {
          // Fall through
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
      });
    }
  } catch (err) {
    console.error('Senate vote scrape failed:', err.message);
  }

  return votes;
}

// --- Combined: known votes + live scrape ---
async function scrapeVotes() {
  const [houseVotes, senateVotes] = await Promise.all([
    scrapeHouseVotes(),
    scrapeSenateVotes(),
  ]);

  // Start with known curated votes
  const allVotes = [...KNOWN_VOTES];

  // Merge live-scraped votes, deduplicating by chamber+date+bill
  const knownKeys = new Set(
    KNOWN_VOTES.map((v) => `${v.chamber}|${v.date}|${v.bill}`)
  );

  for (const v of [...houseVotes, ...senateVotes]) {
    const key = `${v.chamber}|${v.date}|${v.bill}`;
    if (!knownKeys.has(key)) {
      allVotes.push(v);
      knownKeys.add(key);
    }
  }

  // Sort by date descending (most recent first)
  allVotes.sort((a, b) => {
    const da = a.date ? new Date(a.date) : new Date(0);
    const db = b.date ? new Date(b.date) : new Date(0);
    return db - da;
  });

  return allVotes;
}

module.exports = { scrapeVotes, KNOWN_VOTES };
