// js/services/api.js
// The ONLY file that calls external APIs. Other modules import from here.
const AVIATION_STACK_KEY = import.meta.env.VITE_AVIATION_STACK_KEY;
const WEATHER_API_KEY = import.meta.env.VITE_WEATHER_API_KEY;

/* ==========================================
   Errors
   ========================================== */

export class ApiError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = "ApiError";
    // "config" | "auth" | "quota" | "restricted" | "network" | "http" | "api"
    this.kind = kind;
  }
}

function mapAviationError(error) {
  const type = error.type || error.code;
  const info = error.info || error.message || String(type);

  switch (type) {
    case "usage_limit_reached":
    case "rate_limit_reached":
      return new ApiError("quota", "AviationStack request limit reached. Saved results will be used where available.");
    case "invalid_access_key":
    case "missing_access_key":
    case "inactive_user":
      return new ApiError("auth", "AviationStack rejected the API key. Check VITE_AVIATION_STACK_KEY in .env.");
    case "function_access_restricted":
    case "https_access_restricted":
      return new ApiError("restricted", "This AviationStack feature is not included in your plan.");
    default:
      return new ApiError("api", `AviationStack Error: ${info}`);
  }
}

/* ==========================================
   Cache + monthly request counter
   ========================================== */

const CACHE_MS = 10 * 60 * 1000;
const PREFIX = "aeropulse:api:v1:";

function storeGet(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function pruneCache() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX + "q:"))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

function storeSet(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full: clear old cached queries and try once more
    pruneCache();
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* give up */ }
  }
}

function cacheGet(key, { allowStale = false } = {}) {
  const entry = storeGet("q:" + key);
  if (!entry) return null;
  return allowStale || Date.now() - entry.t < CACHE_MS ? entry.data : null;
}

const currentMonth = () => new Date().toISOString().slice(0, 7);

function countRequest() {
  const key = "usage:" + currentMonth();
  storeSet(key, (storeGet(key) || 0) + 1);
}

/** AviationStack requests made from this browser this month (not your account-wide total) */
export function getApiUsage() {
  return { month: currentMonth(), requests: storeGet("usage:" + currentMonth()) || 0 };
}

/* ==========================================
   AviationStack (flights)
   ========================================== */

/** Keep only the fields the app uses, so cached results stay small */
function slimFlight(f) {
  const side = (s = {}) => ({
    iata: s.iata,
    airport: s.airport,
    terminal: s.terminal,
    gate: s.gate,
    delay: s.delay,
    scheduled: s.scheduled,
    estimated: s.estimated,
    actual: s.actual
  });

  return {
    flight_status: f.flight_status,
    flight: { iata: f.flight?.iata },
    airline: { name: f.airline?.name, iata: f.airline?.iata },
    aircraft: { iata: f.aircraft?.iata },
    departure: side(f.departure),
    arrival: side(f.arrival)
  };
}

/**
 * Single entry point for every flight request.
 * Returns the raw (slimmed) flight list. Cached for 10 minutes; if the API
 * hits its quota or the network fails, the last saved result is served instead.
 */
async function fetchFlights(params) {
  if (!AVIATION_STACK_KEY || AVIATION_STACK_KEY === "YOUR_AVIATIONSTACK_API_KEY") {
    throw new ApiError("config", "AviationStack API key is unconfigured in .env");
  }

  const cacheKey = new URLSearchParams(Object.entries(params).sort()).toString();
  const fresh = cacheGet(cacheKey);
  if (fresh) return fresh;

  try {
    const query = new URLSearchParams({ access_key: AVIATION_STACK_KEY, ...params });
    countRequest();

    let response;
    try {
      response = await fetch(`https://api.aviationstack.com/v1/flights?${query}`);
    } catch {
      throw new ApiError("network", "Could not reach AviationStack. Check your connection.");
    }

    let body = null;
    try { body = await response.json(); } catch { /* non-JSON response */ }

    if (body?.error) throw mapAviationError(body.error);
    if (!response.ok) {
      throw new ApiError("http", `AviationStack HTTP Error: ${response.status} ${response.statusText}`);
    }

    const flights = (Array.isArray(body?.data) ? body.data : []).map(slimFlight);
    storeSet("q:" + cacheKey, { t: Date.now(), data: flights });
    return flights;
  } catch (err) {
    if (err.kind === "quota" || err.kind === "network") {
      const stale = cacheGet(cacheKey, { allowStale: true });
      if (stale) return stale;
    }
    throw err;
  }
}

