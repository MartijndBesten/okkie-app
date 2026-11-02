// OKKIE. — Gerichte oefeningen (1.10.0): Bob's 27, 121 Checkout en rond de klok met alleen dubbels of alleen triples.
// Pure functies zonder DOM of opslag, zodat elke regel in Node te testen is (tests/unit/drills.test.js).
//
// Opslag: data.drills, een eigen lijst naast data.trainings. Oudere OKKIE.-versies (web 1.9.0, iOS 1.8.0/1.9.0) keuren
// een back-up of overzetcode daardoor niet af: zij kennen data.drills niet en laten het veld ongemoeid. Per beurt
// staat het doel erbij (target/aims): dat is het gegeven dat bij gewone trainingen ontbreekt en dat de coach nodig
// heeft voor eerlijke uitspraken over dubbels (zie js/coach.js). De stand wordt altijd uit de beurten herberekend.
import { x01Turn, isValidCode, periodKey } from './logic.js';

export const DRILL_KINDS = ['bobs27', 'c121', 'clockD', 'clockT'];
export const DRILL_NAMES = { bobs27: "Bob's 27", c121: '121 Checkout', clockD: 'Rond de klok · dubbels', clockT: 'Rond de klok · triples', clock: 'Rond de klok' };

// ---------- Bob's 27 ----------
// Start met 27 punten. Per ronde 3 pijlen op één dubbel: D1 t/m D20 en tot slot de bull (50, telt als dubbel).
// Raak: elke treffer telt de waarde van de dubbel erbij. Geen enkele treffer: de waarde van de dubbel gaat eraf.
// De score zakt nooit onder 0; je speelt altijd alle 21 rondes uit (geen 'game over'), zodat elke dubbel gegooid wordt.
export const BOBS_TARGETS = [...Array.from({ length: 20 }, (_, i) => 'D' + (i + 1)), 'DB'];
export const BOBS_START = 27;
export const doubleValue = t => (t === 'DB' ? 50 : 2 * Number(String(t).slice(1)));
export const BOBS_MAX = BOBS_START + BOBS_TARGETS.reduce((s, t) => s + 3 * doubleValue(t), 0);   // 1437

export function bobsState(turns = []) {
  let score = BOBS_START, hits = 0;
  const rounds = [];
  const n = Math.min(turns.length, BOBS_TARGETS.length);
  for (let i = 0; i < n; i++) {
    const target = BOBS_TARGETS[i], h = turns[i].hits, v = doubleValue(target);
    const before = score;
    score = Math.max(0, score + (h > 0 ? h * v : -v));
    hits += h;
    rounds.push({ target, hits: h, delta: score - before, score });
  }
  const done = n >= BOBS_TARGETS.length;
  return { score, round: n, target: done ? null : BOBS_TARGETS[n], done, darts: n * 3, hits, rounds };
}

// ---------- 121 Checkout ----------
// Doel 121, dubbel uit, 9 pijlen per doel (3 beurten van 3). Een bust beëindigt de beurt (de rest gaat terug naar de stand
// aan het begin van die beurt), net als in een wedstrijd. Uitgegooid: het volgende doel is 1 hoger. Na 3 beurten niet uit:
// terug naar het laatst gehaalde doel (in het begin is dat 121). Een sessie heeft 10 doelen. Resultaat: het hoogste
// uitgegooide doel ('niveau').
export const C121 = { start: 121, rounds: 10, turnsPerRound: 3 };

export function c121State(turns = []) {
  let target = C121.start, safe = C121.start, remaining = C121.start;
  let round = 0, turnInRound = 0, dartsInRound = 0, darts = 0, best = null, successes = 0;
  const log = [];
  for (const turn of turns) {
    if (round >= C121.rounds) break;
    const r = x01Turn(remaining, turn.darts, true);
    turnInRound++; dartsInRound += turn.darts.length; darts += turn.darts.length;
    let ended = false;
    if (r.finished) {
      log.push({ target, ok: true, darts: dartsInRound });
      best = best === null ? target : Math.max(best, target);
      safe = target; successes++; target = target + 1; ended = true;
    } else {
      remaining = r.remaining;
      if (turnInRound >= C121.turnsPerRound) { log.push({ target, ok: false, darts: dartsInRound }); target = safe; ended = true; }
    }
    if (ended) { round++; turnInRound = 0; dartsInRound = 0; remaining = target; }
  }
  const done = round >= C121.rounds;
  return { target, remaining, round, turnInRound, dartsInRound, darts, best, successes, safe, done, log };
}

