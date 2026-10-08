
import {
  clearApiCache,
  getAirportIndexSize,
  getApiStatus,
  getApiUsage,
  getCacheInfo
} from '../services/api.js';
import { formatClock, formatDistance, formatTemp, formatWind } from '../services/format.js';
import { getSettings, onSettingsChange, resetSettings, updateSettings } from '../services/SettingsService.js';
import { el } from './shared.js';

const syncs = [];
const refs = {};
let app;

/* ---------- Building blocks ---------- */

function segmented(key, options) {
  const group = el('div', 'segmented');
  group.setAttribute('role', 'group');

  const buttons = options.map(([value, label]) => {
    const button = el('button', undefined, label);
    button.type = 'button';
    button.addEventListener('click', () => updateSettings({ [key]: value }));
    group.append(button);
    return [value, button];
  });

  const sync = () => {
    buttons.forEach(([value, button]) => {
      const on = getSettings()[key] === value;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-pressed', String(on));
    });
  };

  syncs.push(sync);
  sync();
  return group;
}

function row(label, help, control) {
  const wrap = el('div', 'setting-row');
  const text = el('div', 'setting-text');
  text.append(el('p', 'setting-label', label));
  if (help) text.append(typeof help === 'string' ? el('p', 'setting-help', help) : help);
  wrap.append(text);
  if (control) wrap.append(control);
  return wrap;
}

function card(title, ...children) {
  const box = el('section', 'dashboard-card settings-card');
  const header = el('header', 'card-header');
  header.append(el('h3', undefined, title));
  box.append(header, ...children);
  return box;
}

