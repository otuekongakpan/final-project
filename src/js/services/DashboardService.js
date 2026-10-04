
import { fetchAirlineFlights, fetchAirportFlights, fetchFlightByNumber, fetchRouteFlights, fetchWeatherData, findNearestAirport, getUserCoordinates, reverseGeocode } from './api.js';
import { buildBoard, detectQuery, sortByStatus, sortRoute } from './FlightService.js';
import { normalizeWeather } from './WeatherService.js';

const MAX_RESULTS = 30;

let cachedState = {
  userLocation: null,
  airport: null,
  active: [],
  departures: [],
  arrivals: [],
  flight: null,
  weather: null,           
  destinationWeather: null, 
  weatherContext: 'flight', 
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
  cachedState.weather = origin.status === 'fulfilled' ? origin.value : null;
  cachedState.destinationWeather = dest.status === 'fulfilled' ? dest.value : null;

  const failure = [origin, dest].find((r) => r.status === 'rejected');
  cachedState.weatherError = failure ? failure.reason.message : null;
  if (failure) console.warn("WeatherAPI Notice:", failure.reason.message);
}

/* ---------- Airport boards ---------- */

export async function loadAirportBoard(iata) {
  const code = iata.toUpperCase();

  const [dep, arr] = await Promise.allSettled([
    fetchAirportFlights("departures", code),
    fetchAirportFlights("arrivals", code)
  ]);

  if (dep.status === "rejected" && arr.status === "rejected") throw dep.reason;

  const allDep = dep.status === "fulfilled" ? buildBoard(dep.value, "departures") : [];
  const allArr = arr.status === "fulfilled" ? buildBoard(arr.value, "arrivals") : [];

  const seen = new Set();
  cachedState.airport = code;
  cachedState.departures = allDep.slice(0, 10);
  cachedState.arrivals = allArr.slice(0, 10);
  cachedState.active = [...allDep, ...allArr]
    .filter((f) => f.status === "active" && !seen.has(f.flightNumber) && seen.add(f.flightNumber))
    .slice(0, 10);

  cachedState.flight =
    cachedState.active[0] || cachedState.departures[0] || cachedState.arrivals[0] || null;

  return cachedState;
}

export async function initGeoDashboard() {

  const coords = await getUserCoordinates();

  cachedState.userLocation = await reverseGeocode(coords.lat, coords.lon).catch(() => null);

  const airport = await findNearestAirport(coords.lat, coords.lon);
  if (!airport) {
    throw new Error("No airport found near your location. Search an airport code instead (e.g. LOS).");
  }

  await loadAirportBoard(airport);
  await loadFlightWeather(cachedState.flight, airport);

  cachedState.lastUpdated = new Date();
  return cachedState;
}

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

      cachedState.weather = await getWeather(query.text);
      cachedState.destinationWeather = null;
      cachedState.weatherContext = 'location';
      cachedState.weatherError = null;
  }

  cachedState.lastUpdated = new Date();
  return cachedState;
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