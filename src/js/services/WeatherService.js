// src/js/services/WeatherService.js
// Pure logic. No network calls, no API keys, no storage.
// Takes raw weather returned by api.js and prepares it for the UI.

// WeatherAPI condition codes
const THUNDER = [1087, 1273, 1276, 1279, 1282];
const FOG = [1135, 1147];
const FREEZING = [1069, 1072, 1168, 1171, 1198, 1201, 1204, 1207, 1237, 1249, 1252, 1261, 1264];
const SNOW = [1066, 1114, 1117, 1210, 1213, 1216, 1219, 1222, 1225, 1255, 1258];
const HEAVY_RAIN = [1192, 1195, 1243, 1246];

const LEVEL_RANK = { ok: 0, caution: 1, warning: 2 };

/** The most serious level in a list of hazards: "ok" | "caution" | "warning" */
export const worstLevel = (items) =>
  items.reduce((worst, i) => (LEVEL_RANK[i.level] > LEVEL_RANK[worst] ? i.level : worst), "ok");

/* ---------- Helpers ---------- */

/** A number, or null when the API left the field out */
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/** "2026-10-3 4:05" becomes "2026-10-03 04:05" so times compare correctly as text */
function padLocal(str = "") {
  const [d = "", t = ""] = str.split(" ");
  const [y, m, day] = d.split("-");
  const [h, min] = t.split(":");
  const p = (v) => String(v ?? 0).padStart(2, "0");
  return `${y}-${p(m)}-${p(day)} ${p(h)}:${p(min)}`;
}

const withUnit = (v, unit) => (v === null ? "—" : `${Math.round(v * 10) / 10}${unit}`);

/* ---------- Hazards ---------- */

/** Rules of thumb for planning, not official aviation limits */
export function assessHazards(w) {
  const out = [];
  const add = (level, label, detail) => out.push({ level, label, detail });
  const m = w.metrics;
  const code = w.conditionCode;

  if (m.visibilityKm !== null) {
    if (m.visibilityKm < 1.5) add("warning", "Very low visibility", `${m.visibilityKm} km`);
    else if (m.visibilityKm < 5) add("caution", "Reduced visibility", `${m.visibilityKm} km`);
  }

  if (m.gustKph !== null) {
    if (m.gustKph >= 74) add("warning", "Severe gusts", `${Math.round(m.gustKph)} km/h`);
    else if (m.gustKph >= 56) add("caution", "Strong gusts", `${Math.round(m.gustKph)} km/h`);
  }

  if (m.windKph !== null) {
    if (m.windKph >= 60) add("warning", "Very strong wind", `${Math.round(m.windKph)} km/h`);
    else if (m.windKph >= 40) add("caution", "Strong wind", `${Math.round(m.windKph)} km/h`);
  }

  if (THUNDER.includes(code) || /thunder/i.test(w.condition)) {
    add("warning", "Thunderstorm", w.condition);
  } else if (w.hourly.some((h) => THUNDER.includes(h.code))) {
    add("caution", "Thunderstorms expected", "within the next 8 hours");
  }

  if (FREEZING.includes(code)) add("warning", "Freezing precipitation", w.condition);
  else if (SNOW.includes(code)) add("caution", "Snow", w.condition);
  else if (HEAVY_RAIN.includes(code)) add("caution", "Heavy rain", w.condition);

  if (FOG.includes(code) && !out.some((h) => h.label.includes("visibility"))) {
    add("caution", "Fog", w.condition);
  }

  if (w.temp !== null && w.temp >= 38) add("caution", "Extreme heat", `${Math.round(w.temp)}°C`);
  if (w.temp !== null && w.temp <= -20) add("caution", "Extreme cold", `${Math.round(w.temp)}°C`);

  w.alerts.forEach((a) => {
    add(/severe|extreme/i.test(a.severity) ? "warning" : "caution", "Official alert", a.headline);
  });

  return out;
}

