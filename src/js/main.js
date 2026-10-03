// src/js/main.js
// Router and shared actions. Each page lives in its own module.
import { initGeoDashboard, searchDashboard, selectFlight } from './services/DashboardService.js';
import DashboardModule from './modules/DashboardModule.js';
import FlightTrackerModule from './modules/FlightTrackerModule.js';
import WeatherModule from './modules/WeatherModule.js';

// Add new pages here. A module's id must match its #view-<id> section and its nav data-view.
// Pages with no module yet (weather, packing, risk, settings) still open as placeholders.
const modules = [DashboardModule, FlightTrackerModule, WeatherModule];
const DEFAULT_VIEW = 'dashboard';

let state = null; // null until the first data load

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

/* ---------- Views ---------- */

const currentHash = () => location.hash.slice(1);

/** Pages are discovered from the HTML: every .view-section with id="view-<name>" */
function getViewIds() {
  return [...document.querySelectorAll('.view-section')].map((s) => s.id.replace('view-', ''));
}

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
  try {
    state = await selectFlight(flight);
    clearError();
    renderAll();
  } catch (error) {
    showError(error.message);
  }
}

async function search(term) {
  try {
    state = await searchDashboard(term);
    clearError();

    // Keep both search boxes in sync
    const topInput = document.getElementById('flight-search-input');
    if (topInput) topInput.value = term;
    modules.forEach((m) => m.onSearch?.(term));

    renderAll();

    // Open the page that owns this kind of search (flight, route and airline go to the tracker)
    const owner = modules.find((m) => m.queryTypes?.includes(state.query?.type));
    goTo(owner ? owner.id : DEFAULT_VIEW);
  } catch (error) {
    showError(error.message);
  }
}

const app = { select, search, goTo, rerender: renderAll, showError };

/* ---------- Startup ---------- */

async function startApp() {
  try {
    state = await initGeoDashboard();
    clearError();
    renderAll();
    if (!state.active.length && !state.departures.length && !state.arrivals.length) {
      showError(`No live flights found for ${state.airport} right now. Try another airport code.`);
    }
  } catch (error) {
    // Includes "Location permission was denied." and "No airport found..."
    showError(error.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  modules.forEach((m) => m.init(app));

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
  document.getElementById('search-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const term = document.getElementById('flight-search-input').value.trim();
    if (term) search(term);
  });

  const appContainer = document.querySelector('.app-container');
  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    appContainer.classList.toggle('collapsed');
  });
});