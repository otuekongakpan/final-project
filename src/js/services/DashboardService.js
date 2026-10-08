
import {
  fetchAirlineFlights,
  fetchAirportFlights,
  fetchFlightByNumber,
  fetchRouteFlights,
  fetchWeatherData,
  findNearestAirport,
  getUserCoordinates,
  reverseGeocode
} from './api.js';
import { buildBoard, detectQuery, normalizeFlights, sortByStatus, sortRoute } from './FlightService.js';
import { normalizeWeather } from './WeatherService.js';
import { applyFresh, getWatchlist, keyFor } from './WatchlistService.js';
import { getSetting } from './SettingsService.js';

const MAX_RESULTS = 30;
const FINAL_STATUS = ['landed', 'cancelled', 'diverted', 'incident'];

let cachedState = {
  userLocation: null,
  airport: null,
  active: [],
  departures: [],
  arrivals: [],
  airportFlights: [],     
  flight: null,
  weather: null,          
  destinationWeather: null, 
  flightWeather: { origin: null, destination: null }, 
  weatherContext: 'flight', 
  weatherLabel: null,     
  weatherError: null,    
  query: null,              
  results: [],           
  lastUpdated: null
};

/* ---------- Weather ---------- */
const getWeather = async (query) => normalizeWeather(await fetchWeatherData(query));

function weatherQueryFor(flight, airport) {
  if (flight && flight.origin.code !== "N/A") return `iata:${flight.origin.code}`;
  return `iata:${airport}`;
}

function destinationQueryFor(flight) {
  return flight && flight.destination.code !== "N/A" ? `iata:${flight.destination.code}` : null;
}

async function loadFlightWeather(flight, airport) {
  const destQuery = destinationQueryFor(flight);

  const [origin, dest] = await Promise.allSettled([
    getWeather(weatherQueryFor(flight, airport)),
    destQuery ? getWeather(destQuery) : Promise.resolve(null)
  ]);

  cachedState.weatherContext = 'flight';
  cachedState.weatherLabel = null;
  cachedState.weather = origin.status === 'fulfilled' ? origin.value : null;
  cachedState.destinationWeather = dest.status === 'fulfilled' ? dest.value : null;
  cachedState.flightWeather = {
    origin: cachedState.weather,
    destination: cachedState.destinationWeather
  };

  const failure = [origin, dest].find((r) => r.status === 'rejected');
  cachedState.weatherError = failure ? failure.reason.message : null;
  if (failure) console.warn("WeatherAPI Notice:", failure.reason.message);
}

async function loadLocationWeather(query, label, { strict = false } = {}) {
  let weather = null;
  let error = null;

  try {
    weather = await getWeather(query);
  } catch (e) {
    if (strict) throw e;
    error = e.message;
    console.warn("WeatherAPI Notice:", e.message);
  }

  cachedState.weather = weather;
  cachedState.destinationWeather = null;
  cachedState.weatherContext = 'location';
  cachedState.weatherLabel = label;
  cachedState.weatherError = error;
}

/* ---------- Airport boards ---------- */
export async function loadAirportBoard(iata) {
  const code = iata.toUpperCase();

  const [dep, arr] = await Promise.allSettled([
    fetchAirportFlights("departures", code),
    fetchAirportFlights("arrivals", code)
  ]);

  if (dep.status === "rejected" && arr.status === "rejected") throw dep.reason;

  const rawDep = dep.status === "fulfilled" ? dep.value : [];
  const rawArr = arr.status === "fulfilled" ? arr.value : [];

  const allDep = buildBoard(rawDep, "departures");
  const allArr = buildBoard(rawArr, "arrivals");

  const seen = new Set();
  cachedState.airport = code;
  cachedState.departures = allDep.slice(0, 10);
  cachedState.arrivals = allArr.slice(0, 10);
  cachedState.active = [...allDep, ...allArr]
    .filter((f) => f.status === "active" && !seen.has(f.flightNumber) && seen.add(f.flightNumber))
    .slice(0, 10);

  const keys = new Set();
  cachedState.airportFlights = normalizeFlights([...rawDep, ...rawArr]).filter((f) => {
    const id = `${f.flightNumber}|${f.origin.scheduled}`;
    if (f.flightNumber === "N/A" || keys.has(id)) return false;
    keys.add(id);
    return true;
  });

  // Featured flight: first airborne flight at this airport, else the next departure
  cachedState.flight =
    cachedState.active[0] || cachedState.departures[0] || cachedState.arrivals[0] || null;

  return cachedState;
}

