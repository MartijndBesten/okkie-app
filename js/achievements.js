// OKKIE — badges. Worden altijd berekend uit de echte gegevens, nooit los opgeslagen.
import { trainingTotals, clockState, matchState, longestStreak, periodKey, turnScore } from './logic.js';

export const BADGES = [
  { id: 'first', icon: '🎯', name: 'Eerste pijlen', desc: 'Rond je eerste training af' },
  { id: 'ton', icon: '💯', name: 'Eerste 100+', desc: 'Gooi 100 of meer in één beurt' },
  { id: 'ton40', icon: '🔥', name: 'Eerste 140+', desc: 'Gooi 140 of meer in één beurt' },
  { id: 'max', icon: '👑', name: 'ONE HUNDRED AND EIGHTY', desc: 'Gooi de perfecte 180' },
  { id: 'drieling', icon: '🎲', name: 'Drieling', desc: 'Drie pijlen in hetzelfde vak in één beurt' },
  { id: 'shanghai', icon: '🏮', name: 'Shanghai', desc: 'Enkel, dubbel én triple van hetzelfde getal in één beurt' },
  { id: 'ton5', icon: '✋', name: 'Vijf keer 100+', desc: 'Gooi 5 keer 100 of meer in één training' },
  { id: 'hattrick', icon: '🎩', name: 'Hattrick', desc: 'Gooi in totaal 3 keer 180' },
  { id: 'avg30', icon: '🥉', name: 'Op dreef', desc: 'Gemiddelde van 30+ in een training van minstens 30 pijlen' },
  { id: 'avg45', icon: '🥈', name: 'Clubspeler', desc: 'Gemiddelde van 45+ in een training van minstens 30 pijlen' },
  { id: 'avg60', icon: '🥇', name: 'Toppers-niveau', desc: 'Gemiddelde van 60+ in een training van minstens 30 pijlen' },
  { id: 'avg80', icon: '🏆', name: 'Pro-gemiddelde', desc: 'Gemiddelde van 80+ in een training van minstens 30 pijlen' },
  { id: 'opkoers', icon: '📈', name: 'Op koers', desc: '5 beurten op rij van 60 of meer in één training' },
  { id: 'geenmis', icon: '🧲', name: 'Geen mis', desc: 'Een training van minstens 30 pijlen zonder één mis' },
  { id: 't10', icon: '📅', name: 'Volhouder', desc: 'Rond 10 trainingen af' },
  { id: 't50', icon: '💪', name: 'Machine', desc: 'Rond 50 trainingen af' },
  { id: 't100', icon: '🦾', name: 'Honderd trainingen', desc: 'Rond 100 trainingen af' },
  { id: 'langeadem', icon: '🏃', name: 'Lange adem', desc: 'Gooi 99 pijlen of meer in één training' },
  { id: 'streak3', icon: '⚡', name: 'Lekker bezig', desc: '3 dagen op rij gegooid' },
  { id: 'streak7', icon: '🌟', name: 'Weekstreak', desc: '7 dagen op rij gegooid' },
  { id: 'streak14', icon: '📆', name: 'Twee weken', desc: '14 dagen op rij gegooid' },
  { id: 'days30', icon: '🏠', name: 'Vaste gast', desc: 'Op 30 verschillende dagen gegooid' },
  { id: 'd1000', icon: '🎳', name: 'Duizend pijlen', desc: 'Gooi in totaal 1.000 pijlen' },
  { id: 'd10000', icon: '🚀', name: 'Tienduizend', desc: 'Gooi in totaal 10.000 pijlen' },
  { id: 'ton100', icon: '🏅', name: 'Honderd keer 100+', desc: 'Gooi in totaal 100 keer 100 of meer' },
  { id: 't20jager', icon: '🏹', name: 'T20-jager', desc: 'Raak in totaal 50 keer triple 20' },
  { id: 'dubbels', icon: '🧩', name: 'Dubbelverzamelaar', desc: 'Raak elke dubbel van 1 tot en met 20 minstens één keer' },
  { id: 'clock', icon: '🕐', name: 'Rond de klok', desc: 'Rond de klok helemaal afmaken' },
  { id: 'clock40', icon: '⏱️', name: 'Klokkenluider', desc: 'Rond de klok in 40 pijlen of minder' },
  { id: 'clock30', icon: '⚙️', name: 'Klokwerk', desc: 'Rond de klok in 30 pijlen of minder' },
  { id: 'uitgegooid', icon: '✅', name: 'Uitgegooid!', desc: 'Gooi een wedstrijd van 301 of 501 helemaal uit' },
  { id: 'win', icon: '🤝', name: 'Eerste zege', desc: 'Win een wedstrijd' },
  { id: 'win10', icon: '🎖️', name: 'Winnaar', desc: 'Win 10 wedstrijden' },
  { id: 'co100', icon: '💥', name: 'Grote finish', desc: 'Gooi 100 of meer uit in een wedstrijd' },
  { id: 'bigfish', icon: '🐟', name: 'Big Fish', desc: 'Gooi 170 uit in een wedstrijd (T20, T20, bull)' },
  { id: 'bull', icon: '🐂', name: 'Bullseye', desc: 'Raak de bull (50) in een training' },
  { id: 'bull10', icon: '🐃', name: 'Stierenvechter', desc: 'Raak in totaal 10 keer de bull (50)' },
  { id: 'samen', icon: '👥', name: 'Samen sterk', desc: 'Train samen met iemand op één telefoon' },
  { id: 'uitwedstrijd', icon: '📲', name: 'Uitwedstrijd', desc: 'Gooi op de telefoon van een vriend met je koppelcode' },
];

