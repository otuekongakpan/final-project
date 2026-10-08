
import { formatDistance, formatTemp, formatWind } from './format.js';

const THUNDER = [1087, 1273, 1276, 1279, 1282];
const FOG = [1135, 1147];
const FREEZING = [1069, 1072, 1168, 1171, 1198, 1201, 1204, 1207, 1237, 1249, 1252, 1261, 1264];
const SNOW = [1066, 1114, 1117, 1210, 1213, 1216, 1219, 1222, 1225, 1255, 1258];
const HEAVY_RAIN = [1192, 1195, 1243, 1246];

const LEVEL_RANK = { ok: 0, caution: 1, warning: 2 };

export const worstLevel = (items) =>
  items.reduce((worst, i) => (LEVEL_RANK[i.level] > LEVEL_RANK[worst] ? i.level : worst), "ok");

/* ---------- Helpers ---------- */
const num = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

function padLocal(str = "") {
  const [d = "", t = ""] = str.split(" ");
  const [y, m, day] = d.split("-");
  const [h, min] = t.split(":");
  const p = (v) => String(v ?? 0).padStart(2, "0");
  return `${y}-${p(m)}-${p(day)} ${p(h)}:${p(min)}`;
}

const withUnit = (v, unit) => (v === null ? "—" : `${Math.round(v * 10) / 10}${unit}`);

/* ---------- Hazards ---------- */
export function assessHazards(w) {
  const out = [];
  const add = (level, label, detail, extra = {}) => out.push({ level, label, detail, ...extra });
  const m = w.metrics;
  const code = w.conditionCode;

  if (m.visibilityKm !== null) {
    const extra = { measure: "distance", value: m.visibilityKm };
    if (m.visibilityKm < 1.5) add("warning", "Very low visibility", `${m.visibilityKm} km`, extra);
    else if (m.visibilityKm < 5) add("caution", "Reduced visibility", `${m.visibilityKm} km`, extra);
  }

  if (m.gustKph !== null) {
    const extra = { measure: "speed", value: m.gustKph };
    if (m.gustKph >= 74) add("warning", "Severe gusts", `${Math.round(m.gustKph)} km/h`, extra);
    else if (m.gustKph >= 56) add("caution", "Strong gusts", `${Math.round(m.gustKph)} km/h`, extra);
  }

  if (m.windKph !== null) {
    const extra = { measure: "speed", value: m.windKph };
    if (m.windKph >= 60) add("warning", "Very strong wind", `${Math.round(m.windKph)} km/h`, extra);
    else if (m.windKph >= 40) add("caution", "Strong wind", `${Math.round(m.windKph)} km/h`, extra);
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

  if (w.temp !== null && w.temp >= 38) add("caution", "Extreme heat", `${Math.round(w.temp)}°C`, { measure: "temp", value: w.temp });
  if (w.temp !== null && w.temp <= -20) add("caution", "Extreme cold", `${Math.round(w.temp)}°C`, { measure: "temp", value: w.temp });

  w.alerts.forEach((a) => {
    add(/severe|extreme/i.test(a.severity) ? "warning" : "caution", "Official alert", a.headline);
  });

  return out;
}

export function hazardDetail(hazard) {
  switch (hazard.measure) {
    case "distance": return formatDistance(hazard.value);
    case "speed": return formatWind(hazard.value);
    case "temp": return formatTemp(hazard.value);
    default: return hazard.detail;
  }
}

/* ---------- Normalizing ---------- */
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
  const feelsLike = num(cur.feelslike_c);

  const weather = {
    location: loc.name || "Unknown location",
    region: loc.region || "",
    country: loc.country || "",
    localClock: loc.localtime ? padLocal(loc.localtime).slice(11) : null,
    condition: cond.text || "Unknown",
    conditionCode: cond.code ?? null,
    isDay: cur.is_day === 1,

    temp,
    feelsLike,
    tempC: temp === null ? "--°C" : `${Math.round(temp)}°C`,
    tempF: num(cur.temp_f) === null ? "--°F" : `${Math.round(cur.temp_f)}°F`,
    feelsLikeC: feelsLike === null ? "—" : `${Math.round(feelsLike)}°C`,
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

export function metricTiles(w) {
  const m = w.metrics;
  return [
    ["Wind", m.windKph === null ? "—" : `${formatWind(m.windKph)} ${m.windDir}`.trim()],
    ["Gusts", formatWind(m.gustKph)],
    ["Visibility", formatDistance(m.visibilityKm)],
    ["Pressure", withUnit(m.pressureMb, " hPa")],
    ["Humidity", withUnit(m.humidity, "%")],
    ["Cloud cover", withUnit(m.cloud, "%")],
    ["Precipitation", withUnit(m.precipMm, " mm")],
    ["UV index", withUnit(m.uv, "")]
  ];
}