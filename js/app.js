// OKKIE — interface. Spelregels staan in logic.js, opslag in store.js.
import * as L from './logic.js';
import * as S from './store.js';
import { queueCommunitySync, resumePendingSync, getAccount, apiAvailable, request, dropAccount } from './community-sync.js';
import * as G from './guest-sync.js';
import * as Backup from './backup-alert.js';
import { boardSVG, heatLegend } from './board.js';
import { lineChart, bindChart } from './chart.js';
import { BADGES, earnedBadges, activityDates } from './achievements.js';
import { logoSVG, TAGLINE } from './brand.js';
import { icon } from './icons.js';
import * as T from './transfer.js';
import * as I from './install.js';
import { DARTCOUNTER_SET, dartCounterTrainings, hasDartCounterSet } from './imports.js';
import { rulesPage } from './rules.js';
import * as FB from './feedback.js';
import * as SP from './speech.js';
import * as VL from './voice-lines.js';
import * as M from './motivation.js';
import * as SC from './share-card.js';
import * as SV from './stat-prefs.js';
import { turnChart, bindTurnCharts } from './turn-chart.js';

FB.captureErrors();

export const APP_VERSION = '1.7.1';
// "Nodig een vriend uit": altijd de website als link. Die blijft geldig, ook na de verhuizing van de app.
export const INVITE_URL = 'https://okkiedarts.nl/';
export const INVITE_TEXT = 'Ik train mijn darts met OKKIE. 🎯 Gratis, werkt gewoon op je telefoon en je ziet meteen of je beter wordt. Doe je mee?';

const $ = sel => document.querySelector(sel);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n, dec = 1) => Number(n || 0).toLocaleString('nl-NL', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const int = n => Number(n || 0).toLocaleString('nl-NL');
const dateLabel = iso => new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
const dateTime = iso => new Date(iso).toLocaleString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const now = () => new Date().toISOString();

const store = S.createStore(window.localStorage);
const loaded = store.load();
let data = loaded.data;
sanitizeActive();

const ui = {
  view: 'home',
  mod: 1, // 1 enkel, 2 dubbel, 3 triple
  typing: false,
  statsFilter: 'all',
  statsPeriod: 'training',
  statsLast10: false,
  heatMode: 'all',
  resultPick: null,   // groepsuitslag: van wie de grafiek per beurt
  prefScope: 'one', prefPlayer: null,   // venster 'Pas mijn statistieken aan'
  lastTap: 0,
  result: null,
  setup: { kind: 'score', turns: 10, custom: 15 },
  match: { start: 501, bestOf: 3, doubleOut: true, players: [] },
  installEvent: null,
  fb: { kind: 'probleem', message: '', contact: '', screenshot: null, busy: false, error: '', sent: null, startedAt: 0 },
};

// ---------- Hulpjes ----------
function save() {
  if (!store.save(data)) toast('Opslaan lukt niet! Maak een back-up via Meer → Back-up.', 'error');
}

function sanitizeActive() {
  const a = data.active || {};
  const okTraining = a.training && Array.isArray(a.training.turns) && Array.isArray(a.training.pending);
  const okMatch = a.match && Array.isArray(a.match.legs) && a.match.legs.length && Array.isArray(a.match.pending);
  data.active = { training: okTraining ? a.training : null, match: okMatch ? a.match : null };
  // Oudere lopende trainingen hadden één speler; nu kunnen 1-4 spelers om de beurt gooien.
  const t = data.active.training;
  if (t && !Array.isArray(t.players)) { t.players = [t.playerId]; t.turns.forEach(x => { x.p = 0; }); }
  if (t) t.players = t.players.filter(id => data.players.some(p => p.id === id));
  if (t && !t.players.length) data.active.training = null;
  if (data.activePlayerId && !data.players.some(p => p.id === data.activePlayerId)) data.activePlayerId = data.players[0]?.id || null;
}

function player(id = data.activePlayerId) {
  return data.players.find(p => p.id === id) || null;
}

function myTrainings(kind) {
  return data.trainings
    .filter(t => t.playerId === data.activePlayerId && (!kind || t.kind === kind))
    .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
}

function myMatches() {
  return data.matches
    .filter(m => m.players.some(p => p.id === data.activePlayerId))
    .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
}

function trainingTitle(t) {
  if (t.kind === 'clock') return 'Rond de klok';
  if (t.source) return `Scoretraining ${t.summary.darts} pijlen`;
  return t.limitTurns ? `Scoretraining ${t.limitTurns * 3} pijlen` : 'Vrije scoretraining';
}

function filterKey(t) {
  return t.limitTurns ? String(t.limitTurns * 3) : 'vrij';
}

function overview(playerId = data.activePlayerId) {
  const ts = data.trainings.filter(t => t.playerId === playerId && t.kind === 'score');
  let points = 0, darts = 0, high = 0, best = null, tons = 0, t140 = 0, t180 = 0;
  for (const t of ts) {
    const tot = L.trainingTotals(t);
    points += tot.points; darts += tot.darts;
    high = Math.max(high, tot.high ?? 0);
    tons += tot.tons; t140 += tot.t140; t180 += tot.t180;
    if (tot.darts >= 30 && (!best || tot.avg > best.avg)) best = { avg: tot.avg, t };
  }
  const all = data.trainings.filter(t => t.playerId === playerId);
  return {
    count: all.length,
    avg: L.avg3(points, darts),
    darts,
    high,
    best,
    tons, t140, t180,
    // Gooien telt, ook een wedstrijd of op de telefoon van een vriend (zelfde dagen als de badges).
    streak: L.dayStreak(activityDates(data, playerId)),
  };
}

function haptic(ms = 12) {
  if (data.settings.vibrate && navigator.vibrate) try { navigator.vibrate(ms); } catch { /* niet ondersteund */ }
}

let audioCtx = null;
function beep(kind) {
  if (!data.settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = { tap: [880], ton: [660, 880], max: [523, 659, 784, 1047], bust: [220, 160], win: [523, 784, 1047] }[kind] || [880];
    notes.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = kind === 'bust' ? 'sawtooth' : 'triangle';
      o.frequency.value = f;
      const t0 = audioCtx.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(kind === 'tap' ? 0.04 : 0.12, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (kind === 'tap' ? 0.06 : 0.22));
      o.connect(g).connect(audioCtx.destination);
      o.start(t0); o.stop(t0 + 0.25);
    });
  } catch { /* geen geluid beschikbaar */ }
}

let toastTimer;
function toast(msg, type = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 3200);
}

// Scoreviering: korte banner bovenin het scherm (blokkeert nooit de invoer). Eén per afgeronde beurt.
function celebrate(big, small = '', kind = 'ton') {
  const el = $('#celebrate');
  el.innerHTML = `<div class="cel-inner ${kind}"><div class="cel-big">${esc(big)}</div>${small ? `<div class="cel-small">${esc(small)}</div>` : ''}</div>`;
  if (kind === 'max' || kind === 'win') {
    const colors = ['#3ddc84', '#ff4d4f', '#ffc53d', '#f3eedf', '#b8ff3c'];
    el.insertAdjacentHTML('beforeend', Array.from({ length: 24 }, (_, i) =>
      `<i class="confetti" style="left:${Math.random() * 100}%;background:${colors[i % 5]};animation-delay:${Math.random() * 0.3}s;transform:rotate(${Math.random() * 360}deg)"></i>`).join(''));
  }
  el.className = 'celebrate show';
  clearTimeout(celebrate.t);
  celebrate.t = setTimeout(hideCelebration, kind === 'max' ? 2200 : 1500);
}

function hideCelebration() {
  clearTimeout(celebrate.t);
  const el = $('#celebrate');
  el.className = 'celebrate';
  el.innerHTML = '';
}

// Meldingen en vieringen nooit laten hangen op een ander scherm.
function hideOverlays() {
  hideCelebration();
  clearTimeout(toastTimer);
  $('#toast').className = 'toast';
}

// 100–139: "100+!", 140–179: "140+!", 180: "ONE HUNDRED AND EIGHTY!". Altijd met de echte score.
function turnCelebration(score) {
  if (score === 180) { celebrate('180', 'ONE HUNDRED AND EIGHTY!', 'max'); beep('max'); haptic([40, 40, 40, 40, 120]); }
  else if (score >= 140) { celebrate(String(score), '140+!', 'ton'); beep('ton'); haptic(60); }
  else if (score >= 100) { celebrate(String(score), '100+!', 'ton'); beep('ton'); haptic(40); }
}

// ---------- Gesproken aanmoedigingen (speech.js): alleen als de speler ze aanzette, nooit bij elke beurt ----------
const speechOn = () => !!data.settings.speech && SP.speechSupported();
// "Veel, met grapjes" (standaard) of "Alleen hoogtepunten" (speechMode 'rustig').
const chatty = () => data.settings.speechMode !== 'rustig';
const talk = text => { if (text && speechOn() && chatty()) SP.say(text, { follow: true }); };
// Hoogste beurt uit opgeslagen trainingen/wedstrijden, één keer per sessie berekend.
function savedHigh(playerId) {
  ui.savedHigh ||= new Map();
  if (!ui.savedHigh.has(playerId)) ui.savedHigh.set(playerId, M.highestTurn(data, playerId));
  return ui.savedHigh.get(playerId);
}
// Hoogtepunten (speech.js) gaan altijd voor; anders, in de stand "Veel", een zin uit voice-lines.js (more()).
function voiceTurn(playerId, score, prevInSession, more) {
  if (!speechOn()) return;
  const line = playerId && score >= 100 ? SP.turnLine(score, Math.max(savedHigh(playerId), prevInSession || 0)) : null;
  if (line) {
    if (line.call180) SP.call180();
    if (line.text) SP.say(line.text, { follow: !!line.call180 });
    return;
  }
  if (more && chatty()) { const text = more(); if (text) SP.say(text); }
}
const VOICE_KEY = 'okkie.voice.v1';
function voiceTraining(r, t) {
  if (!speechOn()) return;
  if (r.group) return talk(VL.doneTalk({ group: true }));
  const keys = ['avg30', 'avg60', 'avg99', 'clock', 'tons'].filter(k => r.recordKeys?.includes(k));
  const records = keys.map(k => ({ label: RECORD_LABELS[k][0], spoken: k === 'clock' ? r.after[k] + ' pijlen' : k === 'tons' ? r.after[k] + ' keer honderd plus' : SP.spokenNumber(r.after[k]) + ' gemiddeld' }));
  const tot = L.trainingTotals(t);
  const goalReached = !!r.goal && tot.avg >= r.goal.target;
  let improved = false, state = {};
  try { state = JSON.parse(localStorage.getItem(VOICE_KEY) || '{}') || {}; } catch { /* leeg */ }
  // Verbetering hooguit eens per 3 dagen noemen, zodat het iets bijzonders blijft.
  if (t.kind === 'score' && !(state.improvedAt > Date.now() - 3 * 864e5)) {
    improved = M.improvedClearly(tot.avg, M.comparable(data.trainings, t.playerId, t.limitTurns).filter(x => x.t.id !== t.id));
  }
  const line = SP.trainingLine({ records, improved, goalReached });
  if (!line) return talk(VL.doneTalk({ kind: t.kind, avg: tot.avg, prevAvg: r.prevAvg ?? null, darts: t.kind === 'clock' ? L.clockState(t).darts : tot.darts }));
  if (SP.say(line.text, { follow: true }) && line.improvement) { try { localStorage.setItem(VOICE_KEY, JSON.stringify({ ...state, improvedAt: Date.now() })); } catch { /* geen opslag */ } }
}

// ---------- Modal ----------
function modal(html, { onClose } = {}) {
  hideOverlays();
  const el = $('#modal');
  el.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">${html}</div>`;
  el.hidden = false;
  bindTurnCharts(el);
  el.onclick = e => { if (e.target === el) closeModal(); };
  modal.onClose = onClose;
  el.querySelector('input,button')?.focus({ preventScroll: true });
}

function closeModal() {
  const el = $('#modal');
  el.hidden = true;
  el.innerHTML = '';
  modal.onClose?.();
  modal.onClose = null;
}

// Eigen bevestigingsvenster (geen browser-confirm).
function confirmBox(title, text, okLabel, onOk, danger = true) {
  modal(`<h3>${esc(title)}</h3><p>${esc(text)}</p>
    <div class="modal-actions"><button class="btn ghost" data-act="modal-close">Annuleren</button>
    <button class="btn ${danger ? 'danger' : 'primary'}" data-act="modal-ok">${esc(okLabel)}</button></div>`);
  confirmBox.ok = onOk;
}

// ---------- Navigatie ----------
function go(view) {
  hideOverlays();
  ui.view = view;
  ui.typing = false;
  render();
  window.scrollTo(0, 0);
}

const PLAY_VIEWS = new Set(['play-score', 'play-clock', 'play-match']);

function render() {
  if (!data.players.length) ui.view = 'welcome';
  const view = VIEWS[ui.view] || VIEWS.home;
  const play = PLAY_VIEWS.has(ui.view);
  document.body.classList.toggle('playing', play);
  $('#app').innerHTML = view();
  ui.justAdded = false;
  $('#tabbar').hidden = play || ui.view === 'welcome';
  document.querySelectorAll('#tabbar [data-go]').forEach(b => b.classList.toggle('active', b.dataset.go === tabOf(ui.view)));
  bindChart($('#app'));
  bindTurnCharts($('#app'));
  const auto = $('#app [autofocus]');
  if (auto && !matchMedia('(pointer: coarse)').matches) auto.focus();
}

function tabOf(view) {
  if (['regels', 'hulp', 'andere-app', 'history'].includes(view)) return 'more';
  if (view.startsWith('train') || view === 'result-training') return 'train';
  if (view.startsWith('match') || view === 'result-match') return 'match';
  return view;
}

// ---------- Schermen ----------
const VIEWS = {};

VIEWS.welcome = () => `
  <section class="welcome">
    <div class="welcome-logo">${logoSVG({ height: 72 })}</div>
    <p class="tagline">${TAGLINE}</p>
    <p class="lead">Jouw eigen darttrainer. Gooi, tik je pijlen in en zie of je beter wordt.</p>
    ${T.role() === 'new' ? fetchCard() : ''}
    ${T.announce() ? newHereCard() : ''}
    <form class="card" data-form="welcome">
      <label for="wname">Hoe heet je?</label>
      <input id="wname" name="name" maxlength="24" autocomplete="nickname" placeholder="Je naam" required autofocus>
      <button class="btn primary big" type="submit">Let's play darts</button>
    </form>
    ${T.role() !== 'new' && I.isStandalone() ? fetchCard() : ''}
    <a class="btn ghost welcome-guide" href="./uitleg/">${icon('book', { size: 19 })}Hoe werkt het? Uitleg in 2 minuten</a>
    <p class="fineprint">Alles wordt op dit toestel bewaard. Geen account, geen reclame.</p>
      <p class="maker-line"><a class="maker" href="https://denckh.nl/" target="_blank" rel="noopener" aria-label="Ontwikkeld door Denckh (naar denckh.nl)"><span class="maker-role">Ontwikkeld door</span><img class="on-dark" src="./icons/denckh-logo-signature-light.svg" alt="Denckh" width="92" height="28"><img class="on-light" src="./icons/denckh-logo-signature.svg" alt="Denckh" width="92" height="28"></a></p>
  </section>`;

// Oude adres tijdens de verhuizing: een nieuwe bezoeker (bijv. via een oude link) begint liever meteen op het
// nieuwe adres. Geen doorverwijzing: hier verder spelen blijft gewoon mogelijk.
function newHereCard() {
  return `<section class="card move-card" data-testid="new-here"><h3>OKKIE. staat nu op app.okkiedarts.nl</h3>
    <p class="muted">Begin daar, dan staan je trainingen meteen op de goede plek. Hier blijft alles ook gewoon werken.</p>
    <a class="btn primary" href="${T.NEW_APP()}">Open app.okkiedarts.nl</a></section>`;
}

// Op het nieuwe adres staat dit bovenaan (daar komen tijdens de verhuizing vooral bestaande spelers),
// in een geïnstalleerde app onder het naamveld.
function fetchCard() {
  return `<section class="card move-card" data-testid="fetch-card"><h3>Al eerder OKKIE. gebruikt?</h3>
      <p class="muted">In Safari of op een andere telefoon? Haal eerst je spelers en trainingen hierheen.</p>
      <button class="btn secondary" data-act="transfer-receive">${icon('download', { size: 19 })}Trainingen ophalen</button></section>`;
}

function header(title, back) {
  const p = player();
  return `<header class="top">
    ${back ? `<button class="icon-btn" data-go="${back}" aria-label="Terug">${icon('back', { size: 20 })}</button>` : `<div class="top-logo">${logoSVG({ height: 30 })}</div>`}
    ${title ? `<h1>${esc(title)}</h1>` : '<span></span>'}
    <button class="player-chip" data-act="switch-player" aria-label="Speler wisselen"><span class="dot" style="background:${esc(p?.color)}"></span>${esc(p?.name)}</button>
  </header>`;
}

