// DOM refs
const answerEl = document.getElementById('answer');
const detailEl = document.getElementById('detail');
const dotEl = document.getElementById('status-dot');
const statusIndicator = document.getElementById('status-indicator');
const statusLabel = document.getElementById('status-label');
const counterSection = document.getElementById('counter-section');
const counterNumber = document.getElementById('counter-number');
const sourcesLineEl = document.getElementById('sources-line');
const lastCheckedEl = document.getElementById('last-checked');
const timelineEl = document.getElementById('timeline');
const shutdownCountEl = document.getElementById('shutdown-count');
const totalDaysEl = document.getElementById('total-days-closed');

// Format date for display
function formatDate(dateStr) {
  if (!dateStr) return 'Present';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Short date (no year)
function formatShortDate(dateStr) {
  if (!dateStr) return 'Present';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Render status data into the DOM
function renderStatus(data) {
  answerEl.classList.remove('loading');

  if (data.isClosed && data.type === 'partial') {
    answerEl.textContent = 'Partially';
    answerEl.className = 'answer partial fade-in';
    dotEl.className = 'status-dot partial';
    statusIndicator.className = 'status-indicator warn';
    statusLabel.textContent = 'PARTIAL SHUTDOWN';
    document.body.className = 'partial-shutdown';

    if (data.daysClosed) {
      counterNumber.textContent = data.daysClosed;
      counterSection.classList.remove('hidden');
    }
  } else if (data.isClosed) {
    answerEl.textContent = 'Yes';
    answerEl.className = 'answer yes fade-in';
    dotEl.className = 'status-dot closed';
    statusIndicator.className = 'status-indicator alert';
    statusLabel.textContent = 'SHUTDOWN';
    document.body.className = 'shutdown';

    if (data.daysClosed) {
      counterNumber.textContent = data.daysClosed;
      counterSection.classList.remove('hidden');
    }
  } else {
    answerEl.textContent = 'No';
    answerEl.className = 'answer no fade-in';
    dotEl.className = 'status-dot open';
    statusIndicator.className = 'status-indicator live';
    statusLabel.textContent = 'OPERATING';
    document.body.className = '';
    counterSection.classList.add('hidden');
  }

  detailEl.textContent = data.message;
  renderSourceFootnotes(data);

  if (data.lastScraped) {
    const d = new Date(data.lastScraped);
    lastCheckedEl.textContent = 'Last checked ' + d.toLocaleString();
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
    sourcesLineEl.textContent = 'Sources: ' + names.map(n => escapeHtml(n)).join(', ');
  }
}

// Render shutdown timeline from server data
function renderTimeline(data) {
  const { shutdowns, count, totalDays, maxDays } = data;

  shutdownCountEl.textContent = count;
  totalDaysEl.textContent = totalDays.toLocaleString();

  const sorted = [...shutdowns].reverse();

  timelineEl.innerHTML = sorted.map((s, i) => {
    const ongoing = s.end === null;
    const isPartial = s.type === 'partial';
    const daysLabel = s.days === 1 ? '1 day' : `${s.days} days`;
    const barWidth = Math.max(2, (s.days / maxDays) * 100);
    const year = s.start.split('-')[0];
    const range = `${formatShortDate(s.start)} – ${ongoing ? 'Present' : formatShortDate(s.end)}`;
    const classes = ['timeline-item', ongoing ? 'ongoing' : '', isPartial ? 'partial' : ''].filter(Boolean).join(' ');
    const typeTag = isPartial ? ' <span class="timeline-type">partial</span>' : '';
    const delay = Math.min(i * 0.04, 1.2);

    return `
      <div class="${classes}" style="animation-delay: ${delay}s">
        <span class="timeline-year">${escapeHtml(year)}</span>
        <div class="timeline-bar-wrap">
          <div class="timeline-bar" style="width: ${barWidth}%"></div>
          <span class="timeline-bar-label">${escapeHtml(range)}</span>
        </div>
        <div class="timeline-meta">
          <span class="timeline-days">${escapeHtml(daysLabel)}${typeTag}</span>
          <div class="timeline-range">${escapeHtml(range)}</div>
        </div>
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

// Show error state
function showError() {
  answerEl.textContent = '?';
  answerEl.className = 'answer loading';
  dotEl.className = 'status-dot';
  statusIndicator.className = 'status-indicator';
  statusLabel.textContent = 'UNAVAILABLE';
  detailEl.textContent = 'Unable to reach the server. Please try again later.';
}

// Fetch status from API
async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    if (!res.ok) throw new Error(res.statusText);
    renderStatus(await res.json());
  } catch (err) {
    showError();
  }
}

// Fetch timeline from API
async function fetchTimeline() {
  try {
    const res = await fetch('/api/shutdowns');
    if (!res.ok) throw new Error(res.statusText);
    renderTimeline(await res.json());
  } catch (err) {
    timelineEl.innerHTML = '<p style="color:var(--text-tertiary);font-size:0.875rem;">Unable to load shutdown history.</p>';
  }
}

// Initialize — fetch both endpoints in parallel
Promise.all([fetchStatus(), fetchTimeline()]);

// Refresh status every 15 minutes
setInterval(fetchStatus, 15 * 60 * 1000);
