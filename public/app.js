async function fetchStatus() {
  const answerEl = document.getElementById('answer');
  const detailEl = document.getElementById('detail');
  const sourceEl = document.getElementById('source');

  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    answerEl.classList.remove('loading');

    if (data.isClosed) {
      answerEl.textContent = 'Yes';
      answerEl.className = 'answer yes';
      document.body.className = 'closed';
    } else {
      answerEl.textContent = 'No';
      answerEl.className = 'answer no';
      document.body.className = 'open';
    }

    detailEl.textContent = data.message;

    if (data.lastScraped) {
      const scraped = new Date(data.lastScraped);
      sourceEl.textContent = 'Last checked: ' + scraped.toLocaleString();
    }
  } catch (err) {
    answerEl.textContent = '?';
    answerEl.classList.remove('loading');
    detailEl.textContent = 'Unable to determine status. Please try again later.';
  }
}

fetchStatus();

// Refresh every 15 minutes
setInterval(fetchStatus, 15 * 60 * 1000);