VIEWS.home = () => {
  const o = overview();
  const p = player();
  const recent = myTrainings('score').slice(-12);
  const at = data.active.training, am = data.active.match;
  const greet = (() => { const h = new Date().getHours(); return h < 6 ? 'Nachtsessie' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond'; })();
  return `${header('')}
  <main class="page">
    <section class="hero">
      <div class="hero-text">
        <small>${greet},</small>
        <h2>${esc(p.name)}</h2>
        ${o.streak >= 2 ? `<span class="streak">🔥 ${o.streak} dagen op rij</span>` : o.count ? '' : '<span class="streak">Klaar voor je eerste training?</span>'}
      </div>
      <div class="hero-avg">
        <span class="label">Gemiddelde</span>
        <strong data-testid="home-avg">${o.darts ? fmt(o.avg, 1) : '–'}</strong>
        <span class="label">per 3 pijlen</span>
      </div>
    </section>
    ${at ? resumeCard('training', at) : ''}
    ${am ? resumeCard('match', am) : ''}
    ${T.announce() ? moveCard() : ''}
    ${installReminder()}
    ${Backup.due(data, data.activePlayerId) ? `<section class="card" role="status"><h3>Even een back-up bewaren?</h3><p>Je hebt weer tien trainingen afgerond. Bewaar jouw scores veilig op je telefoon of in iCloud Drive/Google Drive.</p><div class="row-actions"><button class="btn primary" data-act="backup-share">Back-up bewaren</button><button class="btn ghost" data-act="backup-dismiss">Later</button></div></section>` : ''}
    <section class="actions">
      <button class="action train" data-go="train">
        <span class="a-icon">${icon('train', { size: 24 })}</span><span><b>Trainen</b><small>Scoretraining of rond de klok</small></span>
      </button>
      <button class="action match" data-go="match">
        <span class="a-icon">${icon('match')}</span><span><b>Wedstrijd</b><small>301 / 501, alleen of samen</small></span>
      </button>
      <button class="action stats" data-go="stats">
        <span class="a-icon">${icon('stats')}</span><span><b>Mijn statistieken</b><small>Word ik beter?</small></span>
      </button>
      <a class="action stats" href="./community/" aria-label="Open Darters" data-testid="darters-link">
        <span class="a-icon">${icon('trophy')}</span><span><b>Darters</b><small>Bekijk andere darters en deel zelf je cijfers</small></span>
      </a>
    </section>
    ${o.count < 3 ? `<section class="card next-badge"><span class="a-icon">${icon('book')}</span><div><b>Nieuw? Zo werkt OKKIE.</b><p>Leer scoren met een oefenbeurt van 3 pijlen.</p></div><a class="btn secondary small" href="./uitleg/">Uitleg</a></section>` : ''}
    <section class="tiles">
      ${tile('Trainingen', int(o.count))}
      ${tile('Beste training', o.best ? fmt(o.best.avg, 1) : '–')}
      ${tile('Hoogste beurt', o.high ? o.high : '–')}
      ${tile('180’s', int(o.t180))}
    </section>
    ${recent.length >= 2 ? `<section class="card"><div class="card-head"><h3>Laatste trainingen</h3><button class="link" data-go="stats">Alles bekijken</button></div>
      ${lineChart(recent.map(t => { const tot = L.trainingTotals(t); return { label: dateLabel(t.startedAt), value: tot.avg, sub: trainingTitle(t) }; }), { height: 160 })}</section>` : ''}
  </main>`;
};

function tile(label, value, extra = '', sub = '') {
  return `<div class="tile ${extra}"><span>${esc(label)}</span><strong>${value}</strong>${sub ? `<small>${sub}</small>` : ''}</div>`;
}

// ----- Samen trainen: 1-4 spelers gooien om de beurt 3 pijlen -----
function curIdx(t) { return t.turns.length % t.players.length; }
function playerTurns(t, i) { return t.turns.filter(x => x.p === i); }
function subTotals(t, i) { return L.trainingTotals({ turns: playerTurns(t, i) }); }
function trainingDone(t) { return !!t.limitTurns && t.players.every((_, i) => playerTurns(t, i).length >= t.limitTurns); }
function names(ids) { return ids.map(id => player(id)?.name || '?'); }

function resumeCard(type, a) {
  if (type === 'training') {
    const tot = a.players.length > 1 ? subTotals(a, curIdx(a)) : L.trainingTotals(a);
    const sub = a.kind === 'clock' ? `Bij doel ${L.clockState(a).target === 25 ? 'Bull' : L.clockState(a).target}`
      : a.players.length > 1 ? `${names(a.players).map(esc).join(', ')} · ${esc(names([a.players[curIdx(a)]])[0])} is aan de beurt`
      : `${tot.darts}${a.limitTurns ? ' / ' + a.limitTurns * 3 : ''} pijlen · gem. ${fmt(tot.avg)}`;
    return `<section class="resume"><div><small>Bezig</small><b>${esc(trainingTitle(a))}</b><span>${sub}</span></div>
      <button class="btn primary" data-act="resume-training">Verder</button></section>`;
  }
  const st = L.matchState(a);
  return `<section class="resume"><div><small>Wedstrijd bezig</small><b>${a.players.map(p => esc(p.name)).join(' – ')}</b><span>${a.settings.start} · legs ${st.won.join('–')}</span></div>
    <button class="btn primary" data-act="resume-match">Verder</button></section>`;
}

// ----- Training kiezen -----
function setupPlayers() {
  const s = ui.setup;
  s.players = (s.players || []).filter(id => player(id));
  if (!s.players.length) s.players = [data.activePlayerId];
  return s.players;
}

VIEWS.train = () => {
  const s = ui.setup;
  const ps = setupPlayers();
  const opt = (turns, label, sub) => `<button class="choice ${s.kind === 'score' && s.turns === turns ? 'on' : ''}" data-act="setup-turns" data-arg="${turns}" aria-pressed="${s.kind === 'score' && s.turns === turns}"><b>${label}</b><small>${sub}</small></button>`;
  const info = s.turns === 0 ? 'Vrij trainen: stop wanneer je wilt.' : s.turns === -1 ? `${s.custom} beurten van 3 pijlen (${s.custom * 3} pijlen).` : `${s.turns} beurten van 3 pijlen.`;
  return `${header('Trainen', 'home')}
  <main class="page">
    ${data.active.training ? `<div class="note">Je hebt nog een training open. Als je een nieuwe start, wordt die eerst opgeslagen.</div>` : ''}
    <section class="card">
      <h3>Scoretraining</h3>
      <p class="muted">Gooi telkens 3 pijlen en tik ze in. Zo veel mogelijk punten scoren.</p>
      <div class="choices">
        ${opt(10, '30', 'pijlen')}
        ${opt(20, '60', 'pijlen')}
        ${opt(33, '99', 'pijlen')}
        ${opt(0, '∞', 'vrij')}
        ${opt(-1, s.turns === -1 ? String(s.custom * 3) : '…', 'eigen')}
      </div>
      <p class="choice-info">${info}</p>
      ${goalLine(ps, s)}
      ${s.turns === -1 ? `<label class="inline">Aantal beurten <input type="number" min="1" max="200" inputmode="numeric" value="${s.custom}" data-input="custom-turns"></label>` : ''}
      <h3 class="who">Wie gooien er? <small>max. 4, om de beurt</small></h3>
      <ol class="match-players" data-testid="train-players">${ps.map((id, i) => `<li><span><i class="dot" style="background:${esc(player(id).color)}"></i> ${esc(player(id).name)}${G.guestLink(id)?.code ? ' <span class="linked" title="Gekoppeld: deze training gaat naar zijn eigen OKKIE.">🔗</span>' : ''}</span>
        ${i > 0 ? `<button class="icon-btn small" data-act="tp-up" data-arg="${i}" aria-label="Eerder gooien">↑</button>` : ''}
        ${ps.length > 1 ? `<button class="icon-btn small" data-act="tp-remove" data-arg="${i}" aria-label="Niet meedoen">✕</button>` : ''}</li>`).join('')}</ol>
      ${ps.length < 4 ? `<button class="btn secondary add-btn" data-act="add-player-open" data-arg="train" data-testid="add-player">+ Speler toevoegen</button>` : ''}
      <button class="btn primary big" data-act="start-score" data-testid="start-score">${ps.length > 1 ? `Start met ${ps.length} spelers` : 'Start scoretraining'}</button>
    </section>
    <section class="card">
      <h3>Rond de klok</h3>
      <p class="muted">Raak 1 t/m 20 en daarna de bull, in volgorde. Hoe minder pijlen, hoe beter. Enkel, dubbel of triple: alles telt. (Alleen voor ${esc(player().name)}.)</p>
      <button class="btn secondary big" data-act="start-clock">Start rond de klok</button>
    </section>
  </main>`;
};

// Persoonlijk doel onder de keuze, alleen als je alleen traint en er genoeg vergelijkbare trainingen zijn.
function goalLine(ps, s) {
  if (ps.length !== 1) return '';
  const g = M.goalFor(data.trainings, ps[0], s.turns === -1 ? s.custom : s.turns || null);
  if (!g) return '';
  return `<p class="goal-line" data-testid="goal"><span>Jouw doel: <b>${fmt(g.target, 1)}</b> gemiddeld${g.record ? ', je record verbeteren' : ''}</span>
    <small>Laatste keren ${fmt(g.recent, 1)} · record ${fmt(g.best, 1)}</small></p>`;
}

// Eén venster om een speler toe te voegen, bij trainen én bij een wedstrijd: iemand van deze telefoon, een nieuwe naam,
// of (alleen hier, als het relevant is) een vriend met eigen OKKIE. via zijn koppelcode.
function addPlayerModal(ctx = ui.addCtx) {
  ui.addCtx = ctx;
  const inList = ctx === 'match' ? ui.match.players.map(p => p.id) : setupPlayers();
  if (inList.length >= 4) return closeModal();
  const others = data.players.filter(p => !inList.includes(p.id));
  const act = ctx === 'match' ? 'mp-add' : 'tp-add';
  modal(`<h3>Speler toevoegen</h3>
    ${others.length ? `<div class="chips add-known">${others.map(p => `<button class="chip" data-act="${act}" data-arg="${esc(p.id)}">+ ${esc(p.name)}</button>`).join('')}</div>` : ''}
    <form data-form="${ctx === 'match' ? 'guest' : 'train-player'}" class="guest"><input name="name" maxlength="24" placeholder="${ctx === 'match' ? 'Naam tegenstander' : 'Naam vriend of familie'}" aria-label="Naam nieuwe speler"><button class="btn secondary">Toevoegen</button></form>
    ${apiAvailable() ? `<button class="btn ghost small link-code" data-act="guest-link-open" data-testid="guest-link-open">${icon('group', { size: 17 })}Speler met eigen OKKIE.? Vul zijn koppelcode in</button>` : ''}
    <div class="modal-actions"><button class="btn primary" data-act="modal-close">Klaar</button></div>`);
}
// Na toevoegen: venster dicht, lijst bijgewerkt. Nog iemand? Dan tik je opnieuw op Speler toevoegen.
function playerAdded() {
  closeModal();
  render();
}

// ----- Toetsenbord -----
function keypad({ highlight = null } = {}) {
  const m = ui.mod;
  const nums = Array.from({ length: 20 }, (_, i) => i + 1)
    .map(n => `<button class="key ${highlight === n ? 'target' : ''}" data-act="key" data-arg="${n}">${m === 2 ? 'D' : m === 3 ? 'T' : ''}${n}</button>`).join('');
  return `<div class="keypad mod-${m}" role="group" aria-label="Score-invoer">
    <div class="mods">
      <button class="mod ${m === 2 ? 'on' : ''}" data-act="mod" data-arg="2" aria-pressed="${m === 2}">DOUBLE</button>
      <button class="mod ${m === 3 ? 'on' : ''}" data-act="mod" data-arg="3" aria-pressed="${m === 3}">TRIPLE</button>
    </div>
    <div class="nums">${nums}</div>
    <div class="specials">
      <button class="key bull ${highlight === 25 ? 'target' : ''}" data-act="key" data-arg="25">25</button>
      <button class="key bull ${highlight === 25 ? 'target' : ''}" data-act="key" data-arg="50">BULL</button>
      <button class="key miss" data-act="key" data-arg="0">MIS</button>
      <button class="key undo" data-act="undo" aria-label="Laatste pijl wissen">⌫</button>
    </div>
  </div>`;
}

function dartSlots(pending, extra = '') {
  return `<div class="slots ${extra}">${[0, 1, 2].map(i => {
    const c = pending[i];
    const tag = c ? 'button' : 'div';
    return `<${tag} class="slot ${c ? 'filled' : ''} ${i === pending.length ? 'current' : ''} ${c && ui.justAdded && i === pending.length - 1 ? 'new' : ''}" data-testid="slot-${i}"${c ? ` data-act="slot" data-arg="${i}" aria-label="Pijl ${i + 1} (${esc(L.label(c))}) wissen"` : ''}>
      <small>Pijl ${i + 1}</small><b>${c ? esc(L.label(c)) : ''}</b>${c ? `<span>${L.points(c)}</span>` : ''}</${tag}>`;
  }).join('')}</div>`;
}

function typeBox() {
  return ui.typing ? `<form class="typebox" data-form="type"><input name="line" placeholder="bv. T20 5 D10" autocomplete="off" autocapitalize="characters" enterkeyhint="done" autofocus aria-label="Typ je pijlen"><button class="btn primary">OK</button></form>` : '';
}

// ----- Scoretraining spelen -----
VIEWS['play-score'] = () => {
  const t = data.active.training;
  if (!t) return VIEWS.home();
  const n = t.players.length;
  const cur = curIdx(t);
  const tot = subTotals(t, cur);
  const limit = L.trainingLimitDarts(t);
  const pend = t.pending;
  const mine = playerTurns(t, cur);
  const turnNo = mine.length + 1;
  const last = mine[mine.length - 1];
  const pct = limit ? Math.min(100, (t.turns.length / (t.limitTurns * n)) * 100) : 0;
  const strip = n > 1 ? `<section class="gp n${n}" data-testid="group-strip">${t.players.map((id, i) => {
    const st = subTotals(t, i), p = player(id);
    return `<div class="gp-p ${i === cur ? 'up' : ''}" data-testid="gp-${i}"><b><i class="dot" style="background:${esc(p?.color)}"></i>${esc(p?.name)}</b><strong>${int(st.points)}</strong><small>gem. ${fmt(st.avg, 1)}</small></div>`;
  }).join('')}</section>` : '';
  return `<div class="play">
    <header class="play-top">
      <button class="icon-btn" data-act="pause" aria-label="Pauzeren">${icon('pause', { size: 20 })}</button>
      <div class="play-title"><b>${esc(trainingTitle(t))}</b><small>${n > 1 ? `<span data-testid="now-up">${esc(player(t.players[cur])?.name)}</span> · ` : ''}Beurt ${turnNo}${t.limitTurns ? ' van ' + t.limitTurns : ''}</small></div>
      <button class="icon-btn" data-act="toggle-type" aria-label="Typen">${icon('keyboard', { size: 21 })}</button>
    </header>
    ${limit ? `<div class="progress"><i style="width:${pct}%"></i></div>` : ''}
    ${strip}
    <section class="scoreboard ${n > 1 ? 'compact' : ''}">
      <div class="sb-main"><span>${n > 1 ? esc(player(t.players[cur])?.name) + ' · gem.' : 'Gemiddelde'}</span><strong data-testid="live-avg">${fmt(tot.avg, 2)}</strong></div>
      <div class="sb-side">
        <div><span>Totaal</span><b data-testid="live-total">${int(tot.points)}</b></div>
        <div><span>Pijlen</span><b>${tot.darts}${limit ? '/' + limit : ''}</b></div>
        <div><span>Hoogste</span><b>${tot.high ?? '–'}</b></div>
        <div><span>Laagste</span><b>${tot.low ?? '–'}</b></div>
      </div>
    </section>
    <div class="turn-row">
      ${dartSlots(pend)}
      <div class="turn-total"><small>Deze beurt</small><strong data-testid="turn-total">${L.turnScore(pend)}</strong>
        ${last && !pend.length ? `<span class="last">vorige: ${L.turnScore(last.darts)}</span>` : ''}</div>
    </div>
    ${typeBox()}
    ${keypad()}
    <div class="play-actions">
      <button class="btn ghost small" data-act="finish-training">${t.turns.length ? 'Klaar & bewaren' : 'Stoppen'}</button>
    </div>
  </div>`;
};

// ----- Rond de klok spelen -----
VIEWS['play-clock'] = () => {
  const t = data.active.training;
  if (!t) return VIEWS.home();
  const flat = { ...t, turns: [...t.turns, ...(t.pending.length ? [{ darts: t.pending }] : [])] };
  const st = L.clockState(flat);
  const pend = t.pending;
  const targetLabel = st.target === 25 ? 'BULL' : st.target;
  return `<div class="play">
    <header class="play-top">
      <button class="icon-btn" data-act="pause" aria-label="Pauzeren">${icon('pause', { size: 20 })}</button>
      <div class="play-title"><b>Rond de klok</b><small>${st.darts} pijlen gegooid</small></div>
      <button class="icon-btn" data-act="toggle-type" aria-label="Typen">${icon('keyboard', { size: 21 })}</button>
    </header>
    <div class="progress"><i style="width:${(st.targetIndex / L.CLOCK_TARGETS.length) * 100}%"></i></div>
    <section class="scoreboard clock">
      <div class="sb-main"><span>Gooi op</span><strong class="target-num" data-testid="clock-target">${targetLabel}</strong></div>
      <div class="sb-side">
        <div><span>Raak</span><b>${st.hits}/21</b></div>
        <div><span>Pijlen</span><b>${st.darts}</b></div>
        <div><span>Trefkans</span><b>${st.darts ? Math.round(st.hitRate * 100) + '%' : '–'}</b></div>
      </div>
    </section>
    <div class="clock-track">${L.CLOCK_TARGETS.map((n, i) => `<span class="${i < st.targetIndex ? 'done' : i === st.targetIndex ? 'now' : ''}">${n === 25 ? 'B' : n}</span>`).join('')}</div>
    <div class="turn-row">${dartSlots(pend)}<div class="turn-total"><small>Tip</small><strong class="tip">Alles op ${targetLabel} telt</strong></div></div>
    ${typeBox()}
    ${keypad({ highlight: st.target })}
    <div class="play-actions"><button class="btn ghost small" data-act="finish-training">Stoppen & bewaren</button></div>
  </div>`;
};

// ----- Training-uitslag -----
VIEWS['result-training'] = () => {
  const r = ui.result;
  if (!r) return VIEWS.home();
  const t = data.trainings.find(x => x.id === r.id);
  if (!t) return VIEWS.home();
  if (t.kind === 'clock') {
    const st = L.clockState(t);
    return `${header('Uitslag', 'home')}<main class="page">
      <section class="result-hero"><small>Rond de klok</small><strong>${st.done ? st.darts : st.hits + '/21'}</strong><span>${st.done ? 'pijlen nodig' : 'doelen geraakt'}</span></section>
      ${r.newBadges.length ? badgeBanner(r.newBadges) : ''}
      <section class="tiles three">${tile('Trefkans', Math.round(st.hitRate * 100) + '%')}${tile('Pijlen', st.darts)}${tile('Beste ooit', r.bestClock ? r.bestClock + ' pijlen' : '–')}</section>
      <div class="row-actions"><button class="btn primary big" data-act="again">Nog een keer</button><button class="btn ghost big" data-go="home">Home</button></div>
      ${shareButton(r)}
    </main>`;
  }
  if (r.group) {
    const limitDarts = (r.limitTurns || 0) * 3;
    const rows = r.group.map(g => ({ ...g, t: data.trainings.find(x => x.id === g.id) })).filter(g => g.t)
      .map(g => { const series = L.turnSeries(g.t); return { ...g, tot: L.trainingTotals(g.t), p: player(g.playerId), series, hi: L.extremeTurns(series, 'high') }; })
      .sort((a, b) => b.tot.avg - a.tot.avg);
    const gsv = SV.statView(data.settings, data.activePlayerId);
    const pick = rows.find(g => g.playerId === ui.resultPick) || rows.find(g => g.playerId === data.activePlayerId) || rows[0];
    const medal = i => ['🥇', '🥈', '🥉', '4'][i];
    const extra = rows.filter(g => g.newBadges.length);
    return `${header('Uitslag', 'home')}<main class="page">
      <section class="result-hero win"><small>${esc(trainingTitle(rows[0].t))} · ${rows.length} spelers</small><strong data-testid="group-winner">${esc(rows[0].p?.name)}</strong><span>hoogste gemiddelde: ${fmt(rows[0].tot.avg, 2)}</span></section>
      <section class="card"><ol class="ranking">${rows.map((g, i) => `<li><span class="rk">${medal(i)}</span><span class="rk-name"><b>${esc(g.p?.name)}${limitDarts && g.tot.darts < limitDarts ? ' <small class="muted">(onvolledig)</small>' : ''}</b>
        <small>${int(g.tot.points)} punten · hoogste beurt ${g.tot.high ?? '–'}${g.hi ? ` (${turnsText(g.hi.turns, false)})` : ''}</small>
        ${compareLine(g.tot.avg, g.prevAvg)}
        ${g.records.length ? `<small class="rk-rec">🏅 ${g.records.map(esc).join(' · ')}</small>` : ''}</span>
        <strong>${fmt(g.tot.avg, 2)}<small>gem.</small></strong></li>`).join('')}</ol></section>
      ${SV.shows(gsv, 'one', 'turns') && pick.series.length ? `<section class="card"><div class="card-head"><h3>Score per beurt</h3></div>
        <div class="chips small" data-testid="result-pick">${rows.map(g => `<button class="chip ${g === pick ? 'on' : ''}" data-act="result-pick" data-arg="${esc(g.playerId)}">${esc(g.p?.name)}</button>`).join('')}</div>
        ${turnChart(pick.series, { best: pick.hi?.turns || [], avg: pick.tot.avg })}</section>` : ''}
      <details class="card more"><summary>Badges en meer statistieken</summary>
        ${extra.length ? extra.map(g => `<h4>${esc(g.p?.name)}</h4>${badgeBanner(g.newBadges)}`).join('') : '<p class="muted small">Geen nieuwe badges deze keer.</p>'}
        <h4>Per speler</h4><table class="mtable"><thead><tr><th></th><th>Pijlen</th><th>100+</th><th>140+</th><th>180</th><th>Laagste</th></tr></thead><tbody>
        ${rows.map(g => `<tr><th>${esc(g.p?.name)}</th><td>${g.tot.darts}</td><td>${g.tot.tons}</td><td>${g.tot.t140}</td><td>${g.tot.t180}</td><td>${g.tot.low ?? '–'}</td></tr>`).join('')}</tbody></table>
      </details>
      ${prefsButton('one')}
      <div class="row-actions"><button class="btn primary big" data-act="again">Nog een potje</button><button class="btn ghost big" data-go="home">Home</button></div>
    </main>`;
  }
  const tot = L.trainingTotals(t);
  const limitDarts = (t.limitTurns || 0) * 3;
  const partial = limitDarts && tot.darts < limitDarts;
  // Wat deze speler na een training wil zien (Pas mijn statistieken aan). Standaard alleen het belangrijkste.
  const sv = SV.statView(data.settings, t.playerId);
  const on = k => SV.shows(sv, 'one', k);
  const series = L.turnSeries(t);
  const hi = L.extremeTurns(series, 'high'), lo = L.extremeTurns(series, 'low');
  const hero = on('avg') ? { v: fmt(tot.avg, 2), u: 'gemiddelde per 3 pijlen', id: 'result-avg' } : on('points') ? { v: int(tot.points), u: 'punten', id: 'result-points' } : { v: int(tot.darts), u: 'pijlen gegooid', id: 'result-darts' };
  const tiles = [
    on('points') && hero.id !== 'result-points' ? tile('Totaal punten', int(tot.points)) : '',
    on('darts') ? tile('Pijlen', int(tot.darts)) : '',
    on('low') ? tile('Laagste beurt', lo ? lo.score : '–', '', lo ? turnsText(lo.turns) : '') : '',
  ].filter(Boolean);
  return `${header('Uitslag', 'home')}<main class="page">
    <section class="result-hero"><small>${esc(trainingTitle(t))}${partial ? ' · onvolledig' : ''}</small><strong data-testid="${hero.id}">${hero.v}</strong><span>${hero.u}</span>
      ${on('prev') ? compareLine(tot.avg, r.prevAvg) : ''}
      ${on('avg') && r.goal && !partial ? `<em class="cmp ${tot.avg >= r.goal.target ? 'up' : ''}" data-testid="goal-result">${tot.avg >= r.goal.target ? `Doel ${fmt(r.goal.target, 1)} gehaald!` : `Doel ${fmt(r.goal.target, 1)}: nog ${fmt(r.goal.target - tot.avg, 1)} te gaan.`}</em>` : ''}</section>
    ${on('records') && r.records.length ? `<section class="records-banner">🏅 <b>Nieuw record!</b> ${r.records.map(esc).join(' · ')}</section>` : ''}
    ${r.newBadges.length ? `<details class="card more"><summary>🏅 ${r.newBadges.length === 1 ? 'Nieuwe badge: ' + esc(BADGES.find(b => b.id === r.newBadges[0])?.name || '') : r.newBadges.length + ' nieuwe badges'}</summary>${badgeBanner(r.newBadges)}</details>` : ''}
    ${on('high') ? bestTurnCard(series, hi) : ''}
    ${on('turns') && series.length ? `<section class="card"><div class="card-head"><h3>Score per beurt</h3></div>${turnChart(series, { best: hi?.turns || [], avg: tot.avg })}${allTurns(series, hi)}</section>` : ''}
    ${tiles.length ? `<section class="tiles" data-testid="result-tiles">${tiles.join('')}</section>` : ''}
    ${on('tons') ? `<section class="tiles three" data-testid="result-tons">${tile('100+', tot.tons)}${tile('140+', tot.t140)}${tile('180', tot.t180)}</section>` : ''}
    ${prefsButton('one', t.playerId)}
    <div class="row-actions"><button class="btn primary big" data-act="again">Nog een keer</button><button class="btn ghost big" data-go="stats">Statistieken</button></div>
    ${shareButton(r)}
  </main>`;
};

// "Beurt 4" of "beurt 4 en 7" / "beurt 2, 4 en 7".
function turnsText(ns, cap = true) {
  const list = ns.length > 1 ? ns.slice(0, -1).join(', ') + ' en ' + ns[ns.length - 1] : String(ns[0]);
  return (cap ? 'Beurt ' : 'beurt ') + list;
}

// Hoogste beurt van één training: score, beurtnummer(s) en de drie pijlen. Bij een gedeelde score alle beurten.
function bestTurnCard(series, hi) {
  if (!series.length) return '';
  if (!hi) return `<section class="card best-turn" data-testid="best-turn"><span class="overline">Hoogste beurt</span><p class="muted">Nog geen volledige beurt van 3 pijlen.</p></section>`;
  const rows = series.filter(x => hi.turns.includes(x.n));
  return `<section class="card best-turn" data-testid="best-turn">
    <span class="overline">Hoogste beurt</span>
    <div class="bt-main"><strong>${hi.score}</strong><span>${turnsText(hi.turns)} <small>van ${series.length}</small>${rows.length > 1 ? ' <small>· gedeelde hoogste</small>' : ''}</span></div>
    <ul class="bt-list">${rows.map(x => `<li><span>Beurt ${x.n}</span><span class="darts">${x.darts.map(c => `<i>${esc(L.label(c))}</i>`).join('')}</span></li>`).join('')}</ul>
  </section>`;
}

// Alle beurten op volgorde, als lijst (handig bij veel beurten en voor schermlezers).
function allTurns(series, hi) {
  const best = new Set(hi?.turns || []);
  return `<details class="all-turns"><summary>Alle ${series.length} beurten op een rij</summary>
    <ol class="turnlist">${series.map(x => `<li class="${best.has(x.n) ? 'best' : ''}${x.complete ? '' : ' part'}"><span>${x.n}</span><span class="darts">${x.darts.map(c => `<i>${esc(L.label(c))}</i>`).join('')}${x.complete ? '' : ' <small>onvolledig</small>'}</span><b>${x.score}</b></li>`).join('')}</ol></details>`;
}

function prefsButton(scope, pid = data.activePlayerId) {
  return `<p class="prefs-row"><button class="btn ghost small" data-act="stat-prefs" data-arg="${scope}|${esc(pid)}" data-testid="stat-prefs">${icon('sliders', { size: 17 })}Pas mijn statistieken aan</button></p>`;
}

// Delen van één eigen training. Na een record of gehaald doel iets duidelijker, maar hooguit eens per 2 weken (SHARE_KEY).
function shareButton(r) {
  return `<p class="share-row"><button class="btn ${r.suggestShare ? 'secondary' : 'ghost'} small" data-act="share-result" data-testid="share-result">${icon('share', { size: 17 })}${r.suggestShare ? (r.records?.length ? 'Deel je record' : 'Deel je score of daag een vriend uit') : 'Deel je score'}</button></p>`;
}
const SHARE_KEY = 'okkie.share.v1';
function shouldSuggestShare(r, t) {
  const good = r.records?.length || (r.goal && t && L.trainingTotals(t).avg >= r.goal.target);
  if (!good) return false;
  let st = {}; try { st = JSON.parse(localStorage.getItem(SHARE_KEY) || '{}') || {}; } catch { /* leeg */ }
  if (st.suggestedAt > Date.now() - 14 * 864e5) return false;
  try { localStorage.setItem(SHARE_KEY, JSON.stringify({ ...st, suggestedAt: Date.now() })); } catch { /* geen opslag */ }
  return true;
}
function shareData() {
  const r = ui.result, t = r && data.trainings.find(x => x.id === r.id);
  if (!t) return null;
  const date = new Date(t.startedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  if (t.kind === 'clock') {
    const st = L.clockState(t);
    return { card: { title: 'Rond de klok', value: st.done ? String(st.darts) : st.hits + '/21', unit: st.done ? 'pijlen nodig' : 'doelen geraakt', badge: r.recordKeys?.includes('clock') ? 'Nieuw persoonlijk record' : null,
      tiles: [['Trefkans', Math.round(st.hitRate * 100) + '%'], ['Pijlen', st.darts], ['Beste ooit', r.bestClock || '–']], date },
      challenge: st.done ? `Ik ging rond de klok in ${st.darts} pijlen met OKKIE. Lukt het jou sneller? 🎯 ${INVITE_URL}` : `Ik oefen rond de klok met OKKIE. Doe je mee? 🎯 ${INVITE_URL}` };
  }
  const tot = L.trainingTotals(t);
  const goalHit = r.goal && tot.avg >= r.goal.target;
  return { card: { title: trainingTitle(t), value: fmt(tot.avg, 2), unit: 'gemiddeld per 3 pijlen', badge: r.records?.length ? 'Nieuw persoonlijk record' : goalHit ? 'Doel gehaald' : null,
    tiles: [['Hoogste beurt', tot.high ?? '–'], ['100+', tot.tons], ['180', tot.t180]], date },
    challenge: `Ik gooide ${fmt(tot.avg, 2)} gemiddeld op ${tot.darts} pijlen in OKKIE. Kun jij dat verslaan? 🎯 ${INVITE_URL}` };
}

const badgeTile = b => `<div class="badge" title="${esc(b.desc)}"><span class="badge-icon">${b.icon}</span><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div>`;

function badgeBanner(ids) {
  return `<div class="badge-banner">${ids.map(id => { const b = BADGES.find(x => x.id === id); return `<div><span class="badge-icon">${b.icon}</span><div><small>Badge verdiend!</small><b>${esc(b.name)}</b></div></div>`; }).join('')}</div>`;
}


// ----- Wedstrijd instellen -----
VIEWS.match = () => {
  const m = ui.match;
  if (!m.players.length) m.players = [{ id: data.activePlayerId, name: player().name }];
  const chip = (key, val, label) => `<button class="chip ${m[key] === val ? 'on' : ''}" data-act="match-set" data-arg="${key}:${val}">${label}</button>`;
  return `${header('Wedstrijd', 'home')}
  <main class="page">
    ${data.active.match ? `<div class="note">Er loopt nog een wedstrijd. <button class="link" data-act="resume-match">Hervatten</button></div>` : ''}
    <section class="card">
      <h3>Spel</h3>
      <div class="chips">${chip('start', 301, '301')}${chip('start', 501, '501')}</div>
      <h4>Aantal legs</h4>
      <div class="chips">${chip('bestOf', 1, '1 leg')}${chip('bestOf', 3, 'Best of 3')}${chip('bestOf', 5, 'Best of 5')}${chip('bestOf', 7, 'Best of 7')}${chip('bestOf', 9, 'Best of 9')}</div>
      <h4>Uitgooien</h4>
      <div class="chips">${chip('doubleOut', true, 'Double out')}${chip('doubleOut', false, 'Straight out')}</div>
    </section>
    <section class="card">
      <h3>Spelers <small class="muted">(wie begint staat bovenaan)</small></h3>
      <ol class="match-players">${m.players.map((p, i) => `<li><span>${esc(p.name)}${p.id ? (G.guestLink(p.id)?.code ? ' <span class="linked" title="Gekoppeld: de uitslag gaat naar zijn eigen OKKIE.">🔗</span>' : '') : ' <small class="muted">gast</small>'}</span>
        ${i > 0 ? `<button class="icon-btn small" data-act="mp-up" data-arg="${i}" aria-label="Omhoog">↑</button>` : ''}
        ${m.players.length > 1 ? `<button class="icon-btn small" data-act="mp-remove" data-arg="${i}" aria-label="Verwijderen">✕</button>` : ''}</li>`).join('')}</ol>
      ${m.players.length < 4 ? `<button class="btn secondary add-btn" data-act="add-player-open" data-arg="match" data-testid="add-player">+ Speler toevoegen</button>` : ''}
    </section>
    <button class="btn primary big" data-act="start-match" data-testid="start-match">Start ${m.start} ${m.players.length > 1 ? '' : '(solo)'}</button>
  </main>`;
};

// ----- Wedstrijd spelen -----
function currentLeg(m) { return m.legs[m.legs.length - 1]; }

VIEWS['play-match'] = () => {
  const m = data.active.match;
  if (!m) return VIEWS.home();
  const leg = currentLeg(m);
  const ls = L.legState(leg, m.settings.start, m.players.length, m.settings.doubleOut);
  const ms = L.matchState(m);
  const cur = ls.toThrow;
  const pend = m.pending;
  const live = L.x01Turn(ls.remaining[cur], pend, m.settings.doubleOut);
  const rest = live.remaining;
  const dartsLeft = 3 - pend.length;
  const route = rest <= 170 ? L.checkout(rest, dartsLeft, m.settings.doubleOut) : null;
  return `<div class="play">
    <header class="play-top">
      <button class="icon-btn" data-act="pause" aria-label="Pauzeren">${icon('pause', { size: 20 })}</button>
      <div class="play-title"><b>${m.settings.start} · ${m.settings.bestOf === 1 ? '1 leg' : 'Best of ' + m.settings.bestOf}</b><small>Leg ${m.legs.length} · ${m.settings.doubleOut ? 'double out' : 'straight out'}</small></div>
      <button class="icon-btn" data-act="toggle-type" aria-label="Typen">${icon('keyboard', { size: 21 })}</button>
    </header>
    <section class="x01 n${m.players.length}">
      ${m.players.map((p, i) => {
        const t = ms.totals[i];
        const legAvg = L.avg3(ls.stats[i].points, ls.stats[i].darts);
        const remaining = i === cur ? rest : ls.remaining[i];
        return `<div class="x01-player ${i === cur ? 'up' : ''}" data-testid="player-${i}">
          <div class="x01-name">${i === cur ? '<i class="throw-dot"></i>' : ''}${esc(p.name)}${m.settings.bestOf > 1 ? `<span class="legs">${ms.won[i]}</span>` : ''}</div>
          <strong class="x01-rest" data-testid="rest-${i}">${remaining}</strong>
          <small>gem. ${fmt(t.darts ? t.avg : legAvg, 1)} · ${t.darts} pijlen</small>
        </div>`;
      }).join('')}
    </section>
    <div class="checkout ${route ? '' : 'none'}" data-testid="checkout">${route ? `<span>Uitgooien:</span> ${route.map(c => `<b>${esc(L.label(c))}</b>`).join('')}` : rest <= 170 && m.settings.doubleOut && rest > 1 ? `<span>Geen finish met ${dartsLeft} pijl${dartsLeft === 1 ? '' : 'en'}</span>` : `<span>${esc(m.players[cur].name)} is aan de beurt</span>`}</div>
    <div class="turn-row">${dartSlots(pend)}<div class="turn-total"><small>Deze beurt</small><strong data-testid="turn-total">${L.turnScore(pend)}</strong></div></div>
    ${typeBox()}
    ${keypad()}
    <div class="play-actions"><button class="btn ghost small" data-act="stop-match">Wedstrijd stoppen</button></div>
  </div>`;
};

VIEWS['result-match'] = () => {
  const m = data.matches.find(x => x.id === ui.result?.id);
  if (!m) return VIEWS.home();
  const st = L.matchState(m);
  const w = st.winner;
  return `${header('Uitslag', 'home')}<main class="page">
    <section class="result-hero win"><small>${m.players.length > 1 ? 'Winnaar' : 'Uitgegooid!'}</small><strong>${w !== null ? esc(m.players[w].name) : 'Gestopt'}</strong>
      <span>${m.players.length > 1 ? st.won.join(' – ') + ' in legs' : m.settings.start + ' uitgegooid'}</span></section>
    ${ui.result.newBadges?.length ? badgeBanner(ui.result.newBadges) : ''}
    ${ui.result.sentTo?.length ? `<p class="note" data-testid="sent-to">De uitslag gaat naar de eigen OKKIE. van ${ui.result.sentTo.map(esc).join(' en ')}${navigator.onLine ? '' : ', zodra er internet is'}.</p>` : ''}
    ${matchTable(m, st)}
    <div class="row-actions"><button class="btn primary big" data-act="rematch">Revanche!</button><button class="btn ghost big" data-go="home">Home</button></div>
  </main>`;
};

function matchTable(m, st) {
  const row = (label, f) => `<tr><th>${label}</th>${m.players.map((_, i) => `<td>${f(st.totals[i], i)}</td>`).join('')}</tr>`;
  return `<section class="card"><table class="mtable"><thead><tr><th></th>${m.players.map(p => `<th>${esc(p.name)}</th>`).join('')}</tr></thead><tbody>
    ${m.settings.bestOf > 1 ? row('Legs', (t, i) => st.won[i]) : ''}
    ${row('Gemiddelde', t => fmt(t.avg, 2))}
    ${row('Hoogste beurt', t => t.high)}
    ${row('Beste finish', t => t.bestCheckout || '–')}
    ${row('100+', t => t.t100)}${row('140+', t => t.t140)}${row('180', t => t.t180)}
    ${row('Pijlen', t => t.darts)}
  </tbody></table></section>`;
}

// ----- Statistieken -----
VIEWS.stats = () => {
  const all = myTrainings('score');
  const f = ui.statsFilter;
  let ts = f === 'all' ? all : all.filter(t => filterKey(t) === f);
  if (ui.statsLast10) ts = ts.slice(-10);
  const turns = ts.flatMap(t => t.turns);
  let pts = 0, darts = 0, high = 0, low = null, tons = 0, t140 = 0, t180 = 0, best = null, worst = null;
  for (const t of ts) {
    const tot = L.trainingTotals(t);
    pts += tot.points; darts += tot.darts; high = Math.max(high, tot.high ?? 0);
    if (tot.low !== null) low = low === null ? tot.low : Math.min(low, tot.low);
    tons += tot.tons; t140 += tot.t140; t180 += tot.t180;
    if (tot.darts >= 9) {
      if (!best || tot.avg > best) best = tot.avg;
      if (worst === null || tot.avg < worst) worst = tot.avg;
    }
  }
  const sessAvg = ts.length ? ts.reduce((a, t) => a + L.trainingTotals(t).avg, 0) / ts.length : 0;
  const unknown = ts.filter(t => t.dateUnknown).length;
  const groups = L.groupAverages(ui.statsPeriod === 'training' ? ts : ts.filter(t => !t.dateUnknown), ui.statsPeriod);
  const byId = new Map(ts.map(t => [t.id, t]));
  const chartPts = groups.map(g => ({
    label: ui.statsPeriod === 'training' && byId.get(g.key)?.dateUnknown ? (byId.get(g.key).source === 'DartCounter' ? 'DC' : '?') : ui.statsPeriod === 'training' || ui.statsPeriod === 'dag' ? dateLabel(g.date) : ui.statsPeriod === 'week' ? 'wk ' + g.key.split('-W')[1] : new Date(g.date).toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' }),
    value: g.avg,
    sub: `${g.count} training${g.count === 1 ? '' : 'en'} · ${g.darts} pijlen`,
  }));
  const dist = L.hitDistribution([...turns, ...myTrainings('clock').flatMap(t => t.turns)]);
  const counts = L.topHits(dist, ui.heatMode);
  const heatName = { all: '', S: 'enkel', D: 'dubbel', T: 'triple' }[ui.heatMode];
  const chip = (key, val, label) => `<button class="chip ${ui[key] === val ? 'on' : ''}" data-act="stats-set" data-arg="${key}:${val}">${label}</button>`;
  const cmp = compareLast10(all.filter(t => f === 'all' || filterKey(t) === f));
  const earned = earnedBadges(data, data.activePlayerId);
  const matches = myMatches();
  const mStats = matchSummary(matches);
  // Wat deze speler hier wil zien (Pas mijn statistieken aan).
  const sv = SV.statView(data.settings, data.activePlayerId);
  const on = k => SV.shows(sv, 'many', k);
  const last = [...ts].reverse().find(t => (t.turns || []).length);   // laatste training mét losse pijlen
  const lastSeries = last ? L.turnSeries(last) : [];
  const lastHi = L.extremeTurns(lastSeries, 'high');
  // Vorige training: dezelfde soort als de laatste (30 met 30, vrij met vrij), net als op het uitslagscherm.
  const withDarts = ts.filter(t => L.trainingTotals(t).darts);
  const lastT = withDarts[withDarts.length - 1];
  const prevT = lastT && [...withDarts].reverse().find(t => t !== lastT && filterKey(t) === filterKey(lastT));
  const prevPair = prevT ? [L.trainingTotals(prevT).avg, L.trainingTotals(lastT).avg] : [];
  const kindName = t => (t.limitTurns ? t.limitTurns * 3 + ' pijlen' : 'vrij');
  const statTiles = [
    on('avg') ? tile('Gemiddelde', fmt(L.avg3(pts, darts), 2), 'hl', `${ts.length} training${ts.length === 1 ? '' : 'en'}`) : '',
    ...(on('bestWorst') ? [tile('Beste training', best !== null ? fmt(best, 2) : '–'), tile('Slechtste training', worst !== null ? fmt(worst, 2) : '–')] : []),
    on('high') ? tile('Hoogste beurt', high || '–') : '',
    on('low') ? tile('Laagste beurt', low ?? '–') : '',
    on('points') ? tile('Totaal punten', int(pts)) : '',
    on('darts') ? tile('Pijlen', int(darts)) : '',
  ].filter(Boolean);
  const nothing = !statTiles.length && !on('tons') && !['prev', 'trend', 'turns', 'heatmap', 'records', 'badges', 'matches'].some(on);
  return `${header('Statistieken', 'home')}
  <main class="page">
    ${prefsButton('many')}
    <div class="chips scroll">${chip('statsFilter', 'all', 'Alle')}${chip('statsFilter', '30', '30 pijlen')}${chip('statsFilter', '60', '60 pijlen')}${chip('statsFilter', '99', '99 pijlen')}${chip('statsFilter', 'vrij', 'Vrij')}
      <button class="chip ${ui.statsLast10 ? 'on' : ''}" data-act="stats-last10">Laatste 10</button></div>
    ${!ts.length ? `<section class="card empty"><p>Nog geen scoretrainingen${f !== 'all' ? ' van dit type' : ''}. Start een training en je statistieken verschijnen hier vanzelf.</p><button class="btn primary" data-go="train">Naar trainen</button></section>` : `
    ${statTiles.length ? `<section class="tiles" data-testid="stat-tiles">${statTiles.join('')}</section>` : ''}
    ${on('tons') ? `<section class="tiles three" data-testid="stat-tons">${tile('100+', tons)}${tile('140+', t140)}${tile('180', t180)}</section>` : ''}
    ${on('avg') ? `<p class="muted small explain">Het gemiddelde is altijd <b>punten per 3 pijlen</b> over álle gegooide pijlen (${int(pts)} punten / ${int(darts)} pijlen × 3). Het gewone gemiddelde van je trainingsgemiddelden is ${fmt(sessAvg, 2)}.</p>` : ''}
    ${on('prev') && cmp ? `<section class="card compare" data-testid="stat-compare"><h3>Word ik beter?</h3>
      ${prevPair.length === 2 ? `<p>Laatste training (${kindName(lastT)}): <b>${fmt(prevPair[1], 2)}</b> · de vorige ${kindName(lastT) === 'vrij' ? 'vrije training' : 'van ' + kindName(lastT)}: <b>${fmt(prevPair[0], 2)}</b> <span class="delta inline ${prevPair[1] >= prevPair[0] ? 'up' : 'down'}">${prevPair[1] >= prevPair[0] ? '▲ +' : '▼ −'}${fmt(Math.abs(prevPair[1] - prevPair[0]), 2)}</span></p>` : ''}
      <p>Laatste ${cmp.n} trainingen: <b>${fmt(cmp.recent, 2)}</b>${cmp.before !== null ? ` · de ${cmp.nb} daarvoor: <b>${fmt(cmp.before, 2)}</b>` : ''}</p>
      ${cmp.before !== null ? `<p class="delta ${cmp.recent >= cmp.before ? 'up' : 'down'}">${cmp.recent >= cmp.before ? '▲ Je gaat vooruit' : '▼ Iets lager dan eerst'}: ${cmp.recent >= cmp.before ? '+' : '−'}${fmt(Math.abs(cmp.recent - cmp.before), 2)}</p>` : ''}</section>` : ''}
    ${on('turns') && last ? `<section class="card" data-testid="stat-turns">
      <div class="card-head"><h3>Score per beurt</h3></div>
      <p class="muted small">Laatste training: ${esc(trainingTitle(last))}${last.dateUnknown ? '' : ' · ' + esc(dateLabel(last.startedAt))}${lastHi ? ` · hoogste beurt <b>${lastHi.score}</b> (${turnsText(lastHi.turns, false)})` : ''}</p>
      ${turnChart(lastSeries, { best: lastHi?.turns || [], avg: L.trainingTotals(last).avg })}</section>` : ''}
    ${on('trend') ? `<section class="card">
      <div class="card-head"><h3>Ontwikkeling</h3></div>
      <div class="chips small">${chip('statsPeriod', 'training', 'Per training')}${chip('statsPeriod', 'dag', 'Dag')}${chip('statsPeriod', 'week', 'Week')}${chip('statsPeriod', 'maand', 'Maand')}</div>
      ${lineChart(chartPts)}
      <div class="chart-legend"><span><i></i>Gemiddelde</span><span><i class="t"></i>Trend</span></div>
      <p class="muted small">Tik op een punt voor details.${unknown ? ` ${unknown} training${unknown === 1 ? '' : 'en'} zonder datum (DC = DartCounter) staan alleen in "Per training".` : ''}</p>
    </section>` : ''}`}
    ${nothing ? `<section class="card empty"><p>Je hebt alle onderdelen uitgezet.</p><button class="btn secondary" data-act="stat-prefs" data-arg="many|${esc(data.activePlayerId)}">Pas mijn statistieken aan</button></section>` : ''}
    ${on('heatmap') ? `<section class="card">
      <div class="card-head"><h3>Trefferkaart</h3></div>
      <div class="chips small">${chip('heatMode', 'all', 'Alles')}${chip('heatMode', 'S', 'Enkel')}${chip('heatMode', 'D', 'Dubbel')}${chip('heatMode', 'T', 'Triple')}</div>
      ${dist.total ? `<div class="board-wrap">${boardSVG(dist, ui.heatMode)}</div>${heatLegend()}
      <p class="muted small">Toont welk vak je raakte (bijv. T20), niet de precieze plek van de pijl. Enkele treffers kleuren beide enkele ringen.</p>
      <div class="split">${splitBar(dist)}</div>
      <h4>Meest geraakt${heatName ? ` <small class="muted">· ${heatName}</small>` : ''}</h4>${counts.length ? `<div class="top-nums" data-testid="top-hits">${counts.map(([label, n]) => `<span><b>${label}</b>${n}×</span>`).join('')}</div>` : `<p class="muted small" data-testid="top-hits">Nog geen ${heatName === 'triple' ? 'triples' : heatName === 'dubbel' ? 'dubbels' : 'treffers'} geraakt.</p>`}` : '<p class="muted">Nog geen worpen.</p>'}
    </section>` : ''}
    ${on('records') ? `<section class="card">
      <h3>Persoonlijke records</h3>
      ${recordList()}
    </section>` : ''}
    ${on('badges') ? `<section class="card">
      <div class="card-head"><h3>Badges</h3><span class="badge-count">${earned.size}/${BADGES.length}</span></div>
      ${earned.size ? `<div class="badges" data-testid="badges-earned">${BADGES.filter(b => earned.has(b.id)).map(badgeTile).join('')}</div>` : '<p class="muted small">Nog geen badges. Rond je eerste training af.</p>'}
      ${earned.size < BADGES.length ? `<details class="more badges-todo"><summary>Nog te verdienen (${BADGES.length - earned.size})</summary><div class="badges" data-testid="badges-locked">${BADGES.filter(b => !earned.has(b.id)).map(badgeTile).join('')}</div></details>` : ''}
    </section>` : ''}
    ${on('matches') ? `<section class="card">
      <h3>Wedstrijden</h3>
      ${matches.length ? `<section class="tiles">${tile('Gespeeld', mStats.played)}${tile('Gewonnen', mStats.won)}${tile('Gemiddelde', fmt(mStats.avg, 2))}${tile('Beste finish', mStats.bestCo || '–')}</section>` : '<p class="muted">Nog geen wedstrijden gespeeld.</p>'}
    </section>` : ''}
  </main>`;
};

function splitBar(dist) {
  const m = dist.mult, total = dist.total || 1;
  const parts = [['S', 'Enkel', m.S], ['D', 'Dubbel', m.D], ['T', 'Triple', m.T], ['B', 'Bull', m.B], ['M', 'Mis', m.M]];
  return `<div class="splitbar">${parts.map(([k, , n]) => n ? `<i class="s-${k}" style="flex:${n}"></i>` : '').join('')}</div>
    <div class="splitlegend">${parts.map(([k, lab, n]) => `<span><i class="s-${k}"></i>${lab} ${Math.round((n / total) * 100)}%</span>`).join('')}</div>`;
}

function compareLast10(list) {
  if (list.length < 2) return null;
  const n = Math.min(10, list.length);
  const recent = list.slice(-n), before = list.slice(-2 * n, -n);
  const agg = arr => { let p = 0, d = 0; arr.forEach(t => { const x = L.trainingTotals(t); p += x.points; d += x.darts; }); return L.avg3(p, d); };
  return { n, recent: agg(recent), before: before.length ? agg(before) : null, nb: before.length };
}

function matchSummary(matches) {
  let played = 0, won = 0, p = 0, d = 0, bestCo = 0;
  for (const m of matches) {
    const i = m.players.findIndex(x => x.id === data.activePlayerId);
    const st = L.matchState(m);
    played++;
    if (st.winner === i) won++;
    p += st.totals[i].points; d += st.totals[i].darts;
    bestCo = Math.max(bestCo, st.totals[i].bestCheckout);
  }
  return { played, won, avg: L.avg3(p, d), bestCo };
}

function records(playerId = data.activePlayerId) {
  const out = {};
  for (const t of data.trainings.filter(x => x.playerId === playerId)) {
    if (t.kind === 'clock') {
      const st = L.clockState(t);
      if (st.done && (!out.clock || st.darts < out.clock)) out.clock = st.darts;
      continue;
    }
    const tot = L.trainingTotals(t);
    if (tot.high !== null && (!out.high || tot.high > out.high)) out.high = tot.high;
    if (tot.tons && (!out.tons || tot.tons > out.tons)) out.tons = tot.tons;
    if (t.limitTurns) {
      const k = 'avg' + t.limitTurns * 3;
      if (tot.darts >= t.limitTurns * 3 && (!out[k] || tot.avg > out[k])) out[k] = tot.avg;
    }
  }
  for (const m of data.matches) {
    const i = m.players.findIndex(p => p.id === playerId);
    if (i < 0) continue;
    const st = L.matchState(m);
    if (st.totals[i].bestCheckout && (!out.checkout || st.totals[i].bestCheckout > out.checkout)) out.checkout = st.totals[i].bestCheckout;
    if (st.totals[i].darts >= 9 && (!out.matchAvg || st.totals[i].avg > out.matchAvg)) out.matchAvg = st.totals[i].avg;
  }
  return out;
}

const RECORD_LABELS = {
  avg30: ['Beste 30 pijlen', v => fmt(v, 2)],
  avg60: ['Beste 60 pijlen', v => fmt(v, 2)],
  avg99: ['Beste 99 pijlen', v => fmt(v, 2)],
  high: ['Hoogste beurt', v => v],
  tons: ['Meeste 100+ in één training', v => v],
  clock: ['Snelste rond de klok', v => v + ' pijlen'],
  checkout: ['Hoogste finish', v => v],
  matchAvg: ['Beste wedstrijdgemiddelde', v => fmt(v, 2)],
};

function recordList() {
  const r = records();
  const rows = Object.entries(RECORD_LABELS).filter(([k]) => r[k] !== undefined);
  if (!rows.length) return '<p class="muted">Nog geen records. Die komen vanzelf!</p>';
  return `<ul class="records">${rows.map(([k, [lab, f]]) => `<li><span>${lab}</span><b>${f(r[k])}</b></li>`).join('')}</ul>`;
}

function recordKeys(before, after) {
  return Object.keys(RECORD_LABELS).filter(k => after[k] !== undefined && before[k] !== undefined && (k === 'clock' ? after[k] < before[k] : after[k] > before[k]));
}

function diffRecords(before, after) {
  const out = [];
  for (const [k, [lab, f]] of Object.entries(RECORD_LABELS)) {
    if (after[k] === undefined || before[k] === undefined) continue;
    const better = k === 'clock' ? after[k] < before[k] : after[k] > before[k];
    if (better) out.push(`${lab}: ${f(after[k])}`);
  }
  return out;
}

// ----- Geschiedenis -----
VIEWS.history = () => {
  const items = [
    ...myTrainings().map(t => ({ type: 't', at: t.startedAt, t })),
    ...myMatches().map(m => ({ type: 'm', at: m.startedAt, m })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
  let lastDay = '';
  return `${header('Geschiedenis', 'more')}
  <main class="page">
    ${!items.length ? '<section class="card empty"><p>Nog niets gespeeld. Je trainingen en wedstrijden verschijnen hier.</p></section>' : ''}
    <ul class="history">${items.map(it => {
      const day = it.t?.dateUnknown ? `Datum onbekend${it.t.source ? ' · uit ' + it.t.source : ''}` : new Date(it.at).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const head = day !== lastDay ? `<li class="day">${day}</li>` : '';
      lastDay = day;
      if (it.type === 't') {
        const t = it.t;
        const main = t.kind === 'clock' ? (L.clockState(t).done ? L.clockState(t).darts + ' pijlen' : L.clockState(t).hits + '/21') : fmt(L.trainingTotals(t).avg, 2);
        const with_ = t.groupPlayers ? ' · met ' + names(t.groupPlayers.filter(id => id !== t.playerId)).map(esc).join(', ') : '';
        const sub = t.kind === 'clock' ? 'rond de klok' : `${L.trainingTotals(t).points} pnt · ${L.trainingTotals(t).darts} pijlen${with_}`;
        const when = t.dateUnknown ? esc(t.source || 'Andere app') : new Date(t.startedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
        return `${head}<li><button class="h-item" data-act="open-training" data-arg="${esc(t.id)}"><span class="h-icon">${icon(t.kind === 'clock' ? 'clock' : t.source ? 'import' : t.groupPlayers ? 'group' : 'train')}</span><span class="h-main"><b>${esc(trainingTitle(t))}</b><small>${when} · ${sub}</small></span><strong>${main}</strong></button></li>`;
      }
      const m = it.m, st = L.matchState(m);
      const i = m.players.findIndex(p => p.id === data.activePlayerId);
      const res = m.players.length > 1 ? (st.winner === i ? 'Gewonnen' : st.winner === null ? 'Gestopt' : 'Verloren') : (st.winner !== null ? 'Uit!' : 'Gestopt');
      return `${head}<li><button class="h-item" data-act="open-match" data-arg="${esc(m.id)}"><span class="h-icon">${icon('match')}</span><span class="h-main"><b>${m.settings.start} · ${m.players.map(p => esc(p.name)).join(' – ')}</b><small>${res} · ${st.won.join('–')}${m.source ? ' · gespeeld op andere telefoon' : ''}</small></span><strong>${fmt(st.totals[i].avg, 1)}</strong></button></li>`;
    }).join('')}</ul>
  </main>`;
};

function trainingDetail(t) {
  const isClock = t.kind === 'clock';
  const tot = L.trainingTotals(t);
  const series = isClock ? [] : L.turnSeries(t), hi = L.extremeTurns(series, 'high');
  const others = t.groupPlayers ? names(t.groupPlayers.filter(id => id !== t.playerId)) : [];
  modal(`<h3>${esc(trainingTitle(t))}</h3><p class="muted">${t.dateUnknown ? 'Datum onbekend' : dateTime(t.startedAt)}${t.source ? ' · uit ' + esc(t.source) : ''}${t.note ? ' · ' + esc(t.note) : ''}</p>
    ${others.length ? `<p>Samen met ${others.map(esc).join(', ')}</p>` : ''}
    ${t.source ? `<p class="muted small">Uit een andere app: alleen de eindstand is bekend. Deze training telt mee in je gemiddelde en records, maar niet in de trefferkaart.</p>
      <form data-form="set-date" data-arg="${esc(t.id)}" class="guest"><input type="date" name="date" value="${t.dateUnknown ? '' : t.startedAt.slice(0, 10)}" max="${new Date().toISOString().slice(0, 10)}" aria-label="Datum"><button class="btn secondary">Datum opslaan</button></form>` : ''}
    ${isClock ? `<p>${L.clockState(t).done ? 'Klaar in <b>' + L.clockState(t).darts + '</b> pijlen' : 'Gestopt bij ' + L.clockState(t).hits + '/21'}</p>`
      : `<div class="tiles mini">${tile('Gemiddelde', fmt(tot.avg, 2))}${tile('Totaal', tot.points)}${tile('Pijlen', tot.darts)}${tile('Hoogste', tot.high ?? '–', '', hi ? turnsText(hi.turns) : '')}</div>`}
    ${!isClock && series.length ? turnChart(series, { best: hi?.turns || [], avg: tot.avg }) : ''}
    <ol class="turnlist">${t.turns.map((turn, i) => `<li class="${!isClock && hi?.turns.includes(i + 1) ? 'best' : ''}${!isClock && turn.darts.length < 3 ? ' part' : ''}"><span>${i + 1}</span><span class="darts">${turn.darts.map(c => `<i>${esc(L.label(c))}</i>`).join('')}${!isClock && turn.darts.length < 3 ? ' <small>onvolledig</small>' : ''}</span><b>${isClock ? '' : L.turnScore(turn.darts)}</b></li>`).join('')}</ol>
    <div class="modal-actions"><button class="btn danger ghost" data-act="delete-training" data-arg="${esc(t.id)}">Verwijderen</button><button class="btn primary" data-act="modal-close">Sluiten</button></div>`);
}

// Pas mijn statistieken aan: vinkjes per speler, apart voor één training en voor al je trainingen.
// Elk vinkje werkt meteen (het scherm erachter past zich aan) en wordt bewaard in data.settings.statView.
function statPrefsModal(scope = ui.prefScope, pid = ui.prefPlayer || data.activePlayerId) {
  const p = player(pid) || player();
  if (!p || !SV.SCOPES[scope]) return;
  ui.prefScope = scope; ui.prefPlayer = p.id;
  const sv = SV.statView(data.settings, p.id);
  modal(`<h3>Pas mijn statistieken aan</h3>
    <p class="muted small">Voor <b>${esc(p.name)}</b>. Vink aan wat je wilt zien; het scherm past zich meteen aan. Elke speler heeft zijn eigen keuze.</p>
    <div class="chips small pref-scopes" role="tablist">${Object.entries(SV.SCOPES).map(([k, x]) => `<button class="chip ${k === scope ? 'on' : ''}" role="tab" aria-selected="${k === scope}" data-act="stat-scope" data-arg="${k}" data-testid="pref-scope-${k}">${esc(x.label)}</button>`).join('')}</div>
    <p class="muted small pref-sub">${esc(SV.SCOPES[scope].sub)}</p>
    <div class="checklist" data-testid="pref-list">${SV.optionsFor(scope).map(o => `<label class="check"><input type="checkbox" data-input="stat-pref" data-scope="${scope}" data-arg="${o.key}" data-testid="pref-${scope}-${o.key}" ${sv[scope].has(o.key) ? 'checked' : ''}><span><b>${esc(o.label)}</b>${o.hint?.[scope] ? `<small>${esc(o.hint[scope])}</small>` : ''}</span></label>`).join('')}</div>
    <div class="modal-actions"><button class="btn ghost" data-act="stat-reset" data-testid="pref-reset" ${sv.custom ? '' : 'disabled'}>Standaardweergave herstellen</button><button class="btn primary" data-act="modal-close">Klaar</button></div>`);
}

function matchDetail(m) {
  const st = L.matchState(m);
  modal(`<h3>${m.settings.start} · ${m.players.map(p => esc(p.name)).join(' – ')}</h3><p class="muted">${m.summary ? 'Gespeeld op een andere telefoon · ' + esc(dateLabel(m.startedAt)) : dateTime(m.startedAt)} · ${m.settings.doubleOut ? 'double out' : 'straight out'}${m.stopped ? ' · gestopt' : ''}</p>
    ${m.summary ? '<p class="muted small">Alleen jouw eigen cijfers en de uitslag zijn bekend; de beurten staan op de telefoon waarop is gespeeld.</p>' : ''}
    ${matchTable(m, st)}
    ${m.legs.map((leg, li) => {
      const rem = Array(m.players.length).fill(m.settings.start);
      return `<h4>Leg ${li + 1}</h4><ol class="turnlist">${leg.turns.map(turn => {
        const r = L.x01Turn(rem[turn.p], turn.darts, m.settings.doubleOut); rem[turn.p] = r.remaining;
        return `<li><span>${esc(m.players[turn.p].name)}</span><span class="darts">${turn.darts.map(c => `<i>${esc(L.label(c))}</i>`).join('')}</span><b>${r.bust ? 'BUST' : r.finished ? 'UIT ' + r.scored : r.scored} <small>(${r.remaining})</small></b></li>`;
      }).join('')}</ol>`;
    }).join('')}
    <div class="modal-actions"><button class="btn danger ghost" data-act="delete-match" data-arg="${esc(m.id)}">Verwijderen</button><button class="btn primary" data-act="modal-close">Sluiten</button></div>`);
}

// ----- Meer / instellingen -----
VIEWS.more = () => {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return `${header('Meer', 'home')}
  <main class="page">
    <section class="card">
      <h3>Spelers</h3>
      <ul class="players">${data.players.map(p => `<li><span class="dot" style="background:${esc(p.color)}"></span><b>${esc(p.name)}</b>
        ${p.id === data.activePlayerId ? '<small class="muted">actief</small>' : `<button class="link" data-act="use-player" data-arg="${esc(p.id)}">Kiezen</button>`}
        <button class="icon-btn small" data-act="rename-player" data-arg="${esc(p.id)}" aria-label="${esc(p.name)} beheren: naam, statistieken wissen of verwijderen" data-testid="manage-${esc(p.id)}">✎</button></li>`).join('')}</ul>
      <form data-form="add-player" class="guest"><input name="name" maxlength="24" placeholder="Nieuwe speler" aria-label="Naam nieuwe speler"><button class="btn secondary">+ Speler</button></form>
    </section>
    ${T.announce() ? moveCard() : ''}
    <nav class="card link-list" aria-label="Spelen en leren">
      <button class="link-row" data-go="history"><span class="a-icon">${icon('history', { size: 20 })}</span><span><b>Geschiedenis</b><small>Trainingen en wedstrijden terugkijken of verwijderen</small></span>${icon('chevron', { size: 18 })}</button>
      <a class="link-row" href="./uitleg/"><span class="a-icon">${icon('book', { size: 20 })}</span><span><b>Hoe werkt OKKIE.?</b><small>Uitleg voor kinderen en beginners</small></span>${icon('chevron', { size: 18 })}</a>
      <button class="link-row" data-go="regels"><span class="a-icon">${icon('ruler', { size: 20 })}</span><span><b>Dartregels &amp; afmetingen</b><small>Bord ophangen, 501, dubbel uit, bust</small></span>${icon('chevron', { size: 18 })}</button>
    </nav>
    ${apiAvailable() ? `<section class="card" data-testid="other-phone">
      <h3>Koppelcode maken</h3>
      <p class="muted">Speel je mee op de telefoon van een vriend (training of 301/501)? Geef hem je code; je resultaat komt vanzelf bij je eigen statistieken.</p>
      ${getAccount(data.activePlayerId) ? '<button class="btn secondary" data-act="guest-pass">Maak koppelcode</button>' : '<a class="btn secondary" href="./community/">Eerst delen aanzetten bij Darters ↗</a>'}
      ${G.readGuest().queue.length ? `<p class="note" data-testid="guest-queue">${G.readGuest().queue.length === 1 ? '1 resultaat van een gast wacht' : G.readGuest().queue.length + ' resultaten van gasten wachten'} op internet om verstuurd te worden.${G.readGuest().queue.some(q => q.error) ? ' Eén of meer codes werken niet meer; vraag een nieuwe code en koppel opnieuw.' : ''}</p><button class="btn ghost small" data-act="guest-retry">Nu versturen</button>` : ''}
    </section>` : ''}
    <nav class="card link-list" aria-label="Delen en hulp">
      <button class="link-row" data-act="invite" data-testid="invite-card"><span class="a-icon">${icon('invite', { size: 20 })}</span><span><b>Nodig een vriend uit</b><small>Een link naar okkiedarts.nl; er worden geen scores gedeeld</small></span>${icon('chevron', { size: 18 })}</button>
      <button class="link-row" data-go="hulp"><span class="a-icon">${icon('help', { size: 20 })}</span><span><b>Hulp &amp; feedback</b><small>Meld een probleem of stuur een idee</small></span>${icon('chevron', { size: 18 })}</button>
    </nav>
    <section class="card">
      <h3>Back-up en overzetten</h3>
      <p class="muted">Je gegevens staan alleen op dit toestel. Maak af en toe een back-up, zeker voordat je de browser opschoont.</p>
      <div class="row-actions"><button class="btn primary" data-act="export">${icon('download', { size: 19 })}Back-up downloaden</button><button class="btn secondary" data-act="backup-share">${icon('share', { size: 19 })}Bewaar via Delen / iCloud</button>
      <label class="btn secondary file">${icon('upload', { size: 19 })}Back-up terugzetten<input type="file" accept="application/json,.json" data-input="import" hidden></label></div>
      <h4>Naar een andere telefoon of app</h4>
      <p class="muted small">Met een overzetcode zet je alles over via kopiëren en plakken, bijvoorbeeld van Safari naar OKKIE. op je beginscherm. Er komt niets dubbel.</p>
      <div class="row-actions"><button class="btn secondary" data-act="transfer-code" data-testid="make-code">${icon('copy', { size: 19 })}Overzetcode maken</button><button class="btn secondary" data-act="transfer-receive" data-testid="enter-code">${icon('download', { size: 19 })}Code invoeren</button></div>
      <button class="link-row compact" data-go="andere-app"><span><b>Scores uit een andere app</b><small>Bijv. DartCounter, of zelf een eindstand invullen</small></span>${icon('chevron', { size: 18 })}</button>
    </section>
    <section class="card" data-testid="install-help">
      <h3>Installeren op je telefoon</h3>
      ${standalone ? `<p class="ok-line">${icon('check', { size: 18 })}OKKIE. draait als app op dit toestel.</p>` : `
      ${ui.installEvent ? `<button class="btn primary" data-act="install">${icon('install', { size: 19 })}Installeer OKKIE.</button>` : ''}
      ${T.announce() ? `<p class="note">OKKIE. verhuist naar <b>app.okkiedarts.nl</b>. Zet liever die nieuwe app op je beginscherm, nadat je je trainingen hebt overgezet.</p>` : ''}
      <h4>Installeren op iPhone</h4>
      <p>Open <b>app.okkiedarts.nl</b> in <b>Safari</b>, gebruik <b>Delen</b> en kies <b>'Zet op beginscherm'</b>.</p>
      <h4>Installeren op Android</h4>
      <p>Open <b>app.okkiedarts.nl</b> in <b>Chrome</b> en kies via het menu <b>⋮</b> <b>'App installeren'</b> of <b>'Toevoegen aan startscherm'</b>.</p>
      <p class="muted small">Installeren hoeft niet: OKKIE. werkt ook gewoon in de browser. Op iPhone heeft de app op je beginscherm een eigen opslag; zet je bestaande trainingen dan over met een overzetcode (hierboven).</p>`}
    </section>
    <section class="card">
      <h3>Instellingen</h3>
      ${toggle('sound', 'Geluidjes')}${toggle('vibrate', 'Trillen bij tikken')}
      ${SP.speechSupported() ? `${toggle('speech', 'Gesproken aanmoedigingen')}
        ${data.settings.speech ? `<div class="chips small speech-mode" role="group" aria-label="Hoeveel praat de stem?">${[['veel', 'Veel, met grapjes'], ['rustig', 'Alleen hoogtepunten']].map(([k, l]) => `<button class="chip ${(chatty() ? 'veel' : 'rustig') === k ? 'on' : ''}" data-act="speech-mode" data-arg="${k}" aria-pressed="${(chatty() ? 'veel' : 'rustig') === k}">${l}</button>`).join('')}</div>` : ''}
        <p class="muted small setting-note" data-testid="speech-note">${!data.settings.speech || chatty() ? 'Een enthousiaste stem die je aanmoedigt tijdens het gooien, bij elke 100+ en 180, met finish-calls bij een wedstrijd en af en toe een grapje.' : 'Alleen bij een persoonlijk record, je eerste 100+, elke 180 en een mooie finish.'} Gebruikt de stem van je telefoon. Hoor je niets op een iPhone? Zet de stil-schakelaar aan de zijkant uit en het volume omhoog.${data.settings.speech ? ' <button class="link" data-act="speech-test">Laat horen</button>' : ''}</p>`
        : '<p class="muted small setting-note">Gesproken aanmoedigingen werken niet in deze browser.</p>'}
      <div class="setting"><span>Thema</span><div class="chips small"><button class="chip ${data.settings.theme === 'dark' ? 'on' : ''}" data-act="theme" data-arg="dark">Donker</button><button class="chip ${data.settings.theme === 'light' ? 'on' : ''}" data-act="theme" data-arg="light">Licht</button></div></div>
    </section>
    <section class="card about">
      ${logoSVG({ height: 34 })}
      <p class="muted small">Versie ${APP_VERSION}. OKKIE komt van "oche" (spreek uit: okkie), de werplijn waar je achter staat bij darts. Geen account, geen tracking, geen reclame en geen aankopen in de app.</p>
      <p class="maker-line"><a class="maker" href="https://denckh.nl/" target="_blank" rel="noopener" aria-label="Ontwikkeld door Denckh (naar denckh.nl)"><span class="maker-role">Ontwikkeld door</span><img class="on-dark" src="./icons/denckh-logo-signature-light.svg" alt="Denckh" width="92" height="28"><img class="on-light" src="./icons/denckh-logo-signature.svg" alt="Denckh" width="92" height="28"></a></p>
    </section>
  </main>`;
};

VIEWS.hulp = () => {
  if (!ui.fb.startedAt) ui.fb.startedAt = Date.now();
  return `${header('Hulp & feedback', 'more')}
  <main class="page">${FB.feedbackPage(ui.fb, FB.techInfo({ version: APP_VERSION, installed: I.isStandalone() }))}</main>`;
};

VIEWS['andere-app'] = () => `${header('Andere app', 'more')}
  <main class="page">
    <section class="card" data-testid="other-app">
      <h3>Scores uit een andere app</h3>
      <p class="muted">Eerdere scoretrainingen (bijv. uit DartCounter) toevoegen aan <b>${esc(player().name)}</b>, zodat je ziet of je beter wordt.</p>
      ${hasDartCounterSet(data, data.activePlayerId) ? `<p class="ok-line">${icon('check', { size: 18 })}${DARTCOUNTER_SET.label} zijn toegevoegd.</p>`
        : `<button class="btn secondary" data-act="import-dc">${icon('import', { size: 19 })}${DARTCOUNTER_SET.label} toevoegen</button>`}
      <h4>Zelf een score invullen</h4>
      <form data-form="summary" class="summary-form">
        <label>Pijlen<input type="number" name="darts" min="3" max="999" value="99" inputmode="numeric" required></label>
        <label>Totaalscore<input type="number" name="points" min="0" max="59940" inputmode="numeric" required></label>
        <label>Hoogste beurt <small class="muted">(mag leeg)</small><input type="number" name="high" min="0" max="180" inputmode="numeric"></label>
        <label>Datum <small class="muted">(mag leeg)</small><input type="date" name="date" max="${new Date().toISOString().slice(0, 10)}"></label>
        <button class="btn secondary">+ Score toevoegen</button>
      </form>
    </section>
  </main>`;

VIEWS.regels = () => `${header('Dartregels', 'more')}
  <main class="page rules">${rulesPage()}
  <p class="muted small rules-source">Deze uitleg staat ook op <a href="https://okkiedarts.nl/dartregels/" target="_blank" rel="noopener">okkiedarts.nl/dartregels</a>: handig om door te sturen.</p></main>`;

function toggle(key, label) {
  return `<label class="setting"><span>${label}</span><input type="checkbox" class="switch" data-input="setting" data-arg="${key}" ${data.settings[key] ? 'checked' : ''}></label>`;
}

// ---------- Acties ----------
function startScore() {
  finishActiveTraining(false);
  ui.savedHigh = null;
  const s = ui.setup;
  const turns = s.turns === -1 ? Math.max(1, Math.min(200, Number(s.custom) || 10)) : s.turns;
  const players = setupPlayers().slice(0, 4);
  // Persoonlijk doel (motivation.js) alleen bij alleen trainen: vergeleken met je eigen eerdere trainingen.
  const goal = players.length === 1 ? M.goalFor(data.trainings, players[0], turns || null) : null;
  data.active.training = { id: S.uid(), playerId: players[0], players, kind: 'score', limitTurns: turns || null, startedAt: now(), turns: [], pending: [], ...(goal ? { goal } : {}) };
  G.claimGuests(data.active.training);
  ui.mod = 1;
  save();
  go('play-score');
  talk(VL.startTalk('score'));
}

function startClock() {
  finishActiveTraining(false);
  data.active.training = { id: S.uid(), playerId: data.activePlayerId, players: [data.activePlayerId], kind: 'clock', limitTurns: null, startedAt: now(), turns: [], pending: [] };
  ui.mod = 1;
  save();
  go('play-clock');
  talk(VL.startTalk('clock'));
}

// Gemiddelde van de laatste eerdere scoretraining van deze speler met exact dezelfde instelling.
function prevAverage(playerId, limitTurns) {
  const prev = data.trainings
    .filter(x => x.playerId === playerId && x.kind === 'score' && (x.limitTurns || 0) === (limitTurns || 0))
    .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
  if (!prev.length) return null;
  const tot = L.trainingTotals(prev[prev.length - 1]);
  return tot.darts ? tot.avg : null;
}

function compareLine(avg, prev) {
  if (prev === null || prev === undefined) return '';
  const d = avg - prev;
  const txt = Math.abs(d) < 0.005 ? 'gelijk aan je vorige training' : `${fmt(Math.abs(d), 2)} ${d > 0 ? 'hoger' : 'lager'} dan je vorige training`;
  return `<em class="cmp ${d >= 0 ? 'up' : 'down'}" data-testid="compare">Vandaag ${fmt(avg, 2)} – ${txt}.</em>`;
}

// Training afronden en in de geschiedenis zetten (bij samen trainen: één training per speler).
// showResult: naar uitslagscherm.
function finishActiveTraining(showResult = true) {
  const t = data.active.training;
  if (!t) return;
  if (t.pending.length) t.turns.push({ at: now(), darts: t.pending, p: curIdx(t) });
  data.active.training = null;
  if (!t.turns.length) { G.releaseGuests(t.id); save(); if (showResult) go('home'); return; }
  const before = new Map(t.players.map(id => [id, { rec: records(id), badges: earnedBadges(data, id), prev: prevAverage(id, t.limitTurns) }]));
  const saved = [];
  t.players.forEach((pid, i) => {
    const turns = t.turns.filter(x => (x.p ?? 0) === i).map(({ p, ...rest }) => rest);
    if (!turns.length) return;
    const tr = { id: i === 0 ? t.id : S.uid(), playerId: pid, kind: t.kind, limitTurns: t.limitTurns, startedAt: t.startedAt, finishedAt: now(), turns };
    if (t.players.length > 1) { tr.groupId = t.id; tr.groupPlayers = [...t.players]; }
    data.trainings.push(tr);
    saved.push(tr);
  });
  save();
  // Synchronisatie alleen na toestemming; netwerkfouten beïnvloeden lokaal darten niet.
  queueCommunitySync(data, saved.map(tr => tr.playerId));
  if (G.queueGuestTrainings(t.id, saved)) sendGuests();
  const per = saved.map(tr => {
    const b = before.get(tr.playerId);
    const after = records(tr.playerId);
    return { id: tr.id, playerId: tr.playerId, prevAvg: b.prev, records: diffRecords(b.rec, after), recordKeys: recordKeys(b.rec, after), after, newBadges: [...earnedBadges(data, tr.playerId)].filter(x => !b.badges.has(x)) };
  });
  const main = per.find(x => x.playerId === data.activePlayerId) || per[0];
  ui.resultPick = null;
  ui.result = { ...main, bestClock: records(main.playerId).clock, group: per.length > 1 ? per : null, players: [...t.players], limitTurns: t.limitTurns, kind: t.kind, goal: per.length === 1 ? t.goal || null : null };
  ui.savedHigh = null;
  if (!ui.result.group) ui.result.suggestShare = shouldSuggestShare(ui.result, saved.find(x => x.id === main.id));
  if (showResult) {
    go('result-training');
    voiceTraining(ui.result, saved.find(x => x.id === main.id));
    if (per.some(x => x.newBadges.length || x.records.length)) { beep('win'); haptic([30, 30, 60]); }
  }
}

function addDart(code) {
  const t = performance.now();
  // Spook-tik (zelfde toets twee keer binnen 35 ms) negeren; sneller kan niemand echt tikken.
  if (code === ui.lastCode && t - ui.lastTap < 35) return;
  ui.lastTap = t;
  ui.lastCode = code;
  haptic(8);
  ui.justAdded = true;
  if (ui.view === 'play-match') return addMatchDart(code);
  const tr = data.active.training;
  if (!tr) return;
  tr.pending.push(code);
  ui.mod = 1;
  if (tr.kind === 'clock') {
    const st = L.clockState({ turns: [...tr.turns, { darts: tr.pending }] });
    if (st.done || tr.pending.length === 3) {
      const before = L.clockState(tr).targetIndex;
      tr.turns.push({ at: now(), darts: tr.pending, p: 0 });
      tr.pending = [];
      talk(VL.clockTalk(before, st.targetIndex, st.targetIndex - before));
    }
    save();
    if (st.done) { celebrate('KLAAR!', `${st.darts} pijlen`, 'win'); beep('win'); finishActiveTraining(true); return; }
    render();
    return;
  }
  if (tr.pending.length === 3) {
    const score = L.turnScore(tr.pending);
    const idx = curIdx(tr);
    const prevInSession = Math.max(0, ...tr.turns.filter(x => (x.p ?? 0) === idx && x.darts.length === 3).map(x => L.turnScore(x.darts)));
    tr.turns.push({ at: now(), darts: tr.pending, p: idx });
    tr.pending = [];
    save();
    turnCelebration(score);
    // Laatste beurt: geen extra zin, dan klinkt de afsluiting van de training.
    const last = trainingDone(tr);
    if (tr.kind === 'score') voiceTurn(tr.players[idx], score, prevInSession, last ? null : () => {
      const mine = tr.turns.filter(x => (x.p ?? 0) === idx);
      return VL.turnTalk({ darts: mine[mine.length - 1].darts, scores: mine.filter(x => x.darts.length === 3).map(x => L.turnScore(x.darts)), n: mine.length, limit: tr.limitTurns, progress: idx === 0 });
    });
    if (last) {
      finishActiveTraining(true);
      return;
    }
  } else save();
  render();
}

function undo() {
  haptic(15);
  if (ui.view === 'play-match') return undoMatch();
  const tr = data.active.training;
  if (!tr) return;
  if (tr.pending.length) tr.pending.pop();
  else if (tr.turns.length) { tr.pending = tr.turns.pop().darts.slice(0, -1); }
  else return toast('Er is nog niets om te wissen.');
  save();
  render();
}

function startMatch() {
  const m = ui.match;
  ui.savedHigh = null;
  if (!m.players.length) return toast('Voeg minstens één speler toe.');
  data.active.match = {
    id: S.uid(),
    startedAt: now(),
    settings: { start: m.start, bestOf: m.bestOf, doubleOut: m.doubleOut },
    players: m.players.map(p => ({ id: p.id || null, name: p.name })),
    legs: [{ starter: 0, turns: [] }],
    pending: [],
  };
  // Gekoppelde spelers (koppelcode): hun code hoort nu bij deze wedstrijd.
  G.claimGuests({ id: data.active.match.id, players: data.active.match.players.map(p => p.id).filter(Boolean) });
  ui.mod = 1;
  save();
  go('play-match');
  talk(VL.startTalk('match'));
}

function addMatchDart(code) {
  const m = data.active.match;
  if (!m) return;
  const leg = currentLeg(m);
  const ls = L.legState(leg, m.settings.start, m.players.length, m.settings.doubleOut);
  const p = ls.toThrow;
  m.pending.push(code);
  ui.mod = 1;
  const r = L.x01Turn(ls.remaining[p], m.pending, m.settings.doubleOut);
  if (r.bust || r.finished || m.pending.length === 3) {
    const prevInMatch = speechOn() ? L.matchState(m).totals[p].high : 0;
    leg.turns.push({ p, darts: m.pending, at: now() });
    m.pending = [];
    if (r.bust) { celebrate('BUST', `${m.players[p].name} blijft op ${ls.remaining[p]}`, 'bust'); beep('bust'); haptic([60, 40, 60]); talk(VL.bustTalk()); }
    else if (r.finished) {
      if (speechOn()) {
        const last = leg.turns[leg.turns.length - 1].darts, lastDart = last[last.length - 1];
        const line = SP.checkoutLine(r.scored, lastDart);
        if (line) SP.say(line.text); else talk(VL.checkoutTalk(r.scored, lastDart));
      }
      return legWon(m, p, r.scored);
    }
    else {
      turnCelebration(r.scored);
      voiceTurn(m.players[p].id, r.scored, prevInMatch, () => {
        const next = L.legState(leg, m.settings.start, m.players.length, m.settings.doubleOut);
        return VL.matchTalk({ darts: leg.turns[leg.turns.length - 1].darts, score: r.scored, next: next.remaining[next.toThrow], doubleOut: m.settings.doubleOut });
      });
    }
  }
  save();
  render();
}

function legWon(m, p, checkoutScore) {
  const st = L.matchState(m);
  if (st.winner !== null) {
    const { pending, ...clean } = m;
    const badgesBefore = new Map(m.players.filter(x => x.id).map(x => [x.id, earnedBadges(data, x.id)]));
    data.matches.push({ ...clean, finishedAt: now() });
    data.active.match = null;
    save();
    const me = data.activePlayerId;
    const newBadges = badgesBefore.has(me) ? [...earnedBadges(data, me)].filter(b => !badgesBefore.get(me).has(b)) : [];
    const sentTo = guestMatchDone(data.matches[data.matches.length - 1]);
    ui.result = { id: m.id, newBadges, sentTo };
    go('result-match');
    celebrate('GAME SHOT!', `${m.players[p].name} wint met ${checkoutScore} uit`, 'win');
    beep('win');
    return;
  }
  const last = currentLeg(m);
  m.legs.push({ starter: (last.starter + 1) % m.players.length, turns: [] });
  save();
  render();
  celebrate('LEG!', `${m.players[p].name} gooit ${checkoutScore} uit · ${st.won.join('–')}`, 'win');
  beep('win');
}

// Wedstrijd bewaard (uitgespeeld of gestopt): uitslag van gekoppelde spelers naar hun eigen OKKIE. (wachtrij, ook offline).
function guestMatchDone(saved) {
  const names = saved ? G.queueGuestMatch(saved.id, saved) : [];
  if (names.length) sendGuests();
  return names;
}

function undoMatch() {
  const m = data.active.match;
  if (!m) return;
  if (m.pending.length) { m.pending.pop(); save(); return render(); }
  let leg = currentLeg(m);
  if (!leg.turns.length && m.legs.length > 1) { m.legs.pop(); leg = currentLeg(m); }
  if (!leg.turns.length) return toast('Er is nog niets om te wissen.');
  const turn = leg.turns.pop();
  m.pending = turn.darts.slice(0, -1);
  save();
  render();
}

function stopMatch() {
  const m = data.active.match;
  if (!m) return;
  const thrown = m.legs.some(l => l.turns.length) || m.pending.length;
  confirmBox('Wedstrijd stoppen?', thrown ? 'De wedstrijd wordt bewaard als "gestopt" en telt mee in je statistieken.' : 'Er is nog niet gegooid; de wedstrijd wordt niet bewaard.', 'Stoppen', () => {
    if (thrown) {
      const { pending, ...clean } = m;
      if (pending.length) currentLeg(clean).turns.push({ p: L.legState(currentLeg(clean), m.settings.start, m.players.length, m.settings.doubleOut).toThrow, darts: pending, at: now() });
      clean.legs = clean.legs.filter(l => l.turns.length);
      data.matches.push({ ...clean, finishedAt: now(), stopped: true });
      save();
      const names = guestMatchDone(data.matches[data.matches.length - 1]);
      if (names.length) setTimeout(() => toast(`De uitslag gaat naar de eigen OKKIE. van ${names.join(' en ')}.`), 300);
    } else G.releaseGuests(m.id);
    data.active.match = null;
    save();
    closeModal();
    go('home');
  });
}

function exportBackup() {
  const blob = new Blob([S.makeBackup(data, { appVersion: APP_VERSION })], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `okkie-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  Backup.backedUp(data);
  toast('Back-up gedownload. Controleer of hij in Bestanden / Downloads staat.');
  if (ui.view === 'home' || ui.view === 'more') render();
}

async function shareBackup() {
  const filename = 'okkie-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  const file = new File([S.makeBackup(data, { appVersion: APP_VERSION })], filename, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ title: 'OKKIE. back-up', files: [file] });
      Backup.backedUp(data);
      toast('Back-up gedeeld. Kies op iPhone “Bewaar in Bestanden” en daarna iCloud Drive.');
      if (ui.view === 'home' || ui.view === 'more') render();
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
      // Sommige telefoons ondersteunen delen van bestanden niet goed: download werkt altijd als fallback.
    }
  }
  exportBackup();
}

async function importBackup(file) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) return toast('Dit bestand is te groot voor een OKKIE-back-up.', 'error');
  const r = S.parseBackup(await file.text());
  if (r.error) return toast(r.error, 'error');
  const inc = r.data;
  modal(`<h3>Back-up terugzetten</h3>
    <p>In dit bestand: <b>${inc.players.length}</b> speler(s), <b>${inc.trainings.length}</b> trainingen en <b>${inc.matches.length}</b> wedstrijden.</p>
    <p class="muted">Samenvoegen voegt alleen ontbrekende dingen toe. Vervangen wist eerst alles wat nu op dit toestel staat.</p>
    <div class="modal-actions col">
      <button class="btn primary" data-act="import-merge">Samenvoegen (veilig)</button>
      <button class="btn danger" data-act="import-replace">Alles vervangen</button>
      <button class="btn ghost" data-act="modal-close">Annuleren</button></div>`);
  importBackup.pending = inc;
}

// Algemene uitnodiging. Iets anders dan een groepsuitnodiging in Mijn vrienden: hier gaat alleen een link
// naar de website mee, zonder naam, scores of code.
function inviteMessage() { return `${INVITE_TEXT} ${INVITE_URL}`; }
function inviteModal() {
  const msg = inviteMessage();
  const canShare = typeof navigator.share === 'function';
  modal(`<h3>Nodig een vriend uit</h3>
    <p class="muted">Dit bericht gaat mee. Je kunt het in WhatsApp nog aanpassen.</p>
    <p class="invite-preview" data-testid="invite-text">${esc(INVITE_TEXT)} <a href="${INVITE_URL}" target="_blank" rel="noopener">${INVITE_URL.replace('https://', '').replace(/\/$/, '')}</a></p>
    <div class="modal-actions col">
      <a class="btn primary" data-testid="invite-whatsapp" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">${icon('whatsapp', { size: 20 })}Via WhatsApp</a>
      ${canShare ? `<button class="btn secondary" data-act="invite-share">${icon('share', { size: 19 })}Ander appje kiezen</button>` : ''}
      <button class="btn secondary" data-act="invite-copy">${icon('copy', { size: 19 })}Link kopiëren</button>
      <button class="btn ghost" data-act="modal-close">Sluiten</button>
    </div>`);
}
async function inviteShare() {
  try { await navigator.share({ title: 'OKKIE.', text: INVITE_TEXT, url: INVITE_URL }); closeModal(); }
  catch (e) { if (e.name !== 'AbortError') toast('Delen lukt hier niet. Kopieer de link.'); }
}
async function inviteCopy() {
  try {
    await Promise.race([navigator.clipboard.writeText(inviteMessage()), new Promise((_, no) => setTimeout(() => no(new Error('klembord')), 2000))]);
    closeModal(); toast('Gekopieerd. Plak het in een appje.');
  } catch { toast('Kopiëren lukt niet. Houd de tekst ingedrukt om hem te kopiëren.'); }
}

// ---------- Verhuizen en overzetten (js/transfer.js, VERHUIZING.md) ----------
const MOVED_KEY = 'okkie.verhuisd';
function moved() { try { return JSON.parse(localStorage.getItem(MOVED_KEY) || 'null'); } catch { return null; } }
function moveCard() {
  const m = moved();
  if (m) {
    const changed = m.count !== data.trainings.length + data.matches.length;
    return `<section class="card move-card" data-testid="move-card"><h3>Overgezet naar app.okkiedarts.nl</h3>
      <p class="muted">Op ${esc(new Date(m.at).toLocaleDateString('nl-NL'))}: ${esc(T.summaryText(m.summary))}. Je gegevens blijven hier ook bewaard.</p>
      ${changed ? '<p class="note">Je hebt hier sindsdien nog gegooid. Zet opnieuw over; er komt niets dubbel.</p>' : ''}
      <div class="row-actions"><a class="btn primary" href="${T.NEW_APP()}">Open de nieuwe app</a><button class="btn ghost" data-act="transfer-send">Nog eens overzetten</button></div></section>`;
  }
  return `<section class="card move-card" data-testid="move-card"><h3>OKKIE. verhuist naar app.okkiedarts.nl</h3>
    <p>Zet je spelers en trainingen in één minuut over naar het nieuwe adres. Hier wordt niets gewist.</p>
    <div class="row-actions"><button class="btn primary" data-act="transfer-send">Zet mijn trainingen over</button></div></section>`;
}
const iosApp = () => I.platform() === 'ios' && I.isStandalone();
// De code en het pakket worden vooraf gemaakt, zodat kopiëren en het nieuwe venster direct bij de tik
// gebeuren (Safari staat die anders niet toe).
// Het venster (automatisch) houdt alles op het toestel en neemt online profielsleutels altijd mee; de code
// alleen als je dat aanvinkt.
async function prepareTransfer({ secrets = false } = {}) {
  const extras = T.readExtras(localStorage);
  ui.transferSecrets = secrets;
  ui.transferHasSecrets = T.hasSecrets(extras);
  ui.transferPkg = await T.makePackage(data, extras, { secrets: true });
  ui.transferCode = await T.pack(data, extras, { secrets });
}
async function transferSendModal() {
  await prepareTransfer();
  modal(`<h3>Overzetten naar app.okkiedarts.nl</h3>
    <p>Dit gaat mee: <b>${esc(T.summaryText(T.summary(data)))}</b>. Hier wordt niets gewist.</p>
    <div class="modal-actions col">
      ${iosApp() ? '' : '<button class="btn primary" data-act="transfer-auto" data-testid="transfer-auto">Automatisch overzetten</button>'}
      <button class="btn ${iosApp() ? 'primary' : 'secondary'}" data-act="transfer-code">Met een overzetcode</button>
      <button class="btn ghost" data-act="export">${icon('download', { size: 19 })}Back-upbestand (reserve)</button>
    </div>
    <p class="muted small">${iosApp() ? 'Je gebruikt OKKIE. vanaf je beginscherm. Kies <b>Met een overzetcode</b>.' : '<b>Automatisch</b> opent de nieuwe app in een nieuw venster.'} Op iPhone: zet de nieuwe app eerst op je beginscherm en plak de code dáár.</p>`);
}
async function transferCodeModal(refresh = true) {
  if (refresh || !ui.transferCode) await prepareTransfer({ secrets: false });
  const target = T.role() === 'old' ? `<a href="${T.NEW_APP()}" target="_blank" rel="noopener">app.okkiedarts.nl</a>` : 'de andere OKKIE.';
  modal(`<h3>Jouw overzetcode</h3>
    <p class="muted">In deze code zitten ${esc(T.summaryText(T.summary(data)))}. Deel hem met niemand anders en plak hem niet in een groepsapp.</p>
    ${ui.transferHasSecrets ? `<label class="setting"><span>Ook mijn online profiel meenemen<br><small class="muted">Alleen aanzetten als je de code zelf meteen plakt. Wie de code heeft, kan dan je online profiel gebruiken.</small></span><input type="checkbox" class="switch" data-input="transfer-secrets" data-testid="transfer-secrets" ${ui.transferSecrets ? 'checked' : ''}></label>` : ''}
    <textarea class="transfer-code" readonly rows="4" data-testid="transfer-code" aria-label="Overzetcode">${esc(ui.transferCode)}</textarea>
    <div class="modal-actions col"><button class="btn primary" data-act="transfer-copy">${icon('copy', { size: 19 })}Kopieer de code</button></div>
    <ol class="steps"><li>Open ${target}${T.role() === 'old' ? ' (op iPhone: eerst op je beginscherm zetten en dáár openen)' : ''}.</li><li>Tik op <b>Trainingen ophalen</b> of kies <b>Meer → Code invoeren</b>.</li><li>Plak de code en tik op <b>Controleren</b>.</li></ol>
    <div class="modal-actions"><button class="btn ghost" data-act="modal-close">Klaar</button></div>`);
}
function transferCopy() {
  const code = ui.transferCode;
  const fallback = () => { const ta = $('#modal .transfer-code'); if (ta) { ta.hidden = false; ta.focus(); ta.select(); } toast('Kopiëren lukt hier niet vanzelf. De code is geselecteerd: kies Kopiëren.'); };
  try {
    Promise.race([navigator.clipboard.writeText(code), new Promise((_, no) => setTimeout(() => no(new Error('klembord')), 2000))])
      .then(() => { try { localStorage.setItem(MOVED_KEY + '.code', new Date().toISOString()); } catch { /* niet nodig */ } toast('Code gekopieerd. Plak hem in de andere OKKIE.'); }, fallback);
  } catch { fallback(); }
}
function transferReceiveModal() {
  modal(`<h3>Trainingen ophalen</h3>
    <p class="muted">Maak in je andere OKKIE. een overzetcode (<b>Meer → Overzetcode maken</b>) en plak hem hier.</p>
    <form data-form="transfer-code"><textarea name="code" rows="4" class="transfer-code" data-testid="transfer-input" placeholder="OKKIE-OVERZETTEN-1:…" aria-label="Overzetcode"></textarea>
    <div class="modal-actions"><button type="button" class="btn secondary" data-act="transfer-paste">Plakken</button><button class="btn primary">Controleren</button></div></form>
    <p class="muted small">Heb je een back-upbestand? <label class="link file">Kies het bestand<input type="file" accept="application/json,.json" data-input="import" hidden></label></p>
    <div class="modal-actions"><button class="btn ghost" data-act="modal-close">Annuleren</button></div>`);
}
// Eerst laten zien wat erin zit, pas na bevestiging samenvoegen.
async function previewTransfer(text) {
  const r = await T.unpack(text);
  if (r.error) return toast(r.error, 'error');
  ui.transferIncoming = r;
  const names = r.data.players.map(p => p.name);
  modal(`<h3>Klopt dit?</h3><p>In deze code: <b>${esc(T.summaryText(T.summary(r.data)))}</b>.</p>
    <p class="small" data-testid="transfer-names">Spelers: ${names.slice(0, 8).map(esc).join(', ')}${names.length > 8 ? ` en nog ${names.length - 8}` : ''}. Ken je deze namen niet? Tik dan op Annuleren.</p>
    <p class="muted">Wordt samengevoegd met wat hier staat. Niets wordt gewist en niets komt dubbel.</p>
    <div class="modal-actions"><button class="btn ghost" data-act="modal-close">Annuleren</button><button class="btn primary" data-act="transfer-apply" data-testid="transfer-apply">Overzetten</button></div>`);
}
async function applyIncoming(opened) {
  const { data: next, report } = await T.receive(data, opened);
  data = next;
  sanitizeActive();
  save();
  try { T.writeExtras(localStorage, opened.extras); } catch { /* privémodus */ }
  return report;
}
// Uitkomst van een overdracht. Alleen bij 'identiek' staat er "Overgezet en gecontroleerd".
const RESULT_TITLE = { identiek: 'Overgezet en gecontroleerd', aangepast: 'Overgezet, met bewuste verschillen', aandacht: 'Overgezet, behalve de lopende training', probleem: 'Niet alles is goed overgekomen' };
function activeText(report) {
  if (report.active === 'overgenomen') return 'De lopende training is overgenomen.';
  if (report.active === 'al afgerond') return 'De lopende training was hier al afgerond; die telt niet dubbel.';
  if (report.active === 'niet overgenomen') return 'De lopende training is <b>niet</b> overgenomen, omdat hier al een andere training loopt. Hij staat nog in de andere app: rond hem daar af en zet daarna opnieuw over. Er komt niets dubbel.';
  return '';
}
function reportLists(report) {
  const li = list => list.map(x => `<li>${esc(x.what)}${x.why ? ` <span class="muted">(${esc(x.why)})</span>` : ''}</li>`).join('');
  return `${report.missing.length ? `<h4>Ontbreekt</h4><ul class="plain-list" data-testid="transfer-missing">${li(report.missing)}</ul>` : ''}
    ${report.conflicts.length ? `<h4>Zelfde training, andere inhoud</h4><ul class="plain-list" data-testid="transfer-conflicts">${li(report.conflicts.map(c => ({ ...c, why: 'hier blijft de versie van deze app' })))}</ul>` : ''}
    ${report.adjusted.length ? `<h4>Bewust anders</h4><ul class="plain-list" data-testid="transfer-adjusted">${li(report.adjusted)}</ul>` : ''}`;
}
function resultModal(report) {
  const st = report.status;
  const rows = report.players.map(p => `<tr><th>${esc(p.name)}</th><td>${p.trainings}</td><td>${int(p.darts)}</td><td>${fmt(p.avg, 2)}</td><td>${p.same ? icon('check', { size: 16, label: 'klopt' }) : '<b class="down" aria-label="klopt niet">✗</b>'}</td></tr>`).join('');
  const pairs = T.sameNamePairs(data);
  const intro = {
    identiek: 'Elke speler, training, pijl en wedstrijd staat er precies zo in als in de andere app.',
    aangepast: 'Alles is er. Een paar dingen verschillen bewust; daarvan blijft de versie van deze app.',
    aandacht: 'Alle spelers, trainingen en wedstrijden zijn er.',
    probleem: 'Er is niets gewist: de andere app heeft alles nog. Maak daar als reserve een back-upbestand en neem contact op voordat je opnieuw overzet.',
  }[st];
  modal(`<h3 data-testid="transfer-result" data-status="${st}">${RESULT_TITLE[st]}</h3>
    <p class="${st === 'probleem' ? 'note' : 'muted'}">${intro}</p>
    <table class="mtable" data-testid="transfer-table"><thead><tr><th></th><th>Trainingen</th><th>Pijlen</th><th>Gem.</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    ${reportLists(report)}
    <p class="small">${report.received.matches ? `${report.received.matches} wedstrijd${report.received.matches === 1 ? '' : 'en'} meegekomen. ` : ''}${activeText(report)}</p>
    ${report.omitted?.length ? '<p class="note small" data-testid="transfer-omitted">Je online profiel is voor de veiligheid niet meegenomen. Nodig? Maak in de andere app een nieuwe code met <b>Ook mijn online profiel meenemen</b> aan.</p>' : ''}
    <p class="muted small">Hier staan nu: ${esc(T.summaryText(report.here))}. Heb je de code ergens anders geplakt (notitie, appje)? Wis hem daar.</p>
    ${pairs.map(([a, b]) => `<div class="note" data-testid="same-name">Er zijn nu twee spelers met de naam <b>${esc(a.name)}</b>. Is dat dezelfde persoon?
      <div class="row-actions" style="margin-top:8px"><button class="btn small secondary" data-act="merge-players" data-arg="${esc(b.id)}|${esc(a.id)}">Ja, samenvoegen</button><button class="btn small ghost" data-act="modal-close">Nee, apart houden</button></div></div>`).join('')}
    <div class="modal-actions"><button class="btn primary" data-act="modal-close">Klaar</button></div>`);
}
async function transferAuto() {
  const mine = await T.fingerprint(data);
  let result;
  try { result = await T.sendViaWindow(ui.transferPkg); }
  catch { return toast('Automatisch overzetten lukte hier niet. Gebruik de overzetcode; hier is niets gewist.', 'error'); }
  if (!result || !RESULT_TITLE[result.status] || result.status === 'probleem') {
    return modal(`<h3 data-testid="transfer-sent" data-status="probleem">Niet alles is goed overgekomen</h3>
      <p class="note">Hier is niets gewist en je kunt gewoon verder trainen. Gebruik nog niet de nieuwe app voor deze spelers.</p>
      ${result ? reportLists(result) : ''}
      <p class="muted small">Bewaar als reserve een back-upbestand en neem contact op via okkiedarts.nl/contact.</p>
      <div class="modal-actions"><button class="btn ghost" data-act="modal-close">Sluiten</button><button class="btn primary" data-act="export">${icon('download', { size: 19 })}Back-upbestand</button></div>`);
  }
  try { localStorage.setItem(MOVED_KEY, JSON.stringify({ at: new Date().toISOString(), summary: T.summary(data), count: data.trainings.length + data.matches.length, fingerprint: mine, status: result.status })); } catch { /* niet nodig */ }
  render();
  const extra = result.status === 'aangepast' ? `<p class="muted small">${result.adjusted.length} ding${result.adjusted.length === 1 ? '' : 'en'} verschilde${result.adjusted.length === 1 ? '' : 'n'} bewust (bijvoorbeeld een naam); daar blijft de versie van de nieuwe app.</p>`
    : result.status === 'aandacht' ? `<p class="note small">${activeText(result)}</p>` : '';
  modal(`<h3 data-testid="transfer-sent" data-status="${result.status}">${RESULT_TITLE[result.status]}</h3>
    <p>${esc(T.summaryText(result.received))} staan nu op app.okkiedarts.nl. Je gegevens blijven hier ook bewaard.</p>
    ${extra}
    <p class="muted small">Zet de nieuwe app op je beginscherm en gebruik vanaf nu die.</p>
    <div class="modal-actions"><button class="btn ghost" data-act="modal-close">Sluiten</button><a class="btn primary" href="${T.NEW_APP()}">Open de nieuwe app</a></div>`);
}
function mergePlayersAction(arg) {
  const [keep, drop] = String(arg).split('|');
  const accounts = (() => { try { return JSON.parse(localStorage.getItem('okkie.community.v1') || '{}').accounts || {}; } catch { return {}; } })();
  const r = T.mergePlayers(data, keep, drop, accounts);
  if (r.error) return toast(r.error, 'error');
  if (r.moveAccount) { accounts[keep] = accounts[drop]; delete accounts[drop]; localStorage.setItem('okkie.community.v1', JSON.stringify({ version: 1, accounts })); }
  data = r.data; sanitizeActive(); save(); closeModal(); render();
  toast(`${player(keep)?.name} is nu één speler met alle trainingen.`);
}

// ---------- Installatiebegeleiding (js/install.js) ----------
function installCtx() { return { allowed: I.originAllowed(), standalone: I.isStandalone(), state: I.readState(), finished: data.trainings.length }; }
function installReminder() {
  if (!I.remindOnHome(installCtx())) return '';
  return `<section class="card next-badge" data-testid="install-reminder"><span class="a-icon">${icon('install')}</span><div><b>OKKIE. op je beginscherm?</b><p>Eén tik en je bent er, ook zonder internet.</p></div>
    <div class="row-actions"><button class="btn small primary" data-act="install-start">Installeren</button><button class="btn small ghost" data-act="install-later" data-arg="remind">Niet nu</button></div></section>`;
}
function installSheet() {
  I.writeState({ offeredAt: now() });
  modal(`<div data-testid="install-sheet"><h3>Zet OKKIE. op je beginscherm</h3>
    <p class="muted">Dan open je OKKIE. met één tik, net als een echte app. Ook zonder internet. Installeren hoeft niet: je kunt ook gewoon zo verder.</p>
    <div class="modal-actions col"><button class="btn primary" data-act="install-start">${icon('install', { size: 19 })}OKKIE. installeren</button><button class="btn ghost" data-act="install-later">Eerst proberen</button></div></div>`);
}
async function installStart() {
  const hasData = data.trainings.length || data.matches.length || data.active.training || data.active.match;
  if (ui.installEvent && !hasData) {
    const e = ui.installEvent; ui.installEvent = null;
    closeModal(); e.prompt();
    const choice = await e.userChoice.catch(() => null);
    if (choice?.outcome === 'accepted') { I.writeState({ installedAt: now() }); toast('OKKIE. staat op je beginscherm.'); }
    return render();
  }
  if (hasData) await prepareTransfer();
  const p = I.platform();
  const backup = hasData ? `<li><b>Neem eerst je trainingen mee.</b> ${p === 'ios' ? 'Op iPhone begint OKKIE. op je beginscherm soms leeg.' : 'Voor de zekerheid.'}
      <div class="row-actions" style="margin-top:8px"><button class="btn small primary" data-act="transfer-copy" data-testid="install-copy">${icon('copy', { size: 17 })}Kopieer overzetcode</button><button class="btn small secondary" data-act="backup-share">Back-up bewaren</button></div>
      <textarea class="transfer-code" readonly rows="2" hidden>${esc(ui.transferCode || '')}</textarea></li>` : '';
  const steps = p === 'ios' ? (I.iosBrowser() === 'firefox'
      ? '<li>Open <b>app.okkiedarts.nl</b> in <b>Safari</b>. Firefox kan OKKIE. niet op je beginscherm zetten.</li>'
      : `<li>Tik op de <b>deelknop</b> ${icon('share', { size: 18 })} ${I.iosBrowser() === 'safari' ? '(onderaan of bovenaan; zie je hem niet, tik dan eerst op <b>•••</b>)' : '(rechtsboven in de adresbalk)'}.</li>
      <li>Kies <b>Zet op beginscherm</b>. Staat hij er niet tussen? Scroll in het menu naar beneden.</li>
      <li>Tik op <b>Voeg toe</b>.</li>`)
    : p === 'android' ? (ui.installEvent ? '<li>Tik op <b>Installeren</b> hieronder en bevestig.</li>'
      : '<li>Tik in Chrome op <b>⋮</b> (rechtsboven).</li><li>Kies <b>App installeren</b> of <b>Toevoegen aan startscherm</b>.</li>')
    : (ui.installEvent ? '<li>Klik op <b>Installeren</b> hieronder.</li>' : '<li>Klik in de adresbalk op het installatie-icoon, of kies in het menu <b>App installeren</b>.</li>');
  const after = hasData ? '<li>Open OKKIE. vanaf je beginscherm. Is hij leeg? Tik op <b>Trainingen ophalen</b> en plak de code.</li>' : '<li>Open OKKIE. voortaan vanaf je beginscherm.</li>';
  modal(`<h3>OKKIE. installeren</h3><ol class="steps install-steps" data-testid="install-steps">${backup}${steps}${after}</ol>
    <div class="modal-actions">${ui.installEvent ? `<button class="btn primary" data-act="install-prompt">${icon('install', { size: 19 })}Installeren</button>` : ''}<button class="btn ghost" data-act="install-later">Klaar</button></div>`);
}
async function installPrompt() {
  const e = ui.installEvent; if (!e) return;
  ui.installEvent = null; e.prompt();
  const choice = await e.userChoice.catch(() => null);
  if (choice?.outcome === 'accepted') { I.writeState({ installedAt: now() }); closeModal(); toast('OKKIE. staat op je beginscherm.'); render(); }
}

function switchPlayerModal() {
  modal(`<h3>Wie gooit er?</h3><ul class="pick">${data.players.map(p => `<li><button class="pick-btn ${p.id === data.activePlayerId ? 'on' : ''}" data-act="use-player" data-arg="${esc(p.id)}"><span class="dot" style="background:${esc(p.color)}"></span>${esc(p.name)}</button></li>`).join('')}</ul>
    <form data-form="add-player" class="guest"><input name="name" maxlength="24" placeholder="Nieuwe speler" aria-label="Naam nieuwe speler"><button class="btn secondary">+ Toevoegen</button></form>
    <div class="modal-actions"><button class="btn ghost" data-act="modal-close">Sluiten</button></div>`);
}

const ACTIONS = {
  'guest-link-open': () => modal(`<h3>Speler met eigen OKKIE.</h3>
    <p class="muted">Speelt er iemand mee die zelf OKKIE. heeft? Laat hem op zijn telefoon bij <b>Meer → Koppelcode maken</b> een code maken. Na afloop gaat zijn ${ui.addCtx === 'match' ? 'wedstrijduitslag' : 'training'} vanzelf naar zijn eigen statistieken. Jouw scores blijven gewoon van jou.</p>
    <form data-form="guest-link"><label class="inline">Koppelcode <input name="code" maxlength="9" autocomplete="off" autocapitalize="characters" placeholder="ABCD-EFGH" required></label>
    <label class="inline">Naam (alleen nodig zonder internet) <input name="name" maxlength="24"></label>
    <div class="modal-actions"><button type="button" class="btn ghost" data-act="modal-close">Annuleren</button><button class="btn primary">Koppelen</button></div></form>`),
  'guest-pass': async () => {
    try {
      const r = await G.makeGuestCode(data.activePlayerId);
      modal(`<h3>Jouw koppelcode</h3><p class="guest-code" data-testid="guest-code">${esc(r.code)}</p>
        <p class="muted">Laat je vriend deze code invullen bij <b>Speler toevoegen → Speler met eigen OKKIE.?</b>, bij trainen of bij een 301/501-wedstrijd. De code is ${r.days} dagen geldig en werkt voor <b>één</b> training of wedstrijd. Na afloop komt jouw resultaat vanzelf bij je eigen statistieken. De code geeft geen toegang tot je profiel.</p>
        <div class="modal-actions"><button class="btn primary" data-act="modal-close">Klaar</button></div>`);
    } catch (e) { toast(e instanceof TypeError ? 'Geen internet. Een koppelcode maken lukt alleen online.' : e.message); }
  },
  'guest-retry': () => sendGuests(true),
  'modal-close': closeModal,
  'transfer-send': transferSendModal,
  'transfer-auto': transferAuto,
  'transfer-code': () => transferCodeModal(true),
  'transfer-copy': transferCopy,
  'transfer-receive': transferReceiveModal,
  'transfer-paste': async () => {
    try { const t = await navigator.clipboard.readText(); if (!t) throw new Error('leeg'); $('#modal [name=code]').value = t; ui.transferFromClipboard = true; await previewTransfer(t); }
    catch { toast('Plakken lukt hier niet vanzelf. Houd het vak ingedrukt en kies Plak.'); }
  },
  'transfer-apply': async () => {
    // De code bevat al je trainingen: na plakken via de knop het klembord leegmaken (direct bij deze tik).
    if (ui.transferFromClipboard) { ui.transferFromClipboard = false; try { navigator.clipboard.writeText('').catch(() => {}); } catch { /* niet ondersteund */ } }
    const r = ui.transferIncoming; ui.transferIncoming = null; if (!r) return closeModal();
    const report = await applyIncoming(r); goAfterTransfer(); resultModal(report);
  },
  'merge-players': mergePlayersAction,
  'install-start': installStart,
  'install-prompt': installPrompt,
  'install-later': v => { if (v === 'remind') I.writeState({ remindedAt: now() }); closeModal(); render(); },
  'invite': inviteModal,
  'invite-share': inviteShare,
  'invite-copy': inviteCopy,
  'modal-ok': () => confirmBox.ok?.(),
  'share-result': async () => {
    const d = shareData();
    if (!d) return;
    try {
      ui.shareBlob = await SC.drawScoreCard(d.card); ui.shareChallenge = d.challenge;
      if (ui.shareUrl) URL.revokeObjectURL(ui.shareUrl);
      ui.shareUrl = URL.createObjectURL(ui.shareBlob);
    } catch { return toast('Een scorekaart maken lukt op dit toestel niet.'); }
    modal(`<h3>Deel je score</h3>
      <img class="share-preview" src="${ui.shareUrl}" alt="Scorekaart: ${esc(d.card.title)}, ${esc(d.card.value)} ${esc(d.card.unit)}" data-testid="share-preview">
      <p class="muted small">Zonder je naam. Je kiest zelf met wie je hem deelt; er gaat niets naar OKKIE.</p>
      <div class="modal-actions col">
        <button class="btn primary" data-act="share-card">${icon('share', { size: 19 })}Scorekaart delen</button>
        <button class="btn secondary" data-act="share-challenge" data-testid="share-challenge">${icon('invite', { size: 19 })}Daag een vriend uit</button>
        <button class="btn ghost" data-act="modal-close">Sluiten</button>
      </div>`);
  },
  'share-card': async () => {
    if (!ui.shareBlob) return;
    const how = await SC.shareCard(ui.shareBlob, `Mijn training in OKKIE. 🎯 ${INVITE_URL}`);
    if (how === 'shared') closeModal();
    if (how === 'downloaded') toast('Scorekaart bewaard als afbeelding. Deel hem vanuit je foto’s of bestanden.');
  },
  'share-challenge': async () => {
    const text = ui.shareChallenge || inviteMessage();
    if (navigator.share) {
      try { await navigator.share({ text }); closeModal(); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
  },
  'speech-test': () => { SP.call180(); SP.say(chatty() ? 'Zo klinkt OKKIE. bij een honderdtachtig! En bij nul punten? Het bord hangt hier, hoor!' : 'Zo klinkt OKKIE. bij een honderdtachtig! Kom op!', { follow: true }); },
  'speech-mode': v => {
    if (v === 'rustig') data.settings.speechMode = 'rustig'; else delete data.settings.speechMode;
    save(); render();
    SP.say(v === 'rustig' ? 'Oké. Ik zeg alleen nog iets bij de hoogtepunten.' : 'Lekker! Ik moedig je vaker aan. En soms een grapje!', { priority: true });
  },
  'fb-shot-remove': () => { ui.fb.screenshot = null; render(); },
  'fb-again': () => { ui.fb = { kind: ui.fb.kind, message: '', contact: '', screenshot: null, busy: false, error: '', sent: null, startedAt: Date.now() }; render(); },
  'switch-player': switchPlayerModal,
  'use-player': id => {
    if (data.active.training || data.active.match) {
      // lopende sessies blijven bij hun eigen speler; alleen de actieve speler wisselt
    }
    data.activePlayerId = id;
    ui.match.players = [];
    ui.setup.players = [];
    save(); closeModal(); render();
    toast(`${player().name} is nu actief.`);
  },
  'setup-turns': v => { ui.setup.kind = 'score'; ui.setup.turns = Number(v); render(); },
  'start-score': startScore,
  'add-player-open': ctx => addPlayerModal(ctx === 'match' ? 'match' : 'train'),
  'tp-add': id => { const ps = setupPlayers(); if (player(id) && ps.length < 4 && !ps.includes(id)) ps.push(id); playerAdded(); },
  'tp-remove': i => { setupPlayers().splice(Number(i), 1); render(); },
  'tp-up': i => { const a = setupPlayers(); const n = Number(i); [a[n - 1], a[n]] = [a[n], a[n - 1]]; render(); },
  'start-clock': startClock,
  'resume-training': () => { const t = data.active.training; if (t) { data.activePlayerId = t.playerId; go(t.kind === 'clock' ? 'play-clock' : 'play-score'); } },
  'resume-match': () => data.active.match && go('play-match'),
  'mod': v => { const n = Number(v); ui.mod = ui.mod === n ? 1 : n; haptic(5); render(); },
  'key': v => {
    const n = Number(v);
    let code;
    if (n === 0) code = 'M';
    else if (n === 25) code = 'SB';
    else if (n === 50) code = 'DB';
    else code = (ui.mod === 2 ? 'D' : ui.mod === 3 ? 'T' : 'S') + n;
    addDart(code);
  },
  'undo': undo,
  // Tik op een ingevulde pijl: die pijl (en alles erna in deze beurt) wissen en opnieuw invoeren.
  'slot': i => {
    const holder = ui.view === 'play-match' ? data.active.match : data.active.training;
    if (!holder) return;
    holder.pending = holder.pending.slice(0, Number(i));
    haptic(15); save(); render();
  },
  'toggle-type': () => { ui.typing = !ui.typing; render(); },
  'pause': () => { save(); go('home'); toast('Gepauzeerd. Je kunt later verder via Home.'); },
  'finish-training': () => {
    const t = data.active.training;
    if (!t.turns.length && !t.pending.length) { data.active.training = null; save(); return go('home'); }
    const lim = t.players.length > 1 ? null : L.trainingLimitDarts(t);
    const text = t.players.length > 1 ? 'Iedereen krijgt zijn eigen training in de geschiedenis, zoals de stand nu is.' : lim ? `Je hebt ${L.trainingTotals(t).darts + t.pending.length} van de ${lim} pijlen gegooid. De training wordt bewaard zoals hij nu is.` : 'De training wordt bewaard in je geschiedenis.';
    confirmBox('Training afronden?', text, 'Bewaren', () => { closeModal(); finishActiveTraining(true); }, false);
  },
  'again': () => {
    const t = data.trainings.find(x => x.id === ui.result?.id);
    if (t?.kind === 'clock') return startClock();
    if (ui.result?.players) ui.setup.players = ui.result.players.filter(id => player(id));
    if (t) { ui.setup.turns = t.limitTurns || 0; if (![0, 10, 20, 33].includes(ui.setup.turns)) { ui.setup.custom = ui.setup.turns; ui.setup.turns = -1; } }
    startScore();
  },
  'match-set': v => {
    const [k, val] = v.split(':');
    ui.match[k] = k === 'doubleOut' ? val === 'true' : Number(val);
    render();
  },
  'mp-add': id => { const p = player(id); if (p && ui.match.players.length < 4 && !ui.match.players.some(x => x.id === id)) ui.match.players.push({ id: p.id, name: p.name }); playerAdded(); },
  'mp-remove': i => { ui.match.players.splice(Number(i), 1); render(); },
  'mp-up': i => { const a = ui.match.players; const n = Number(i); [a[n - 1], a[n]] = [a[n], a[n - 1]]; render(); },
  'start-match': () => {
    if (data.active.match) return void confirmBox('Lopende wedstrijd', 'Er loopt nog een wedstrijd. Die wordt gestopt en bewaard als je een nieuwe start.', 'Nieuwe starten', () => {
      const m = data.active.match; const { pending, ...clean } = m; clean.legs = clean.legs.filter(l => l.turns.length);
      if (clean.legs.length) { data.matches.push({ ...clean, finishedAt: now(), stopped: true }); save(); guestMatchDone(data.matches[data.matches.length - 1]); }
      else G.releaseGuests(m.id);
      data.active.match = null; closeModal(); startMatch();
    }, false);
    startMatch();
  },
  'stop-match': stopMatch,
  'rematch': () => {
    const m = data.matches.find(x => x.id === ui.result?.id);
    if (m) { ui.match = { start: m.settings.start, bestOf: m.settings.bestOf, doubleOut: m.settings.doubleOut, players: m.players.length > 1 ? [...m.players.slice(1), m.players[0]] : [...m.players] }; }
    startMatch();
  },
  'stats-set': v => { const [k, val] = v.split(':'); ui[k] = val; render(); },
  'stats-last10': () => { ui.statsLast10 = !ui.statsLast10; render(); },
  'stat-prefs': v => { const [scope, pid] = String(v || '').split('|'); statPrefsModal(SV.SCOPES[scope] ? scope : 'one', player(pid) ? pid : data.activePlayerId); },
  'stat-scope': v => statPrefsModal(v, ui.prefPlayer),
  'stat-reset': () => {
    if (SV.resetStats(data.settings, ui.prefPlayer)) save();
    render(); statPrefsModal(ui.prefScope, ui.prefPlayer); toast('Standaardweergave hersteld.');
  },
  'result-pick': id => { ui.resultPick = id; render(); },
  'open-training': id => { const t = data.trainings.find(x => x.id === id); if (t) trainingDetail(t); },
  'open-match': id => { const m = data.matches.find(x => x.id === id); if (m) matchDetail(m); },
  'delete-training': id => confirmBox('Training verwijderen?', 'Deze training verdwijnt definitief uit je geschiedenis en statistieken.', 'Verwijderen', () => {
    const affected = data.trainings.find(t => t.id === id)?.playerId;
    data.trainings = data.trainings.filter(t => t.id !== id); T.rememberRemoved(data, 'trainings', [id]); save();
    if (affected) queueCommunitySync(data, [affected], { replace: true });
    closeModal(); render(); toast('Training verwijderd.');
  }),
  'delete-match': id => confirmBox('Wedstrijd verwijderen?', 'Deze wedstrijd verdwijnt definitief.', 'Verwijderen', () => {
    data.matches = data.matches.filter(m => m.id !== id); T.rememberRemoved(data, 'matches', [id]); save(); closeModal(); render(); toast('Wedstrijd verwijderd.');
  }),
  // Speler beheren: naam, statistieken wissen (speler blijft) of de speler helemaal verwijderen.
  'rename-player': id => {
    const p = player(id);
    if (!p) return;
    const c = playerDataCount(id), acct = getAccount(id);
    modal(`<h3>${esc(p.name)}</h3>
      <form data-form="rename" data-arg="${esc(id)}"><label for="pname">Naam</label><div class="guest"><input id="pname" name="name" maxlength="24" value="${esc(p.name)}" required><button class="btn secondary">Opslaan</button></div></form>
      <h4>Gegevens van ${esc(p.name)}</h4>
      <p class="muted small" data-testid="player-data">${c.trainings} training${c.trainings === 1 ? '' : 'en'} en ${c.matches} wedstrijd${c.matches === 1 ? '' : 'en'} op deze telefoon${acct?.enabled ? '. Deelt cijfers in Darters.' : '.'}</p>
      <div class="modal-actions col">
        <button class="btn secondary" data-act="reset-player" data-arg="${esc(id)}" data-testid="reset-player">Statistieken wissen</button>
        <button class="btn danger ghost" data-act="delete-player" data-arg="${esc(id)}" data-testid="delete-player">Speler verwijderen</button>
        <button class="btn ghost" data-act="modal-close">Sluiten</button>
      </div>
      <p class="muted small">Tip: bewaar eerst een back-up (Meer → Back-up). Andere spelers op deze telefoon blijven altijd ongemoeid.</p>`);
  },
  'reset-player': id => {
    const p = player(id), c = playerDataCount(id), acct = getAccount(id);
    if (!p) return;
    confirmBox(`Statistieken van ${p.name} wissen?`, `${c.trainings} training${c.trainings === 1 ? '' : 'en'} en ${c.matches} wedstrijd${c.matches === 1 ? '' : 'en'} van ${p.name} worden van deze telefoon gewist; ${p.name} blijft als speler bestaan. Wedstrijden samen met andere spelers op deze telefoon blijven voor hen bewaard.${acct?.enabled ? ' De gedeelde cijfers in Darters gaan ook naar nul.' : ''} Dit kun je alleen terugdraaien met een back-up.`, 'Wissen', () => {
      removePlayerData(id, { keepPlayer: true });
      save();
      if (acct?.enabled) queueCommunitySync(data, [id], { replace: true });
      closeModal(); render(); toast(`De statistieken van ${p.name} zijn gewist.`);
    });
  },
  'delete-player': id => {
    const p = player(id), c = playerDataCount(id), acct = getAccount(id);
    if (!p) return;
    const last = data.players.length === 1;
    confirmBox(`${p.name} helemaal verwijderen?`, `${p.name} en ${c.trainings} training${c.trainings === 1 ? '' : 'en'} en ${c.matches} wedstrijd${c.matches === 1 ? '' : 'en'} worden van deze telefoon gewist.${acct?.token ? ' Het Darters-profiel en de gedeelde cijfers worden ook online gewist.' : ''} Wedstrijden samen met andere spelers op deze telefoon blijven voor hen bewaard, zonder ${p.name}s naam.${last ? ' Dit is de laatste speler: daarna begint OKKIE. opnieuw.' : ''} Dit kun je alleen terugdraaien met een back-up.`, 'Verwijderen', async () => {
      if (acct?.token) {
        try { await deleteOnlineProfile(acct); }
        catch (e) { return toast(e instanceof TypeError ? 'Geen internet. Verwijderen lukt als je online bent; de online cijfers moeten ook weg.' : e.message, 'error'); }
        dropAccount(id);
      }
      removePlayerData(id, { keepPlayer: false });
      G.unlinkGuest(id);
      save(); closeModal(); render(); toast(`${p.name} is verwijderd.`);
    });
  },
  'export': exportBackup,
  'backup-share': shareBackup,
  'backup-dismiss': () => { Backup.dismissed(data, data.activePlayerId); render(); },
  'import-dc': () => {
    const list = dartCounterTrainings(data.activePlayerId);
    let p = 0, d = 0; list.forEach(t => { p += t.summary.points; d += t.summary.darts; });
    confirmBox('DartCounter-scores toevoegen?', `${list.length} scoretrainingen van 99 pijlen (gemiddeld ${fmt(L.avg3(p, d), 2)}) worden toegevoegd aan ${player().name}. De datums waren niet bekend; die kun je per training invullen in de geschiedenis.`, 'Toevoegen', () => {
      if (!hasDartCounterSet(data, data.activePlayerId)) data.trainings.push(...list);
      save(); closeModal(); render(); toast(`${list.length} trainingen toegevoegd.`);
    }, false);
  },
  'import-merge': async () => { const report = await applyIncoming({ data: importBackup.pending, extras: {}, fingerprint: null }); goAfterTransfer(); resultModal(report); },
  'import-replace': () => confirmBox('Echt alles vervangen?', 'Alles wat nu op dit toestel staat wordt overschreven door de back-up.', 'Ja, vervangen', () => {
    const inc = importBackup.pending; data = structuredClone(inc); sanitizeActive(); save(); goAfterTransfer();
    const v = T.verifyTransfer(inc, data);
    resultModal({ ...v, skippedActive: null, omitted: [], received: T.summary(inc), here: T.summary(data) });
  }),
  'theme': v => { data.settings.theme = v; applyTheme(); save(); render(); },
  'install': async () => { const e = ui.installEvent; if (!e) return; e.prompt(); await e.userChoice; ui.installEvent = null; render(); },
};

// ---------- Wissen en verwijderen per speler ----------
function playerDataCount(id) {
  return { trainings: data.trainings.filter(t => t.playerId === id).length, matches: data.matches.filter(m => m.players.some(mp => mp.id === id)).length };
}
// Alleen gegevens van deze ene speler. Een wedstrijd met een andere speler van deze telefoon blijft voor die speler bestaan;
// een wedstrijd die alleen van deze speler was (eventueel met gasten zonder eigen speler) gaat weg.
function removePlayerData(id, { keepPlayer }) {
  const trIds = data.trainings.filter(t => t.playerId === id).map(t => t.id);
  T.rememberRemoved(data, 'trainings', trIds);
  data.trainings = data.trainings.filter(t => t.playerId !== id);
  const others = new Set(data.players.filter(p => p.id !== id).map(p => p.id));
  const own = data.matches.filter(m => m.players.some(mp => mp.id === id || mp.formerId === id) && !m.players.some(mp => mp.id && others.has(mp.id)));
  T.rememberRemoved(data, 'matches', own.map(m => m.id));
  data.matches = data.matches.filter(m => !own.includes(m));
  // Gewist: telt niet meer mee voor deze speler (formerId onthoudt wie het was). Verwijderd: ook de naam eruit.
  data.matches.forEach(m => m.players.forEach(mp => {
    if (mp.id !== id && mp.formerId !== id) return;
    mp.id = null;
    if (keepPlayer) mp.formerId = id; else { delete mp.formerId; mp.name = 'Verwijderde speler'; }
  }));
  if (data.active.training?.players?.includes(id)) data.active.training = null;
  if (data.active.match?.players?.some(mp => mp.id === id)) data.active.match = null;
  if (!keepPlayer) SV.resetStats(data.settings, id);
  ui.setup.players = (ui.setup.players || []).filter(x => x !== id);
  ui.match.players = [];
  if (keepPlayer) return;
  T.rememberRemoved(data, 'players', [id]);
  data.players = data.players.filter(x => x.id !== id);
  if (data.activePlayerId === id) data.activePlayerId = data.players[0]?.id || null;
}
// Darters-profiel online wissen. Staat het profiel inmiddels op een andere telefoon (token vervangen), dan met de
// bewaarde herstelcode opnieuw toegang krijgen en daarna wissen. Bestaat het online al niet meer: klaar.
async function deleteOnlineProfile(acct) {
  try { await request('/v1/me', 'DELETE', null, acct.token); return; }
  catch (e) { if (e.status !== 401) throw e; }
  if (!acct.handle || !acct.recovery) return;
  let fresh;
  try { fresh = await request('/v1/recover', 'POST', { handle: acct.handle, recovery: acct.recovery }); }
  catch (e) { if (e.status === 401) return; throw e; }
  await request('/v1/me', 'DELETE', null, fresh.token);
}

// Na overzetten vanaf het (lege) welkomstscherm: naar de lopende sessie als die er is, anders naar Home.
// Vanuit Meer (back-up terugzetten, code invoeren) blijf je waar je was.
function goAfterTransfer() {
  closeModal();
  if (ui.view === 'welcome' || !data.players.length) {
    ui.view = data.players.length ? (data.active.training ? (data.active.training.kind === 'clock' ? 'play-clock' : 'play-score') : data.active.match ? 'play-match' : 'home') : 'welcome';
  }
  render();
}

const FORMS = {
  'transfer-code': fd => previewTransfer(fd.get('code')),
  'guest-link': async fd => {
    const code = G.normalizeCode(fd.get('code'));
    if (code.length !== 8) return toast('Een koppelcode heeft 8 tekens, bijvoorbeeld ABCD-EFGH.');
    let nickname = S.cleanName(fd.get('name'));
    try { nickname = (await G.previewCode(code)).nickname; }
    catch (e) {
      if (!(e instanceof TypeError)) return toast(e.message);
      if (!nickname) return toast('Geen internet: vul ook zijn naam in. De code wordt later gecontroleerd.');
    }
    const links = G.readGuest().links;
    let p = data.players.find(x => links[x.id] && links[x.id].nickname === nickname);
    if (!p) { p = S.newPlayer(nickname, data.players.length); data.players.push(p); save(); }
    G.linkGuest(p.id, code, nickname);
    if (ui.addCtx === 'match') { if (!ui.match.players.some(x => x.id === p.id) && ui.match.players.length < 4) ui.match.players.push({ id: p.id, name: p.name }); }
    else { const ps = setupPlayers(); if (!ps.includes(p.id) && ps.length < 4) ps.push(p.id); }
    closeModal(); render();
    toast(`${nickname} is gekoppeld. Na afloop gaat ${ui.addCtx === 'match' ? 'de uitslag' : 'de training'} naar zijn eigen OKKIE.`);
  },
  welcome: fd => {
    const name = S.cleanName(fd.get('name'));
    if (!name) return toast('Vul je naam in.');
    const p = S.newPlayer(name, data.players.length);
    data.players.push(p);
    data.activePlayerId = p.id;
    save();
    go('home');
    if (I.offerAfterWelcome(installCtx())) installSheet();
  },
  'add-player': fd => {
    const name = S.cleanName(fd.get('name'));
    if (!name) return toast('Vul een naam in.');
    if (data.players.some(p => p.name.toLowerCase() === name.toLowerCase())) return toast('Die naam bestaat al.');
    const p = S.newPlayer(name, data.players.length);
    data.players.push(p);
    save();
    closeModal();
    render();
    toast(`${name} toegevoegd.`);
  },
  // Nieuwe speler (vriend/familie) maken en meteen laten meedoen met de training.
  'train-player': fd => {
    const name = S.cleanName(fd.get('name'));
    if (!name) return toast('Vul een naam in.');
    const ps = setupPlayers();
    let p = data.players.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (p && getAccount(p.id) && !ps.includes(p.id)) return toast(`${p.name} heeft op deze telefoon een eigen profiel. Gooit ${p.name} zelf? Kies dan + ${p.name}. Anders: kies een andere naam.`);
    if (!p) { p = S.newPlayer(name, data.players.length); data.players.push(p); save(); }
    if (ps.includes(p.id)) return toast(`${p.name} doet al mee.`);
    if (ps.length >= 4) return toast('Maximaal 4 spelers.');
    ps.push(p.id);
    playerAdded();
  },
  guest: fd => {
    const name = S.cleanName(fd.get('name'));
    if (!name) return toast('Vul een naam in.');
    const prof = data.players.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (ui.match.players.length < 4) ui.match.players.push(prof && !ui.match.players.some(x => x.id === prof.id) ? { id: prof.id, name: prof.name } : { id: null, name });
    playerAdded();
  },
  summary: fd => {
    const t = S.summaryTraining({ playerId: data.activePlayerId, points: fd.get('points'), darts: fd.get('darts'), high: fd.get('high'), date: fd.get('date') || null, source: 'Andere app' });
    if (!t) return toast('Deze score klopt niet (bijv. hoogste beurt hoger dan 180 of meer punten dan mogelijk).', 'error');
    data.trainings.push(t); save(); render();
    toast(`Toegevoegd: ${t.summary.points} punten in ${t.summary.darts} pijlen (gem. ${fmt(L.trainingTotals(t).avg, 2)}).`);
  },
  'set-date': (fd, form) => {
    const t = data.trainings.find(x => x.id === form.dataset.arg);
    const v = fd.get('date');
    if (!t || !v) return toast('Kies een datum.');
    t.startedAt = new Date(v + 'T12:00:00').toISOString();
    delete t.dateUnknown;
    save(); closeModal(); render(); toast('Datum opgeslagen.');
  },
  rename: (fd, form) => {
    const name = S.cleanName(fd.get('name'));
    const p = player(form.dataset.arg);
    if (!name || !p) return;
    p.name = name;
    data.matches.forEach(m => m.players.forEach(mp => { if (mp.id === p.id) mp.name = name; }));
    save(); closeModal(); render();
  },
  feedback: async fd => {
    const f = ui.fb;
    if (f.busy) return;
    f.message = String(fd.get('message') || '').trim(); f.contact = String(fd.get('contact') || '').trim();
    if (f.message.length < 5) { f.error = f.kind === 'idee' ? 'Schrijf je idee in een paar woorden.' : 'Schrijf kort wat er misging.'; return render(); }
    if (f.contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contact)) { f.error = 'Dit e-mailadres klopt niet. Laat het leeg als je geen antwoord nodig hebt.'; return render(); }
    f.busy = true; f.error = ''; render();
    try {
      await FB.sendFeedback({ kind: f.kind, message: f.message, contact: f.contact, website: String(fd.get('website') || ''), startedAt: f.startedAt, screenshot: f.screenshot,
        meta: FB.techInfo({ version: APP_VERSION, installed: I.isStandalone() }) });
      ui.fb = { kind: f.kind, message: '', contact: '', screenshot: null, busy: false, error: '', sent: f.kind, contactGiven: !!f.contact, startedAt: 0 };
    } catch (e) {
      f.busy = false;
      f.error = e instanceof TypeError ? 'Geen internet. Je bericht blijft staan; probeer het zo nog eens.' : e.message;
    }
    if (ui.view === 'hulp') render();
  },
  type: (fd) => {
    const r = L.parseLine(fd.get('line'));
    if (r.error) return toast(r.error, 'error');
    const pend = ui.view === 'play-match' ? data.active.match.pending : data.active.training.pending;
    const room = 3 - pend.length;
    if (!r.codes.length) return;
    if (r.codes.length > room) return toast(`Je kunt nog ${room} pijl${room === 1 ? '' : 'en'} invoeren in deze beurt.`, 'error');
    for (const c of r.codes) { ui.lastTap = 0; addDart(c); if (!PLAY_VIEWS.has(ui.view)) break; }
    ui.typing = true;
    render();
  },
};

function applyTheme() {
  document.documentElement.dataset.theme = data.settings.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', data.settings.theme === 'light' ? '#f6f1e7' : '#07120d');
}

// ---------- Event-delegatie ----------
document.addEventListener('click', e => {
  const goEl = e.target.closest('[data-go]');
  if (goEl) { e.preventDefault(); closeModal(); return go(goEl.dataset.go); }
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el.dataset.arg); }
});

document.addEventListener('submit', e => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  FORMS[form.dataset.form]?.(new FormData(form), form);
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.input === 'import') { importBackup(el.files[0]); el.value = ''; }
  if (el.dataset.input === 'setting') {
    data.settings[el.dataset.arg] = el.checked; save();
    // Direct na de tik iets zeggen: zo hoor je dat het werkt (en mag de iPhone daarna ook spreken).
    if (el.dataset.arg === 'speech') { if (el.checked) SP.say('Aanmoedigingen staan aan! Kom op, gooien!'); render(); }
  }
  if (el.dataset.input === 'stat-pref') {
    if (SV.setStat(data.settings, ui.prefPlayer, el.dataset.scope, el.dataset.arg, el.checked)) { save(); render(); }
    const reset = $('#modal [data-act=stat-reset]');
    if (reset) reset.disabled = !SV.statView(data.settings, ui.prefPlayer).custom;
  }
  if (el.dataset.input === 'transfer-secrets') prepareTransfer({ secrets: el.checked }).then(() => transferCodeModal(false));
  if (el.dataset.input === 'fb-kind') { ui.fb.kind = el.value === 'idee' ? 'idee' : 'probleem'; render(); }
  if (el.dataset.input === 'fb-shot' && el.files[0]) FB.shrinkImage(el.files[0]).then(d => { ui.fb.screenshot = d; if (ui.view === 'hulp') render(); }).catch(err => toast(err.message, 'error'));
  if (el.dataset.input === 'custom-turns') { ui.setup.custom = Math.max(1, Math.min(200, Number(el.value) || 1)); render(); }
});

// Hulp & feedback: wat je typt bewaren (het scherm wordt bij andere keuzes opnieuw opgebouwd).
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset?.input === 'fb-text' && (el.name === 'message' || el.name === 'contact')) ui.fb[el.name] = el.value;
});

// Toetsenbord op desktop: cijfers typen gaat via het typvak; Escape sluit een venster.
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
  if (PLAY_VIEWS.has(ui.view) && !ui.typing && $('#modal').hidden && /^[0-9a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
    ui.typing = true; render();
  }
});

// iPhone: na het sluiten van het toetsenbord blijft de pagina soms een stukje verschoven (kop onder de statusbalk,
// vreemd scrollen). Op dezelfde plek opnieuw scrollen laat Safari de indeling herberekenen; verder geen effect.
document.addEventListener('focusout', e => {
  if (!e.target.matches?.('input, textarea, select')) return;
  setTimeout(() => { if (!document.activeElement?.matches?.('input, textarea, select')) window.scrollTo(window.scrollX, window.scrollY); }, 60);
});

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); ui.installEvent = e; if (ui.view === 'more') render(); });

// ---------- Start ----------
const TAB_ICONS = { home: 'home', train: 'train', match: 'match', stats: 'stats', more: 'more' };
document.querySelectorAll('#tabbar [data-go]').forEach(b => { const sp = b.querySelector('span'); if (sp) sp.innerHTML = icon(TAB_ICONS[b.dataset.go] || 'more'); });
applyTheme();
if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
if (loaded.source === 'legacy') { save(); setTimeout(() => toast('Je trainingen uit Dartlog zijn overgezet naar OKKIE.'), 600); }
const at = data.active.training;
if (at) ui.view = at.kind === 'clock' ? 'play-clock' : 'play-score';
else if (data.active.match) ui.view = 'play-match';
render();
T.receiveViaWindow(async opened => {
  const report = await applyIncoming(opened);
  goAfterTransfer();
  resultModal(report);
  return report;
});
window.addEventListener('appinstalled', () => I.writeState({ installedAt: now() }));

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'activated' && hadController) toast('OKKIE is bijgewerkt. Herstart de app voor de nieuwste versie.');
      });
    });
  }).catch(() => {});
}

// Gasten: wachtrij versturen; eigen telefoon: trainingen van andere telefoons ophalen. Nooit blokkerend.
function sendGuests(manual = false) {
  G.flushGuestQueue().then(r => {
    if (r.sent.length) toast(`Resultaat doorgestuurd naar ${[...new Set(r.sent)].join(', ')}.`);
    else if (manual) toast(G.readGuest().queue.length ? 'Nog niet verstuurd. Probeer het later opnieuw.' : 'Alles is verstuurd.');
    if (ui.view === 'more') render();
  }).catch(() => {});
}
function syncOtherPhones() {
  sendGuests();
  resumePendingSync(data);   // wat bij afsluiten of offline nog niet verstuurd was
  G.pullInbox(data, save).then(n => {
    if (n) { toast(n === 1 ? 'Een resultaat van een andere telefoon is toegevoegd.' : `${n} resultaten van andere telefoons zijn toegevoegd.`); if (!PLAY_VIEWS.has(ui.view)) render(); }
  }).catch(() => {});
}
syncOtherPhones();
window.addEventListener('online', syncOtherPhones);

// Voor tests
window.__okkie = { get data() { return data; }, L };
