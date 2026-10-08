import { BANDS, FACTORS, FLOOR, OUTLOOK, airportStats, outlookData, riskForState } from '../services/RiskService.js';
import { barList, gaugeChart, lineChart, stackedBar } from './charts.js';
import { el, setText } from './shared.js';

const EMPTY = 'Select a flight on the Dashboard or Flight Tracking page to analyze its risk.';

const PULSE = [
  ['ontime', 'On time'],
  ['active', 'In the air'],
  ['landed', 'Landed'],
  ['delayed', 'Delayed 15+ min'],
  ['cancelled', 'Cancelled or diverted']
];

let lastState = null;
let metric = 'rain';

const key = (level) => (level ? level.toLowerCase() : '');
const percent = (value) => `${Math.round((value || 0) * 100)}%`;

function startCard(id, title, extra) {
  const box = document.getElementById(id);
  if (!box) return null;
  box.replaceChildren();

  const header = el('header', 'card-header');
  header.append(el('h3', undefined, title));
  if (extra) header.append(extra);
  box.append(header);
  return box;
}

/* ---------- Widget 1: risk gauge ---------- */

function renderGauge(risk) {
  const scored = risk && risk.score !== null && risk.score !== undefined;
  const badge = scored ? el('div', `badge risk-${key(risk.level)}`, risk.level) : null;
  const box = startCard('risk-gauge', 'Overall risk', badge);
  if (!box) return;

  if (!risk) {
    box.append(el('p', 'risk-empty', EMPTY));
    return;
  }
  if (!scored) {
    box.append(el('p', 'risk-empty', 'Not enough data to score this flight.'));
    return;
  }

  const bands = BANDS.map((b, i) => ({ key: key(b.level), from: b.from, to: BANDS[i + 1]?.from ?? 100 }));
  box.append(
    gaugeChart({
      score: risk.score,
      levelKey: key(risk.level),
      levelLabel: risk.level,
      bands,
      ariaLabel: `Risk score ${risk.score} out of 100, ${risk.level}`
    })
  );

  const summary = el('div', 'risk-summary');
  summary.append(
    el('p', 'risk-verdict', risk.verdict),
    el('p', 'risk-confidence', `Based on ${risk.used} of ${risk.total} factors`)
  );
  box.append(summary);

  if (risk.floored) {
    box.append(
      el(
        'p',
        'risk-floor-note',
        `One factor stands out (${Math.round(risk.worst)}), so the score is held at ${percent(FLOOR)} of it instead of being averaged down.`
      )
    );
  }

  const reasons = el('div', 'risk-reasons');
  const list = el('ul');
  (risk.reasons && risk.reasons.length ? risk.reasons : [risk.headline]).forEach((r) => list.append(el('li', undefined, r)));
  reasons.append(el('h4', undefined, 'Main reasons'), list);
  box.append(reasons);
}

/* ---------- Widget 2: contribution bars ---------- */

function renderFactors(risk) {
  const box = startCard('risk-factors', 'Why this score');
  if (!box) return;

  if (!risk) {
    box.append(el('p', 'risk-empty', EMPTY));
    return;
  }

  const items = (risk.factors || []).map((f) => ({
    label: f.label,
    scoreText: f.available ? String(f.score) : 'No data',
    available: f.available,
    levelKey: f.available ? key(f.level) : null,
    percent: f.available ? f.score : 0,
    reason: f.reason,
    meta: f.available
      ? `${percent(f.weight)} weight, adds ${f.points.toFixed(1)} points`
      : `${percent(f.weight)} weight, left out of the score`
  }));

  box.append(barList({ items }));
}

/* ---------- Widget 3: weather outlook ---------- */

function renderOutlook(state) {
  const tabs = el('div', 'segmented');
  Object.entries(OUTLOOK).forEach(([id, cfg]) => {
    const button = el('button', id === metric ? 'is-active' : undefined, cfg.label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(id === metric));
    button.addEventListener('click', () => {
      metric = id;
      renderOutlook(lastState);
    });
    tabs.append(button);
  });

  const box = startCard('risk-outlook', 'Weather outlook', tabs);
  if (!box) return;

  const flight = state?.flight;
  const data = flight
    ? outlookData({
        flight,
        originWeather: state.flightWeather?.origin ?? null,
        destinationWeather: state.flightWeather?.destination ?? null,
        metric
      })
    : null;

  if (!data) {
    box.append(el('p', 'risk-empty', flight ? 'No hourly weather data is available for this flight.' : EMPTY));
    return;
  }

  const legend = el('div', 'chart-legend');
  data.series.forEach((s) => {
    const item = el('span', 'legend-item');
    item.append(el('span', `swatch series-${s.id}`), s.name);
    legend.append(item);
  });
  const zone = el('span', 'legend-item');
  zone.append(el('span', 'swatch zone'), `Risk zone (${data.threshold}${data.unit} or more)`);
  legend.append(zone);

  box.append(
    legend,
    lineChart({
      labels: data.labels,
      series: data.series,
      yMax: data.yMax,
      ticks: data.ticks,
      threshold: data.threshold,
      unit: data.unit,
      ariaLabel: `${data.label} for the next ${data.labels.length} hours at ${data.series.map((s) => s.name).join(' and ')}`
    }),
    el('p', 'chart-caption', `Next ${data.labels.length} hours. Hover a point to see the local time at that airport.`)
  );
}

