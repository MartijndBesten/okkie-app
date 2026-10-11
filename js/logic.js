// OKKIE — pure spelregels en berekeningen. Geen DOM, geen opslag: alles hier is testbaar in Node.

export const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

// ---------- Pijlen ----------
// Interne notatie: S1..S20, D1..D20, T1..T20, SB (25), DB (bull, 50), M (mis).
// Oude Dartlog-data kan "X<punten>" bevatten: een score zonder bekend vak.

export function dart(code) {
  const c = String(code || '').toUpperCase();
  if (c === 'M') return { code: 'M', points: 0, segment: 0, mult: 0, isDouble: false, known: true };
  if (c === 'SB') return { code: 'SB', points: 25, segment: 25, mult: 1, isDouble: false, known: true };
  if (c === 'DB') return { code: 'DB', points: 50, segment: 25, mult: 2, isDouble: true, known: true };
  let m = c.match(/^([SDT])([1-9]|1\d|20)$/);
  if (m) {
    const mult = { S: 1, D: 2, T: 3 }[m[1]];
    const segment = Number(m[2]);
    return { code: c, points: mult * segment, segment, mult, isDouble: mult === 2, known: true };
  }
  m = c.match(/^X(\d{1,2})$/);
  if (m && Number(m[1]) <= 60) {
    return { code: c, points: Number(m[1]), segment: null, mult: null, isDouble: false, known: false };
  }
  return null;
}

export function isValidCode(code) {
  return dart(code) !== null;
}

export function points(code) {
  const d = dart(code);
  return d ? d.points : 0;
}

export function label(code) {
  const d = dart(code);
  if (!d) return '?';
  if (d.code === 'M') return 'Mis';
  if (d.code === 'SB') return '25';
  if (d.code === 'DB') return 'Bull';
  if (!d.known) return String(d.points);
  return (d.mult === 1 ? '' : d.mult === 2 ? 'D' : 'T') + d.segment;
}

// Vrije tekstinvoer: "T20", "d16", "5", "s5", "25", "bull", "0", "mis".
export function parseInput(text) {
  const v = String(text ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!v) return { error: 'Leeg' };
  if (/^(0|M|MIS|MISS)$/.test(v)) return { code: 'M' };
  if (/^(BULL|DB|D25|BULLSEYE|50)$/.test(v)) return { code: 'DB' };
  if (/^(25|S25|SB|SBULL)$/.test(v)) return { code: 'SB' };
  let m = v.match(/^([SDT])(\d{1,2})$/);
  if (m) {
    const n = Number(m[2]);
    if (n >= 1 && n <= 20) return { code: m[1] + n };
    return { error: `"${text}" bestaat niet op een dartbord` };
  }
  m = v.match(/^(\d{1,2})$/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 20) return { code: 'S' + n };
  }
  return { error: `"${text}" snap ik niet. Probeer T20, D16, 5, 25, bull of 0.` };
}

// Meerdere pijlen in één regel: "T20 5 D10" of "t20,5,d10".
export function parseLine(text) {
  const parts = String(text ?? '').trim().split(/[\s,;+]+/).filter(Boolean);
  const codes = [];
  for (const p of parts) {
    const r = parseInput(p);
    if (r.error) return { error: r.error };
    codes.push(r.code);
  }
  return { codes };
}

export function turnScore(codes) {
  return codes.reduce((sum, c) => sum + points(c), 0);
}

