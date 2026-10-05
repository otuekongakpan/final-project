// src/js/main.js
// Router and shared actions. Each page lives in its own module.
import { initGeoDashboard, searchDashboard, selectFlight } from './services/DashboardService.js';
import DashboardModule from './modules/DashboardModule.js';
import FlightTrackerModule from './modules/FlightTrackerModule.js';
import WeatherModule from './modules/WeatherModule.js';

// Order matters: when a search can't be shown on the current page, it opens the FIRST module
// whose queryTypes include it. Each module declares queryTypes (the searches it can show)
// and a placeholder for the top search bar.
// Pages with no module yet (packing, risk, settings) still open as placeholders.
const modules = [DashboardModule, FlightTrackerModule, WeatherModule];
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

/** Pages are discovered from the HTML: every .view-section with id="view-<name>" */
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
    section.style.display = show ? '' : 'none'; // overrides the inline display:none
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
  modules.forEach((m) => m.render(state));
}

/* ---------- Shared actions (given to every module) ---------- */

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

      // Stay on this page if it can show the result, otherwise open the page that can
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

const app = { select, search, goTo, rerender: renderAll, showError };

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