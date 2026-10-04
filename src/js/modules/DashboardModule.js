
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

export default {
  id: 'dashboard',

  init(sharedApp) {
    app = sharedApp;
  },

  render(state) {
    if (!state) return;
    const { flight, weather, airport, active, departures, arrivals } = state;

    if (weather) {
      setText('weather-temp', weather.tempC);
      setText('weather-location', `${weather.location}, ${weather.country}`);
      setText('weather-badge', weather.condition);
    }

    renderHero(flight);

    const select = (f) => app.select(f);
    renderBoard('active-list', active, 'active', select);
    renderBoard('departures-list', departures, 'departures', select);
    renderBoard('arrivals-list', arrivals, 'arrivals', select);

    setText('active-count', `${active.length} in air`);
    setText('departures-count', `${airport || '---'} • ${departures.length}`);
    setText('arrivals-count', `${airport || '---'} • ${arrivals.length}`);
  }
};