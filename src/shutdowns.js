// Historical US federal government shutdowns
// Source: Congressional Research Service reports
// Each entry: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' | null, type?: 'partial' | 'full' }
// end = null means the shutdown is currently ongoing
// type defaults to 'full' when omitted

const SHUTDOWNS = [
  { start: '1976-09-30', end: '1976-10-11', description: 'President Ford vetoed a spending bill for the Departments of Labor and Health, Education, and Welfare, citing excessive spending. Congress failed to override the veto before the fiscal year ended.' },
  { start: '1977-09-30', end: '1977-10-13', description: 'Disagreement between the House and Senate over whether Medicaid funds could pay for abortions. This was the first of three shutdowns in 1977 driven by abortion funding disputes.' },
  { start: '1977-10-31', end: '1977-11-09', description: 'The second 1977 shutdown, again over abortion funding restrictions in Medicaid. The House wanted strict limits while the Senate favored broader exceptions.' },
  { start: '1977-11-30', end: '1977-12-09', description: 'The third and final 1977 shutdown. Congress and President Carter ultimately compromised on abortion funding language, allowing Medicaid coverage only for life endangerment, rape, or incest.' },
  { start: '1978-09-30', end: '1978-10-18', description: 'President Carter vetoed a defense spending bill that included funding for a nuclear aircraft carrier he opposed. Congress also fought over public works spending levels.' },
  { start: '1979-09-30', end: '1979-10-12', description: 'Disagreements over pay raises for Congress and senior civil servants, along with disputes about abortion funding, delayed passage of spending bills.' },
  { start: '1981-11-20', end: '1981-11-23', description: 'President Reagan vetoed a continuing resolution, demanding deeper spending cuts. Reagan wanted $8.4 billion in cuts but Congress offered only $2 billion. About 400,000 federal workers were furloughed.' },
  { start: '1982-09-30', end: '1982-10-02', description: 'Congress failed to pass spending bills on time due to disputes over the MX missile program, a jobs program, and increased spending levels opposed by the Reagan administration.' },
  { start: '1982-12-17', end: '1982-12-21', description: 'Disagreements between the House and Senate over funding for legal services and the Legal Services Corporation, plus disputes over the MX missile program.' },
  { start: '1983-11-10', end: '1983-11-14', description: 'The House sought increased education spending and a public jobs program, while the Senate and Reagan pushed for MX missile funding and foreign aid. Neither side agreed before funding lapsed.' },
  { start: '1984-09-30', end: '1984-10-03', description: 'A spending package got bogged down with various add-ons including a crime-fighting package and water projects. Congress could not agree before the deadline.' },
  { start: '1984-10-03', end: '1984-10-05', description: 'A very brief gap immediately following the previous shutdown. Congress passed a short-term measure but it expired before a longer-term bill was ready.' },
  { start: '1986-10-16', end: '1986-10-18', description: 'Disputes over a variety of spending provisions and policy riders attached to the continuing resolution. Resolved quickly with a clean short-term extension.' },
  { start: '1987-12-18', end: '1987-12-20', description: 'Disagreements over Contra aid funding and the Fairness Doctrine. Democrats wanted to reinstate the FCC\'s Fairness Doctrine while Reagan opposed it.' },
  { start: '1990-10-05', end: '1990-10-09', description: 'President George H.W. Bush vetoed a continuing resolution to force Congress into a deficit-reduction deal. This ultimately led to the Budget Enforcement Act of 1990, which included new taxes despite Bush\'s "read my lips" pledge.' },
  { start: '1995-11-13', end: '1995-11-19', description: 'Speaker Newt Gingrich and House Republicans clashed with President Clinton over balancing the budget. Gingrich demanded Clinton use CBO rather than OMB budget projections. About 800,000 federal workers were furloughed.' },
  { start: '1995-12-16', end: '1996-01-06', description: 'The second and longer 1995-96 shutdown. Clinton and Gingrich remained deadlocked over the seven-year balanced budget plan. At 21 days, it was the longest shutdown in US history at that time. About 284,000 workers were furloughed.' },
  { start: '2013-10-01', end: '2013-10-17', description: 'Congressional Republicans sought to defund or delay the Affordable Care Act (Obamacare) as a condition of funding the government. President Obama and Senate Democrats refused. About 800,000 federal workers were furloughed.' },
  { start: '2018-01-20', end: '2018-01-22', description: 'Senate Democrats blocked a spending bill to pressure Republicans into addressing DACA (Deferred Action for Childhood Arrivals) immigration protections. It ended after a 3-day weekend shutdown with a promise to hold immigration votes.' },
  { start: '2018-02-09', end: '2018-02-09', description: 'A brief technical lapse after Senator Rand Paul delayed a vote on a bipartisan budget deal, objecting to increased spending levels. Funding was restored within hours.' },
  { start: '2018-12-22', end: '2019-01-25', description: 'President Trump demanded $5.7 billion for a US-Mexico border wall. Democrats refused. At 34 days, it became the longest shutdown in US history. About 800,000 federal workers went without pay. It ended with a temporary deal but no wall funding.' },
  { start: '2025-10-01', end: '2025-11-12', description: 'Congress failed to pass appropriations bills or a continuing resolution before the fiscal year deadline amid deep partisan divisions over spending levels and policy riders. The 43-day closure surpassed the 2018-19 record as the longest in US history.' },
  { start: '2026-02-14', end: null, type: 'partial', detail: 'DHS funding lapse', description: 'Funding for the Department of Homeland Security lapsed after Congress could not agree on DHS appropriations. The partial shutdown affects DHS operations while other federal agencies remain funded under previously passed spending bills.' },
];

function getShutdownStatus() {
  const today = new Date().toISOString().split('T')[0];

  // Check for ongoing shutdown (end is null or end >= today)
  const ongoing = SHUTDOWNS.find(
    (s) => s.end === null || (s.start <= today && s.end >= today)
  );

  if (ongoing) {
    const type = ongoing.type || 'full';
    const partial = type === 'partial';
    const closedWord = partial ? 'partially closed' : 'closed';
    const detail = ongoing.detail || null;
    const detailSuffix = detail ? ` (${detail})` : '';

    return {
      isClosed: true,
      type,
      since: ongoing.start,
      detail,
      message: `The government has been ${closedWord} since ${formatDate(ongoing.start)}.${detailSuffix}`,
    };
  }

  // Find most recent past shutdown
  const past = SHUTDOWNS.filter((s) => s.end && s.end < today).sort(
    (a, b) => b.end.localeCompare(a.end)
  );

  const lastShutdown = past[0] || null;

  return {
    isClosed: false,
    type: null,
    lastClosure: lastShutdown
      ? { start: lastShutdown.start, end: lastShutdown.end, type: lastShutdown.type || 'full' }
      : null,
    message: lastShutdown
      ? `The last government closure was ${formatDate(lastShutdown.start)} – ${formatDate(lastShutdown.end)}.`
      : 'No recorded government closures.',
  };
}

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// Add a shutdown dynamically (e.g., from scraping)
function addShutdown(start, end = null, type = 'full') {
  const exists = SHUTDOWNS.find((s) => s.start === start);
  if (!exists) {
    SHUTDOWNS.push({ start, end, type });
    SHUTDOWNS.sort((a, b) => a.start.localeCompare(b.start));
  } else if (end && !exists.end) {
    exists.end = end;
  }
}

module.exports = { getShutdownStatus, addShutdown, SHUTDOWNS };
