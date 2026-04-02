# Backlog: Reopening Votes Feature

Remaining issues from the code review of the reopening votes feature (`claude/code-review-prep-PR58C`). None are merge blockers — all are improvements for follow-up work.

---

## 1. H.Res. 1142 threshold data inconsistency

**Severity:** Low  
**File:** `src/vote-scraper.js:370-378`

The curated vote for H.Res. 1142 has `threshold: 218` but passed with only 213 yea votes. Simple resolutions pass by majority of those voting (213 > 203), so the result is correct but the threshold field is wrong. The client works around this by recalculating `visualThreshold` for non-cloture votes (`public/app.js:643`), so the display is fine — but the data is inconsistent.

**Plan:** Set `threshold: null` for simple majority votes in `KNOWN_VOTES` and let the client compute the threshold from vote counts. Update the client to handle `threshold: null` gracefully (it partially does already). This removes the split between server data and client workaround.

---

## 2. `abstainPct` variable and CSS class misnamed

**Severity:** Low  
**Files:** `public/app.js:646`, `public/style.css:1055`

The amber bar segment is called "abstain" (`abstainPct`, `vote-seg--abstain`) but actually represents `present + notVoting`, which includes absent members — not just abstentions. Could confuse future contributors.

**Plan:** Rename `abstainPct` to `otherPct` in `app.js` and rename `vote-seg--abstain` to `vote-seg--other` in both `app.js` and `style.css`. Purely a naming change with no behavior impact.

---

## 3. No date format validation for scraped vote data

**Severity:** Medium  
**File:** `public/app.js:151-156`

`groupVotesByShutdown` calls `shiftDate()` which assumes dates are in `YYYY-MM-DD` format. Curated votes always are, but scraped Senate dates come from HTML text parsing and could arrive in other formats (e.g., "Jan 22, 2026"). Malformed dates produce `NaN` and comparisons silently fail, causing votes to land in the "unmatched" bucket without any warning.

**Plan:** Add a date normalization step in `vote-scraper.js` when parsing scraped Senate dates — convert to `YYYY-MM-DD` before returning. As a safety net, add a guard in `shiftDate()` that returns `null` for unparseable dates and skip those votes in `groupVotesByShutdown`.

---

## 4. Missing ARIA attributes on vote progress bars

**Severity:** Medium  
**File:** `public/app.js:650-653`

The vote progress bar (`vote-progress-outer` and its colored segments) has no ARIA attributes. Screen readers cannot convey the vote breakdown to users.

**Plan:** Add `role="img"` and a descriptive `aria-label` to `.vote-progress-outer`, e.g.:
```html
<div class="vote-progress-outer" role="img"
     aria-label="213 yea, 203 nay, 19 not voting. 208 needed to pass.">
```
Generate the label string dynamically from the vote data.

---

## 5. 30-minute vote cache may be stale during live votes

**Severity:** Low  
**File:** `server.js:39`

`VOTES_CACHE_TTL` is 30 minutes. During active congressional votes, users could see outdated tallies. News has the same TTL but is less time-sensitive.

**Plan:** Reduce `VOTES_CACHE_TTL` to 10 minutes (matching the scrape cache pattern). Optionally, support a `?fresh=1` query parameter on `/api/votes` that bypasses the cache for manual refreshes, with rate limiting to prevent abuse.

---

## 6. Unnecessary `escapeHtml` in `renderSourceFootnotes`

**Severity:** Trivial  
**File:** `public/app.js:345`

`escapeHtml()` is called on source names, but the result is assigned via `.textContent` which already auto-escapes HTML. The escaping is redundant and makes the code misleading (it looks like `innerHTML` safety but isn't needed).

**Plan:** Remove the `escapeHtml` calls in this function since `textContent` handles escaping. One-line fix.
