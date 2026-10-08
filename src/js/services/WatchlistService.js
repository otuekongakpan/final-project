
const STORAGE_KEY = 'aeropulse:watchlist:v2';
const MAX_TRACKED = 20;

/** One tracked entry per flight number per day */
export const keyFor = (flight) => `${flight.flightNumber}|${(flight.origin?.scheduled ?? '').slice(0, 10)}`;

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
  
  }
}

export const getWatchlist = () => read();

export const isWatched = (flight) => Boolean(flight) && read().some((e) => e.key === keyFor(flight));

export function toggleWatchlist(flight) {
  if (!flight || flight.flightNumber === 'N/A') return false;

  const key = keyFor(flight);
  const list = read();

  if (list.some((e) => e.key === key)) {
    write(list.filter((e) => e.key !== key));
    return false;
  }

  const now = new Date().toISOString();
  write([{ key, flight, addedAt: now, updatedAt: now, change: null }, ...list].slice(0, MAX_TRACKED));
  return true;
}

export function removeFromWatchlist(key) {
  write(read().filter((e) => e.key !== key));
}

export function lastChecked() {
  const times = read().map((e) => e.updatedAt).filter(Boolean).sort();
  return times.at(-1) ?? null;
}

export function describeChange(before, after) {
  const changes = [];
  const delay = (side) => Number(side?.delay) || 0;

  if (before.status !== after.status) changes.push(`Status: ${before.status} to ${after.status}`);
  if (delay(before.origin) !== delay(after.origin)) {
    changes.push(`Departure delay: ${delay(before.origin)} to ${delay(after.origin)} min`);
  }
  if (delay(before.destination) !== delay(after.destination)) {
    changes.push(`Arrival delay: ${delay(before.destination)} to ${delay(after.destination)} min`);
  }
  if (after.origin?.gate && before.origin?.gate !== after.origin.gate) {
    changes.push(`Gate: ${before.origin?.gate ?? 'none'} to ${after.origin.gate}`);
  }

  return changes.slice(0, 2).join('; ');
}

export function applyFresh(freshFlights, { touch = false } = {}) {
  const list = read();
  if (!list.length || !freshFlights.length) return 0;

  const fresh = new Map(freshFlights.map((f) => [keyFor(f), f]));
  const now = new Date().toISOString();
  let changed = 0;
  let dirty = false;

  const next = list.map((entry) => {
    const latest = fresh.get(entry.key);
    if (!latest) return entry;

    const same = JSON.stringify(entry.flight) === JSON.stringify(latest);
    if (same && !touch) return entry;

    const text = describeChange(entry.flight, latest);
    if (text) changed += 1;
    dirty = true;

    return { ...entry, flight: latest, updatedAt: now, change: text ? { text, at: now } : entry.change };
  });

  if (dirty) write(next);
  return changed;
}