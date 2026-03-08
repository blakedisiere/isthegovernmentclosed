// Screen reader announcement utility
function announceToScreenReader(message) {
  const el = document.getElementById('sr-announcer') || createAnnouncer();
  el.textContent = '';
  // Brief delay so screen readers register the change
  setTimeout(() => { el.textContent = message; }, 100);
}

function createAnnouncer() {
  const el = document.createElement('div');
  el.id = 'sr-announcer';
  el.setAttribute('aria-live', 'assertive');
  el.setAttribute('aria-atomic', 'true');
  el.className = 'sr-only';
  document.body.appendChild(el);
  return el;
}

// DOM refs
const themeColorEl = document.getElementById('theme-color');
const faviconEl = document.getElementById('favicon');
const retryBtn = document.getElementById('retry-btn');
const answerEl = document.getElementById('answer');
const detailEl = document.getElementById('detail');
const dotEl = document.getElementById('status-dot');
const statusIndicator = document.getElementById('status-indicator');
const statusLabel = document.getElementById('status-label');
const counterSection = document.getElementById('counter-section');
const counterNumber = document.getElementById('counter-number');
const shareBtn = document.getElementById('share-btn');
const shareLabelEl = document.getElementById('share-label');
const sourcesLineEl = document.getElementById('sources-line');
const lastCheckedEl = document.getElementById('last-checked');
const statsSection = document.getElementById('stats-section');
const statsChart = document.getElementById('stats-chart');
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