// Het doel waarop de volgende beurt gegooid wordt (voor de opslag per beurt).
export const c121NextTarget = turns => c121State(turns).target;

// ---------- Rond de klok: alleen dubbels of alleen triples ----------
// Dubbels: D1 t/m D20 en daarna de bull (DB). Triples: T1 t/m T20 (er is geen triple bull). Alleen precies dat vak telt.
export function clockTargets(kind) {
  const ring = kind === 'clockT' ? 'T' : 'D';
  const list = Array.from({ length: 20 }, (_, i) => ring + (i + 1));
  return kind === 'clockT' ? list : [...list, 'DB'];
}

export function clockVariantState(kind, turns = []) {
  const targets = clockTargets(kind);
  let idx = 0, darts = 0, hits = 0;
  for (const turn of turns) {
    for (const c of turn.darts) {
      if (idx >= targets.length) break;
      darts++;
      if (c === targets[idx]) { idx++; hits++; }
    }
  }
  const done = idx >= targets.length;
  return { targets, targetIndex: idx, target: done ? null : targets[idx], darts, hits, done, total: targets.length, hitRate: darts ? hits / darts : 0 };
}

// Mikpunt per pijl voor een nieuwe beurt (wordt bij de beurt opgeslagen als aims).
export function clockAims(kind, turnsBefore, darts) {
  const targets = clockTargets(kind);
  let idx = clockVariantState(kind, turnsBefore).targetIndex;
  return darts.map(c => { const aim = targets[idx] ?? null; if (aim && c === aim) idx++; return aim; });
}

// ---------- Algemeen ----------
export function drillState(d) {
  if (d.kind === 'bobs27') return bobsState(d.turns);
  if (d.kind === 'c121') return c121State(d.turns);
  return clockVariantState(d.kind, d.turns);
}

// Eén getal per oefening. higher: hoger is beter (Bob's 27, 121) of lager (klok: minder pijlen).
// value null = (nog) geen resultaat, bijv. een klok die niet is afgemaakt.
export function drillResult(d) {
  const st = drillState(d);
  if (d.kind === 'bobs27') return { value: st.done ? st.score : null, partial: st.done ? null : st.score, higher: true, done: st.done, darts: st.darts };
  if (d.kind === 'c121') return { value: st.best, higher: true, done: st.done, darts: st.darts, successes: st.successes };
  return { value: st.done ? st.darts : null, partial: st.hits, higher: false, done: st.done, darts: st.darts };
}

export function formatResult(kind, value) {
  if (value === null || value === undefined) return '–';
  if (kind === 'c121') return 'niveau ' + value;
  if (kind === 'bobs27') return String(value);
  return value + ' pijlen';
}

const mine = (drills, playerId, kind) => (drills || []).filter(d => d.playerId === playerId && (!kind || d.kind === kind) && d.finishedAt);

// Record per oefening: { kind: { value, id, at } }. Alleen afgeronde oefeningen met een resultaat.
export function drillRecords(drills, playerId) {
  const out = {};
  for (const d of mine(drills, playerId)) {
    const r = drillResult(d);
    if (r.value === null) continue;
    const cur = out[d.kind];
    if (!cur || (r.higher ? r.value > cur.value : r.value < cur.value)) out[d.kind] = { value: r.value, id: d.id, at: d.startedAt };
  }
  return out;
}

// Trend per week (ISO-week, maandag t/m zondag, lokale tijd): Bob's 27 en klok = gemiddelde per week, 121 = hoogste niveau.
export function weeklyTrend(drills, playerId, kind) {
  const weeks = new Map();
  for (const d of mine(drills, playerId, kind)) {
    const r = drillResult(d);
    if (r.value === null) continue;
    const key = periodKey(new Date(d.startedAt), 'week');
    const w = weeks.get(key) || { key, date: d.startedAt, values: [] };
    w.values.push(r.value);
    if (d.startedAt < w.date) w.date = d.startedAt;
    weeks.set(key, w);
  }
  return [...weeks.values()].sort((a, b) => (a.key < b.key ? -1 : 1)).map(w => ({
    key: w.key, date: w.date, count: w.values.length,
    value: kind === 'c121' ? Math.max(...w.values) : Math.round((w.values.reduce((s, x) => s + x, 0) / w.values.length) * 10) / 10,
  }));
}

