
import { packingForState } from '../services/PackingService.js';
import { riskForState } from '../services/RiskService.js';
import { formatTemp } from '../services/format.js';
import { renderBoard, setText } from './shared.js';

let app;

function renderHero(flight) {
  if (!flight) {
    setText('origin-code', '---');
    setText('destination-code', '---');
    setText('flight-info', 'No live flight available');
    setText('flight-badge', 'None');
    return;
  }

  setText('origin-code', flight.origin.code);
  setText('destination-code', flight.destination.code);

  const extras = [
    flight.origin.terminal && `Terminal ${flight.origin.terminal}`,
    flight.origin.gate && `Gate ${flight.origin.gate}`,
    flight.origin.delay > 0 && `${flight.origin.delay} min delay`
  ].filter(Boolean);

  setText('flight-info', [`Flight ${flight.flightNumber} • ${flight.airline}`, ...extras].join(' • '));
  setText('flight-badge', flight.status);
}

function renderRiskCard(state) {
  const risk = riskForState(state);
  const scored = Boolean(risk) && risk.score !== null;

  setText('risk-score', scored ? `${risk.score} / 100` : '-- / 100');
  setText('risk-desc', risk ? risk.headline : 'Select a flight to see its risk');

  const badge = document.getElementById('risk-badge');
  if (badge) {
    const label = scored ? risk.level : '--';
    if (badge.textContent !== label) badge.textContent = label;
    badge.className = scored ? `badge risk-${risk.level.toLowerCase()}` : 'badge';
  }
}

function renderPackingCard(state) {
  const pack = packingForState(state);

  setText('packing-badge', pack ? pack.label : 'Destination Sync');
  setText('packing-tip', pack ? pack.headline : 'Awaiting destination weather data...');
  setText('gear-tag', pack ? pack.keyItems.join(' • ') || 'No special gear' : '--');
}

export default {
  id: 'dashboard',

  queryTypes: ['airport', 'text'],
  placeholder: 'Search an airport (LOS), flight (BA74) or city',

  init(sharedApp) {
    app = sharedApp;
  },

  render(state) {
    if (!state) return;
    const { flight, weather, airport, active, departures, arrivals } = state;

    if (weather) {
      setText('weather-temp', formatTemp(weather.temp));
      setText('weather-location', `${weather.location}, ${weather.country}`);
      setText('weather-badge', weather.condition);
    }

    renderHero(flight);
    renderRiskCard(state);
    renderPackingCard(state);

    const select = (f) => app.select(f);
    renderBoard('active-list', active, 'active', select);
    renderBoard('departures-list', departures, 'departures', select);
    renderBoard('arrivals-list', arrivals, 'arrivals', select);

    setText('active-count', `${active.length} in air`);
    setText('departures-count', `${airport || '---'} • ${departures.length}`);
    setText('arrivals-count', `${airport || '---'} • ${arrivals.length}`);
  }
};