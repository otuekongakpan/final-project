
import { initGeoDashboard, refreshData, refreshTracked, searchDashboard, selectFlight } from './services/DashboardService.js';
import { getApiUsage } from './services/api.js';
import { getSettings, onSettingsChange } from './services/SettingsService.js';
import { applyFresh } from './services/WatchlistService.js';
import DashboardModule from './modules/DashboardModule.js';
import FlightTrackerModule from './modules/FlightTrackerModule.js';
import WeatherModule from './modules/WeatherModule.js';
import PackingModule from './modules/PackingModule.js';
import RiskModule from './modules/RiskModule.js';
import WatchlistModule from './modules/WatchlistModule.js';
import SettingsModule from './modules/SettingsModule.js';

const modules = [DashboardModule, FlightTrackerModule, WeatherModule, PackingModule, RiskModule, WatchlistModule, SettingsModule];
const DEFAULT_VIEW = 'dashboard';
const DEFAULT_PLACEHOLDER = 'Search flight, route, airline or airport';

const RECENT_KEY = 'aeropulse:recent-searches';
const MAX_RECENT = 8;

let state = null; // null until the first data load
let pending = 0;

/* ---------- Loading state ---------- */

function setLoading(on) {
  pending = Math.max(0, pending + (on ? 1 : -1));
  document.body.classList.toggle('is-loading', pending > 0);
}

async function withLoading(task) {
  setLoading(true);
  try {
    return await task();
  } finally {
    setLoading(false);
  }
}

function setLoaderText(text) {
  const node = document.getElementById('loader-text');
  if (node) node.textContent = text;
}

function hideLoader() {
  const loader = document.getElementById('app-loader');
  if (!loader) return;
  loader.classList.add('is-hidden');
  setTimeout(() => loader.remove(), 500);
}

/* ---------- Errors ---------- */

function showError(message) {
  console.error("Dashboard Error:", message);
  const banner = document.getElementById('error-banner');
  if (banner) {
    banner.textContent = message;
    banner.style.display = 'block';
  }
}

function clearError() {
  const banner = document.getElementById('error-banner');
  if (banner) banner.style.display = 'none';
}

/* ---------- Recent searches ---------- */

function getRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function renderSuggestions(list = getRecent()) {
  let box = document.getElementById('recent-searches');
  if (!box) {
    box = document.createElement('datalist');
    box.id = 'recent-searches';
    document.body.append(box);
  }

  box.replaceChildren(
    ...list.map((term) => {
      const option = document.createElement('option');
      option.value = term;
      return option;
    })
  );
}

function rememberSearch(term) {
  const list = [term, ...getRecent().filter((t) => t.toLowerCase() !== term.toLowerCase())].slice(0, MAX_RECENT);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* ignore */ }
  renderSuggestions(list);
}

/* ---------- Views ---------- */

const currentHash = () => location.hash.slice(1);

function getViewIds() {
  return [...document.querySelectorAll('.view-section')].map((s) => s.id.replace('view-', ''));
}

const activeView = () =>
  document.querySelector('.view-section.active')?.id.replace('view-', '') || DEFAULT_VIEW;

