// OKKIE. — Schermen voor de gerichte oefeningen, "Vandaag oefenen" en het weekdoel (1.10.0).
// Alleen HTML-opbouw uit gegevens; acties (tikken, opslaan) staan in js/app.js. De rekenregels staan in js/drills.js en
// js/coach.js. Helpers (esc, fmt, keypad, ...) komen uit app.js via makeDrillViews(h), zodat er geen tweede kopie bestaat.
import * as D from './drills.js';
import * as C from './coach.js';
import { checkout, x01Turn, label } from './logic.js';

const WEEKDAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const pct = (h, d) => (d ? Math.round((h / d) * 100) : 0) + '%';
const dname = t => (t === 'DB' ? 'Bull' : t);

export function makeDrillViews(h) {
  const { esc, fmt, int, icon, header, tile, keypad, dartSlots, typeBox, lineChart, dateLabel, dateTime } = h;

  // ---------- Trainen: blok "Gericht oefenen" (precies drie kaarten) ----------
  function trainBlock(data, ui, playerId) {
    const rec = D.drillRecords(data.drills, playerId);
    const clockRec = h.records(playerId).clock;
    const recLine = (txt) => `<p class="drill-rec">${txt}</p>`;
    const mode = ui.clockMode || 'all';
    const modeBtn = (m, lab) => `<button class="chip ${mode === m ? 'on' : ''}" data-act="clock-mode" data-arg="${m}" aria-pressed="${mode === m}" data-testid="clock-mode-${m}">${lab}</button>`;
    const clockShown = mode === 'D' ? rec.clockD?.value : mode === 'T' ? rec.clockT?.value : clockRec;
    return `<h2 class="block-title" data-testid="gericht-oefenen">Gericht oefenen</h2>
    <section class="card drill-card" data-testid="drill-bobs27">
      <h3>Bob's 27</h3>
      <p class="muted">Dubbels oefenen. Per ronde 3 pijlen op één dubbel, van D1 tot en met de bull. Raak telt de dubbel erbij, drie keer mis gaat hem eraf. Je tikt alleen hoe vaak je raak gooide.</p>
      ${recLine(`Record: <b>${rec.bobs27 ? rec.bobs27.value : '–'}</b>`)}
      <button class="btn primary big" data-act="start-drill" data-arg="bobs27" data-testid="start-bobs27">Start Bob's 27</button>
    </section>
    <section class="card drill-card" data-testid="drill-c121">
      <h3>121 Checkout</h3>
      <p class="muted">Uitgooien oefenen. Gooi 121 uit met 9 pijlen (dubbel uit). Gelukt: het doel gaat 1 omhoog. Niet gelukt: terug naar je laatst gehaalde doel. 10 doelen per keer.</p>
      ${recLine(`Record: <b>${rec.c121 ? 'niveau ' + rec.c121.value : '–'}</b>`)}
      <button class="btn primary big" data-act="start-drill" data-arg="c121" data-testid="start-c121">Start 121 Checkout</button>
    </section>
    <section class="card drill-card" data-testid="drill-clock">
      <h3>Rond de klok</h3>
      <p class="muted">${mode === 'D' ? 'Alleen dubbels: D1 t/m D20 en daarna de bull.' : mode === 'T' ? 'Alleen triples: T1 t/m T20.' : 'Raak 1 t/m 20 en daarna de bull, in volgorde. Enkel, dubbel of triple: alles telt.'} Hoe minder pijlen, hoe beter. (Alleen voor ${esc(h.player().name)}.)</p>
      <div class="chips small" role="group" aria-label="Welke vakken tellen">${modeBtn('all', 'Alles')}${modeBtn('D', 'Alleen dubbels')}${modeBtn('T', 'Alleen triples')}</div>
      ${recLine(`Record: <b>${clockShown ? clockShown + ' pijlen' : '–'}</b>`)}
      <button class="btn secondary big" data-act="start-clock-mode" data-testid="start-clock">Start rond de klok</button>
    </section>`;
  }

  // ---------- Bob's 27 spelen: één tik per ronde ----------
  function playBobs(dr) {
    const st = D.bobsState(dr.turns);
    const v = D.doubleValue(st.target);
    const last = st.rounds.slice(-3).reverse();
    return `<div class="play">
    <header class="play-top">
      <button class="icon-btn" data-act="pause" aria-label="Pauzeren">${icon('pause', { size: 20 })}</button>
      <div class="play-title"><b>Bob's 27</b><small>Ronde ${st.round + 1} van ${D.BOBS_TARGETS.length}</small></div>
      <span class="icon-btn slot-empty" aria-hidden="true"></span>
    </header>
    <div class="progress"><i style="width:${(st.round / D.BOBS_TARGETS.length) * 100}%"></i></div>
    <section class="scoreboard clock">
      <div class="sb-main"><span>Gooi 3 pijlen op</span><strong class="target-num" data-testid="bobs-target">${dname(st.target)}</strong></div>
      <div class="sb-side">
        <div><span>Score</span><b data-testid="bobs-score">${st.score}</b></div>
        <div><span>Raak</span><b>${st.hits}/${st.darts}</b></div>
        <div><span>Per treffer</span><b>+${v}</b></div>
      </div>
    </section>
    <p class="drill-hint">Hoe vaak raak op ${dname(st.target)}? Drie keer mis: −${v}${st.score - v < 0 ? ' (je score blijft minstens 0)' : ''}.</p>
    <div class="hit-buttons" role="group" aria-label="Aantal keer raak">
      ${[0, 1, 2, 3].map(n => `<button class="hit-btn ${n ? '' : 'zero'}" data-act="bobs-hits" data-arg="${n}" data-testid="bobs-${n}"><b>${n}</b><small>${n === 0 ? `mis · −${v}` : `raak · +${n * v}`}</small></button>`).join('')}
    </div>
    ${last.length ? `<ol class="drill-last">${last.map(r => `<li><span>${dname(r.target)}</span><span>${r.hits}× raak</span><b>${r.delta >= 0 ? '+' : '−'}${Math.abs(r.delta)}</b></li>`).join('')}</ol>` : ''}
    <div class="play-actions">
      ${st.round ? '<button class="btn ghost small" data-act="drill-undo" data-testid="drill-undo">Vorige ronde aanpassen</button>' : ''}
      <button class="btn ghost small" data-act="finish-drill">Stoppen</button>
    </div>
  </div>`;
  }

  // ---------- 121 Checkout spelen: X01-invoer met uitgooi-advies ----------
  function playC121(dr, ui) {
    const st = D.c121State(dr.turns);
    const live = x01Turn(st.remaining, dr.pending, true);
    const rest = live.remaining;
    const left = 3 - dr.pending.length;
    const route = rest <= 170 ? checkout(rest, left, true) : null;
    return `<div class="play">
    <header class="play-top">
      <button class="icon-btn" data-act="pause" aria-label="Pauzeren">${icon('pause', { size: 20 })}</button>
      <div class="play-title"><b>121 Checkout</b><small>Doel ${st.round + 1} van ${D.C121.rounds} · beurt ${st.turnInRound + 1} van ${D.C121.turnsPerRound}</small></div>
      <button class="icon-btn" data-act="toggle-type" aria-label="Typen">${icon('keyboard', { size: 21 })}</button>
    </header>
    <div class="progress"><i style="width:${(st.round / D.C121.rounds) * 100}%"></i></div>
    <section class="scoreboard clock">
      <div class="sb-main"><span>Gooi uit · doel ${st.target}</span><strong class="target-num" data-testid="c121-rest">${rest}</strong></div>
      <div class="sb-side">
        <div><span>Doel</span><b data-testid="c121-target">${st.target}</b></div>
        <div><span>Niveau</span><b data-testid="c121-best">${st.best ?? '–'}</b></div>
        <div><span>Pijlen over</span><b data-testid="c121-left">${(D.C121.turnsPerRound - st.turnInRound - 1) * 3 + left}</b></div>
      </div>
    </section>
    <div class="checkout ${route ? '' : 'none'}" data-testid="checkout">${route ? `<span>Uitgooien:</span> ${route.map(c => `<b>${esc(label(c))}</b>`).join('')}` : `<span>${rest > 1 ? 'Eerst scoren, dan uitgooien' : ''}</span>`}</div>
    <div class="turn-row">${dartSlots(dr.pending)}<div class="turn-total"><small>Deze beurt</small><strong>${dr.pending.reduce((s, c) => s + h.points(c), 0)}</strong></div></div>
    ${typeBox()}
    ${keypad()}
    <div class="play-actions"><button class="btn ghost small" data-act="finish-drill">Stoppen</button></div>
  </div>`;
  }

  // ---------- Rond de klok: alleen dubbels of alleen triples ----------
  function playClockV(dr) {
    const st = D.clockVariantState(dr.kind, [...dr.turns, ...(dr.pending.length ? [{ darts: dr.pending }] : [])]);
    const tLabel = st.target ? dname(st.target) : '';
    const seg = st.target === 'DB' ? 25 : Number(String(st.target || '').slice(1));
    return `<div class="play">
    <header class="play-top">
      <button class="icon-btn" data-act="pause" aria-label="Pauzeren">${icon('pause', { size: 20 })}</button>
      <div class="play-title"><b>${esc(D.DRILL_NAMES[dr.kind])}</b><small>${st.darts} pijlen gegooid</small></div>
      <button class="icon-btn" data-act="toggle-type" aria-label="Typen">${icon('keyboard', { size: 21 })}</button>
    </header>
    <div class="progress"><i style="width:${(st.targetIndex / st.total) * 100}%"></i></div>
    <section class="scoreboard clock">
      <div class="sb-main"><span>Gooi op</span><strong class="target-num" data-testid="clockv-target">${tLabel}</strong></div>
      <div class="sb-side">
        <div><span>Raak</span><b>${st.hits}/${st.total}</b></div>
        <div><span>Pijlen</span><b>${st.darts}</b></div>
        <div><span>Trefkans</span><b>${st.darts ? Math.round(st.hitRate * 100) + '%' : '–'}</b></div>
      </div>
    </section>
    <div class="clock-track">${st.targets.map((t, i) => `<span class="${i < st.targetIndex ? 'done' : i === st.targetIndex ? 'now' : ''}">${t === 'DB' ? 'B' : t.slice(1)}</span>`).join('')}</div>
    <div class="turn-row">${dartSlots(dr.pending)}<div class="turn-total"><small>Tip</small><strong class="tip">Alleen ${tLabel} telt</strong></div></div>
    ${typeBox()}
    ${keypad({ highlight: seg })}
    <div class="play-actions"><button class="btn ghost small" data-act="finish-drill">Stoppen</button></div>
  </div>`;
  }

  // ---------- Uitslag ----------
  function resultDrill(d, r) {
    const res = D.drillResult(d), st = D.drillState(d);
    const name = D.DRILL_NAMES[d.kind];
    let main, sub, body = '';
    if (d.kind === 'bobs27') {
      main = st.score; sub = st.done ? `${st.hits} van ${st.darts} pijlen raak` : `gestopt na ${st.round} van 21 rondes`;
      body = `<section class="card"><h3>Per dubbel</h3><ol class="drill-table">${st.rounds.map(x => `<li><span>${dname(x.target)}</span><span>${x.hits}× raak</span><b>${x.delta >= 0 ? '+' : '−'}${Math.abs(x.delta)}</b></li>`).join('')}</ol></section>`;
    } else if (d.kind === 'c121') {
      main = st.best ?? '–'; sub = `niveau · ${st.successes} van ${st.log.length} doelen uitgegooid`;
      body = `<section class="card"><h3>Per doel</h3><ol class="drill-table">${st.log.map(x => `<li><span>${x.target}</span><span>${x.ok ? 'uit in ' + x.darts + ' pijlen' : 'niet gelukt'}</span><b>${x.ok ? '✓' : '–'}</b></li>`).join('')}</ol></section>`;
    } else {
      main = st.done ? st.darts : `${st.hits}/${st.total}`; sub = st.done ? `pijlen · trefkans ${Math.round(st.hitRate * 100)}%` : 'gestopt';
    }
    return `${header('Uitslag', 'home')}<main class="page">
    <section class="result-hero" data-testid="drill-result"><small>${esc(name)}</small><strong data-testid="drill-value">${main}</strong><span>${esc(sub)}</span></section>
    ${r?.newRecord ? `<p class="note good" data-testid="drill-record">Nieuw persoonlijk record (was ${esc(D.formatResult(d.kind, r.prev))}).</p>` : r?.first ? '<p class="note" data-testid="drill-record">Je eerste resultaat: meteen je record.</p>' : r?.record !== null && r?.record !== undefined ? `<p class="muted small">Je record: ${esc(D.formatResult(d.kind, r.record))}</p>` : ''}
    ${body}
    <div class="row-actions"><button class="btn primary big" data-act="drill-again">Nog een keer</button><button class="btn ghost big" data-go="stats">Statistieken</button></div>
  </main>`;
  }

  function drillDetail(d) {
    const st = D.drillState(d), res = D.drillResult(d);
    const rows = d.kind === 'bobs27' ? st.rounds.map(x => `<li><span>${dname(x.target)}</span><span class="darts">${x.hits}× raak</span><b>${x.score}</b></li>`).join('')
      : d.turns.map((t, i) => `<li><span>${d.kind === 'c121' ? t.target ?? '' : i + 1}</span><span class="darts">${t.darts.map(c => `<i>${esc(label(c))}</i>`).join('')}</span><b>${t.darts.reduce((s, c) => s + h.points(c), 0)}</b></li>`).join('');
    return `<h3>${esc(D.DRILL_NAMES[d.kind])}</h3><p class="muted">${dateTime(d.startedAt)}</p>
      <div class="tiles mini">${tile('Resultaat', esc(D.formatResult(d.kind, res.value ?? null)))}${tile('Pijlen', res.darts)}</div>
      <ol class="turnlist">${rows}</ol>
      <div class="modal-actions"><button class="btn danger ghost" data-act="delete-drill" data-arg="${esc(d.id)}">Verwijderen</button><button class="btn primary" data-act="modal-close">Sluiten</button></div>`;
  }

  // ---------- Startscherm: "Vandaag oefenen" en het weekdoel ----------
  function coachCard(data, playerId, now = new Date()) {
    const a = C.coachAdvice(data, playerId, now);
    const start = a.drill ? `<button class="btn primary" data-act="coach-start" data-arg="${esc(a.drill)}" data-testid="coach-start">${a.drill === 'score30' ? 'Start scoretraining 30 pijlen' : 'Start ' + esc(a.drill === 'clockD' ? 'Rond de klok · dubbels' : a.drill === 'clock' ? 'Rond de klok' : D.DRILL_NAMES[a.drill])}</button>` : '';
    return `<section class="card coach" data-testid="coach" data-rule="${esc(a.rule)}">
      <div class="card-head"><h3>Vandaag oefenen</h3></div>
      <p class="coach-title"><b>${esc(a.title)}</b></p>
      <p>${esc(a.text)}</p>
      <details class="coach-why" data-testid="coach-why"><summary>Waarom?</summary><ul>${a.why.map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>
      <div class="row-actions">${start}</div>
    </section>`;
  }

  function weekCard(data, playerId, now = new Date()) {
    const w = C.weekProgress(data, playerId, now);
    const trend = C.averageTrend(data, playerId, now);
    const recs = C.newRecordsThisWeek(data, playerId, now, { drillRecords: D.drillRecords, trainingTotals: h.trainingTotals, clockState: h.clockState });
    const left = w.goal - w.count;
    return `<section class="card week" data-testid="weekgoal">
      <div class="card-head"><h3>Deze week</h3><span class="week-count" data-testid="week-count">${w.count} van ${w.goal}</span></div>
      <div class="week-dots" aria-label="${w.count} van ${w.goal} trainingen deze week">${WEEKDAYS.map((d, i) => `<span class="${w.days[i] ? 'on' : ''}"><i></i>${d}</span>`).join('')}</div>
      <p>${w.reached ? 'Weekdoel gehaald. Alles wat je nu nog gooit, is extra.' : `Nog ${left} ${left === 1 ? 'training' : 'trainingen'} voor je weekdoel van ${w.goal} per week.`}</p>
      ${trend ? `<p class="muted small">Gemiddelde scoretrainingen deze week <b>${fmt(trend.thisWeek, 1)}</b>; de 4 weken ervoor ${fmt(trend.before, 1)}.</p>` : ''}
      ${recs.length ? `<p class="muted small" data-testid="week-records">Nieuw record deze week: ${recs.map(esc).join(', ')}.</p>` : ''}
      <details class="week-goal-edit"><summary>Weekdoel aanpassen</summary><div class="chips small">${[1, 2, 3, 4, 5, 6, 7].map(n => `<button class="chip ${n === w.goal ? 'on' : ''}" data-act="week-goal" data-arg="${n}" aria-pressed="${n === w.goal}">${n}</button>`).join('')}</div>
        <p class="muted small">Trainingen en gerichte oefeningen tellen mee; de week begint op maandag.</p></details>
    </section>`;
  }

  // ---------- Statistieken: record en trend per week per oefening ----------
  function statsSection(data, ui, playerId) {
    const k = ui.drillStat || 'bobs27';
    const chip = (key, lab) => `<button class="chip ${k === key ? 'on' : ''}" data-act="drill-stat" data-arg="${key}">${lab}</button>`;
    let rec, weeks, count, unit;
    if (k === 'clock') {
      rec = h.records(playerId).clock ?? null;
      weeks = D.weeklyTrendClock(data.trainings, playerId, h.clockState);
      count = data.trainings.filter(t => t.playerId === playerId && t.kind === 'clock').length;
      unit = 'gemiddeld aantal pijlen per week (lager is beter)';
    } else {
      rec = D.drillRecords(data.drills, playerId)[k]?.value ?? null;
      weeks = D.weeklyTrend(data.drills, playerId, k);
      count = (data.drills || []).filter(d => d.playerId === playerId && d.kind === k).length;
      unit = k === 'c121' ? 'hoogste niveau per week' : k === 'bobs27' ? 'gemiddelde score per week' : 'gemiddeld aantal pijlen per week (lager is beter)';
    }
    const pts = weeks.map(w => ({ label: 'wk ' + Number(w.key.split('-W')[1]), value: w.value, sub: `${w.count} keer` }));
    const dbl = (k === 'bobs27' || k === 'clockD') ? D.doubleStats(data.drills, playerId, Infinity) : [];
    return `<section class="card" data-testid="stat-drills">
      <div class="card-head"><h3>Gericht oefenen</h3></div>
      <div class="chips small scroll">${chip('bobs27', "Bob's 27")}${chip('c121', '121')}${chip('clock', 'Klok')}${chip('clockD', 'Klok dubbels')}${chip('clockT', 'Klok triples')}</div>
      <section class="tiles three">${tile('Record', esc(rec === null ? '–' : k === 'clock' ? rec + ' pijlen' : D.formatResult(k, rec)))}${tile('Keer gedaan', int(count))}${tile('Weken', int(weeks.length))}</section>
      ${lineChart(pts, { height: 160 })}
      <p class="muted small">Per week (maandag t/m zondag): ${unit}.</p>
      ${dbl.length ? `<h4>Dubbels <small class="muted">· alleen pijlen met een vast doel</small></h4><ol class="drill-table dbl" data-testid="double-table">${dbl.map(r => `<li><span>${dname(r.target)}</span><span>${r.hits} van ${r.darts}</span><b>${r.darts >= C.COACH.minDartsPerDouble ? pct(r.hits, r.darts) : 'te weinig'}</b></li>`).join('')}</ol>
        <p class="muted small">Een percentage verschijnt pas vanaf ${C.COACH.minDartsPerDouble} pijlen per dubbel.</p>` : ''}
    </section>`;
  }

  return { trainBlock, playBobs, playC121, playClockV, resultDrill, drillDetail, coachCard, weekCard, statsSection };
}

