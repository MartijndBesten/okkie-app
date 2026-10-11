// OKKIE — eenvoudige SVG-lijngrafiek met tik-/hoverinfo. Geen externe bibliotheek.
// De grafiek wordt na het tonen opnieuw getekend op de echte breedte (bindChart), zodat tekst en
// punten nooit worden uitgerekt.

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nl = v => v.toFixed(2).replace('.', ',');

function draw(points, W, H) {
  const padL = 30, padR = 10, padT = 12, padB = 24;
  const vals = points.map(p => p.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 10) { const mid = (hi + lo) / 2; lo = mid - 5; hi = mid + 5; }
  lo = Math.max(0, Math.floor((lo - 3) / 5) * 5);
  hi = Math.ceil((hi + 3) / 5) * 5;
  const x = i => points.length === 1 ? (padL + W - padR) / 2 : padL + (i * (W - padL - padR)) / (points.length - 1);
  const y = v => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const f = n => n.toFixed(1);
  const ticks = [];
  const step = Math.max(5, Math.ceil((hi - lo) / 4 / 5) * 5);
  for (let v = lo; v <= hi; v += step) {
    ticks.push(`<line x1="${padL}" x2="${W - padR}" y1="${f(y(v))}" y2="${f(y(v))}" class="grid"/><text x="${padL - 6}" y="${f(y(v) + 4)}" class="tick" text-anchor="end">${v}</text>`);
  }
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${f(x(i))} ${f(y(p.value))}`).join('');
  const area = `${line}L${f(x(points.length - 1))} ${H - padB}L${f(x(0))} ${H - padB}Z`;
  // trendlijn (kleinste kwadraten)
  let trend = '';
  if (points.length >= 3) {
    const n = points.length, mx = (n - 1) / 2, my = vals.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    vals.forEach((v, i) => { num += (i - mx) * (v - my); den += (i - mx) ** 2; });
    const slope = num / den, b = my - slope * mx;
    trend = `<line x1="${f(x(0))}" y1="${f(y(b))}" x2="${f(x(n - 1))}" y2="${f(y(b + slope * (n - 1)))}" class="trend"/>`;
  }
  const room = Math.max(2, Math.floor((W - padL - padR) / 54));
  const every = Math.ceil(points.length / room);
  const last = points.length - 1;
  const labels = points.map((p, i) => ((i % every === 0 && last - i >= Math.max(2, every)) || i === last) ? `<text x="${f(x(i))}" y="${H - 6}" class="tick" text-anchor="${i === last && points.length > 1 ? 'end' : 'middle'}">${esc(p.label)}</text>` : '').join('');
  const dotR = points.length > 30 ? 2.5 : 3.5;
  const dots = points.map((p, i) => `<g class="pt${i === last ? ' last' : ''}" data-i="${i}"><circle cx="${f(x(i))}" cy="${f(y(p.value))}" r="14" class="hit"/><circle cx="${f(x(i))}" cy="${f(y(p.value))}" r="${dotR}" class="dot"/></g>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Grafiek van je gemiddelde">
      <defs><linearGradient id="cg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".22"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      ${ticks.join('')}<path d="${area}" fill="url(#cg)"/><path d="${line}" class="line"/>${trend}${dots}${labels}
    </svg>`;
}

// points: [{ label, value, sub }]
export function lineChart(points, { height = 200, unit = '' } = {}) {
  if (!points.length) return '<div class="empty-chart">Nog geen gegevens. Rond een training af en je ziet hier je lijn groeien.</div>';
  const data = esc(JSON.stringify(points.map(p => [p.label, p.value, p.sub || ''])));
  return `<div class="chart" data-points="${data}" data-h="${height}" data-unit="${esc(unit)}">
    ${draw(points, 340, height)}
    <div class="chart-tip" hidden></div>
  </div>`;
}

function bindPoints(chart, pts) {
  const tip = chart.querySelector('.chart-tip');
  const show = g => {
    const [lab, val, sub] = pts[Number(g.dataset.i)];
    tip.innerHTML = `<b>${esc(nl(val))}</b> <span>${esc(lab)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}`;
    tip.hidden = false;
    chart.querySelectorAll('.pt.on').forEach(p => p.classList.remove('on'));
    g.classList.add('on');
  };
  chart.querySelectorAll('.pt').forEach(g => {
    g.addEventListener('pointerenter', () => show(g));
    g.addEventListener('click', () => show(g));
  });
}

function redraw(chart) {
  const pts = JSON.parse(chart.dataset.points);
  const W = Math.round(chart.clientWidth);
  if (W > 0) chart.querySelector('svg').outerHTML = draw(pts.map(([label, value, sub]) => ({ label, value, sub })), W, Number(chart.dataset.h) || 200);
  bindPoints(chart, pts);
}

export function bindChart(root) {
  root.querySelectorAll('.chart').forEach(redraw);
}

// Draaien of venster groter maken: grafieken opnieuw tekenen op de nieuwe breedte.
if (typeof window !== 'undefined') {
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => document.querySelectorAll('.chart').forEach(redraw), 150); });
}
