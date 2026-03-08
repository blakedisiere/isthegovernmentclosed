// Historical shutdowns for timeline (matches src/shutdowns.js)
const SHUTDOWNS = [
  { start: '1976-09-30', end: '1976-10-11' },
  { start: '1977-09-30', end: '1977-10-13' },
  { start: '1977-10-31', end: '1977-11-09' },
  { start: '1977-11-30', end: '1977-12-09' },
  { start: '1978-09-30', end: '1978-10-18' },
  { start: '1979-09-30', end: '1979-10-12' },
  { start: '1981-11-20', end: '1981-11-23' },
  { start: '1982-09-30', end: '1982-10-02' },
  { start: '1982-12-17', end: '1982-12-21' },
  { start: '1983-11-10', end: '1983-11-14' },
  { start: '1984-09-30', end: '1984-10-03' },
  { start: '1984-10-03', end: '1984-10-05' },
  { start: '1986-10-16', end: '1986-10-18' },
  { start: '1987-12-18', end: '1987-12-20' },
  { start: '1990-10-05', end: '1990-10-09' },
  { start: '1995-11-13', end: '1995-11-19' },
  { start: '1995-12-16', end: '1996-01-06' },
  { start: '2013-10-01', end: '2013-10-17' },
  { start: '2018-01-20', end: '2018-01-22' },
  { start: '2018-02-09', end: '2018-02-09' },
  { start: '2018-12-22', end: '2019-01-25' },
  { start: '2025-10-01', end: '2025-11-12' },
  { start: '2026-02-14', end: null, type: 'partial' },
];

// DOM refs
const answerEl = document.getElementById('answer');
const detailEl = document.getElementById('detail');
const dotEl = document.getElementById('status-dot');
const counterSection = document.getElementById('counter-section');
const counterNumber = document.getElementById('counter-number');
const sourcesLineEl = document.getElementById('sources-line');
const lastCheckedEl = document.getElementById('last-checked');
const timelineEl = document.getElementById('timeline');

// Format date for display
function formatDate(dateStr) {
  if (!dateStr) return 'Present';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Calculate days between two date strings (or today if end is null)
function daysBetween(startStr, endStr) {
  const start = new Date(startStr + 'T00:00:00');
  const end = endStr ? new Date(endStr + 'T00:00:00') : new Date();
  return Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
}

// Compute shutdown status from local data
function getLocalStatus() {
  const today = new Date().toISOString().split('T')[0];

  const ongoing = SHUTDOWNS.find(
    (s) => s.end === null || (s.start <= today && s.end >= today)
  );

  if (ongoing) {
    const type = ongoing.type || 'full';
    const partial = type === 'partial';
    const closedWord = partial ? 'partially closed' : 'closed';
    return {
      isClosed: true,
      type,
      since: ongoing.start,
      message: `The government has been ${closedWord} since ${formatDate(ongoing.start)}.`,
    };
  }

  const past = SHUTDOWNS.filter((s) => s.end && s.end < today).sort(
    (a, b) => b.end.localeCompare(a.end)
  );
  const last = past[0] || null;

  return {
    isClosed: false,
    type: null,
    message: last
      ? `The last government closure was ${formatDate(last.start)} – ${formatDate(last.end)}.`
      : 'No recorded government closures.',
  };
}

// Render status data into the DOM
function renderStatus(data) {
  answerEl.classList.remove('loading');

  if (data.isClosed && data.type === 'partial') {
    answerEl.textContent = 'Partially';
    answerEl.className = 'answer partial fade-in';
    dotEl.className = 'status-dot partial';
    document.body.className = 'partial-shutdown';

    if (data.since) {
      const days = daysBetween(data.since, null);
      counterNumber.textContent = days;
      counterSection.classList.remove('hidden');
    }
  } else if (data.isClosed) {
    answerEl.textContent = 'Yes';
    answerEl.className = 'answer yes fade-in';
    dotEl.className = 'status-dot closed';
    document.body.className = 'shutdown';

    if (data.since) {
      const days = daysBetween(data.since, null);
      counterNumber.textContent = days;
      counterSection.classList.remove('hidden');
    }
  } else {
    answerEl.textContent = 'No';
    answerEl.className = 'answer no fade-in';
    dotEl.className = 'status-dot open';
    document.body.className = '';
    counterSection.classList.add('hidden');
  }

  detailEl.textContent = data.message;

  // Render source footnotes
  renderSourceFootnotes(data);

  // Update last checked
  if (data.lastScraped) {
    const d = new Date(data.lastScraped);
    lastCheckedEl.textContent = 'Last checked: ' + d.toLocaleString();
  }
}

// Fetch status from API, fall back to local computation
async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    renderStatus(data);
  } catch (err) {
    // API unavailable (e.g. static hosting) — use client-side data
    renderStatus(getLocalStatus());
  }
}

// Render sources as a footnote line
function renderSourceFootnotes(data) {
  if (!data.liveCheck) return;

  const names = [];
  if (data.liveCheck.sources) {
    data.liveCheck.sources.forEach(s => names.push(s.name));
  }
  if (data.liveCheck.errors) {
    data.liveCheck.errors.forEach(s => names.push(s.name));
  }

  if (names.length > 0) {
    sourcesLineEl.textContent = 'Sources checked: ' + names.map(n => escapeHtml(n)).join(', ');
  }
}

// Render shutdown timeline (newest first)
function renderTimeline() {
  const sorted = [...SHUTDOWNS].reverse();

  timelineEl.innerHTML = sorted.map(s => {
    const ongoing = s.end === null;
    const isPartial = s.type === 'partial';
    const days = daysBetween(s.start, s.end);
    const daysLabel = days === 1 ? '1 day' : `${days} days`;
    const range = `${formatDate(s.start)} – ${ongoing ? 'Present' : formatDate(s.end)}`;
    const classes = ['timeline-item', ongoing ? 'ongoing' : '', isPartial ? 'partial' : ''].filter(Boolean).join(' ');
    const typeLabel = isPartial ? ' <span class="timeline-type">partial</span>' : '';

    return `
      <div class="${classes}">
        <div class="timeline-bar"></div>
        <div class="timeline-dates">
          <div class="timeline-range">${range}${typeLabel}</div>
          <div class="timeline-duration">${daysLabel}</div>
        </div>
        <span class="timeline-days">${daysLabel}</span>
      </div>
    `;
  }).join('');
}

// Escape HTML to prevent XSS
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Initialize
renderTimeline();
fetchStatus();

// Refresh every 15 minutes
setInterval(fetchStatus, 15 * 60 * 1000);