/** Raw matches for a flight number */
export const fetchFlightByNumber = (num) =>
  fetchFlights({ flight_iata: String(num).toUpperCase().replace(/\s+/g, "") });

/** Raw departures or arrivals for an airport */
export const fetchAirportFlights = (direction, iata) =>
  fetchFlights({
    [direction === "arrivals" ? "arr_iata" : "dep_iata"]: iata.toUpperCase(),
    limit: "100"
  });

/** Raw flights between two airports */
export const fetchRouteFlights = (fromIata, toIata) =>
  fetchFlights({ dep_iata: fromIata.toUpperCase(), arr_iata: toIata.toUpperCase(), limit: "100" });

/** Raw flights for an airline IATA code */
export const fetchAirlineFlights = (airlineIata) =>
  fetchFlights({ airline_iata: airlineIata.toUpperCase(), limit: "100" });

/* ==========================================
   WeatherAPI
   ========================================== */

/** Keep only the fields the app uses, so cached results stay small */
function slimWeather(d) {
  const cond = (c = {}) => ({ text: c.text, code: c.code });
  const c = d.current ?? {};

  return {
    location: {
      name: d.location?.name,
      region: d.location?.region,
      country: d.location?.country,
      localtime: d.location?.localtime
    },
    current: {
      temp_c: c.temp_c,
      temp_f: c.temp_f,
      feelslike_c: c.feelslike_c,
      is_day: c.is_day,
      condition: cond(c.condition),
      wind_kph: c.wind_kph,
      wind_degree: c.wind_degree,
      wind_dir: c.wind_dir,
      gust_kph: c.gust_kph,
      pressure_mb: c.pressure_mb,
      precip_mm: c.precip_mm,
      humidity: c.humidity,
      cloud: c.cloud,
      vis_km: c.vis_km,
      uv: c.uv
    },
    forecast: {
      forecastday: (d.forecast?.forecastday ?? []).map((day) => ({
        date: day.date,
        day: {
          maxtemp_c: day.day?.maxtemp_c,
          mintemp_c: day.day?.mintemp_c,
          maxwind_kph: day.day?.maxwind_kph,
          totalprecip_mm: day.day?.totalprecip_mm,
          daily_chance_of_rain: day.day?.daily_chance_of_rain,
          daily_chance_of_snow: day.day?.daily_chance_of_snow,
          condition: cond(day.day?.condition)
        },
        hour: (day.hour ?? []).map((h) => ({
          time: h.time,
          temp_c: h.temp_c,
          wind_kph: h.wind_kph,
          chance_of_rain: h.chance_of_rain,
          condition: cond(h.condition)
        }))
      }))
    },
    alerts: {
      alert: (d.alerts?.alert ?? []).map((a) => ({
        headline: a.headline,
        event: a.event,
        severity: a.severity,
        expires: a.expires,
        desc: (a.desc ?? "").slice(0, 400)
      }))
    }
  };
}

function mapWeatherError(error) {
  switch (error.code) {
    case 1006:
      return new ApiError("not_found", "WeatherAPI could not find that location.");
    case 1002:
    case 2006:
    case 2008:
      return new ApiError("auth", "WeatherAPI rejected the API key. Check VITE_WEATHER_API_KEY in .env.");
    case 2007:
      return new ApiError("quota", "WeatherAPI monthly limit reached. Saved results will be used where available.");
    case 2009:
      return new ApiError("restricted", "Your WeatherAPI plan does not include this data.");
    default:
      return new ApiError("api", `WeatherAPI Error: ${error.message}`);
  }
}

