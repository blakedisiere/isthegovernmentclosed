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
const impactSection = document.getElementById('impact-section');
const impactToggle = document.getElementById('impact-toggle');
const impactContent = document.getElementById('impact-content');
const impactFurloughed = document.getElementById('impact-furloughed');
const impactCost = document.getElementById('impact-cost');
const impactAgencies = document.getElementById('impact-agencies');
const impactServices = document.getElementById('impact-services');
const impactServicesList = document.getElementById('impact-services-list');
const newsSection = document.getElementById('news-section');
const newsFeed = document.getElementById('news-feed');
const votesSection = document.getElementById('votes-section');
const votesFeed = document.getElementById('votes-feed');

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

// Generate congress.gov URL from a bill string like "H.R. 6201 — End the Shutdown Act"
function getCongressUrl(bill, date) {
  if (!bill) return null;
  // Match bill prefixes: H.R., S., H.J.Res., S.J.Res., H.Con.Res., S.Con.Res.
  const match = bill.match(/^(H\.J\.Res\.|S\.J\.Res\.|H\.Con\.Res\.|S\.Con\.Res\.|H\.Res\.|S\.Res\.|H\.R\.|S\.)\s*(\d+)/i);
  if (!match) return null;
  const prefix = match[1].replace(/\s+/g, '').toUpperCase();
  const number = match[2];
  const year = date ? parseInt(date.split('-')[0]) : new Date().getFullYear();
  const congress = Math.floor((year - 1) / 2) - 893;
  const ordinal = getOrdinalSuffix(congress);

  const typeMap = {
    'H.R.': 'house-bill',
    'S.': 'senate-bill',
    'H.J.RES.': 'house-joint-resolution',
    'S.J.RES.': 'senate-joint-resolution',
    'H.CON.RES.': 'house-concurrent-resolution',
    'S.CON.RES.': 'senate-concurrent-resolution',
    'H.RES.': 'house-resolution',
    'S.RES.': 'senate-resolution',
  };
  const type = typeMap[prefix] || 'house-bill';
  return `https://www.congress.gov/bill/${congress}${ordinal}-congress/${type}/${number}`;
}

