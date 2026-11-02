// OKKIE. — "Vandaag oefenen": een coach zonder AI. Vaste regels, alles op het toestel, niets gaat naar een server.
// Pure functies (geen DOM), getest in tests/unit/coach.test.js.
//
// Regels (in deze volgorde; de eerste die past bepaalt het advies):
// 1. Geen gerichte oefening in de afgelopen 7 dagen: de oefening die het langst geleden is (nooit gedaan eerst).
// 2. 121 Checkout: hoogste niveau twee opeenvolgende weken gelijk: Rond de klok met alleen dubbels.
// 3. Zwakke dubbels, alleen als minstens twee dubbels elk minstens 30 pijlen met een vast doel hebben (Bob's 27, klok-dubbels),
//    en de zwakste onder het gemiddelde van die dubbels ligt: Bob's 27, met de twee zwakste dubbels erbij.
//    Minder pijlen: de coach zegt eerlijk "nog te weinig gegooid". Een geraden mikpunt (gewone training, wedstrijd) telt nooit.
// 4. Het gemiddelde zakt binnen scoretrainingen (in minstens 2 van de laatste 3 trainingen van 60+ pijlen is de tweede helft
//    3 punten of meer lager dan de eerste): tip voor kortere sessies.
// 5. Anders: de oefening die het langst geleden is.
// Elk advies heeft "Waarom?"-regels met de getallen waarop het berust.
import { DRILL_NAMES, doubleStats, weeklyTrend } from './drills.js';
import { turnScore, avg3 } from './logic.js';

export const COACH = { staleDays: 7, minDartsPerDouble: 30, declineTrainings: 3, declineMinTurns: 20, declineDrop: 3, declineNeeded: 2 };
export const WEEK_GOAL_DEFAULT = 3;
const DAY = 864e5;
const GROUPS = ['bobs27', 'c121', 'clock'];   // de drie kaarten onder "Gericht oefenen"
const GROUP_NAME = { bobs27: "Bob's 27", c121: '121 Checkout', clock: 'Rond de klok' };

const nl1 = n => (Math.round(n * 10) / 10).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (h, d) => (d ? Math.round((h / d) * 100) : 0) + '%';
const dname = t => (t === 'DB' ? 'Bull' : t);
const weekLabel = key => 'week ' + Number(key.split('-W')[1]);