// ---------- Gemiddelden ----------
// Altijd gewogen: totaal punten / totaal pijlen * 3. Nooit een gemiddelde van gemiddelden.
export function avg3(totalPoints, totalDarts) {
  return totalDarts > 0 ? (totalPoints / totalDarts) * 3 : 0;
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

// ---------- Scoretraining ----------
export function trainingTotals(training) {
  // Training uit een andere app: alleen de eindstand is bekend, geen losse pijlen.
  if (training.summary && !(training.turns || []).length) {
    const s = training.summary;
    const high = Number.isFinite(s.high) ? s.high : null;
    return {
      points: s.points, darts: s.darts, turns: Math.ceil(s.darts / 3), avg: avg3(s.points, s.darts), high, low: null,
      // ondergrens: een hoogste beurt van 100+ betekent minstens één keer 100+
      tons: s.tons ?? (high >= 100 ? 1 : 0), t140: s.t140 ?? (high >= 140 ? 1 : 0), t180: s.t180 ?? (high === 180 ? 1 : 0),
    };
  }
  let pts = 0, darts = 0, high = null, low = null, tons = 0, t140 = 0, t180 = 0;
  for (const turn of training.turns || []) {
    const s = turnScore(turn.darts);
    pts += s;
    darts += turn.darts.length;
    if (turn.darts.length === 3) {
      high = high === null ? s : Math.max(high, s);
      low = low === null ? s : Math.min(low, s);
    }
    if (s >= 100) tons++;
    if (s >= 140) t140++;
    if (s === 180) t180++;
  }
  return { points: pts, darts, turns: (training.turns || []).length, avg: avg3(pts, darts), high, low, tons, t140, t180 };
}

export function trainingLimitDarts(training) {
  return training.limitTurns ? training.limitTurns * 3 : null;
}

export function trainingIsComplete(training) {
  const lim = trainingLimitDarts(training);
  return lim !== null && trainingTotals(training).darts >= lim;
}

// ---------- Rond de klok ----------
// Doelen 1 t/m 20 en daarna de bull. Elk raak vak van het doel (S, D of T) telt.
export const CLOCK_TARGETS = [...Array.from({ length: 20 }, (_, i) => i + 1), 25];

export function clockState(training) {
  let idx = 0, darts = 0, hits = 0;
  for (const turn of training.turns || []) {
    for (const c of turn.darts) {
      if (idx >= CLOCK_TARGETS.length) break;
      darts++;
      const d = dart(c);
      if (d && d.segment === CLOCK_TARGETS[idx]) { idx++; hits++; }
    }
  }
  const done = idx >= CLOCK_TARGETS.length;
  return { targetIndex: idx, target: done ? null : CLOCK_TARGETS[idx], darts, hits, done, hitRate: darts ? hits / darts : 0 };
}

// ---------- X01 ----------
// Eén beurt verwerken vanaf `start`. Bij double-out moet de laatste pijl een dubbel of bull zijn
// en is een rest van 1 een bust. Bij een bust telt de beurt 0 en blijft de stand gelijk.
export function x01Turn(start, codes, doubleOut = true) {
  let remaining = start;
  for (let i = 0; i < codes.length; i++) {
    const d = dart(codes[i]);
    const after = remaining - d.points;
    if (after < 0 || (doubleOut && after === 1) || (after === 0 && doubleOut && !d.isDouble)) {
      return { bust: true, finished: false, scored: 0, remaining: start, dartsUsed: i + 1 };
    }
    remaining = after;
    if (remaining === 0) {
      return { bust: false, finished: true, scored: start, remaining: 0, dartsUsed: i + 1 };
    }
  }
  return { bust: false, finished: false, scored: start - remaining, remaining, dartsUsed: codes.length };
}

// Stand van een leg terugrekenen uit de beurten (bron van waarheid = de pijlen).
export function legState(leg, startScore, playerCount, doubleOut = true) {
  const remaining = Array(playerCount).fill(startScore);
  const stats = Array.from({ length: playerCount }, () => ({ points: 0, darts: 0, high: 0, checkout: null }));
  let winner = null;
  for (const turn of leg.turns) {
    const r = x01Turn(remaining[turn.p], turn.darts, doubleOut);
    stats[turn.p].darts += turn.darts.length;
    stats[turn.p].points += r.scored;
    stats[turn.p].high = Math.max(stats[turn.p].high, r.scored);
    remaining[turn.p] = r.remaining;
    if (r.finished) { winner = turn.p; stats[turn.p].checkout = r.scored; break; }
  }
  const last = leg.turns[leg.turns.length - 1];
  let toThrow;
  if (!leg.turns.length) toThrow = leg.starter;
  else toThrow = (last.p + 1) % playerCount;
  return { remaining, stats, winner, toThrow };
}

export function legsToWin(bestOf) {
  return Math.floor(bestOf / 2) + 1;
}

// Wedstrijd die op een andere telefoon is gespeeld (koppelcode): alleen de eindstand en de eigen cijfers van deze
// speler zijn bekend (summary.me = zijn plek in players). Geen legs/beurten; tegenstanders zonder cijfers.
function summaryState(match) {
  const s = match.summary, n = match.players.length;
  const totals = Array.from({ length: n }, () => ({ points: 0, darts: 0, high: 0, bestCheckout: 0, t100: 0, t140: 0, t180: 0 }));
  totals[s.me] = { points: s.points, darts: s.darts, high: s.high || 0, bestCheckout: s.bestCheckout || 0, t100: s.t100 || 0, t140: s.t140 || 0, t180: s.t180 || 0 };
  return { won: [...s.won], need: legsToWin(match.settings.bestOf), winner: Number.isInteger(s.winner) ? s.winner : null, totals: totals.map(t => ({ ...t, avg: avg3(t.points, t.darts) })) };
}

export function matchState(match) {
  if (match.summary && !(match.legs || []).length) return summaryState(match);
  const n = match.players.length;
  const won = Array(n).fill(0);
  const totals = Array.from({ length: n }, () => ({ points: 0, darts: 0, high: 0, bestCheckout: 0, t100: 0, t140: 0, t180: 0 }));
  for (const leg of match.legs) {
    const st = legState(leg, match.settings.start, n, match.settings.doubleOut);
    if (st.winner !== null) won[st.winner]++;
    for (let p = 0; p < n; p++) {
      totals[p].points += st.stats[p].points;
      totals[p].darts += st.stats[p].darts;
      totals[p].high = Math.max(totals[p].high, st.stats[p].high);
      if (st.stats[p].checkout) totals[p].bestCheckout = Math.max(totals[p].bestCheckout, st.stats[p].checkout);
    }
    // beurtscores voor 100+/140+/180
    const rem = Array(n).fill(match.settings.start);
    for (const t of leg.turns) {
      const r = x01Turn(rem[t.p], t.darts, match.settings.doubleOut);
      rem[t.p] = r.remaining;
      if (r.scored >= 100) totals[t.p].t100++;
      if (r.scored >= 140) totals[t.p].t140++;
      if (r.scored === 180) totals[t.p].t180++;
      if (r.finished) break;
    }
  }
  const need = legsToWin(match.settings.bestOf);
  const winnerIdx = won.findIndex(w => w >= need);
  return {
    won,
    need,
    winner: winnerIdx >= 0 ? winnerIdx : null,
    totals: totals.map(t => ({ ...t, avg: avg3(t.points, t.darts) })),
  };
}

// ---------- Uitgooi-advies ----------
const DOUBLE_PREF = ['D20', 'D16', 'D8', 'D18', 'D12', 'D10', 'D4', 'D14', 'D6', 'D2', 'DB', 'D19', 'D17', 'D15', 'D13', 'D11', 'D9', 'D7', 'D5', 'D3', 'D1'];
const ALL_CODES = (() => {
  const list = [];
  for (const m of ['T', 'S', 'D']) for (let n = 20; n >= 1; n--) list.push(m + n);
  list.push('SB', 'DB');
  return list;
})();

function setupCost(code) {
  const d = dart(code);
  if (d.code === 'DB') return 9;
  if (d.code === 'SB') return 7;
  if (d.mult === 3) return d.segment >= 15 ? (20 - d.segment) * 0.4 : 4 + (20 - d.segment) * 0.2;
  if (d.mult === 1) return 1 + (20 - d.segment) * 0.05;
  return 6 + (20 - d.segment) * 0.1; // dubbel als opzetpijl: liever niet
}

function finishCost(code, doubleOut) {
  if (doubleOut) {
    const i = DOUBLE_PREF.indexOf(code);
    return i < 0 ? null : i * 0.5;
  }
  return setupCost(code);
}

const checkoutCache = new Map();

// Beste route om `rest` uit te gooien met maximaal `dartsLeft` pijlen, of null.
export function checkout(rest, dartsLeft = 3, doubleOut = true) {
  const key = `${rest}|${dartsLeft}|${doubleOut}`;
  if (checkoutCache.has(key)) return checkoutCache.get(key);
  let best = null;
  const finishers = doubleOut ? DOUBLE_PREF : ALL_CODES;
  const consider = (route, cost) => {
    if (!best || cost < best.cost) best = { route, cost };
  };
  // Eerst met zo min mogelijk pijlen; pas als dat niet kan een pijl extra.
  for (let n = 1; n <= dartsLeft && !best && rest > 0 && rest <= 180; n++) {
    for (const f of finishers) {
      const fp = points(f);
      const fc = finishCost(f, doubleOut);
      if (n === 1) { if (fp === rest) consider([f], fc); continue; }
      for (const a of ALL_CODES) {
        const ap = points(a);
        if (n === 2) { if (ap + fp === rest) consider([a, f], setupCost(a) + fc); continue; }
        for (const b of ALL_CODES) {
          if (ap + points(b) + fp === rest) consider([a, b, f], setupCost(a) + setupCost(b) + fc);
        }
      }
    }
  }
  const result = best ? best.route : null;
  checkoutCache.set(key, result);
  return result;
}

// ---------- Statistiek over meerdere trainingen ----------
export function hitDistribution(turnsList) {
  // turnsList: array van beurten ({darts: [...]})
  const bySeg = {}; // segment -> {S,D,T}
  const mult = { S: 0, D: 0, T: 0, M: 0, B: 0 };
  let total = 0;
  for (const turn of turnsList) {
    for (const c of turn.darts) {
      const d = dart(c);
      if (!d || !d.known) continue;
      total++;
      if (d.code === 'M') { mult.M++; continue; }
      if (d.segment === 25) { mult.B++; }
      else mult[{ 1: 'S', 2: 'D', 3: 'T' }[d.mult]]++;
      const key = String(d.segment);
      bySeg[key] = bySeg[key] || { S: 0, D: 0, T: 0 };
      bySeg[key][{ 1: 'S', 2: 'D', 3: 'T' }[d.mult]]++;
    }
  }
  return { bySeg, mult, total };
}

// Groepeer afgeronde trainingen per dag/week/maand met gewogen gemiddelde.
export function groupAverages(trainings, period) {
  const groups = new Map();
  for (const t of trainings) {
    const tot = trainingTotals(t);
    if (!tot.darts) continue;
    const key = period === 'training' ? t.id : periodKey(new Date(t.startedAt), period);
    const g = groups.get(key) || { key, date: t.startedAt, points: 0, darts: 0, count: 0 };
    g.points += tot.points;
    g.darts += tot.darts;
    g.count++;
    if (t.startedAt < g.date) g.date = t.startedAt;
    groups.set(key, g);
  }
  return [...groups.values()]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map(g => ({ ...g, avg: avg3(g.points, g.darts) }));
}

export function periodKey(date, period) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  if (period === 'dag') return `${y}-${m}-${d}`;
  if (period === 'maand') return `${y}-${m}`;
  // ISO-week
  const t = new Date(Date.UTC(y, date.getMonth(), date.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Aantal opeenvolgende kalenderdagen (t/m vandaag of gisteren) waarop getraind is.
export function dayStreak(dates, today = new Date()) {
  const days = new Set(dates.map(d => periodKey(new Date(d), 'dag')));
  const cur = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!days.has(periodKey(cur, 'dag'))) cur.setDate(cur.getDate() - 1);
  let streak = 0;
  while (days.has(periodKey(cur, 'dag'))) { streak++; cur.setDate(cur.getDate() - 1); }
  return streak;
}

// Langste reeks opeenvolgende trainingsdagen ooit.
export function longestStreak(dates) {
  const days = [...new Set(dates.map(d => periodKey(new Date(d), 'dag')))].sort();
  let best = 0, run = 0, prev = null;
  for (const k of days) {
    const [y, m, d] = k.split('-').map(Number);
    const cur = Date.UTC(y, m - 1, d);
    run = prev !== null && cur - prev === 86400000 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = cur;
  }
  return best;
}
