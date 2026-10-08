
import { clearChecked, getChecked, packingForState, toggleChecked } from '../services/PackingService.js';
import { el, setText } from './shared.js';

const EMPTY = 'Select a flight on the Dashboard, or search a city, to get a packing list.';

let current = null;
let progress = null;

function packedCount() {
  if (!current) return 0;
  const ids = new Set(current.items.map((i) => i.id));
  return getChecked(current.key).filter((id) => ids.has(id)).length;
}

function updateProgress() {
  if (!current || !progress) return;
  const done = packedCount();
  const total = current.items.length;

  progress.text.textContent = `Packed ${done} of ${total}`;
  progress.fill.style.setProperty('--w', `${total ? Math.round((done / total) * 100) : 0}%`);
  progress.reset.hidden = done === 0;
}

/* ---------- Summary ---------- */

function renderSummary(pack) {
  const box = document.getElementById('packing-summary');
  if (!box) return;
  box.replaceChildren();
  progress = null;

  const header = el('header', 'card-header');
  header.append(el('h3', undefined, pack ? `Packing for ${pack.label}` : 'Packing list'));
  if (pack) header.append(el('div', 'badge', pack.tempWord));
  box.append(header);

  if (!pack) {
    box.append(el('p', 'pack-empty', EMPTY));
    return;
  }

  box.append(el('p', 'pack-headline', pack.headline), el('p', 'pack-basis', pack.basis));

  const facts = el('div', 'pack-facts');
  pack.facts.forEach(([label, value]) => {
    const chip = el('div', 'pack-fact');
    chip.append(el('span', undefined, `${label} `), el('strong', undefined, value));
    facts.append(chip);
  });
  box.append(facts);

  const text = el('span', 'pack-progress-text');
  const reset = el('button', 'pack-reset', 'Clear checklist');
  reset.type = 'button';
  reset.addEventListener('click', () => {
    clearChecked(pack.key);
    renderLists(pack);
    updateProgress();
  });

  const head = el('div', 'pack-progress-head');
  head.append(text, reset);

  const fill = el('div', 'pack-progress-fill');
  const track = el('div', 'pack-progress-track');
  track.append(fill);

  const wrap = el('div', 'pack-progress');
  wrap.append(head, track);
  box.append(wrap);

  progress = { text, fill, reset };
}

/* ---------- Checklist groups ---------- */

function renderLists(pack) {
  const box = document.getElementById('packing-lists');
  if (!box) return;
  box.replaceChildren();
  if (!pack) return;

  const packed = new Set(getChecked(pack.key));

  pack.groups.forEach((group) => {
    const card = el('section', 'dashboard-card pack-group');

    const header = el('header', 'card-header');
    header.append(el('h3', undefined, group.title), el('div', 'badge', `${group.items.length} items`));
    card.append(header);

    const list = el('ul', 'pack-items');
    group.items.forEach((item) => {
      const checkbox = el('input');
      checkbox.type = 'checkbox';
      checkbox.checked = packed.has(item.id);

      const text = el('span', 'pack-text');
      text.append(el('span', 'pack-label', item.label), el('span', 'pack-why', item.why));

      const label = el('label', `pack-item${checkbox.checked ? ' is-packed' : ''}`);
      label.append(checkbox, text);

      checkbox.addEventListener('change', () => {
        const nowPacked = toggleChecked(pack.key, item.id);
        label.classList.toggle('is-packed', nowPacked);
        updateProgress();
      });

      const row = el('li');
      row.append(label);
      list.append(row);
    });

    card.append(list);
    box.append(card);
  });
}

/* ---------- Travel-day tips ---------- */

function renderTips(pack) {
  const box = document.getElementById('packing-tips');
  if (!box) return;
  box.replaceChildren();

  const tips = pack?.tips ?? [];
  box.hidden = !tips.length;
  if (!tips.length) return;

  const header = el('header', 'card-header');
  header.append(el('h3', undefined, 'Travel-day tips'));

  const list = el('ul');
  tips.forEach((tip) => list.append(el('li', undefined, tip)));
  box.append(header, list);
}

/* ---------- Module ---------- */

export default {
  id: 'packing',

  queryTypes: ['text', 'airport', 'flight', 'route', 'airline'],
  placeholder: 'Search a city or airport to see what to pack',

  init() {},

  render(state) {
    const pack = packingForState(state);
    current = pack;

    setText('packing-subtitle', pack ? `What to pack for ${pack.label}` : 'Select a flight or search a city to see what to pack.');

    renderSummary(pack);
    renderLists(pack);
    renderTips(pack);
    updateProgress();
  }
};