// Maandag 00:00 (lokale tijd) van de week waarin `d` valt.
export function weekStart(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

// Afgeronde sessies van een speler (trainingen in OKKIE. en gerichte oefeningen), met hun begintijd.
function sessions(data, playerId) {
  const t = (data.trainings || []).filter(x => x.playerId === playerId && !x.source && !x.dateUnknown && x.finishedAt).map(x => ({ at: x.startedAt, kind: x.kind }));
  const d = (data.drills || []).filter(x => x.playerId === playerId && x.finishedAt).map(x => ({ at: x.startedAt, kind: x.kind }));
  return [...t, ...d];
}

// ---------- Weekdoel ----------
export function weekGoal(settings) {
  const g = Number(settings?.weekGoal);
  return Number.isInteger(g) && g >= 1 && g <= 7 ? g : WEEK_GOAL_DEFAULT;
}

export function weekProgress(data, playerId, now = new Date()) {
  const start = weekStart(now), end = new Date(start); end.setDate(end.getDate() + 7);
  const inWeek = sessions(data, playerId).filter(s => { const t = new Date(s.at); return t >= start && t < end; });
  const days = Array.from({ length: 7 }, (_, i) => inWeek.some(s => (new Date(s.at).getDay() + 6) % 7 === i));
  const goal = weekGoal(data.settings);
  return { count: inWeek.length, goal, reached: inWeek.length >= goal, days, start };
}

// Gemiddelde van scoretrainingen deze week tegenover de 4 weken ervoor (gewogen, minstens 30 pijlen aan beide kanten).
export function averageTrend(data, playerId, now = new Date()) {
  const start = weekStart(now), from = new Date(start); from.setDate(from.getDate() - 28);
  const sum = (a, b) => {
    let p = 0, d = 0;
    for (const t of data.trainings || []) {
      if (t.playerId !== playerId || t.kind !== 'score' || t.dateUnknown || !t.finishedAt) continue;
      const at = new Date(t.startedAt);
      if (at < a || at >= b) continue;
      for (const turn of t.turns || []) { p += turnScore(turn.darts); d += turn.darts.length; }
    }
    return { p, d };
  };
  const end = new Date(start); end.setDate(end.getDate() + 7);
  const now_ = sum(start, end), before = sum(from, start);
  if (now_.d < 30 || before.d < 30) return null;
  return { thisWeek: avg3(now_.p, now_.d), before: avg3(before.p, before.d), darts: now_.d };
}

// ---------- Advies ----------
function lastDone(data, playerId) {
  const out = { bobs27: null, c121: null, clock: null };
  for (const s of sessions(data, playerId)) {
    const g = s.kind === 'bobs27' ? 'bobs27' : s.kind === 'c121' ? 'c121' : ['clock', 'clockD', 'clockT'].includes(s.kind) ? 'clock' : null;
    if (g && (!out[g] || s.at > out[g])) out[g] = s.at;
  }
  return out;
}
const daysAgo = (iso, now) => Math.max(0, Math.round((dayStart(now) - dayStart(new Date(iso))) / DAY));
function dayStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
const agoText = n => (n === 0 ? 'vandaag' : n === 1 ? 'gisteren' : `${n} dagen geleden`);

function longestAgo(last) {
  const never = GROUPS.filter(g => !last[g]);
  if (never.length) return never[0];
  return [...GROUPS].sort((a, b) => (last[a] < last[b] ? -1 : 1))[0];
}

// Status van de dubbels voor de "Waarom?"-regels.
export function doublesInsight(data, playerId) {
  const rows = doubleStats(data.drills, playerId, COACH.minDartsPerDouble);
  const enough = rows.filter(r => r.enough);
  const most = rows.reduce((m, r) => Math.max(m, r.darts), 0);
  if (enough.length < 2) {
    return { weak: [], enough, note: `Dubbels: nog te weinig gegooid om iets te zeggen. Daarvoor zijn minstens ${COACH.minDartsPerDouble} pijlen per dubbel nodig uit Bob's 27 of Rond de klok · dubbels${most ? `; je meest gegooide dubbel heeft er nu ${most}` : ''}.` };
  }
  const meanRate = enough.reduce((s, r) => s + r.hits, 0) / enough.reduce((s, r) => s + r.darts, 0);
  const sorted = [...enough].sort((a, b) => a.rate - b.rate || b.darts - a.darts);
  const weak = sorted.filter(r => r.rate < meanRate).slice(0, 2);
  return { weak, enough, meanRate, note: weak.length ? null : `Dubbels: je ${enough.length} dubbels met genoeg pijlen liggen dicht bij elkaar (gemiddeld ${pct(meanRate * 100, 100)} raak).` };
}

// 121: hoogste niveau per week; twee opeenvolgende weken gelijk (de laatste is deze of vorige week).
export function c121Flat(data, playerId, now = new Date()) {
  const weeks = weeklyTrend(data.drills, playerId, 'c121');
  if (weeks.length < 2) return null;
  const [a, b] = weeks.slice(-2);
  const mon = iso => weekStart(new Date(iso)).getTime();
  const consecutive = Math.round((mon(b.date) - mon(a.date)) / DAY) === 7;
  const recent = Math.round((weekStart(now).getTime() - mon(b.date)) / DAY) <= 7;
  return consecutive && recent && a.value === b.value ? { a, b } : null;
}

// Gemiddelde binnen scoretrainingen: eerste helft tegenover tweede helft (alleen volledige beurten).
export function declineCheck(data, playerId) {
  const list = (data.trainings || [])
    .filter(t => t.playerId === playerId && t.kind === 'score' && !t.source && t.finishedAt)
    .map(t => ({ t, turns: (t.turns || []).filter(x => x.darts.length === 3) }))
    .filter(x => x.turns.length >= COACH.declineMinTurns)
    .sort((a, b) => (a.t.startedAt < b.t.startedAt ? -1 : 1))
    .slice(-COACH.declineTrainings);
  if (list.length < COACH.declineTrainings) return null;
  const rows = list.map(({ t, turns }) => {
    const half = Math.floor(turns.length / 2);
    const avg = arr => arr.reduce((s, x) => s + turnScore(x.darts), 0) / arr.length;
    const first = avg(turns.slice(0, half)), second = avg(turns.slice(half));
    return { at: t.startedAt, first, second, drop: first - second >= COACH.declineDrop };
  });
  return rows.filter(r => r.drop).length >= COACH.declineNeeded ? rows : null;
}

const dateNl = iso => new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });

