
import { getWatchlist, lastChecked, removeFromWatchlist, toggleWatchlist } from '../services/WatchlistService.js';
import { localTime } from '../services/FlightService.js';
import { el, setText, updateWatchButtons } from './shared.js';

const PREVIEW_LIMIT = 5;
const CHECK_LIMIT = 5;
const RECENT_MS = 24 * 60 * 60 * 1000;
const EMPTY = 'No tracked flights yet. Select a flight and press Track.';

let app;
let lastState = null;
let refreshing = false;
let message = '';

const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* ---------- Rows ---------- */

function buildRow(entry) {
  const f = entry.flight;
  const item = el('div', 'watchlist-item');

  const select = el('button', 'watchlist-select');
  select.type = 'button';
  select.title = `${f.airline}: ${f.origin.name} to ${f.destination.name}`;
  select.append(
    el('span', 'watchlist-flight', f.flightNumber),
    el('span', 'watchlist-route', `${f.origin.code} → ${f.destination.code} • ${localTime(f.origin.scheduled)}`),
    el('span', `watchlist-status status-${f.status}`, f.status)
  );

  if (entry.change && Date.now() - Date.parse(entry.change.at) < RECENT_MS) {
    select.append(el('span', 'watchlist-change', `${entry.change.text} (${clock(entry.change.at)})`));
  }
  select.addEventListener('click', () => app.select(f));

  const remove = el('button', 'watchlist-remove', '×');
  remove.type = 'button';
  remove.setAttribute('aria-label', `Stop tracking ${f.flightNumber}`);
  remove.addEventListener('click', () => {
    removeFromWatchlist(entry.key);
    renderLists();
  });

  item.append(select, remove);
  return item;
}

/* ---------- Dashboard preview ---------- */

function renderPreview(list) {
  setText('watchlist-count', `${list.length} Tracked`);

  const box = document.getElementById('dashboard-watchlist-container');
  if (!box) return;
  box.replaceChildren();

  if (!list.length) {
    box.append(el('p', 'watchlist-empty', EMPTY));
    return;
  }

  list.slice(0, PREVIEW_LIMIT).forEach((entry) => box.append(buildRow(entry)));

  if (list.length > PREVIEW_LIMIT) {
    const more = el('button', 'watchlist-more', `View all ${list.length} tracked flights`);
    more.type = 'button';
    more.addEventListener('click', () => app.goTo('tracking'));
    box.append(more);
  }
}

/* ---------- Full list (Flight Tracking page) ---------- */

function summarize(result) {
  if (!result) return 'Could not refresh the tracked flights.';

  const parts = [];
  if (result.error) {
    parts.push(`${result.error} Stopped after checking ${plural(result.checked, 'flight')}`);
  } else if (!result.checked && !result.skipped) {
    parts.push('Nothing to check: every tracked flight has already landed or been cancelled');
  } else {
    parts.push(`Checked ${plural(result.checked, 'flight')}, ${result.changed} changed`);
  }
  if (result.notFound) parts.push(`${plural(result.notFound, 'flight')} not found in today's data`);
  if (result.skipped) parts.push(`${result.skipped} more not checked (limit ${CHECK_LIMIT} per refresh)`);

  return `${parts.join('. ')}.`;
}

async function handleRefresh() {
  refreshing = true;
  renderLists();
  const result = await app.refreshTracked({ limit: CHECK_LIMIT });
  refreshing = false;
  message = summarize(result);
  renderLists();
}

function buildToolbar() {
  const toolbar = el('div', 'watchlist-toolbar');

  const checked = lastChecked();
  const note = message || `Last checked ${checked ? clock(checked) : 'never'}. Refreshing uses up to ${CHECK_LIMIT} API requests.`;

  const button = el('button', 'btn-outline', refreshing ? 'Checking...' : 'Refresh statuses');
  button.type = 'button';
  button.disabled = refreshing;
  button.addEventListener('click', handleRefresh);

  toolbar.append(el('p', 'watchlist-toolbar-note', note), button);
  return toolbar;
}

function renderFull(list) {
  setText('full-watchlist-count', `${list.length} Tracked`);

  const box = document.getElementById('full-watchlist-container');
  if (!box) return;
  box.replaceChildren();

  if (!list.length) {
    box.append(el('p', 'watchlist-empty', EMPTY));
    return;
  }

  box.append(buildToolbar());
  list.forEach((entry) => box.append(buildRow(entry)));
}

/* ---------- Module ---------- */

function renderLists() {
  const list = getWatchlist();
  renderPreview(list);
  renderFull(list);
  updateWatchButtons(lastState?.flight ?? null);
}

export default {
  id: 'watchlist',

  init(sharedApp) {
    app = sharedApp;

    document.addEventListener('click', (event) => {
      const button = event.target.closest('.watch-btn');
      if (!button || button.disabled || !lastState?.flight) return;
      toggleWatchlist(lastState.flight);
      renderLists();
    });
  },

  render(state) {
    lastState = state;
    renderLists();
  }
};