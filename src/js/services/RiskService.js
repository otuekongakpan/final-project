
import { formatClock, toWind, windUnitLabel } from './format.js';

export const FLOOR = 0.7;

export const FACTORS = [
  {
    id: 'flight',
    label: 'Flight status and delay',
    weight: 0.3,
    how: 'Cancelled, diverted or incident = 100. Otherwise scaled by delay minutes: 15 min = 25, 45 min = 60, 2 hours or more = 100. Needs delay data.'
  },
  {
    id: 'origin',
    label: 'Origin weather',
    weight: 0.25,
    how: 'Hazards flagged at the departure airport (visibility, wind, storms, snow, official alerts). The worst hazard scores 75 if it is a warning or 40 if it is a caution, and each extra hazard adds 10.'
  },
  {
    id: 'destination',
    label: 'Destination weather',
    weight: 0.25,
    how: 'The same hazard scoring, for the arrival airport.'
  },
  {
    id: 'airport',
    label: 'Airport congestion',
    weight: 0.2,
    how: 'Share of flights on the airport board that are delayed (15+ min) or cancelled: 0% = 0, 50% or more = 100. Needs at least 5 flights, and the board must be for this flight\'s origin or destination.'
  }
];

export const BANDS = [
  { level: 'Low', from: 0, to: 24 },
  { level: 'Moderate', from: 25, to: 49 },
  { level: 'High', from: 50, to: 74 },
  { level: 'Severe', from: 75, to: 100 }
];

export const OUTLOOK = {
  rain: { label: 'Rain chance', unit: '%', threshold: 60, field: 'rainChance', fixedMax: 100 },
  wind: { label: 'Wind', unit: ' km/h', threshold: 40, field: 'windKph', fixedMax: null }
};

const DELAY_SCALE = [[0, 0], [15, 25], [45, 60], [120, 100]];
const DELAYED_MIN = 15;
const MIN_BOARD = 5;
const KNOWN_STATUS = ['scheduled', 'active', 'landed'];
const HAZARD_RANK = { warning: 2, caution: 1, ok: 0 };

const PROBLEM_STATUS = {
  cancelled: 'Flight is cancelled',
  diverted: 'Flight was diverted',
  incident: 'An incident was reported for this flight'
};

const VERDICTS = {
  Low: 'Conditions look normal for this flight.',
  Moderate: 'Some factors could cause minor disruption.',
  High: 'Disruption is likely. Check with the airline before leaving.',
  Severe: 'Serious disruption risk. Check with the airline before leaving.'
};

/* ---------- Helpers ---------- */

export function bandFor(score) {
  if (score === null || score === undefined) return null;
  return [...BANDS].reverse().find((b) => score >= b.from) ?? BANDS[0];
}

export function delayToScore(minutes) {
  if (minutes <= 0) return 0;
  for (let i = 1; i < DELAY_SCALE.length; i++) {
    const [m0, s0] = DELAY_SCALE[i - 1];
    const [m1, s1] = DELAY_SCALE[i];
    if (minutes <= m1) return Math.round(s0 + ((minutes - m0) / (m1 - m0)) * (s1 - s0));
  }
  return 100;
}

export function delayMinutes(side) {
  if (!side) return null;
  if (side.delay > 0) return side.delay;

  const planned = Date.parse(side.scheduled);
  const expected = Date.parse(side.actual || side.estimated);
  if (Number.isNaN(planned) || Number.isNaN(expected)) return null;
  return Math.max(0, Math.round((expected - planned) / 60000));
}

const info = (id) => FACTORS.find((f) => f.id === id);
const missing = (id, reason) => ({ ...info(id), available: false, score: null, reason });
const scored = (id, score, reason) => ({ ...info(id), available: true, score, reason });

/* ---------- Factors ---------- */

function flightFactor(flight) {
  if (PROBLEM_STATUS[flight.status]) return scored('flight', 100, PROBLEM_STATUS[flight.status]);

  const delays = [delayMinutes(flight.origin), delayMinutes(flight.destination)].filter((d) => d !== null);
  if (!delays.length) return missing('flight', 'No delay data reported for this flight');

  const worst = Math.max(...delays);
  return scored('flight', delayToScore(worst), worst > 0 ? `${worst} min delay reported` : 'No delay reported');
}

function weatherFactor(id, weather, code) {
  const place = id === 'origin' ? 'origin' : 'destination';
  if (!weather) return missing(id, `No weather data for the ${place} airport`);

  const hazards = [...(weather.hazards ?? [])].sort((a, b) => HAZARD_RANK[b.level] - HAZARD_RANK[a.level]);
  if (!hazards.length) return scored(id, 0, `No significant weather hazards at ${code}`);

  const top = hazards[0];
  const score = Math.min(100, (top.level === 'warning' ? 75 : 40) + 10 * (hazards.length - 1));
  const more = hazards.length > 1 ? ` and ${hazards.length - 1} more` : '';
  return scored(id, score, `${top.label} at ${code}${more}`);
}

