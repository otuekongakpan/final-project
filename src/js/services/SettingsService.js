// src/js/services/SettingsService.js
// Saves the user's settings in localStorage. No network calls, no DOM.

const STORAGE_KEY = 'aeropulse:settings:v1';

export const DEFAULTS = Object.freeze({
  tempUnit: 'c',
  windUnit: 'kph',
  distanceUnit: 'km',
  timeFormat: '24h',
  refreshMinutes: 0,
  monthlyLimit: 100,
  startAirport: ''
});

const VALID = {
  tempUnit: (v) => ['c', 'f'].includes(v),
  windUnit: (v) => ['kph', 'mph', 'kn'].includes(v),
  distanceUnit: (v) => ['km', 'mi'].includes(v),
  timeFormat: (v) => ['24h', '12h'].includes(v),
  refreshMinutes: (v) => [0, 30, 60, 180].includes(v),
  monthlyLimit: (v) => Number.isInteger(v) && v >= 10 && v <= 100000,
  startAirport: (v) => v === '' || /^[A-Z]{3}$/.test(v)
};

const listeners = new Set();
let current = null;

function load() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    saved = {};
  }

  const settings = { ...DEFAULTS };
  Object.keys(DEFAULTS).forEach((key) => {
    if (key in saved && VALID[key](saved[key])) settings[key] = saved[key];
  });
  return Object.freeze(settings);
}

export function getSettings() {
  if (!current) current = load();
  return current;
}

export const getSetting = (key) => getSettings()[key];

/** Applies the valid changes in `patch`. Returns true if anything changed. */
export function updateSettings(patch) {
  const next = { ...getSettings() };
  let changed = false;

  Object.entries(patch).forEach(([key, value]) => {
    if (!(key in DEFAULTS) || !VALID[key](value) || next[key] === value) return;
    next[key] = value;
    changed = true;
  });

  if (!changed) return false;

  current = Object.freeze(next);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* storage full or unavailable: the change still applies for this session */
  }
  listeners.forEach((fn) => fn(current));
  return true;
}

export function resetSettings() {
  current = Object.freeze({ ...DEFAULTS });
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn(current));
}

/** Calls fn(settings) after every change. Returns a function that stops listening. */
export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}