// Dezelfde weektrend voor de gewone klok (data.trainings, kind 'clock', alles telt): gemiddeld aantal pijlen per week.
export function weeklyTrendClock(trainings, playerId, clockState) {
  const weeks = new Map();
  for (const t of trainings || []) {
    if (t.playerId !== playerId || t.kind !== 'clock' || !t.finishedAt) continue;
    const st = clockState(t);
    if (!st.done) continue;
    const key = periodKey(new Date(t.startedAt), 'week');
    const w = weeks.get(key) || { key, date: t.startedAt, values: [] };
    w.values.push(st.darts);
    if (t.startedAt < w.date) w.date = t.startedAt;
    weeks.set(key, w);
  }
  return [...weeks.values()].sort((a, b) => (a.key < b.key ? -1 : 1))
    .map(w => ({ key: w.key, date: w.date, count: w.values.length, value: Math.round((w.values.reduce((s, x) => s + x, 0) / w.values.length) * 10) / 10 }));
}

// ---------- Dubbels: alleen pijlen waarvan het doel vaststond ----------
// Bob's 27: 3 pijlen per ronde op de dubbel van die ronde. Klok-dubbels: elke pijl op het opgeslagen mikpunt.
// Nooit afgeleid uit gewone trainingen of wedstrijden (daar is het mikpunt een gok).
export function doubleAttempts(drills, playerId) {
  const out = new Map();   // dubbel -> [{ at, darts, hits }], nieuwste eerst
  const add = (target, at, darts, hits) => { if (!out.has(target)) out.set(target, []); out.get(target).push({ at, darts, hits }); };
  for (const d of drills || []) {
    if (d.playerId !== playerId) continue;
    (d.turns || []).forEach((turn, i) => {
      const at = turn.at || d.startedAt;
      if (d.kind === 'bobs27' && i < BOBS_TARGETS.length) add(BOBS_TARGETS[i], at, 3, turn.hits);
      if (d.kind === 'clockD') turn.darts.forEach((c, j) => { const aim = turn.aims?.[j]; if (aim) add(aim, at, 1, c === aim ? 1 : 0); });
    });
  }
  for (const list of out.values()) list.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return out;
}

// Per dubbel de nieuwste pogingen tot minstens `window` pijlen (een Bob's 27-ronde telt in zijn geheel: 3 pijlen).
// Geeft ook dubbels met minder pijlen terug; enough geeft aan of de drempel is gehaald.
export function doubleStats(drills, playerId, window = 30) {
  const rows = [];
  for (const [target, list] of doubleAttempts(drills, playerId)) {
    let darts = 0, hits = 0;
    for (const a of list) { if (darts >= window) break; darts += a.darts; hits += a.hits; }
    rows.push({ target, darts, hits, rate: darts ? hits / darts : 0, enough: darts >= window });
  }
  return rows.sort((a, b) => BOBS_TARGETS.indexOf(a.target) - BOBS_TARGETS.indexOf(b.target));
}

// ---------- Validatie (back-up, overzetcode) ----------
const ISO = s => typeof s === 'string' && !Number.isNaN(Date.parse(s));
export function validDrill(d, playerIds) {
  if (!d || typeof d.id !== 'string' || !playerIds.has(d.playerId) || !DRILL_KINDS.includes(d.kind) || !ISO(d.startedAt) || !Array.isArray(d.turns)) return false;
  if (d.kind === 'bobs27') {
    return d.turns.length <= BOBS_TARGETS.length && d.turns.every((t, i) => t && Number.isInteger(t.hits) && t.hits >= 0 && t.hits <= 3 && (t.target === undefined || t.target === BOBS_TARGETS[i]));
  }
  const dartsOk = t => t && Array.isArray(t.darts) && t.darts.length >= 1 && t.darts.length <= 3 && t.darts.every(isValidCode);
  if (!d.turns.every(dartsOk)) return false;
  if (d.kind === 'c121') {
    // Elke beurt moet op het doel staan dat uit de eerdere beurten volgt.
    for (let i = 0; i < d.turns.length; i++) {
      const st = c121State(d.turns.slice(0, i));
      if (st.done || (d.turns[i].target !== undefined && d.turns[i].target !== st.target)) return false;
    }
    return true;
  }
  return d.turns.every(t => t.aims === undefined || (Array.isArray(t.aims) && t.aims.length === t.darts.length));
}
