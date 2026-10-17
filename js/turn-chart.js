// OKKIE. — Grafiek "score per beurt" van één training. Elke beurt is een knop: tik erop voor de score en de drie pijlen.
// De hoogste beurt (bij een gedeelde score: alle) is gemarkeerd. Een onvolledige beurt (minder dan 3 pijlen, bijv. als je
// eerder stopt) is gestippeld en telt niet als hoogste of laagste beurt. Geen externe bibliotheek; werkt offline.
import { label } from './logic.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nl1 = v => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
const DENSE = 20;   // meer beurten: vaste breedte per beurt en zijwaarts scrollen, waarden alleen bij de hoogste beurt

// series: uit L.turnSeries; best: beurtnummers van de hoogste beurt; avg: gemiddelde per 3 pijlen (stippellijn).
export function turnChart(series, { best = [], avg = null, title = '' } = {}) {
  if (!series.length) return '';
  const max = Math.max(60, ...series.map(s => s.score));
  const dense = series.length > DENSE;
  const bestSet = new Set(best);
  const bars = series.map((s, i) => {
    const isBest = bestSet.has(s.n);
    const darts = s.darts.map(label);
    const cls = ['tc-bar', isBest ? 'best' : '', s.complete ? '' : 'part', dense && (s.n === 1 || s.n % 5 === 0) ? 'tick' : ''].filter(Boolean).join(' ');
    const aria = `Beurt ${s.n}: ${s.score} punten, ${darts.join(' ')}${s.complete ? '' : ', onvolledig'}${isBest ? ', hoogste beurt' : ''}`;
    return `<button type="button" class="${cls}" data-n="${s.n}" data-score="${s.score}" data-darts="${esc(darts.join(' '))}"${s.complete ? '' : ' data-part="1"'}${isBest ? ' data-best="1"' : ''} aria-label="${esc(aria)}" aria-pressed="false" style="--i:${Math.min(i, 40)}">`
      + `<span class="tc-col"><i style="height:${Math.max(1.5, (s.score / max) * 100).toFixed(1)}%"><span class="tc-val">${s.score}</span></i></span><span class="tc-n">${s.n}</span></button>`;
  }).join('');
  const avgLine = avg ? `<span class="tc-avg" style="--r:${Math.min(1, avg / max).toFixed(3)}" aria-hidden="true"></span>` : '';
  const part = series.some(s => !s.complete);
  return `<div class="tchart${dense ? ' dense' : ''}" data-testid="turn-chart" data-total="${series.length}">
    ${title ? `<p class="tc-title">${esc(title)}</p>` : ''}
    <div class="tc-scroll"><div class="tc-bars" role="group" aria-label="Score per beurt, ${series.length} beurten">${bars}${avgLine}</div></div>
    <p class="tc-legend"><span><i class="lg-best"></i>hoogste beurt</span>${avg ? `<span><i class="lg-avg"></i>gemiddelde ${nl1(avg)}</span>` : ''}${part ? '<span><i class="lg-part"></i>onvolledig</span>' : ''}</p>
    <p class="tc-detail" data-testid="turn-detail" aria-live="polite">Tik op een beurt om de pijlen te zien.</p>
  </div>`;
}

function detail(bar, total) {
  const darts = bar.dataset.darts.split(' ').filter(Boolean).map(d => `<i>${esc(d)}</i>`).join('');
  return `<b>Beurt ${bar.dataset.n}</b><small>van ${total}</small><strong>${bar.dataset.score}</strong><span class="darts">${darts}</span>`
    + `${bar.dataset.best ? '<em class="tc-tag best">hoogste beurt</em>' : ''}${bar.dataset.part ? '<em class="tc-tag">onvolledig</em>' : ''}`;
}

function select(chart, bar, focus = false) {
  chart.querySelectorAll('.tc-bar.on').forEach(b => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); });
  bar.classList.add('on');
  bar.setAttribute('aria-pressed', 'true');
  chart.querySelector('.tc-detail').innerHTML = detail(bar, chart.dataset.total);
  if (focus) bar.focus();
  bar.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

// Na elk tekenen: tikken en pijltjestoetsen per grafiek. Selecteren tekent niets opnieuw (de rest van het scherm blijft staan).
export function bindTurnCharts(root) {
  root.querySelectorAll('.tchart').forEach(chart => {
    if (chart.dataset.bound) return;
    chart.dataset.bound = '1';
    const bars = [...chart.querySelectorAll('.tc-bar')];
    bars.forEach((bar, i) => {
      bar.addEventListener('click', () => select(chart, bar));
      bar.addEventListener('keydown', e => {
        const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? bars.length - 1 : null;
        if (j === null || !bars[j]) return;
        e.preventDefault();
        select(chart, bars[j], true);
      });
    });
    // Bij veel beurten: de eerste hoogste beurt in beeld schuiven.
    const first = chart.querySelector('.tc-bar.best');
    const scroller = chart.querySelector('.tc-scroll');
    if (first && chart.classList.contains('dense') && scroller) scroller.scrollLeft = Math.max(0, first.offsetLeft - scroller.clientWidth / 2);
  });
}
