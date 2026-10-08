
const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([name, value]) => {
    if (value !== undefined && value !== null) node.setAttribute(name, value);
  });
  node.append(...children);
  return node;
}

function html(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const tip = (text) => svg('title', {}, [text]);
const fixed = (n) => Number(n.toFixed(2));

export function gaugeChart({ score, levelKey, levelLabel, bands, ariaLabel }) {
  const cx = 120;
  const cy = 100;
  const r = 85;

  const point = (value) => {
    const angle = Math.PI - (value / 100) * Math.PI;
    return [cx + r * Math.cos(angle), cy - r * Math.sin(angle)];
  };
  const arc = (from, to) => {
    const [x0, y0] = point(from);
    const [x1, y1] = point(to);
    return `M ${fixed(x0)} ${fixed(y0)} A ${r} ${r} 0 0 1 ${fixed(x1)} ${fixed(y1)}`;
  };

  const root = svg('svg', { viewBox: '0 0 240 170', class: 'gauge', role: 'img', 'aria-label': ariaLabel });

  bands.forEach((b, i) => {
    const path = svg('path', { d: arc(b.from + 0.8, b.to - 0.8), pathLength: 1, class: `gauge-band gauge-${b.key}` });
    path.style.setProperty('--i', i);
    root.append(path);
  });

  root.append(
    svg('text', { x: cx - r, y: cy + 18, class: 'gauge-limit' }, ['0']),
    svg('text', { x: cx + r, y: cy + 18, class: 'gauge-limit' }, ['100'])
  );

  if (score !== null && score !== undefined) {
    const needle = svg('g', { class: 'gauge-needle' }, [
      svg('line', { x1: cx, y1: cy, x2: cx - (r - 20), y2: cy, class: 'gauge-needle-line' }),
      svg('circle', { cx, cy, r: 7, class: 'gauge-hub' })
    ]);
    needle.style.transformOrigin = `${cx}px ${cy}px`;
    needle.style.setProperty('--needle', `${(score / 100) * 180}deg`);
    root.append(needle);
  }

  root.append(
    svg('text', { x: cx, y: 142, class: 'gauge-score' }, [score === null || score === undefined ? '--' : String(score)]),
    svg('text', { x: cx, y: 162, class: `gauge-level level-${levelKey}` }, [levelLabel])
  );

  return root;
}

export function barList({ items }) {
  const list = html('div', 'bar-list');

  items.forEach((item, index) => {
    const row = html('div', `bar-row${item.available ? '' : ' is-missing'}`);

    const head = html('div', 'bar-head');
    head.append(html('span', 'bar-label', item.label), html('span', 'bar-score', item.scoreText));

    const fill = html('div', `bar-fill${item.levelKey ? ` level-${item.levelKey}` : ''}`);
    const track = html('div', 'bar-track');
    track.append(fill);

    fill.style.setProperty('--w', `${item.available ? item.percent : 0}%`);
    fill.style.setProperty('--i', index);

    row.append(head, track, html('p', 'bar-reason', item.reason), html('p', 'bar-meta', item.meta));
    list.append(row);
  });

  return list;
}

export function lineChart({ labels, series, yMax, ticks, threshold, unit = '', ariaLabel }) {
  const W = 420;
  const H = 220;
  const pad = { top: 14, right: 14, bottom: 30, left: 40 };
  const pw = W - pad.left - pad.right;
  const ph = H - pad.top - pad.bottom;
  const count = labels.length;

  const x = (i) => pad.left + (count > 1 ? (i / (count - 1)) * pw : pw / 2);
  const y = (v) => pad.top + ph - (Math.min(Math.max(v, 0), yMax) / yMax) * ph;

  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-line', role: 'img', 'aria-label': ariaLabel });

  ticks.forEach((t) => {
    root.append(
      svg('line', { x1: pad.left, x2: pad.left + pw, y1: fixed(y(t)), y2: fixed(y(t)), class: 'chart-grid' }),
      svg('text', { x: pad.left - 6, y: fixed(y(t) + 3), class: 'chart-axis chart-axis-y' }, [String(t)])
    );
  });

  labels.forEach((label, i) => {
    root.append(svg('text', { x: fixed(x(i)), y: H - 10, class: 'chart-axis chart-axis-x' }, [label]));
  });

  const hasThreshold = threshold !== undefined && threshold !== null && threshold < yMax;
  if (hasThreshold) {
    root.append(
      svg('rect', { x: pad.left, y: pad.top, width: pw, height: fixed(y(threshold) - pad.top), class: 'chart-zone' }),
      svg('line', { x1: pad.left, x2: pad.left + pw, y1: fixed(y(threshold)), y2: fixed(y(threshold)), class: 'chart-threshold' })
    );
  }

  const plot = svg('g', { class: 'chart-plot' });

  series.forEach((s) => {
    let d = '';
    let drawing = false;

    s.values.forEach((v, i) => {
      if (v === null || v === undefined) {
        drawing = false;
        return;
      }
      d += `${drawing ? 'L' : 'M'} ${fixed(x(i))} ${fixed(y(v))} `;
      drawing = true;
    });

    if (d) plot.append(svg('path', { d: d.trim(), class: `chart-series series-${s.id}` }));

    s.values.forEach((v, i) => {
      if (v === null || v === undefined) return;
      const risky = hasThreshold && v >= threshold;
      plot.append(
        svg(
          'circle',
          { cx: fixed(x(i)), cy: fixed(y(v)), r: 3.5, class: `chart-point series-${s.id}${risky ? ' is-risky' : ''}` },
          [tip(s.titles?.[i] || `${s.name}: ${v}${unit}`)]
        )
      );
    });
  });

  root.append(plot);
  return root;
}

export function stackedBar({ segments, ariaLabel }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const root = svg('svg', {
    viewBox: '0 0 100 12',
    preserveAspectRatio: 'none',
    class: 'stacked-bar',
    role: 'img',
    'aria-label': ariaLabel
  });

  let start = 0;
  let drawn = 0;
  segments.forEach((s) => {
    if (!s.value || !total) return;
    const width = (s.value / total) * 100;
    const rect = svg('rect', { x: fixed(start), y: 0, width: fixed(width), height: 12, class: s.className }, [tip(s.title)]);
    rect.style.setProperty('--i', drawn);
    root.append(rect);
    start += width;
    drawn += 1;
  });

  return root;
}