// src/js/modules/FlightTrackerModule.js
// The Flight Tracking page: search, results and flight details.
import { filterFlights } from '../services/FlightService.js';
import { el, fmt, renderBoard, setText } from './shared.js';

let app;
let lastState = null;

function factColumn(title, side) {
  const col = el('div', 'facts-col');
  col.append(el('h4', undefined, title));

  const list = el('dl');
  [
    ['Airport', side.name],
    ['Scheduled', fmt(side.scheduled)],
    ['Estimated', fmt(side.estimated)],
    ['Terminal', side.terminal || '—'],
    ['Gate', side.gate || '—'],
    ['Delay', side.delay > 0 ? `${side.delay} min` : 'None']
  ].forEach(([label, value]) => {
    list.append(el('dt', undefined, label), el('dd', undefined, value));
  });

  col.append(list);
  return col;
}

function renderDetail(flight) {
  const box = document.getElementById('tracking-detail');
  if (!box) return;
  box.replaceChildren();

  if (!flight) {
    box.append(el('p', 'tracking-empty', 'Search for a flight, route or airline, then choose a flight to see its details.'));
    return;
  }

  const header = el('header', 'card-header');
  header.append(
    el('h3', undefined, `Flight ${flight.flightNumber} • ${flight.airline}`),
    el('div', 'badge status-live', flight.status)
  );

  const route = el('div', 'flight-route');
  route.append(
    el('div', 'airport-code', flight.origin.code),
    el('span', 'route-arrow', '→'),
    el('div', 'airport-code', flight.destination.code)
  );

  const facts = el('div', 'facts');
  facts.append(factColumn('Departure', flight.origin), factColumn('Arrival', flight.destination));

  box.append(header, route, facts);
}

function renderResults(state) {
  const results = state?.results ?? [];
  const status = document.getElementById('tracking-status')?.value || '';
  const filtered = filterFlights(results, { status });

  renderBoard(
    'tracking-list',
    filtered,
    'results',
    (f) => app.select(f),
    results.length
      ? 'No results match this status filter.'
      : 'Search for a flight number, route or airline to see results.'
  );
  setText('tracking-count', `${filtered.length} found`);
  renderDetail(state?.flight ?? null);
}

export default {
  id: 'tracking',

  // Search types this page owns. main.js opens it when a search matches one.
  queryTypes: ['flight', 'route', 'airline'],

  init(sharedApp) {
    app = sharedApp;

    document.getElementById('tracking-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const term = document.getElementById('tracking-input').value.trim();
      if (term) app.search(term);
    });

    document.getElementById('tracking-status')?.addEventListener('change', () => renderResults(lastState));
  },

  /** Keeps this page's search box in sync with the top search bar */
  onSearch(term) {
    const input = document.getElementById('tracking-input');
    if (input) input.value = term;
  },

  render(state) {
    lastState = state;
    renderResults(state);
  }
};