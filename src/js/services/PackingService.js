
import { formatTemp, formatTempDelta, formatWind } from './format.js';

const STORAGE_KEY = 'aeropulse:packing:v1';
const MAX_LISTS = 10;

const GROUPS = [
  { id: 'clothing', title: 'Clothing' },
  { id: 'gear', title: 'Gear and protection' },
  { id: 'carry', title: 'Keep in your carry-on' }
];

const TIPS = [
  [/thunder/i, 'Storms can delay flights. Check your flight status before leaving for the airport.'],
  [/visibility|fog/i, 'Low visibility can cause delays. Leave extra time for the airport.'],
  [/snow|freezing/i, 'Snow and ice can slow transport and delay departures. Allow extra time.'],
  [/gust|wind/i, 'Strong wind can make landings bumpy and cause delays.'],
  [/heavy rain/i, 'Heavy rain can slow traffic to the airport. Allow extra time.'],
  [/heat/i, 'Drink water regularly and keep electronics out of direct heat.'],
  [/cold/i, 'Extreme cold can slow ground transport. Allow extra time.'],
  [/official alert/i, 'There is an official weather alert. Check the Weather page for details.']
];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const round = (v) => Math.round(v);

/* ---------- Reading the weather ---------- */

export function weatherProfile(weather) {
  const days = weather?.forecast ?? [];
  const temps = [weather?.temp, ...days.flatMap((d) => [d.maxC, d.minC])].filter(isNum);
  if (!temps.length) return null;

  const m = weather.metrics ?? {};
  const conditions = [weather.condition, ...days.map((d) => d.condition)].join(' ');

  const minC = Math.min(...temps);
  const maxC = Math.max(...temps);
  const avg = (minC + maxC) / 2;

  const rainChance = Math.max(0, ...days.map((d) => d.rainChance ?? 0));
  const snowChance = Math.max(0, ...days.map((d) => d.snowChance ?? 0));
  const precipMm = Math.max(m.precipMm ?? 0, ...days.map((d) => d.precipMm ?? 0));
  const windKph = Math.max(m.windKph ?? 0, ...days.map((d) => d.maxWindKph ?? 0));

  const snow = snowChance >= 30 || (snowChance >= 15 && /snow|sleet|blizzard|ice pellets/i.test(conditions));
  const rain = !snow && (rainChance >= 50 || precipMm >= 2 || (rainChance >= 30 && /rain|drizzle|shower|thunder/i.test(conditions)));

  return {
    minC,
    maxC,
    tempWord: avg < 5 ? 'Cold' : avg < 15 ? 'Cool' : avg < 25 ? 'Mild' : avg < 30 ? 'Warm' : 'Hot',
    rainChance,
    snow,
    rain,
    heavyRain: rain && (rainChance >= 70 || precipMm >= 8),
    windKph,
    sun: (m.uv ?? 0) >= 6 || maxC >= 30,
    humid: (m.humidity ?? 0) >= 80 && maxC >= 26,
    humidity: m.humidity ?? null,
    days: days.length
  };
}

/* ---------- The packing rules ---------- */

function buildItems(p, target) {
  const { weather, origin } = target;
  const items = [];
  const add = (group, id, label, short, why, priority = 2) => items.push({ group, id, label, short, why, priority });

  const range = `${formatTemp(p.minC)} to ${formatTemp(p.maxC)}`;
  const hasCoat = p.minC < 15;

  if (p.maxC >= 30) add('clothing', 'base', 'Lightweight, breathable clothes', 'Light clothes', `Highs up to ${formatTemp(p.maxC)}`, 1);
  else if (p.maxC >= 24) add('clothing', 'base', 'Light clothes (cotton or linen)', 'Light clothes', `Highs up to ${formatTemp(p.maxC)}`, 1);
  else if (p.maxC >= 15) add('clothing', 'base', 'Light layers (T-shirts and a long-sleeve top)', 'Light layers', `Temperatures of ${range}`, 1);
  else if (p.maxC >= 5) add('clothing', 'base', 'Warm layers (sweaters and long trousers)', 'Warm layers', `Temperatures of ${range}`, 1);
  else add('clothing', 'base', 'Thermal base layers and sweaters', 'Thermal layers', `Temperatures of ${range}`, 1);

  if (p.minC < 0) add('clothing', 'coat', 'Insulated winter coat', 'Winter coat', `Lows of ${formatTemp(p.minC)}`, 1);
  else if (p.minC < 8) add('clothing', 'coat', 'Warm coat', 'Warm coat', `Lows of ${formatTemp(p.minC)}`, 1);
  else if (p.minC < 15) add('clothing', 'coat', 'Jacket', 'Jacket', `Lows of ${formatTemp(p.minC)}`, 1);
  else if (p.minC < 19 && p.maxC - p.minC >= 8) add('clothing', 'coat', 'Light jacket for the evenings', 'Light jacket', `Evenings drop to ${formatTemp(p.minC)}`);

  if (p.minC < 3) add('clothing', 'warm-accessories', 'Gloves, hat and scarf', 'Gloves and hat', `Lows of ${formatTemp(p.minC)}`, 1);

  if (p.rain && p.minC < 22) add('clothing', 'rain-jacket', 'Waterproof jacket', 'Rain jacket', `Up to ${p.rainChance}% chance of rain`, 1);
  if (p.windKph >= 40 && !hasCoat && !(p.rain && p.minC < 22)) {
    add('clothing', 'windproof', 'Windproof layer', 'Windproof layer', `Wind up to ${formatWind(p.windKph)}`);
  }
  if (p.humid) add('clothing', 'quick-dry', 'Quick-dry, breathable fabrics', 'Breathable fabrics', `${p.humidity}% humidity in the heat`);

  if (p.snow) add('clothing', 'shoes', 'Waterproof boots with good grip', 'Waterproof boots', 'Snow expected', 1);
  else if (p.heavyRain) add('clothing', 'shoes', 'Water-resistant shoes', 'Water-resistant shoes', `Up to ${p.rainChance}% chance of rain`);
  else add('clothing', 'shoes', 'Comfortable walking shoes', 'Walking shoes', 'For the airport and getting around');

  if (p.sun) add('clothing', 'sun-hat', 'Sun hat or cap', 'Sun hat', `Highs up to ${formatTemp(p.maxC)} with strong sun`);

  if (p.rain) add('gear', 'umbrella', 'Compact umbrella', 'Umbrella', `Up to ${p.rainChance}% chance of rain`, 1);
  if (p.sun) {
    add('gear', 'sunscreen', 'Sunscreen', 'Sunscreen', 'Strong sun expected', 1);
    add('gear', 'sunglasses', 'Sunglasses', 'Sunglasses', 'Strong sun expected');
  }
  if (p.maxC >= 28) add('gear', 'water-bottle', 'Reusable water bottle', 'Water bottle', 'Stay hydrated in the heat');

  add('carry', 'documents', 'Passport or ID and your boarding pass', 'Documents', 'Keep them where you can reach them', 1);
  add('carry', 'charger', 'Phone charger and power bank', 'Charger', 'Power banks must travel in the cabin, not in checked luggage', 1);

  const arrivalTemp = weather.temp;
  const drop = isNum(origin?.temp) && isNum(arrivalTemp) ? origin.temp - arrivalTemp : 0;
  if (isNum(arrivalTemp) && (arrivalTemp < 12 || drop >= 10)) {
    const why = drop >= 10 ? `${formatTempDelta(drop)} colder than where you start` : `${formatTemp(arrivalTemp)} on arrival`;
    add('carry', 'layer-handy', 'A warm layer within reach', 'Warm layer', why, 1);
  }

  const arrivalRain = p.rain && ((weather.forecast?.[0]?.rainChance ?? 0) >= 40 || (weather.metrics?.precipMm ?? 0) > 0);
  if (arrivalRain) add('carry', 'rain-handy', 'Umbrella or rain jacket within reach', 'Rain cover', 'Rain is likely when you arrive', 1);

  return items.sort((a, b) => a.priority - b.priority);
}

