// src/js/modules/shared.js
// Helpers used by more than one module.
import { localTime } from '../services/FlightService.js';

export function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** "2026-10-03 14:05" from an API timestamp (already airport-local) */
export const fmt = (iso) => (iso ? `${iso.slice(0, 10)} ${localTime(iso)}` : '—');

/**
 * Renders a list of flights as board rows.
 * direction: "active" | "departures" | "arrivals" | "results"
 */
export function renderBoard(
  containerId,
  flights,
  direction,
  onSelect,
  emptyText = 'No live flights returned right now.'
) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.replaceChildren();

  if (!flights.length) {
    container.append(el('p', 'board-empty', emptyText));
    return;
  }

  flights.forEach((f) => {
    let scheduled, rightText, airlineText = f.airline;

    if (direction === 'departures') {
      scheduled = f.origin.scheduled;
      rightText = `to ${f.destination.code}`;
    } else if (direction === 'arrivals') {
      scheduled = f.destination.scheduled;
      rightText = `from ${f.origin.code}`;
    } else {
      // "active" and "results": show the full route
      scheduled = f.origin.scheduled;
      rightText = `${f.origin.code} → ${f.destination.code}`;
      if (direction === 'results' && scheduled) airlineText = `${f.airline} • ${scheduled.slice(0, 10)}`;
    }

    const row = el('button', 'board-row');
    row.type = 'button';
    row.title = `${f.airline} • ${f.origin.name} → ${f.destination.name}`;

    const info = el('div', 'board-info');
    info.append(el('span', 'board-flight', f.flightNumber), el('span', 'board-airline', airlineText));

    row.append(
      el('span', 'board-time', localTime(scheduled)),
      info,
      el('span', 'board-airport', rightText),
      el('span', `board-status status-${f.status}`, f.status)
    );

    row.addEventListener('click', () => onSelect(f));
    container.append(row);
  });
}