
import { metricTiles, worstLevel } from '../services/WeatherService.js';
import { el, setText } from './shared.js';

const LEVEL_TEXT = { ok: 'Clear', caution: 'Caution', warning: 'Warning' };

const deg = (v) => (v === null || v === undefined ? '—' : `${Math.round(v)}°`);

/* ---------- Pieces of a panel ---------- */

function renderNow(w) {
  const wrap = el('div', 'wx-now');
  wrap.append(
    el('div', 'wx-temp', w.tempC),
    el('div', 'wx-condition', `${w.condition}, feels like ${w.feelsLikeC}`)
  );

  const place = [w.location, w.region, w.country].filter(Boolean).join(', ');
  wrap.append(el('div', 'wx-place', w.localClock ? `${place}. Local time ${w.localClock}` : place));
  return wrap;
}

function renderMetrics(w) {
  const grid = el('div', 'wx-metrics');
  metricTiles(w).forEach(([label, value]) => {
    const tile = el('div', 'wx-metric');
    tile.append(el('div', 'wx-metric-label', label), el('div', 'wx-metric-value', value));
    grid.append(tile);
  });
  return grid;
}

function renderHazards(w) {
  const wrap = el('div');
  wrap.append(el('h4', 'wx-section-title', 'Hazards'));

  if (!w.hazards.length) {
    wrap.append(el('p', 'wx-empty', 'No significant hazards at this time.'));
    return wrap;
  }

  const list = el('ul', 'wx-hazards');
  w.hazards.forEach((h) => {
    list.append(el('li', `wx-hazard level-${h.level}`, `${h.label}: ${h.detail}`));
  });
  wrap.append(list);
  return wrap;
}

function renderForecast(w) {
  const wrap = el('div');
  wrap.append(el('h4', 'wx-section-title', '3-day forecast'));

  const row = el('div', 'wx-forecast');
  w.forecast.forEach((d) => {
    const day = el('div', 'wx-day');
    const name = new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
    day.append(
      el('div', 'wx-day-name', name),
      el('div', 'wx-day-condition', d.condition),
      el('div', 'wx-day-temps', `${deg(d.maxC)} / ${deg(d.minC)}`),
      el('div', 'wx-day-rain', d.rainChance === null ? '—' : `${d.rainChance}% rain`)
    );
    row.append(day);
  });

  wrap.append(row);
  return wrap;
}

function renderHourly(w) {
  const wrap = el('div');
  wrap.append(el('h4', 'wx-section-title', 'Next hours'));

  if (!w.hourly.length) {
    wrap.append(el('p', 'wx-empty', 'No hourly data available.'));
    return wrap;
  }

  const strip = el('div', 'wx-hourly');
  w.hourly.forEach((h) => {
    const cell = el('div', 'wx-hour');
    cell.title = h.condition;
    cell.append(
      el('div', 'wx-hour-time', h.time),
      el('div', 'wx-hour-temp', deg(h.tempC)),
      el('div', 'wx-hour-rain', h.rainChance === null ? '—' : `${h.rainChance}%`)
    );
    strip.append(cell);
  });

  wrap.append(strip);
  return wrap;
}

function renderAlerts(w) {
  if (!w.alerts.length) return null;

  const wrap = el('div');
  wrap.append(el('h4', 'wx-section-title', 'Official alerts'));
  w.alerts.forEach((a) => {
    const item = el('div', 'wx-alert');
    item.append(el('strong', undefined, a.headline));
    if (a.expires) item.append(el('div', 'wx-alert-meta', `Expires ${a.expires.slice(0, 16).replace('T', ' ')}`));
    wrap.append(item);
  });
  return wrap;
}

/* ---------- Panels ---------- */

function renderPanel(id, title, weather, emptyText) {
  const box = document.getElementById(id);
  if (!box) return;
  box.replaceChildren();

  const header = el('header', 'card-header');
  header.append(el('h3', undefined, title));
  if (weather) header.append(el('div', `badge level-${weather.hazardLevel}`, LEVEL_TEXT[weather.hazardLevel]));
  box.append(header);

  if (!weather) {
    box.append(el('p', 'wx-empty', emptyText));
    return;
  }

  box.append(renderNow(weather), renderMetrics(weather), renderHazards(weather), renderForecast(weather), renderHourly(weather));
  const alerts = renderAlerts(weather);
  if (alerts) box.append(alerts);
}

function renderSummary(panels, errorText) {
  const box = document.getElementById('hazard-summary');
  if (!box) return;
  box.replaceChildren();

  const loaded = panels.filter(([, w]) => w);

  if (!loaded.length) {
    box.className = 'hazard-summary';
    box.append(el('p', undefined, errorText || 'Weather loads when a flight or location is selected.'));
    return;
  }

  const items = loaded.flatMap(([where, w]) => w.hazards.map((h) => ({ ...h, where })));
  box.className = `hazard-summary level-${worstLevel(items)}`;

  if (!items.length) {
    box.append(el('p', 'hazard-headline', 'No significant weather hazards found.'));
    return;
  }

  box.append(el('p', 'hazard-headline', `${items.length} weather ${items.length === 1 ? 'hazard' : 'hazards'} found`));
  const list = el('ul', 'hazard-list');
  items.forEach((i) => list.append(el('li', undefined, `${i.where}: ${i.label} (${i.detail})`)));
  box.append(list);
}

/* ---------- Module ---------- */

export default {
  id: 'weather',

  init() {

  },

  render(state) {
    const flight = state?.flight;
    const isLocation = state?.weatherContext === 'location';

    if (isLocation) {
      setText('weather-corridor', `Showing weather for ${state.weather?.location ?? 'your search'}.`);
    } else if (flight) {
      setText(
        'weather-corridor',
        `Route ${flight.origin.code} to ${flight.destination.code}, flight ${flight.flightNumber}.`
      );
    } else {
      setText('weather-corridor', 'Select a flight to see the weather along its route.');
    }

    const originTitle = isLocation ? 'Location' : 'Origin';
    const errorText = state?.weatherError;

    renderSummary(
      [[originTitle, state?.weather], ['Destination', state?.destinationWeather]],
      errorText
    );
    renderPanel(
      'weather-origin',
      originTitle,
      state?.weather ?? null,
      errorText || 'Weather loads when a flight or location is selected.'
    );
    renderPanel(
      'weather-destination',
      'Destination',
      state?.destinationWeather ?? null,
      isLocation
        ? 'Select a flight to see its destination weather.'
        : errorText || 'No destination weather for this flight.'
    );
  }
};