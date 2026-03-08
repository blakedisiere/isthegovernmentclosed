// Historical US federal government shutdowns
// Source: Congressional Research Service reports
// Each entry: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' | null }
// end = null means the shutdown is currently ongoing

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
];

function getShutdownStatus() {
  const today = new Date().toISOString().split('T')[0];

  // Check for ongoing shutdown (end is null or end >= today)
  const ongoing = SHUTDOWNS.find(
    (s) => s.end === null || (s.start <= today && s.end >= today)
  );

  if (ongoing) {
    return {
      isClosed: true,
      since: ongoing.start,
      message: `The government has been closed since ${formatDate(ongoing.start)}.`,
    };
  }

  // Find most recent past shutdown
  const past = SHUTDOWNS.filter((s) => s.end && s.end < today).sort(
    (a, b) => b.end.localeCompare(a.end)
  );

  const lastShutdown = past[0] || null;

  return {
    isClosed: false,
    lastClosure: lastShutdown
      ? { start: lastShutdown.start, end: lastShutdown.end }
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
function addShutdown(start, end = null) {
  const exists = SHUTDOWNS.find((s) => s.start === start);
  if (!exists) {
    SHUTDOWNS.push({ start, end });
    SHUTDOWNS.sort((a, b) => a.start.localeCompare(b.start));
  } else if (end && !exists.end) {
    exists.end = end;
  }
}

module.exports = { getShutdownStatus, addShutdown, SHUTDOWNS };