export function coachAdvice(data, playerId, now = new Date()) {
  const last = lastDone(data, playerId);
  const doubles = doublesInsight(data, playerId);
  const recentLine = () => GROUPS.map(g => `${GROUP_NAME[g]}: ${last[g] ? agoText(daysAgo(last[g], now)) : 'nog nooit gedaan'}`).join(' · ');
  const withDoubles = why => (doubles.note ? [...why, doubles.note] : why);

  // 1. Geen gerichte oefening in 7 dagen.
  const recent = GROUPS.some(g => last[g] && daysAgo(last[g], now) <= COACH.staleDays);
  if (!recent) {
    const g = longestAgo(last);
    const anyEver = GROUPS.some(x => last[x]);
    return { rule: 'stale', drill: g, title: `Vandaag: ${GROUP_NAME[g]}`,
      text: anyEver ? `Je hebt al meer dan ${COACH.staleDays} dagen geen gerichte oefening gedaan. ${GROUP_NAME[g]} is het langst geleden.` : `Je hebt nog geen gerichte oefening gedaan. Begin met ${GROUP_NAME[g]}.`,
      why: withDoubles([`Gerichte oefeningen, laatst gedaan: ${recentLine()}.`, `Regel: na ${COACH.staleDays} dagen zonder gerichte oefening stelt de coach de oefening voor die het langst geleden is.`]) };
  }
  // 2. 121-niveau twee weken gelijk.
  const flat = c121Flat(data, playerId, now);
  if (flat) {
    return { rule: 'c121flat', drill: 'clockD', title: 'Vandaag: Rond de klok · dubbels',
      text: `Je 121-niveau staat twee weken stil op ${flat.b.value}. Een ronde langs alle dubbels helpt om verder te komen.`,
      why: withDoubles([`121 Checkout, hoogste niveau: ${weekLabel(flat.a.key)}: ${flat.a.value}, ${weekLabel(flat.b.key)}: ${flat.b.value}.`, 'Regel: twee weken achter elkaar hetzelfde niveau betekent: dubbels oefenen met Rond de klok · dubbels.']) };
  }
  // 3. Zwakke dubbels (alleen met genoeg pijlen per dubbel).
  if (doubles.weak.length) {
    const w = doubles.weak;
    const namesTxt = w.map(r => dname(r.target)).join(' en ');
    const counts = w.map(r => `${r.hits}`).join(' en ');
    return { rule: 'weakDoubles', drill: 'bobs27', title: "Vandaag: Bob's 27",
      text: `${namesTxt} raak je het minst: ${counts} keer raak van je laatste ${w.map(r => r.darts).join(' en ')} pijlen erop.`,
      why: [...w.map(r => `${dname(r.target)}: ${r.hits} van ${r.darts} pijlen raak (${pct(r.hits, r.darts)}).`),
        `Gemiddeld over je ${doubles.enough.length} dubbels met minstens ${COACH.minDartsPerDouble} pijlen: ${pct(doubles.meanRate * 100, 100)} raak.`,
        "Alleen pijlen met een vast doel tellen (Bob's 27 en Rond de klok · dubbels), steeds de nieuwste per dubbel."] };
  }
  // 4. Gemiddelde zakt binnen een training.
  const decline = declineCheck(data, playerId);
  if (decline) {
    return { rule: 'decline', drill: 'score30', title: 'Tip: kortere sessies',
      text: 'In je laatste scoretrainingen zakt je gemiddelde in de tweede helft. Probeer vandaag een korte scoretraining van 30 pijlen, eventueel twee keer met een pauze ertussen.',
      why: withDoubles([...decline.map(r => `${dateNl(r.at)}: eerste helft ${nl1(r.first)}, tweede helft ${nl1(r.second)} per beurt.`),
        `Regel: in minstens ${COACH.declineNeeded} van je laatste ${COACH.declineTrainings} trainingen van 60+ pijlen is de tweede helft ${COACH.declineDrop} punten of meer lager.`]) };
  }
  // 5. Afwisselen.
  const g = longestAgo(last);
  return { rule: 'rotate', drill: g, title: `Vandaag: ${GROUP_NAME[g]}`, text: `${GROUP_NAME[g]} heb je het langst niet gedaan.`,
    why: withDoubles([`Gerichte oefeningen, laatst gedaan: ${recentLine()}.`]) };
}

// Nieuwe records deze week: alleen als er van vóór deze week al een record was (de eerste keer is geen 'record verbeterd').
export function newRecordsThisWeek(data, playerId, now = new Date(), { drillRecords, trainingTotals, clockState }) {
  const start = weekStart(now).toISOString();
  const before = { ...data, trainings: (data.trainings || []).filter(t => t.startedAt < start), drills: (data.drills || []).filter(d => d.startedAt < start) };
  const out = [];
  const best = (d) => {
    const r = { high: null, clock: null };
    for (const t of d.trainings || []) {
      if (t.playerId !== playerId) continue;
      if (t.kind === 'clock') { const st = clockState(t); if (st.done && (r.clock === null || st.darts < r.clock)) r.clock = st.darts; continue; }
      const tot = trainingTotals(t);
      if (tot.high !== null && (r.high === null || tot.high > r.high)) r.high = tot.high;
      if (t.limitTurns && [10, 20, 33].includes(t.limitTurns) && tot.darts >= t.limitTurns * 3) {
        const k = 'avg' + t.limitTurns * 3;
        if (r[k] === undefined || tot.avg > r[k]) r[k] = tot.avg;
      }
    }
    return r;
  };
  const b = best(before), a = best(data);
  const label = { high: 'hoogste beurt', clock: 'rond de klok', avg30: 'gemiddelde 30 pijlen', avg60: 'gemiddelde 60 pijlen', avg99: 'gemiddelde 99 pijlen' };
  for (const k of Object.keys(label)) {
    if (b[k] === null || b[k] === undefined || a[k] === null || a[k] === undefined) continue;
    if (k === 'clock' ? a[k] < b[k] : a[k] > b[k]) out.push(label[k]);
  }
  const rb = drillRecords(before.drills, playerId), ra = drillRecords(data.drills, playerId);
  for (const k of Object.keys(ra)) {
    if (!rb[k]) continue;
    const higher = k === 'bobs27' || k === 'c121';
    if (higher ? ra[k].value > rb[k].value : ra[k].value < rb[k].value) out.push(DRILL_NAMES[k]);
  }
  return out;
}