// Animate counter from 0 to target value
function animateCounter(target) {
  counterNumber.textContent = '0';
  // Delay start so the section's reveal-up animation (0.8s delay + 0.6s duration) is visible
  setTimeout(() => {
    const duration = 2200;
    const start = performance.now();
    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Slow start, fast middle, slow finish (ease-in-out quartic)
      const eased = progress < 0.5
        ? 8 * Math.pow(progress, 4)
        : 1 - 8 * Math.pow(1 - progress, 4);
      counterNumber.textContent = Math.round(eased * target);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, 900);
}

// Update favicon to reflect current status
function updateFavicon(color) {
  faviconEl.href = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='40' fill='${encodeURIComponent(color)}'/></svg>`;
}

// Remove shimmer loading state
function clearShimmer() {
  answerEl.classList.remove('shimmer');
  detailEl.classList.remove('shimmer');
}

// Track current status for sharing
let currentShareText = '';

// Render status data into the DOM
function renderStatus(data) {
  clearShimmer();
  answerEl.classList.remove('loading');
  retryBtn.classList.add('hidden');

  if (data.isClosed && data.type === 'partial') {
    answerEl.textContent = 'Partially';
    answerEl.className = 'answer partial fade-in';
    dotEl.className = 'status-dot partial';
    statusIndicator.className = 'status-indicator warn';
    statusLabel.textContent = 'PARTIAL SHUTDOWN';
    document.body.className = 'partial-shutdown';
    themeColorEl.setAttribute('content', '#0c0b06');
    updateFavicon('#fbbf24');

    if (data.daysClosed) {
      counterSection.setAttribute('aria-label', 'Government partially closed for ' + data.daysClosed + ' days');
      counterSection.classList.remove('hidden');
      animateCounter(data.daysClosed);
    }
    announceToScreenReader('The government is partially closed.');
  } else if (data.isClosed) {
    answerEl.textContent = 'Yes';
    answerEl.className = 'answer yes fade-in';
    dotEl.className = 'status-dot closed';
    statusIndicator.className = 'status-indicator alert';
    statusLabel.textContent = 'SHUTDOWN';
    document.body.className = 'shutdown';
    themeColorEl.setAttribute('content', '#0c0606');
    updateFavicon('#ef4444');

    if (data.daysClosed) {
      counterSection.setAttribute('aria-label', 'Government closed for ' + data.daysClosed + ' days');
      counterSection.classList.remove('hidden');
      animateCounter(data.daysClosed);
    }
    announceToScreenReader('Yes, the government is closed.');
  } else {
    answerEl.textContent = 'No';
    answerEl.className = 'answer no fade-in';
    dotEl.className = 'status-dot open';
    statusIndicator.className = 'status-indicator live';
    statusLabel.textContent = 'OPERATING';
    document.body.className = '';
    themeColorEl.setAttribute('content', '#07080c');
    updateFavicon('#4ade80');
    counterSection.classList.add('hidden');
    announceToScreenReader('No, the government is open.');
  }

  detailEl.textContent = data.message;

  // Set share text and show share button
  const statusWord = data.isClosed
    ? (data.type === 'partial' ? 'partially closed' : 'closed')
    : 'open';
  currentShareText = `The US government is currently ${statusWord}. isthegovernmentclosed.com`;
  shareBtn.classList.remove('hidden');

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
    sourcesLineEl.textContent = 'Sources: ' + names.map(n => escapeHtml(n)).join(', ') + ' \u00b7 Auto-refreshes every 15 min';
  }
}

// US Presidents relevant to shutdown history
const PRESIDENTS = [
  { name: 'Ford', end: '1977-01-20' },
  { name: 'Carter', end: '1981-01-20' },
  { name: 'Reagan', end: '1989-01-20' },
  { name: 'G.H.W. Bush', end: '1993-01-20' },
  { name: 'Clinton', end: '2001-01-20' },
  { name: 'G.W. Bush', end: '2009-01-20' },
  { name: 'Obama', end: '2017-01-20' },
  { name: 'Trump', end: '2021-01-20' },
  { name: 'Biden', end: '2025-01-20' },
  { name: 'Trump', end: '2029-01-20' },
];

function getPresident(dateStr) {
  for (const p of PRESIDENTS) {
    if (dateStr < p.end) return p.name;
  }
  return PRESIDENTS[PRESIDENTS.length - 1].name;
}

// Render stats bar chart grouped by president
function renderStats(data) {
  const { shutdowns } = data;
  const byPres = {};
  shutdowns.forEach(s => {
    const pres = getPresident(s.start);
    byPres[pres] = (byPres[pres] || 0) + s.days;
  });

  const entries = Object.entries(byPres);
  const maxDays = Math.max(...entries.map(e => e[1]));

  let html = '';
  entries.forEach(([pres, days]) => {
    const pct = Math.max(2, (days / maxDays) * 100);
    html += `
      <div class="stats-row">
        <span class="stats-label">${escapeHtml(pres)}</span>
        <div class="stats-bar-wrap">
          <div class="stats-bar" style="width: ${pct}%"></div>
        </div>
        <span class="stats-value">${days}d</span>
      </div>
    `;
  });

  statsChart.innerHTML = html;
  statsSection.classList.remove('hidden');
}

// Render shutdown timeline from server data
function renderTimeline(data) {
  const { shutdowns, count, totalDays, maxDays } = data;

  shutdownCountEl.textContent = count;
  totalDaysEl.textContent = totalDays.toLocaleString();

  const sorted = [...shutdowns].reverse();
  let html = '';
  let lastPresident = null;
  let cardIndex = 0;

  sorted.forEach((s) => {
    const president = getPresident(s.start);

    // Insert president marker when president changes
    if (president !== lastPresident) {
      html += `
        <div class="timeline-president">
          <span class="timeline-president-label">${escapeHtml(president)}</span>
        </div>
      `;
      lastPresident = president;
    }

    const ongoing = s.end === null;
    const isPartial = s.type === 'partial';
    const daysLabel = s.days === 1 ? '1 day' : `${s.days} days`;
    const barWidth = Math.max(2, (s.days / maxDays) * 100);
    const year = s.start.split('-')[0];
    const range = `${formatShortDate(s.start)} – ${ongoing ? 'Present' : formatShortDate(s.end)}`;
    const side = cardIndex % 2 === 0 ? 'left' : 'right';
    const entryClasses = ['timeline-entry', side, ongoing ? 'ongoing' : '', isPartial ? 'partial' : ''].filter(Boolean).join(' ');
    const typeTag = isPartial ? ' <span class="timeline-type">partial</span>' : '';
    const desc = s.description ? `<div class="timeline-description"><p>${escapeHtml(s.description)}</p></div>` : '';

    html += `
      <div class="${entryClasses}">
        <div class="timeline-dot"></div>
        <div class="timeline-connector"></div>
        <div class="timeline-card" tabindex="0" role="button" aria-expanded="false" onclick="toggleCard(this)" onkeydown="handleCardKeydown(event, this)">
          <div class="timeline-card-header">
            <span class="timeline-year">${escapeHtml(year)}</span>
            <span class="timeline-days">${escapeHtml(daysLabel)}${typeTag}</span>
          </div>
          <div class="timeline-bar-wrap">
            <div class="timeline-bar" style="width: ${barWidth}%"></div>
          </div>
          <div class="timeline-card-footer">
            <span class="timeline-range">${escapeHtml(range)}</span>
            <span class="timeline-chevron">&#9654;</span>
          </div>
          ${desc}
        </div>
      </div>
    `;
    cardIndex++;
  });

  timelineEl.innerHTML = html;

  // Scroll-reveal with IntersectionObserver
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  timelineEl.querySelectorAll('.timeline-entry, .timeline-president').forEach((el) => {
    observer.observe(el);
  });
}

// Escape HTML to prevent XSS
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Toggle timeline card expansion
function toggleCard(card) {
  const isExpanded = card.classList.toggle('expanded');
  card.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
}

// Handle keyboard interaction on timeline cards
function handleCardKeydown(event, card) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    toggleCard(card);
  }
}

// Show error state
function showError() {
  clearShimmer();
  answerEl.textContent = '?';
  answerEl.className = 'answer loading';
  dotEl.className = 'status-dot';
  statusIndicator.className = 'status-indicator';
  statusLabel.textContent = 'UNAVAILABLE';
  detailEl.textContent = 'Unable to reach the server.';
  retryBtn.classList.remove('hidden');
  announceToScreenReader('Error: Unable to reach the server.');
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
    const timelineData = await res.json();
    renderStats(timelineData);
    renderTimeline(timelineData);
  } catch (err) {
    timelineEl.innerHTML = '<p style="color:var(--text-tertiary);font-size:0.875rem;">Unable to load shutdown history.</p>';
  }
}

// Retry button (debounced — disabled during fetch)
retryBtn.addEventListener('click', () => {
  retryBtn.disabled = true;
  retryBtn.textContent = 'Checking…';
  answerEl.textContent = '...';
  answerEl.className = 'answer loading shimmer';
  detailEl.textContent = '';
  detailEl.classList.add('shimmer');
  fetchStatus().finally(() => {
    retryBtn.disabled = false;
    retryBtn.textContent = 'Retry';
  });
});

// Share button
shareBtn.addEventListener('click', async () => {
  if (navigator.share) {
    try {
      await navigator.share({ text: currentShareText });
    } catch (e) {
      // User cancelled share — ignore
    }
  } else if (navigator.clipboard) {
    await navigator.clipboard.writeText(currentShareText);
    shareLabelEl.textContent = 'Copied!';
    setTimeout(() => { shareLabelEl.textContent = 'Share'; }, 2000);
  }
});

// Initialize — fetch both endpoints in parallel
Promise.all([fetchStatus(), fetchTimeline()]);

// Refresh status every 15 minutes
setInterval(fetchStatus, 15 * 60 * 1000);