function getOrdinalSuffix(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
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

// Cached data for coordinating votes with shutdowns
let cachedStatus = null;
let cachedShutdowns = null;
let cachedVotes = null;

// Match votes to shutdowns by date range (with buffer for pre-shutdown and reopening votes)
function groupVotesByShutdown(votes, shutdowns) {
  const groups = {}; // keyed by shutdown start date
  const unmatched = [];

  // Helper: shift a YYYY-MM-DD date by N days
  function shiftDate(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  for (const v of votes) {
    if (!v.date) { unmatched.push(v); continue; }
    let matched = false;
    for (const s of shutdowns) {
      // Include votes up to 7 days before shutdown and 3 days after it ended
      const windowStart = shiftDate(s.start, -7);
      const windowEnd = s.end === null ? null : shiftDate(s.end, 3);
      if (v.date >= windowStart && (windowEnd === null || v.date <= windowEnd)) {
        if (!groups[s.start]) groups[s.start] = [];
        groups[s.start].push(v);
        matched = true;
        break;
      }
    }
    if (!matched) unmatched.push(v);
  }
  return { groups, unmatched };
}

// Render compact vote cards for embedding inside timeline cards
function renderCompactVotes(votes) {
  const items = votes.map(v => {
    const resultLower = v.result ? v.result.toLowerCase() : '';
    const failed = resultLower.includes('failed') ||
                   resultLower.includes('rejected') ||
                   resultLower.includes('not agreed');
    const passed = !failed && (resultLower.includes('passed') ||
                   resultLower.includes('agreed'));
    const resultClass = passed ? 'vote-passed' : failed ? 'vote-failed' : '';
    const resultIcon = passed ? '&#10003;' : failed ? '&#10007;' : '&#8211;';
    const chamberClass = v.chamber.toLowerCase();

    const url = getCongressUrl(v.bill, v.date);
    const billText = escapeHtml(v.bill || 'Funding Vote');
    const billHtml = url
      ? `<a class="compact-vote-bill" href="${url}" target="_blank" rel="noopener noreferrer">${billText}</a>`
      : `<span class="compact-vote-bill">${billText}</span>`;

    return `
      <div class="compact-vote ${resultClass}">
        <span class="compact-vote-chamber compact-vote-chamber-${chamberClass}">${escapeHtml(v.chamber)}</span>
        ${billHtml}
        <span class="compact-vote-result ${resultClass}">${resultIcon} ${escapeHtml(v.result || '')}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="compact-votes-section">
      <div class="compact-votes-label">Reopening Votes</div>
      ${items}
    </div>
  `;
}

// Embed votes into timeline cards for historical shutdowns
function embedVotesInTimeline(voteGroups, excludeShutdownStart) {
  const entries = timelineEl.querySelectorAll('.timeline-entry');
  const sorted = [...cachedShutdowns].reverse(); // same order as renderTimeline

  entries.forEach((entry, i) => {
    const shutdown = sorted[i];
    if (!shutdown) return;
    if (shutdown.start === excludeShutdownStart) return;

    const votes = voteGroups[shutdown.start];
    if (!votes || votes.length === 0) return;

    const card = entry.querySelector('.timeline-card');
    const descDiv = card.querySelector('.timeline-description');
    const votesHtml = renderCompactVotes(votes);

    if (descDiv) {
      // Remove any previously embedded votes before re-adding
      const existing = descDiv.querySelector('.compact-votes-section');
      if (existing) existing.remove();
      descDiv.insertAdjacentHTML('beforeend', votesHtml);
    } else {
      const newDesc = document.createElement('div');
      newDesc.className = 'timeline-description';
      newDesc.innerHTML = votesHtml;
      card.appendChild(newDesc);
    }
  });
}

// Coordinate vote rendering once all data is available
function coordinateVotesRendering() {
  if (!cachedVotes || !cachedShutdowns || !cachedStatus) return;

  const { groups } = groupVotesByShutdown(cachedVotes, cachedShutdowns);

  if (cachedStatus.isClosed && cachedStatus.since) {
    // Active shutdown: standalone section shows only current shutdown's votes
    const currentVotes = groups[cachedStatus.since] || [];
    renderVotes(currentVotes);
    // Embed historical votes in timeline cards (skip current shutdown)
    embedVotesInTimeline(groups, cachedStatus.since);
  } else {
    // No active shutdown: hide standalone, embed all in timeline
    votesSection.classList.add('hidden');
    embedVotesInTimeline(groups, null);
  }
}

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

  renderImpact(data);
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
  let groupOpen = false;

  sorted.forEach((s) => {
    const president = getPresident(s.start);

    // Insert president marker when president changes
    if (president !== lastPresident) {
      if (groupOpen) html += '</div>'; // close previous group
      html += `
        <div class="timeline-group">
          <div class="timeline-president">
            <span class="timeline-president-label">${escapeHtml(president)}</span>
          </div>
      `;
      groupOpen = true;
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
    const reopeningHtml = s.reopeningBill ? (() => {
      const url = getCongressUrl(s.reopeningBill, s.end || s.start);
      const text = escapeHtml(s.reopeningBill);
      const link = url
        ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`
        : text;
      return `<p class="timeline-reopening-bill">Reopened by: ${link}</p>`;
    })() : '';
    const desc = s.description ? `<div class="timeline-description"><p>${escapeHtml(s.description)}</p>${reopeningHtml}</div>` : (reopeningHtml ? `<div class="timeline-description">${reopeningHtml}</div>` : '');

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

  if (groupOpen) html += '</div>'; // close last group
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

// Render impact dashboard
function renderImpact(data) {
  if (!data.impact) {
    impactSection.classList.add('hidden');
    return;
  }

  const impact = data.impact;
  impactSection.classList.remove('hidden');

  if (impact.furloughedEstimate) {
    impactFurloughed.textContent = impact.furloughedEstimate.toLocaleString();
  }
  if (impact.dailyCostEstimate) {
    impactCost.textContent = '$' + (impact.dailyCostEstimate / 1000000).toFixed(0) + 'M';
  }
  if (impact.agencies) {
    impactAgencies.textContent = impact.agencies;
  }

  if (impact.affectedServices && impact.affectedServices.length > 0) {
    impactServices.classList.remove('hidden');
    impactServicesList.innerHTML = impact.affectedServices
      .map((s) => `<li>${escapeHtml(s)}</li>`)
      .join('');
  } else {
    impactServices.classList.add('hidden');
  }

  announceToScreenReader('Shutdown impact dashboard is available.');
}

// Render news feed
function renderNews(articles) {
  if (!articles || articles.length === 0) {
    newsSection.classList.add('hidden');
    return;
  }

  newsSection.classList.remove('hidden');
  newsFeed.innerHTML = articles
    .map((a) => {
      const date = a.pubDate
        ? new Date(a.pubDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '';
      const sourceLabel = a.source ? escapeHtml(a.source) : '';
      const meta = [sourceLabel, date].filter(Boolean).join(' \u00b7 ');
      return `
        <a class="news-card" href="${escapeHtml(a.link)}" target="_blank" rel="noopener noreferrer">
          <div class="news-card-title">${escapeHtml(a.title)}</div>
          <div class="news-card-meta">${meta}</div>
        </a>
      `;
    })
    .join('');
}

// Render reopening votes
function renderVotes(votes) {
  if (!votes || votes.length === 0) {
    votesSection.classList.add('hidden');
    return;
  }

  votesSection.classList.remove('hidden');
  votesFeed.innerHTML = votes
    .map((v) => {
      const hasCount = v.yea !== null;
      const resultLower = v.result ? v.result.toLowerCase() : '';
      // Check failed first — "not agreed" contains "agreed" so order matters
      const failed = resultLower.includes('failed') ||
                     resultLower.includes('rejected') ||
                     resultLower.includes('not agreed');
      const passed = !failed && (resultLower.includes('passed') ||
                     resultLower.includes('agreed'));
      const resultClass = passed ? 'vote-passed' : failed ? 'vote-failed' : '';

      let progressHtml = '';
      if (hasCount && v.threshold) {
        const pct = Math.min(100, Math.round((v.yea / v.threshold) * 100));
        const barColor = passed ? 'var(--green)' : failed ? 'var(--red)' : 'var(--amber)';
        progressHtml = `
          <div class="vote-progress">
            <div class="vote-progress-bar-wrap">
              <div class="vote-progress-bar" style="width: ${pct}%; background: ${barColor}"></div>
              <div class="vote-progress-threshold" style="left: 100%"></div>
            </div>
            <div class="vote-progress-labels">
              <span class="vote-yea">${v.yea} yea</span>
              <span class="vote-nay">${v.nay} nay</span>
              <span class="vote-threshold-label">${escapeHtml(v.thresholdLabel)}</span>
            </div>
          </div>
        `;
      }

      const chamberTag = `<span class="vote-chamber vote-chamber-${v.chamber.toLowerCase()}">${escapeHtml(v.chamber)}</span>`;
      const resultTag = v.result ? `<span class="vote-result ${resultClass}">${escapeHtml(v.result)}</span>` : '';
      const dateStr = v.date || '';

      return `
        <div class="vote-card ${resultClass}">
          <div class="vote-card-header">
            <div class="vote-card-tags">${chamberTag}${resultTag}</div>
            <span class="vote-date">${escapeHtml(dateStr)}</span>
          </div>
          <div class="vote-card-bill">${(() => {
            const url = getCongressUrl(v.bill, v.date);
            const text = escapeHtml(v.bill || v.question || 'Funding Vote');
            return url ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>` : text;
          })()}</div>
          ${v.question && v.question !== v.bill ? `<div class="vote-card-question">${escapeHtml(v.question)}</div>` : ''}
          ${progressHtml}
        </div>
      `;
    })
    .join('');
}

// Fetch votes from API
async function fetchVotes() {
  try {
    const res = await fetch('/api/votes');
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    cachedVotes = data.votes;
    coordinateVotesRendering();
  } catch (err) {
    votesSection.classList.add('hidden');
  }
}

// Fetch news from API
async function fetchNewsFeed() {
  try {
    const res = await fetch('/api/news');
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json();
    renderNews(data.articles);
  } catch (err) {
    newsSection.classList.add('hidden');
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
    const data = await res.json();
    cachedStatus = data;
    renderStatus(data);
    coordinateVotesRendering();
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
    cachedShutdowns = timelineData.shutdowns;
    renderStats(timelineData);
    renderTimeline(timelineData);
    coordinateVotesRendering();
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
// Push notification support
const notifyBtn = document.getElementById('notify-btn');
const notifyLabel = document.getElementById('notify-label');
let swRegistration = null;
let isSubscribed = false;

async function initPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    swRegistration = await navigator.serviceWorker.register('/sw.js');
    const subscription = await swRegistration.pushManager.getSubscription();
    isSubscribed = subscription !== null;
    updateNotifyButton();
    notifyBtn.classList.remove('hidden');
  } catch (err) {
    console.error('Service worker registration failed:', err);
  }
}

function updateNotifyButton() {
  if (isSubscribed) {
    notifyLabel.textContent = 'Subscribed';
    notifyBtn.classList.add('subscribed');
    notifyBtn.setAttribute('aria-label', 'Disable shutdown notifications');
  } else {
    notifyLabel.textContent = 'Notify Me';
    notifyBtn.classList.remove('subscribed');
    notifyBtn.setAttribute('aria-label', 'Enable shutdown notifications');
  }
}

async function subscribeUser() {
  try {
    const res = await fetch('/api/push/vapid-public-key');
    const { key } = await res.json();
    if (!key) {
      notifyLabel.textContent = 'Unavailable';
      return;
    }

    const subscription = await swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
    });

    isSubscribed = true;
    updateNotifyButton();
  } catch (err) {
    console.error('Subscribe failed:', err);
    notifyLabel.textContent = 'Failed';
    setTimeout(() => updateNotifyButton(), 2000);
  }
}

async function unsubscribeUser() {
  try {
    const subscription = await swRegistration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
    }
    isSubscribed = false;
    updateNotifyButton();
  } catch (err) {
    console.error('Unsubscribe failed:', err);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

notifyBtn.addEventListener('click', () => {
  if (isSubscribed) {
    unsubscribeUser();
  } else {
    subscribeUser();
  }
});

initPushNotifications();

// Impact toggle handler
impactToggle.addEventListener('click', () => {
  const expanded = impactToggle.getAttribute('aria-expanded') === 'true';
  impactToggle.setAttribute('aria-expanded', !expanded);
});

impactToggle.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    impactToggle.click();
  }
});

// Initialize — use SSR data if available, then fetch fresh data
if (window.__STATUS__) {
  cachedStatus = window.__STATUS__;
  renderStatus(window.__STATUS__);
  fetchTimeline();
} else {
  Promise.all([fetchStatus(), fetchTimeline()]);
}

// Fetch news and votes on load
fetchNewsFeed();
fetchVotes();

// Refresh status, news, and votes periodically
setInterval(fetchStatus, 15 * 60 * 1000);
setInterval(fetchNewsFeed, 15 * 60 * 1000);
setInterval(fetchVotes, 30 * 60 * 1000);