/**
 * Raw (slimmed) weather for a location: current conditions, 3-day forecast with hours, and alerts.
 * Accepts a city name, "iata:LOS", or a "lat,lon" string.
 * Cached for 10 minutes; served from the last saved result if the network or quota fails.
 */
export async function fetchWeatherData(query) {
  if (!WEATHER_API_KEY || WEATHER_API_KEY === "YOUR_WEATHERAPI_KEY") {
    throw new ApiError("config", "WeatherAPI key is unconfigured in .env");
  }

  const cacheKey = `wx:${query.trim().toLowerCase()}`;
  const fresh = cacheGet(cacheKey);
  if (fresh) return fresh;

  try {
    const params = new URLSearchParams({
      key: WEATHER_API_KEY,
      q: query,
      days: "3",
      aqi: "no",
      alerts: "yes"
    });

    let response;
    try {
      response = await fetch(`https://api.weatherapi.com/v1/forecast.json?${params}`);
    } catch {
      throw new ApiError("network", "Could not reach WeatherAPI. Check your connection.");
    }

    let body = null;
    try { body = await response.json(); } catch { /* non-JSON response */ }

    if (body?.error) throw mapWeatherError(body.error);
    if (!response.ok) {
      throw new ApiError("http", `WeatherAPI HTTP Error: ${response.status} ${response.statusText}`);
    }

    const data = slimWeather(body);
    storeSet("q:" + cacheKey, { t: Date.now(), data });
    return data;
  } catch (err) {
    if (err.kind === "quota" || err.kind === "network") {
      const stale = cacheGet(cacheKey, { allowStale: true });
      if (stale) return stale;
    }
    throw err;
  }
}

/* ==========================================
   Geolocation
   ========================================== */

export function getUserCoordinates() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        lat: position.coords.latitude,
        lon: position.coords.longitude
      }),
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error("Location permission was denied."));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new Error("Location information is unavailable."));
            break;
          case error.TIMEOUT:
            reject(new Error("Location request timed out."));
            break;
          default:
            reject(new Error(`Geolocation error: ${error.message}`));
        }
      }
    );
  });
}

export async function reverseGeocode(lat, lon) {
  const endpoint = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
  const response = await fetch(endpoint);

  if (!response.ok) throw new Error("Reverse geocoding service unavailable.");

  const data = await response.json();
  if (!data.countryName) throw new Error("Could not determine country from GPS coordinates.");

  return {
    city: data.city || data.locality || data.principalSubdivision,
    country: data.countryName,
    countryCode: data.countryCode,
    continent: data.continent
  };
}

/* ==========================================
   Nearest airport (OurAirports open dataset)
   ========================================== */

const AIRPORTS_CSV = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const AIRPORT_INDEX_KEY = "airport-index:v1";

function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** Compact index of [iata, lat, lon] for airports with scheduled commercial service */
async function loadAirportIndex() {
  try {
    const saved = localStorage.getItem(AIRPORT_INDEX_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }

  const res = await fetch(AIRPORTS_CSV);
  if (!res.ok) throw new Error("Airport database is unavailable right now.");

  const [headerLine, ...lines] = (await res.text()).split("\n");
  const col = Object.fromEntries(
    parseCsvLine(headerLine.trim()).map((name, i) => [name, i])
  );

  const index = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const r = parseCsvLine(line.trim());
    const iata = r[col.iata_code];
    if (!iata || r[col.scheduled_service] !== "yes" || r[col.type] === "closed") continue;
    index.push([iata, parseFloat(r[col.latitude_deg]), parseFloat(r[col.longitude_deg])]);
  }

  try { localStorage.setItem(AIRPORT_INDEX_KEY, JSON.stringify(index)); } catch { /* ignore */ }
  return index;
}

/** Nearest airport with commercial service, within 200 km */
export async function findNearestAirport(lat, lon) {
  const index = await loadAirportIndex();

  const [nearest] = index
    .map(([code, la, lo]) => ({ code, km: distanceKm(lat, lon, la, lo) }))
    .sort((a, b) => a.km - b.km);

  return nearest && nearest.km <= 200 ? nearest.code : null;
}