export async function initGeoDashboard(onProgress = () => {}) {
  let airport = getSetting('startAirport');

  if (!airport) {
    onProgress("Waiting for your location...");
    const coords = await getUserCoordinates();

    onProgress("Finding the nearest airport...");
    cachedState.userLocation = await reverseGeocode(coords.lat, coords.lon).catch(() => null);

    airport = await findNearestAirport(coords.lat, coords.lon);
    if (!airport) {
      throw new Error("No airport found near your location. Search an airport code instead (e.g. LOS).");
    }
  }

  onProgress(`Loading flights at ${airport}...`);
  await loadAirportBoard(airport);

  onProgress("Loading weather...");
  await loadFlightWeather(cachedState.flight, airport);

  cachedState.lastUpdated = new Date();
  return cachedState;
}

export async function refreshData() {
  const airport = cachedState.airport;
  if (!airport) return cachedState;

  const selected = cachedState.flight;
  const context = cachedState.weatherContext;

  await loadAirportBoard(airport);

  if (selected) {
    const updated = cachedState.airportFlights.find(
      (f) => f.flightNumber === selected.flightNumber && f.origin.scheduled === selected.origin.scheduled
    );
    cachedState.flight = updated ?? selected;
  }

  if (context === 'flight') await loadFlightWeather(cachedState.flight, airport);

  cachedState.lastUpdated = new Date();
  return cachedState;
}

/** Called when a row in any board or result list is clicked */
export async function selectFlight(flight) {
  cachedState.flight = flight;
  await loadFlightWeather(flight, cachedState.airport);
  cachedState.lastUpdated = new Date();
  return cachedState;
}

async function showResults(flights, emptyMessage) {
  const results = flights.filter((f) => f.flightNumber !== "N/A").slice(0, MAX_RESULTS);
  if (!results.length) throw new Error(emptyMessage);

  cachedState.results = results;
  cachedState.flight = results[0];
  await loadFlightWeather(results[0], cachedState.airport);
}

export async function searchDashboard(term) {
  const query = detectQuery(term);
  cachedState.query = query;

  switch (query.type) {
    case "airport":
      await loadAirportBoard(query.code);
      await loadFlightWeather(cachedState.flight, query.code);
      await loadLocationWeather(`iata:${query.code}`, `Airport ${query.code}`);
      break;

    case "flight":
      await showResults(
        sortByStatus(await fetchFlightByNumber(query.number)),
        `No flight found for flight number: ${query.number}`
      );
      break;

    case "route":
      await showResults(
        sortRoute(await fetchRouteFlights(query.from, query.to)),
        `No flights found from ${query.from} to ${query.to}.`
      );
      break;

    case "airline":
      await showResults(
        sortByStatus(await fetchAirlineFlights(query.code)),
        `No flights found for airline ${query.code}.`
      );
      break;

    default:
      await loadLocationWeather(query.text, query.text, { strict: true });
  }

  cachedState.lastUpdated = new Date();
  return cachedState;
}

export async function refreshTracked({ limit = 5 } = {}) {
  const all = getWatchlist();
  const due = all
    .filter((entry) => !FINAL_STATUS.includes(entry.flight.status))
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
  const batch = due.slice(0, limit);

  const result = {
    checked: 0,
    changed: 0,
    notFound: 0,
    skipped: due.length - batch.length,
    finished: all.length - due.length,
    error: null
  };

  for (const entry of batch) {
    try {
      const matches = normalizeFlights(await fetchFlightByNumber(entry.flight.flightNumber));
      const match = matches.find((f) => keyFor(f) === entry.key);
      result.checked += 1;

      if (match) result.changed += applyFresh([match], { touch: true });
      else result.notFound += 1;
    } catch (error) {
      result.error = error.message;
      break;
    }
  }

  return result;
}

export function getSharedUserLocation() {
  if (!cachedState.userLocation) throw new Error("Location state has not been initialized.");
  return cachedState.userLocation;
}

export function getSharedFlightData() {
  if (!cachedState.flight) throw new Error("Flight state has not been loaded.");
  return cachedState.flight;
}

export function getSharedWeatherData() {
  if (!cachedState.weather) throw new Error("Weather state has not been loaded.");
  return cachedState.weather;
}