export function airportStats(flights, airport) {
  const counts = { ontime: 0, active: 0, landed: 0, delayed: 0, cancelled: 0 };
  let delayKnown = 0;

  flights.forEach((f) => {
    if (PROBLEM_STATUS[f.status]) {
      counts.cancelled += 1;
      return;
    }
    if (!KNOWN_STATUS.includes(f.status)) return;

    const side = f.origin.code === airport ? f.origin : f.destination;
    const delay = delayMinutes(side);
    if (delay !== null) delayKnown += 1;

    if (delay !== null && delay >= DELAYED_MIN) counts.delayed += 1;
    else if (f.status === 'active') counts.active += 1;
    else if (f.status === 'landed') counts.landed += 1;
    else counts.ontime += 1;
  });

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return { total, counts, delayKnown };
}

function airportFactor(flight, airport, airportFlights) {
  if (!airport) return missing('airport', 'No airport board is loaded');
  if (flight.origin.code !== airport && flight.destination.code !== airport) {
    return missing('airport', `The loaded board (${airport}) is not this flight's origin or destination`);
  }

  const stats = airportStats(airportFlights, airport);
  if (stats.total < MIN_BOARD) return missing('airport', `Too few flights on the ${airport} board (${stats.total})`);

  const share = (stats.counts.delayed + stats.counts.cancelled) / stats.total;
  const score = Math.min(100, Math.round(share * 200));
  return scored('airport', score, `${Math.round(share * 100)}% of ${stats.total} flights at ${airport} are delayed or cancelled`);
}

/* ---------- The score ---------- */

export function analyzeRisk({ flight, originWeather = null, destinationWeather = null, airportFlights = [], airport = null }) {
  const factors = [
    flightFactor(flight),
    weatherFactor('origin', originWeather, flight.origin.code),
    weatherFactor('destination', destinationWeather, flight.destination.code),
    airportFactor(flight, airport, airportFlights)
  ];

  const used = factors.filter((f) => f.available);
  factors.forEach((f) => {
    f.level = f.available ? bandFor(f.score).level : null;
    f.points = 0;
  });

  if (!used.length) {
    return {
      score: null, level: 'No data', average: null, worst: null, floorScore: null, floored: false,
      used: 0, total: factors.length, factors, reasons: [],
      headline: 'Not enough data to score this flight', verdict: ''
    };
  }

  const weightSum = used.reduce((sum, f) => sum + f.weight, 0);
  used.forEach((f) => { f.points = (f.score * f.weight) / weightSum; });

  const average = used.reduce((sum, f) => sum + f.points, 0);
  const worst = Math.max(...used.map((f) => f.score));
  const floorScore = worst * FLOOR;
  const score = Math.round(Math.max(average, floorScore));
  const level = bandFor(score).level;

  const reasons = used
    .filter((f) => f.score >= 25)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((f) => f.reason);

  return {
    score,
    level,
    average,
    worst,
    floorScore,
    floored: floorScore - average >= 0.5,
    used: used.length,
    total: factors.length,
    factors,
    reasons,
    headline: reasons[0] ?? 'No significant risk factors found',
    verdict: VERDICTS[level]
  };
}

export function riskForState(state) {
  if (!state?.flight) return null;
  return analyzeRisk({
    flight: state.flight,
    originWeather: state.flightWeather?.origin ?? null,
    destinationWeather: state.flightWeather?.destination ?? null,
    airportFlights: state.airportFlights ?? [],
    airport: state.airport ?? null
  });
}

/* ---------- Weather outlook (next hours at both airports) ---------- */

export function outlookData({ flight, originWeather, destinationWeather, metric = 'rain' }) {
  const cfg = OUTLOOK[metric];
  const defs = [
    { id: 'origin', weather: originWeather, code: flight?.origin?.code ?? 'Origin' },
    { id: 'destination', weather: destinationWeather, code: flight?.destination?.code ?? 'Destination' }
  ].filter((d) => d.weather?.hourly?.length);

  if (!defs.length) return null;

  const count = Math.max(...defs.map((d) => d.weather.hourly.length));
  const labels = Array.from({ length: count }, (_, i) => `+${i + 1}h`);

  const isWind = metric === 'wind';
  const convert = isWind ? (v) => Math.round(toWind(v)) : (v) => v;
  const unit = isWind ? ` ${windUnitLabel()}` : cfg.unit;
  const threshold = convert(cfg.threshold);

  const series = defs.map((d) => ({
    id: d.id,
    name: `${d.code} (${d.id})`,
    values: labels.map((_, i) => {
      const value = d.weather.hourly[i]?.[cfg.field];
      return value === null || value === undefined ? null : convert(value);
    }),
    titles: labels.map((_, i) => {
      const hour = d.weather.hourly[i];
      if (!hour) return '';
      const value = hour[cfg.field];
      return `${d.code} at ${formatClock(hour.time)} local: ${value === null || value === undefined ? '--' : convert(value)}${unit}, ${hour.condition}`;
    })
  }));

  const peak = Math.max(0, ...series.flatMap((s) => s.values.filter((v) => v !== null)));
  const rawMax = cfg.fixedMax ?? Math.max(convert(60), peak + 10);
  const step = rawMax > 100 ? 40 : 20;
  const yMax = Math.ceil(rawMax / step) * step;
  const ticks = [];
  for (let v = 0; v <= yMax; v += step) ticks.push(v);

  return { labels, series, yMax, ticks, threshold, unit, label: cfg.label };
}