function button(label, onClick) {
  const node = el('button', 'btn-outline', label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

/* ---------- Cards ---------- */

function unitsCard() {
  refs.preview = el('p', 'settings-preview');

  return card(
    'Dashboard units',
    row('Temperature', null, segmented('tempUnit', [['c', '°C'], ['f', '°F']])),
    row('Wind speed', null, segmented('windUnit', [['kph', 'km/h'], ['mph', 'mph'], ['kn', 'knots']])),
    row('Distance', 'Used for visibility.', segmented('distanceUnit', [['km', 'Kilometres'], ['mi', 'Miles']])),
    row('Time format', 'Applies to flight times and weather hours.', segmented('timeFormat', [['24h', '24-hour'], ['12h', '12-hour']])),
    refs.preview
  );
}

function refreshCard() {
  const limit = el('input', 'settings-input');
  limit.type = 'number';
  limit.min = '10';
  limit.max = '100000';
  limit.step = '10';
  limit.setAttribute('aria-label', 'Monthly flight request limit');
  limit.value = String(getSettings().monthlyLimit);
  limit.addEventListener('change', () => {
    updateSettings({ monthlyLimit: Math.round(Number(limit.value)) });
    limit.value = String(getSettings().monthlyLimit);
  });
  syncs.push(() => { limit.value = String(getSettings().monthlyLimit); });

  const now = button('Refresh now', async () => {
    now.disabled = true;
    now.textContent = 'Refreshing...';
    await app.refreshNow();
    now.disabled = false;
    now.textContent = 'Refresh now';
    refreshInfo();
  });

  return card(
    'Data refresh',
    row(
      'Auto-refresh',
      'Reloads the airport boards and weather while this tab is open and visible. Each refresh uses about 2 flight requests. It pauses when you are close to your monthly limit.',
      segmented('refreshMinutes', [[0, 'Off'], [30, '30 min'], [60, '1 hour'], [180, '3 hours']])
    ),
    row('Monthly flight request limit', 'Set this to match your AviationStack plan. It drives the usage bar and the auto-refresh pause.', limit),
    row('Refresh now', 'Reloads the current airport right away.', now)
  );
}

function sourcesCard() {
  refs.flightsStatus = el('span', 'badge');
  refs.weatherStatus = el('span', 'badge');
  refs.usageText = el('p', 'usage-text');
  refs.usageFill = el('div', 'usage-fill');
  refs.airports = el('span', 'setting-value');
  refs.cache = el('span', 'setting-value');

  const track = el('div', 'usage-track');
  track.append(refs.usageFill);
  const usage = el('div', 'usage');
  usage.append(refs.usageText, track);

  const start = el('input', 'settings-input settings-code');
  start.type = 'text';
  start.maxLength = 3;
  start.placeholder = 'LOS';
  start.setAttribute('aria-label', 'Start airport code');
  start.value = getSettings().startAirport;

  const hint = el('p', 'setting-help');
  let mode = getSettings().startAirport ? 'fixed' : 'gps';

  const gps = el('button', undefined, 'My location');
  const fixed = el('button', undefined, 'Fixed airport');
  [gps, fixed].forEach((b) => { b.type = 'button'; });

  const syncMode = () => {
    gps.classList.toggle('is-active', mode === 'gps');
    fixed.classList.toggle('is-active', mode === 'fixed');
    gps.setAttribute('aria-pressed', String(mode === 'gps'));
    fixed.setAttribute('aria-pressed', String(mode === 'fixed'));
    start.hidden = mode !== 'fixed';
    hint.textContent = mode === 'fixed'
      ? 'Enter a 3-letter airport code (for example LOS). This skips the location prompt. Takes effect the next time the app starts.'
      : 'Uses your browser location to find the nearest airport. Takes effect the next time the app starts.';
  };

  gps.addEventListener('click', () => {
    mode = 'gps';
    updateSettings({ startAirport: '' });
    start.value = '';
    syncMode();
  });
  fixed.addEventListener('click', () => {
    mode = 'fixed';
    syncMode();
    start.focus();
  });
  start.addEventListener('change', () => {
    const code = start.value.trim().toUpperCase();
    if (updateSettings({ startAirport: code })) {
      start.value = code;
    } else if (!/^[A-Z]{3}$/.test(code)) {
      start.value = getSettings().startAirport;
      hint.textContent = 'That is not a valid airport code. Use 3 letters, for example LOS.';
    }
  });
  syncs.push(() => {
    mode = getSettings().startAirport ? 'fixed' : 'gps';
    start.value = getSettings().startAirport;
    syncMode();
  });
  syncMode();

  const group = el('div', 'segmented');
  group.append(gps, fixed);
  const control = el('div', 'settings-inline');
  control.append(group, start);

  const clear = button('Clear cached data', () => {
    clearApiCache();
    refreshInfo();
  });

  return card(
    'Data sources and storage',
    row('AviationStack (flights)', 'Flight status, boards and routes.', refs.flightsStatus),
    usage,
    row('WeatherAPI (weather)', 'Current conditions, forecast and alerts.', refs.weatherStatus),
    row('OurAirports (airport list)', 'Used once to find your nearest airport.', refs.airports),
    row('Start location', hint, control),
    row('Saved responses', 'Flight and weather responses are kept for 10 minutes to save requests. Clearing them means the next loads use API requests again.', refs.cache),
    row('Clear saved responses', null, clear)
  );
}

function resetCard() {
  let armed = null;
  const reset = button('Reset all settings', () => {
    if (!armed) {
      reset.textContent = 'Click again to confirm';
      armed = setTimeout(() => {
        armed = null;
        reset.textContent = 'Reset all settings';
      }, 4000);
      return;
    }
    clearTimeout(armed);
    armed = null;
    reset.textContent = 'Reset all settings';
    resetSettings();
  });

  return card('Reset', row('Back to defaults', 'Restores units, refresh and start location. Your tracked flights and packing checklists are not touched.', reset));
}

/* ---------- Live information ---------- */

function updatePreview() {
  if (!refs.preview) return;
  refs.preview.textContent = `Example: ${formatTemp(27)}, wind ${formatWind(25)}, visibility ${formatDistance(10)}, departure ${formatClock('14:05')}`;
}

function refreshInfo() {
  const status = getApiStatus();
  const setStatus = (node, ok) => {
    node.textContent = ok ? 'Key configured' : 'Key missing';
    node.className = `badge ${ok ? 'risk-low' : 'risk-severe'}`;
  };
  setStatus(refs.flightsStatus, status.flights);
  setStatus(refs.weatherStatus, status.weather);

  const { requests } = getApiUsage();
  const limit = getSettings().monthlyLimit;
  const percent = Math.min(100, Math.round((requests / limit) * 100));
  refs.usageText.textContent = `${requests} of ${limit} flight requests used this month (counted in this browser only)`;
  refs.usageFill.style.setProperty('--w', `${percent}%`);
  refs.usageFill.className = `usage-fill ${percent >= 90 ? 'is-high' : percent >= 70 ? 'is-warn' : 'is-ok'}`;

  const airports = getAirportIndexSize();
  refs.airports.textContent = airports ? `${airports.toLocaleString()} airports saved on this device` : 'Not downloaded yet';

  const cache = getCacheInfo();
  refs.cache.textContent = `${cache.entries} saved (${cache.kb} KB)`;
}

/* ---------- Module ---------- */

export default {
  id: 'settings',

  init(sharedApp) {
    app = sharedApp;

    const grid = document.getElementById('settings-grid');
    if (grid) {
      grid.replaceChildren(unitsCard(), refreshCard(), sourcesCard(), resetCard());
    }

    updatePreview();
    refreshInfo();

    onSettingsChange(() => {
      syncs.forEach((sync) => sync());
      updatePreview();
      refreshInfo();
    });
  },

  render() {
    updatePreview();
    refreshInfo();
  }
};