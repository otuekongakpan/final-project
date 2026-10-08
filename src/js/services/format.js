
import { getSettings } from './SettingsService.js';

const WIND_FACTOR = { kph: 1, mph: 0.621371, kn: 0.539957 };
const WIND_LABEL = { kph: 'km/h', mph: 'mph', kn: 'kn' };
const KM_TO_MILES = 0.621371;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const useFahrenheit = () => getSettings().tempUnit === 'f';

/* ---------- Temperature ---------- */

export const tempUnitLabel = () => (useFahrenheit() ? '°F' : '°C');
export const toTemp = (c) => (useFahrenheit() ? (c * 9) / 5 + 32 : c);

export const formatTemp = (c) => (isNum(c) ? `${Math.round(toTemp(c))}${tempUnitLabel()}` : '--');

export const formatDegrees = (c) => (isNum(c) ? `${Math.round(toTemp(c))}°` : '—');

export const formatTempDelta = (c) => `${Math.round(useFahrenheit() ? (c * 9) / 5 : c)}°`;

/* ---------- Wind ---------- */

export const windUnitLabel = () => WIND_LABEL[getSettings().windUnit];
export const toWind = (kph) => kph * WIND_FACTOR[getSettings().windUnit];
export const formatWind = (kph) => (isNum(kph) ? `${Math.round(toWind(kph))} ${windUnitLabel()}` : '—');

/* ---------- Distance ---------- */

export function formatDistance(km) {
  if (!isNum(km)) return '—';
  const miles = getSettings().distanceUnit === 'mi';
  const value = miles ? km * KM_TO_MILES : km;
  return `${Math.round(value * 10) / 10} ${miles ? 'mi' : 'km'}`;
}

/* ---------- Time of day ---------- */

export function formatClock(value) {
  if (!value) return '--:--';
  const hhmm = value.length > 5 ? value.slice(11, 16) : value;
  if (getSettings().timeFormat !== '12h') return hhmm;

  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}