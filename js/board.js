// OKKIE — SVG-dartbord voor de trefferkaart. Toont per vak hoe vaak het is geraakt;
// enkele treffers worden over beide enkele ringen getoond omdat de exacte positie onbekend is.
import { SECTORS } from './logic.js';

const R = { db: 6.35, sb: 15.9, tIn: 99, tOut: 107, dIn: 162, dOut: 170, num: 186 };

function polar(r, deg) {
  const a = (deg * Math.PI) / 180;
  return [r * Math.cos(a), r * Math.sin(a)];
}

function arc(r1, r2, a1, a2) {
  const [x1, y1] = polar(r2, a1), [x2, y2] = polar(r2, a2), [x3, y3] = polar(r1, a2), [x4, y4] = polar(r1, a1);
  const f = n => n.toFixed(2);
  return `M${f(x1)} ${f(y1)}A${r2} ${r2} 0 0 1 ${f(x2)} ${f(y2)}L${f(x3)} ${f(y3)}A${r1} ${r1} 0 0 0 ${f(x4)} ${f(y4)}Z`;
}

// Warmtekleur van donker via oranje naar geel-wit.
export function heatColor(t) {
  if (t <= 0) return null;
  const stops = [[0, [64, 20, 10]], [0.35, [214, 60, 30]], [0.7, [255, 160, 40]], [1, [255, 245, 170]]];
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
  const [p0, c0] = stops[i], [p1, c1] = stops[i + 1];
  const k = Math.min(1, Math.max(0, (t - p0) / (p1 - p0)));
  const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
  return `rgb(${c.join(',')})`;
}

// dist: { bySeg: { '20': {S,D,T}, '25': {S,D} } } ; mode: 'all' | 'S' | 'D' | 'T'
export function boardSVG(dist, mode = 'all') {
  const counts = [];
  const val = (seg, m) => {
    const c = dist.bySeg[String(seg)];
    if (!c) return 0;
    if (mode !== 'all' && mode !== m) return 0;
    return c[m] || 0;
  };
  for (const seg of SECTORS) for (const m of ['S', 'D', 'T']) counts.push(val(seg, m));
  counts.push(val(25, 'S'), val(25, 'D'));
  const max = Math.max(1, ...counts);
  const parts = [];
  SECTORS.forEach((seg, i) => {
    const a1 = -90 + i * 18 - 9, a2 = a1 + 18;
    const dark = i % 2 === 0;
    const baseS = dark ? 'var(--board-dark)' : 'var(--board-light)';
    const baseR = dark ? 'var(--board-red)' : 'var(--board-green)';
    const ring = (r1, r2, m, base, name) => {
      const n = val(seg, m);
      const fill = heatColor(n / max) || base;
      parts.push(`<path d="${arc(r1, r2, a1, a2)}" fill="${fill}" data-seg="${name}" data-n="${n}"><title>${name}: ${n}×</title></path>`);
    };
    ring(R.sb, R.tIn, 'S', baseS, String(seg));
    ring(R.tIn, R.tOut, 'T', baseR, 'T' + seg);
    ring(R.tOut, R.dIn, 'S', baseS, String(seg));
    ring(R.dIn, R.dOut, 'D', baseR, 'D' + seg);
    const [tx, ty] = polar(R.num, -90 + i * 18);
    parts.push(`<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" class="board-num">${seg}</text>`);
  });
  const sb = val(25, 'S'), db = val(25, 'D');
  parts.push(`<circle r="${R.sb}" fill="${heatColor(sb / max) || 'var(--board-green)'}" data-seg="25" data-n="${sb}"><title>25: ${sb}×</title></circle>`);
  parts.push(`<circle r="${R.db}" fill="${heatColor(db / max) || 'var(--board-red)'}" data-seg="Bull" data-n="${db}"><title>Bull: ${db}×</title></circle>`);
  return `<svg class="board" viewBox="-200 -200 400 400" role="img" aria-label="Trefferkaart van het dartbord">
    <circle r="199" fill="var(--board-rim)"/>
    ${parts.join('')}
    <g fill="none" stroke="var(--board-wire)" stroke-width="0.8">
      <circle r="${R.dOut}"/><circle r="${R.dIn}"/><circle r="${R.tOut}"/><circle r="${R.tIn}"/><circle r="${R.sb}"/><circle r="${R.db}"/>
    </g>
  </svg>`;
}

// Legenda-schaal
export function heatLegend() {
  const stops = [0.1, 0.3, 0.5, 0.7, 0.9, 1].map(t => `<span style="background:${heatColor(t)}"></span>`).join('');
  return `<div class="heat-legend"><small>weinig</small><div>${stops}</div><small>vaak</small></div>`;
}