function setView(name) {
  const ids = getViewIds();
  const view = ids.includes(name) ? name : DEFAULT_VIEW;

  ids.forEach((id) => {
    const section = document.getElementById(`view-${id}`);
    if (!section) return;
    const show = id === view;
    section.hidden = !show;
    section.style.display = show ? '' : 'none';
    section.classList.toggle('active', show);
  });

  document.querySelectorAll('.nav-item[data-view]').forEach((link) => {
    const active = link.dataset.view === view;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  const input = document.getElementById('flight-search-input');
  if (input) input.placeholder = modules.find((m) => m.id === view)?.placeholder ?? DEFAULT_PLACEHOLDER;
}

function goTo(view) {
  if (currentHash() === view) setView(view);
  else location.hash = view; // the hashchange listener calls setView
}

/* ---------- Rendering ---------- */

function renderAll() {
  if (state) {
    applyFresh([
      ...(state.active || []),
      ...(state.departures || []),
      ...(state.arrivals || []),
      ...(state.airportFlights || []),
      ...(state.results || []),
      ...(state.flight ? [state.flight] : [])
    ]);
  }

  modules.forEach((m) => m.render(state));
}

/* ---------- Shared actions ---------- */

async function select(flight) {
  await withLoading(async () => {
    try {
      state = await selectFlight(flight);
      clearError();
      renderAll();
    } catch (error) {
      showError(error.message);
    }
  });
}

async function search(term) {
  await withLoading(async () => {
    try {
      state = await searchDashboard(term);
      clearError();
      rememberSearch(term);

      // Keep both search boxes in sync
      const topInput = document.getElementById('flight-search-input');
      if (topInput) topInput.value = term;
      modules.forEach((m) => m.onSearch?.(term));

      renderAll();

      const type = state.query?.type;
      const here = modules.find((m) => m.id === activeView());
      const target = here?.queryTypes?.includes(type)
        ? here
        : modules.find((m) => m.queryTypes?.includes(type));
      goTo(target ? target.id : DEFAULT_VIEW);
    } catch (error) {
      showError(error.message);
    }
  });
}

async function refreshWatchlist(options) {
  return withLoading(async () => {
    try {
      const result = await refreshTracked(options);
      renderAll();
      return result;
    } catch (error) {
      showError(error.message);
      return null;
    }
  });
}

/* ---------- Settings: refresh rate and display options ---------- */

let refreshTimer = null;

async function refreshNow() {
  if (!state) return;

  await withLoading(async () => {
    try {
      state = await refreshData();
      clearError();
      renderAll();
    } catch (error) {
      showError(error.message);
    }
  });
}

const nearLimit = () => getApiUsage().requests >= getSettings().monthlyLimit * 0.9;

async function autoRefresh() {
  if (document.hidden || pending > 0 || !state || nearLimit()) return;
  await refreshNow();
}

function applySettings() {
  const { refreshMinutes, timeFormat } = getSettings();

  document.body.classList.toggle('time-12h', timeFormat === '12h');

  clearInterval(refreshTimer);
  refreshTimer = refreshMinutes > 0 ? setInterval(autoRefresh, refreshMinutes * 60 * 1000) : null;
}

const app = { select, search, goTo, rerender: renderAll, showError, refreshTracked: refreshWatchlist, refreshNow };

/* ---------- Startup ---------- */

async function startApp() {
  const guard = setTimeout(hideLoader, 40000);

  await withLoading(async () => {
    try {
      state = await initGeoDashboard(setLoaderText);
      clearError();
      renderAll();
      if (!state.active.length && !state.departures.length && !state.arrivals.length) {
        showError(`No live flights found for ${state.airport} right now. Try another airport code.`);
      }
    } catch (error) {
      showError(error.message);
    } finally {
      clearTimeout(guard);
      hideLoader();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  modules.forEach((m) => m.init(app));

  applySettings();
  onSettingsChange(() => {
    applySettings();
    renderAll();
  });

  renderSuggestions();
  ['flight-search-input', 'tracking-input'].forEach((id) =>
    document.getElementById(id)?.setAttribute('list', 'recent-searches')
  );

  setView(currentHash());
  renderAll();
  startApp();

  window.addEventListener('hashchange', () => setView(currentHash()));

  // Sidebar links
  document.querySelectorAll('.sidebar-menu .nav-item').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (link.dataset.view) goTo(link.dataset.view);
    });
  });

  // Top search bar
  const topInput = document.getElementById('flight-search-input');

  document.getElementById('search-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const term = topInput.value.trim();
    if (term) search(term);
  });

  // "/" focuses the search bar, Esc leaves it
  document.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(active?.tagName) || active?.isContentEditable;

    if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      topInput?.focus();
      topInput?.select();
    } else if (e.key === 'Escape' && active === topInput) {
      topInput.blur();
    }
  });

  const appContainer = document.querySelector('.app-container');
  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    appContainer.classList.toggle('collapsed');
  });
});