/* ---------- Widget 4: airport pulse ---------- */

function renderAirport(state) {
  const code = state?.airport;
  const box = startCard('risk-airport', 'Airport pulse', code ? el('div', 'badge', code) : null);
  if (!box) return;

  const stats = code ? airportStats(state.airportFlights ?? [], code) : null;
  if (!stats || !stats.total) {
    box.append(el('p', 'risk-empty', 'No airport flight data is loaded yet.'));
    return;
  }

  box.append(
    stackedBar({
      segments: PULSE.map(([id, label]) => ({
        value: stats.counts[id] || 0,
        className: `pulse-${id}`,
        title: `${label}: ${stats.counts[id] || 0}`
      })),
      ariaLabel: `Flights at ${code}: ${PULSE.map(([id, label]) => `${stats.counts[id] || 0} ${label}`).join(', ')}`
    })
  );

  const legend = el('ul', 'pulse-legend');
  PULSE.forEach(([id, label]) => {
    const count = stats.counts[id] || 0;
    const item = el('li');
    item.append(
      el('span', `pulse-swatch pulse-${id}`),
      el('span', undefined, label),
      el('span', 'pulse-count', `${count} (${percent(count / stats.total)})`)
    );
    legend.append(item);
  });
  box.append(legend);

  box.append(
    el('p', 'pulse-note', `${stats.total} flights sampled at ${code}. Delay data is reported for ${stats.delayKnown} of them.`)
  );
}

/* ---------- Calculation table (bottom of the page) ---------- */

function renderMethod() {
  const box = startCard('risk-method', 'How the score is calculated');
  if (!box) return;

  box.append(
    el(
      'p',
      'method-intro',
      'Each factor is scored from 0 to 100, then combined using the weights below. The result is a planning indicator, not a prediction or a safety rating.'
    )
  );

  const table = el('table', 'method-table');
  const head = el('thead');
  const headRow = el('tr');
  ['Factor', 'Weight', "How it's scored"].forEach((label) => headRow.append(el('th', undefined, label)));
  head.append(headRow);

  const body = el('tbody');
  FACTORS.forEach((f) => {
    const row = el('tr');
    row.append(el('td', undefined, f.label), el('td', undefined, percent(f.weight)), el('td', undefined, f.how));
    body.append(row);
  });

  const foot = el('tfoot');
  const footRow = el('tr');
  const total = FACTORS.reduce((sum, f) => sum + f.weight, 0);
  footRow.append(el('td', undefined, 'Total'), el('td', undefined, percent(total)), el('td'));
  foot.append(footRow);

  table.append(head, body, foot);
  const scroll = el('div', 'table-scroll');
  scroll.append(table);
  box.append(scroll);

  const bands = el('div', 'band-list');
  BANDS.forEach((b) => bands.append(el('span', `band-chip level-${key(b.level)}`, `${b.level} ${b.from} to ${b.to}`)));
  box.append(el('h4', undefined, 'Score bands'), bands);

  const rules = el('ul', 'rule-list');
  [
    `A serious problem cannot be averaged away: the final score is the higher of the weighted average and ${percent(FLOOR)} of the worst factor.`,
    'Missing data is not treated as "no problem". A factor that cannot be computed is left out and the other weights are rescaled. The page shows how many factors the score is based on.',
    'The score uses a live snapshot (this flight, the weather at both airports and the flights on the loaded airport board), not historical delay data.'
  ].forEach((text) => rules.append(el('li', undefined, text)));
  box.append(el('h4', undefined, 'Rules'), rules);
}

/* ---------- Module ---------- */

export default {
  id: 'risk',

  queryTypes: ['flight', 'route', 'airline', 'airport'],
  placeholder: 'Search a flight (BA74), route (LOS-JFK) or airport to analyze its risk',

  init() {
    renderMethod();
  },

  render(state) {
    lastState = state;
    const risk = riskForState(state);
    const flight = state?.flight;

    setText(
      'risk-subtitle',
      flight
        ? `Flight ${flight.flightNumber}, ${flight.origin.code} to ${flight.destination.code}`
        : 'Select a flight to see its risk analysis.'
    );

    renderGauge(risk);
    renderFactors(risk);
    renderOutlook(state);
    renderAirport(state);
  }
};