/* ---------- Normalizing ---------- */

/**
 * Turns raw weather from api.js into the shape the app uses.
 * tempC, tempF, humidity and windKph are display strings (the dashboard card uses them);
 * temp and metrics hold numbers (or null when the API left a field out).
 */
export function normalizeWeather(raw) {
  const loc = raw.location ?? {};
  const cur = raw.current ?? {};
  const cond = cur.condition ?? {};
  const days = raw.forecast?.forecastday ?? [];

  const metrics = {
    windKph: num(cur.wind_kph),
    windDir: cur.wind_dir || "",
    gustKph: num(cur.gust_kph),
    visibilityKm: num(cur.vis_km),
    pressureMb: num(cur.pressure_mb),
    humidity: num(cur.humidity),
    cloud: num(cur.cloud),
    precipMm: num(cur.precip_mm),
    uv: num(cur.uv)
  };

  const now = padLocal(loc.localtime);
  const hourly = days
    .flatMap((d) => d.hour ?? [])
    .filter((h) => padLocal(h.time) > now)
    .slice(0, 8)
    .map((h) => ({
      time: padLocal(h.time).slice(11),
      tempC: num(h.temp_c),
      code: h.condition?.code ?? null,
      condition: h.condition?.text || "",
      rainChance: num(h.chance_of_rain),
      windKph: num(h.wind_kph)
    }));

  const forecast = days.map((d) => ({
    date: d.date,
    condition: d.day?.condition?.text || "—",
    maxC: num(d.day?.maxtemp_c),
    minC: num(d.day?.mintemp_c),
    rainChance: num(d.day?.daily_chance_of_rain),
    snowChance: num(d.day?.daily_chance_of_snow),
    maxWindKph: num(d.day?.maxwind_kph),
    precipMm: num(d.day?.totalprecip_mm)
  }));

  const alerts = (raw.alerts?.alert ?? []).map((a) => ({
    headline: a.headline || a.event || "Weather alert",
    severity: a.severity || "",
    expires: a.expires || null,
    desc: a.desc || ""
  }));

  const temp = num(cur.temp_c);

  const weather = {
    location: loc.name || "Unknown location",
    region: loc.region || "",
    country: loc.country || "",
    localClock: loc.localtime ? padLocal(loc.localtime).slice(11) : null,
    condition: cond.text || "Unknown",
    conditionCode: cond.code ?? null,
    isDay: cur.is_day === 1,

    temp,
    tempC: temp === null ? "--°C" : `${Math.round(temp)}°C`,
    tempF: num(cur.temp_f) === null ? "--°F" : `${Math.round(cur.temp_f)}°F`,
    feelsLikeC: num(cur.feelslike_c) === null ? "—" : `${Math.round(cur.feelslike_c)}°C`,
    humidity: metrics.humidity === null ? "—" : `${metrics.humidity}%`,
    windKph: metrics.windKph === null ? "—" : `${metrics.windKph} km/h`,

    metrics,
    forecast,
    hourly,
    alerts
  };

  weather.hazards = assessHazards(weather);
  weather.hazardLevel = worstLevel(weather.hazards);
  return weather;
}

/** Label/value pairs for the metrics tiles on the Weather page */
export function metricTiles(w) {
  const m = w.metrics;
  return [
    ["Wind", m.windKph === null ? "—" : `${Math.round(m.windKph)} km/h ${m.windDir}`.trim()],
    ["Gusts", withUnit(m.gustKph === null ? null : Math.round(m.gustKph), " km/h")],
    ["Visibility", withUnit(m.visibilityKm, " km")],
    ["Pressure", withUnit(m.pressureMb, " hPa")],
    ["Humidity", withUnit(m.humidity, "%")],
    ["Cloud cover", withUnit(m.cloud, "%")],
    ["Precipitation", withUnit(m.precipMm, " mm")],
    ["UV index", withUnit(m.uv, "")]
  ];
}