function buildTips(target) {
  const tips = [];

  const collect = (weather, onlyWarnings) => {
    (weather?.hazards ?? [])
      .filter((h) => !onlyWarnings || h.level === 'warning')
      .forEach((h) => {
        const match = TIPS.find(([pattern]) => pattern.test(h.label));
        if (match) tips.push(`${weather.location}: ${match[1]}`);
      });
  };

  collect(target.weather, false);
  collect(target.origin, true);
  return [...new Set(tips)].slice(0, 5);
}

/* ---------- What to pack for the current state ---------- */
function packingTarget(state) {
  if (!state) return null;

  if (state.weatherContext === 'location' && state.weather) {
    return { weather: state.weather, origin: null, label: state.weatherLabel || state.weather.location, kind: 'place' };
  }

  const destination = state.flightWeather?.destination;
  if (state.flight && destination) {
    return { weather: destination, origin: state.flightWeather?.origin ?? null, label: state.flight.destination.code, kind: 'flight' };
  }
  return null;
}

export function packingForState(state) {
  const target = packingTarget(state);
  const profile = target && weatherProfile(target.weather);
  if (!profile) return null;

  const items = buildItems(profile, target);
  const extras = [];
  if (profile.snow) extras.push('snowy');
  else if (profile.rain) extras.push('rainy');
  if (profile.windKph >= 40) extras.push('windy');
  if (profile.sun) extras.push('sunny');

  const place = [target.weather.location, target.weather.country].filter(Boolean).join(', ');
  const forecastText = profile.days ? `the ${profile.days}-day forecast` : 'the current conditions';

  return {
    key: `${target.label}|${target.weather.forecast?.[0]?.date ?? ''}`,
    label: target.label,
    kind: target.kind,
    tempWord: profile.tempWord,
    headline: `Pack for ${[profile.tempWord.toLowerCase(), ...extras].join(', ')} weather`,
    basis: `Based on the current conditions and ${forecastText} for ${place}.`,
    facts: [
      ['Temperature', `${formatTemp(profile.minC)} to ${formatTemp(profile.maxC)}`],
      ['Rain', profile.rainChance > 0 ? `Up to ${profile.rainChance}% chance` : 'Unlikely'],
      ['Wind', `Up to ${formatWind(profile.windKph)}`],
      ['Humidity', profile.humidity === null ? '--' : `${profile.humidity}%`]
    ],
    items,
    groups: GROUPS.map((g) => ({ ...g, items: items.filter((i) => i.group === g.id) })).filter((g) => g.items.length),
    tips: buildTips(target),
    keyItems: items.filter((i) => i.priority === 1 && i.group !== 'carry').slice(0, 2).map((i) => i.short)
  };
}

function read() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function write(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
  }
}

export const getChecked = (key) => read()[key] ?? [];

export function toggleChecked(key, id) {
  const data = read();
  const packed = new Set(data[key] ?? []);
  if (packed.has(id)) packed.delete(id);
  else packed.add(id);

  delete data[key];
  data[key] = [...packed];

  const keys = Object.keys(data);
  keys.slice(0, Math.max(0, keys.length - MAX_LISTS)).forEach((k) => delete data[k]);

  write(data);
  return packed.has(id);
}

export function clearChecked(key) {
  const data = read();
  delete data[key];
  write(data);
}