// Alle dagen waarop een speler gooide: trainingen (score en rond de klok) én wedstrijden, ook die op de telefoon van een
// vriend (koppelcode). Trainingen uit een andere app zonder datum tellen niet. Gebruikt voor "x dagen op rij".
export function activityDates(data, playerId) {
  return [
    ...data.trainings.filter(t => t.playerId === playerId && !t.dateUnknown).map(t => t.startedAt),
    ...data.matches.filter(m => m.players.some(p => p.id === playerId)).map(m => m.startedAt),
  ].filter(Boolean);
}

const SEGMENT = /^([SDT])(\d{1,2})$/;
// Beurten met losse pijlen van deze speler: trainingen (score en klok) en wedstrijden op deze telefoon.
function ownTurns(data, playerId) {
  const out = [];
  for (const t of data.trainings) if (t.playerId === playerId) for (const turn of t.turns || []) out.push(turn.darts);
  for (const m of data.matches) {
    const idx = m.players.findIndex(p => p.id === playerId);
    if (idx < 0) continue;
    for (const leg of m.legs || []) for (const turn of leg.turns || []) if (turn.p === idx) out.push(turn.darts);
  }
  return out;
}

export function earnedBadges(data, playerId) {
  const earned = new Set();
  const trainings = data.trainings.filter(t => t.playerId === playerId);
  const score = trainings.filter(t => t.kind === 'score');
  let darts = 0, tonsAll = 0, t180All = 0, wins = 0;
  for (const t of score) {
    const tot = trainingTotals(t);
    darts += tot.darts;
    tonsAll += tot.tons; t180All += tot.t180;
    if (tot.turns > 0) earned.add('first');
    if (tot.tons) earned.add('ton');
    if (tot.t140) earned.add('ton40');
    if (tot.t180) earned.add('max');
    if (tot.tons >= 5) earned.add('ton5');
    if (tot.darts >= 99) earned.add('langeadem');
    if (tot.darts >= 30) {
      if (tot.avg >= 30) earned.add('avg30');
      if (tot.avg >= 45) earned.add('avg45');
      if (tot.avg >= 60) earned.add('avg60');
      if (tot.avg >= 80) earned.add('avg80');
    }
    const turns = t.turns || [];
    if (turns.some(turn => turn.darts.includes('DB'))) earned.add('bull');
    if (turns.length && tot.darts >= 30 && turns.every(turn => !turn.darts.includes('M'))) earned.add('geenmis');
    let run = 0;
    for (const turn of turns) { run = turn.darts.length === 3 && turnScore(turn.darts) >= 60 ? run + 1 : 0; if (run >= 5) { earned.add('opkoers'); break; } }
    if (t.groupPlayers?.length > 1) earned.add('samen');
  }
  for (const t of trainings.filter(t => t.kind === 'clock')) {
    const st = clockState(t);
    darts += st.darts;
    if (st.done) earned.add('clock');
    if (st.done && st.darts <= 40) earned.add('clock40');
    if (st.done && st.darts <= 30) earned.add('clock30');
  }
  if (trainings.length >= 10) earned.add('t10');
  if (trainings.length >= 50) earned.add('t50');
  if (trainings.length >= 100) earned.add('t100');
  if (trainings.some(t => String(t.id).startsWith('gast-'))) earned.add('uitwedstrijd');
  const dates = activityDates(data, playerId);
  const streak = longestStreak(dates);
  if (streak >= 3) earned.add('streak3');
  if (streak >= 7) earned.add('streak7');
  if (streak >= 14) earned.add('streak14');
  if (new Set(dates.map(d => periodKey(new Date(d), 'dag'))).size >= 30) earned.add('days30');
  for (const m of data.matches) {
    const idx = m.players.findIndex(p => p.id === playerId);
    if (idx < 0) continue;
    const st = matchState(m);
    darts += st.totals[idx].darts;
    tonsAll += st.totals[idx].t100; t180All += st.totals[idx].t180;
    if (st.winner === idx) earned.add('uitgegooid');
    if (st.winner === idx && m.players.length > 1) { earned.add('win'); wins++; }
    if (st.totals[idx].bestCheckout >= 100) earned.add('co100');
    if (st.totals[idx].bestCheckout >= 170) earned.add('bigfish');
    if (st.totals[idx].t100) earned.add('ton');
    if (st.totals[idx].t140) earned.add('ton40');
    if (st.totals[idx].t180) earned.add('max');
    if (String(m.id).startsWith('gast-')) earned.add('uitwedstrijd');
  }
  if (wins >= 10) earned.add('win10');
  if (tonsAll >= 100) earned.add('ton100');
  if (t180All >= 3) earned.add('hattrick');
  if (darts >= 1000) earned.add('d1000');
  if (darts >= 10000) earned.add('d10000');
  // Losse pijlen (alleen waar die bekend zijn): drieling, Shanghai, T20's, bulls en alle dubbels.
  let t20 = 0, bulls = 0;
  const doubles = new Set();
  for (const ds of ownTurns(data, playerId)) {
    for (const c of ds) { if (c === 'T20') t20++; if (c === 'DB') bulls++; const m = SEGMENT.exec(c); if (m && m[1] === 'D') doubles.add(Number(m[2])); }
    if (ds.length === 3 && ds[0] !== 'M' && ds.every(c => c === ds[0])) earned.add('drieling');
    const segs = ds.map(c => SEGMENT.exec(c)).filter(Boolean);
    if (segs.length === 3 && new Set(segs.map(x => x[2])).size === 1 && new Set(segs.map(x => x[1])).size === 3) earned.add('shanghai');
  }
  if (t20 >= 50) earned.add('t20jager');
  if (bulls >= 10) earned.add('bull10');
  if ([...Array(20)].every((_, i) => doubles.has(i + 1))) earned.add('dubbels');
  return earned;
}
