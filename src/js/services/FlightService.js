
const LIVE_STATUSES = ["active", "scheduled"];
const STATUS_ORDER = ["active", "scheduled", "landed", "diverted", "incident", "cancelled", "unknown"];

const rank = (status) => {
  const i = STATUS_ORDER.indexOf(status);
  return i === -1 ? STATUS_ORDER.length : i;
};

/** WATCHLIST AND TRACKING */

let watchlistStore = [];

export function addToWatchlist(flightData) {
  const normalized = flightData.flightNumber ? flightData : normalizeFlight(flightData);
  const exists = watchlistStore.some((f) => f.flightNumber === normalized.flightNumber);

  if (!exists) {
    watchlistStore.push(normalized);
  }
  return [...watchlistStore];
}

export function removeFromWatchlist(flightNumber) {
  watchlistStore = watchlistStore.filter((f) => f.flightNumber !== flightNumber);
  return [...watchlistStore];
}

export function getFullWatchlist() {
  return [...watchlistStore];
}

export function getDashboardWatchlist(limit = 5) {
  return sortByStatus(watchlistStore).slice(0, limit);
}

export function isWatched(flightNumber) {
  return watchlistStore.some((f) => f.flightNumber === flightNumber);
}


/** NORMALIZING DATA */

function normalizeSide(s = {}) {
  return {
    code: s.iata || "N/A",
    name: s.airport || "Unknown Airport",
    terminal: s.terminal || null,
    gate: s.gate || null,
    scheduled: s.scheduled || null,
    estimated: s.estimated || null,
    actual: s.actual || null,
    delay: Number(s.delay) || 0 // minutes
  };
}

export function normalizeFlight(f) {
  return {
    flightNumber: f.flight?.iata || f.flightNumber || "N/A",
    airline: f.airline?.name || f.airline || "Unknown airline",
    airlineCode: f.airline?.iata || f.airlineCode || null,
    aircraft: f.aircraft?.iata || f.aircraft || null,
    status: f.flight_status || f.status || "unknown",
    origin: normalizeSide(f.departure || f.origin),
    destination: normalizeSide(f.arrival || f.destination)
  };
}

export const normalizeFlights = (rawList) => rawList.map(normalizeFlight);

export function localTime(iso) {
  return iso ? iso.slice(11, 16) : "--:--";
}

export function pickBestFlight(rawList, flightNumber = "") {
  const flights = normalizeFlights(rawList);
  if (!flights.length) {
    throw new Error(`No flight found for flight number: ${flightNumber}`);
  }
  return [...flights].sort((a, b) => rank(a.status) - rank(b.status))[0];
}

export function buildBoard(rawList, direction) {
  const side = direction === "arrivals" ? "destination" : "origin";

  const all = normalizeFlights(rawList)
    .filter((f) => f[side].scheduled)
    .sort((a, b) => a[side].scheduled.localeCompare(b[side].scheduled));

  const live = all.filter((f) => LIVE_STATUSES.includes(f.status));
  return live.length ? live : all.slice(-10);
}

export function sortRoute(rawList) {
  return normalizeFlights(rawList)
    .filter((f) => f.origin.scheduled)
    .sort((a, b) => rank(a.status) - rank(b.status) || a.origin.scheduled.localeCompare(b.origin.scheduled));
}

/** Priority sort by active/scheduled status */
export function sortByStatus(rawList) {
  return normalizeFlights(rawList).sort((a, b) => rank(a.status) - rank(b.status));
}

export function filterFlights(flights, { text = "", status = "", airlineCode = "" } = {}) {
  const needle = text.trim().toLowerCase();

  return flights.filter((f) => {
    if (status && f.status !== status) return false;
    if (airlineCode && f.airlineCode !== airlineCode.toUpperCase()) return false;
    if (!needle) return true;
    return [f.flightNumber, f.airline, f.origin.code, f.origin.name, f.destination.code, f.destination.name]
      .some((v) => String(v).toLowerCase().includes(needle));
  });
}

export function detectQuery(term) {
  const q = term.trim().toUpperCase();

  const route = q.match(/^([A-Z]{3})\s*(?:-|>|→|TO|\s)\s*([A-Z]{3})$/);
  if (route) return { type: "route", from: route[1], to: route[2] };

  const compact = q.replace(/\s+/g, "");
  if (/^[A-Z]{3}$/.test(compact)) return { type: "airport", code: compact };
  if (/^[A-Z0-9]{2}\d{1,4}$/.test(compact)) return { type: "flight", number: compact };
  if (/^[A-Z]{2}$/.test(compact)) return { type: "airline", code: compact };

  return { type: "text", text: term.trim() };
}