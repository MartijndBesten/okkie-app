// OKKIE — badges. Worden altijd berekend uit de echte gegevens, nooit los opgeslagen.
import { trainingTotals, clockState, matchState, longestStreak } from './logic.js';

export const BADGES = [
  { id: 'first', icon: '🎯', name: 'Eerste pijlen', desc: 'Rond je eerste training af' },
  { id: 'ton', icon: '💯', name: 'Eerste 100+', desc: 'Gooi 100 of meer in één beurt' },
  { id: 'ton40', icon: '🔥', name: 'Eerste 140+', desc: 'Gooi 140 of meer in één beurt' },
  { id: 'max', icon: '👑', name: 'ONE HUNDRED AND EIGHTY', desc: 'Gooi de perfecte 180' },
  { id: 'avg30', icon: '🥉', name: 'Op dreef', desc: 'Gemiddelde van 30+ in een training van minstens 30 pijlen' },
  { id: 'avg45', icon: '🥈', name: 'Clubspeler', desc: 'Gemiddelde van 45+ in een training van minstens 30 pijlen' },
  { id: 'avg60', icon: '🥇', name: 'Toppers-niveau', desc: 'Gemiddelde van 60+ in een training van minstens 30 pijlen' },
  { id: 'avg80', icon: '🏆', name: 'Pro-gemiddelde', desc: 'Gemiddelde van 80+ in een training van minstens 30 pijlen' },
  { id: 't10', icon: '📅', name: 'Volhouder', desc: 'Rond 10 trainingen af' },
  { id: 't50', icon: '💪', name: 'Machine', desc: 'Rond 50 trainingen af' },
  { id: 'streak3', icon: '⚡', name: 'Lekker bezig', desc: '3 dagen op rij getraind' },
  { id: 'streak7', icon: '🌟', name: 'Weekstreak', desc: '7 dagen op rij getraind' },
  { id: 'd1000', icon: '🎳', name: 'Duizend pijlen', desc: 'Gooi in totaal 1.000 pijlen' },
  { id: 'd10000', icon: '🚀', name: 'Tienduizend', desc: 'Gooi in totaal 10.000 pijlen' },
  { id: 'clock', icon: '🕐', name: 'Rond de klok', desc: 'Rond de klok helemaal afmaken' },
  { id: 'clock40', icon: '⏱️', name: 'Klokkenluider', desc: 'Rond de klok in 40 pijlen of minder' },
  { id: 'win', icon: '🤝', name: 'Eerste zege', desc: 'Win een wedstrijd' },
  { id: 'co100', icon: '💥', name: 'Grote finish', desc: 'Gooi 100 of meer uit in een wedstrijd' },
  { id: 'bull', icon: '🐂', name: 'Bullseye', desc: 'Raak de bull (50) in een training' },
];

export function earnedBadges(data, playerId) {
  const earned = new Set();
  const trainings = data.trainings.filter(t => t.playerId === playerId);
  const score = trainings.filter(t => t.kind === 'score');
  let darts = 0;
  for (const t of score) {
    const tot = trainingTotals(t);
    darts += tot.darts;
    if (tot.turns > 0) earned.add('first');
    if (tot.tons) earned.add('ton');
    if (tot.t140) earned.add('ton40');
    if (tot.t180) earned.add('max');
    if (tot.darts >= 30) {
      if (tot.avg >= 30) earned.add('avg30');
      if (tot.avg >= 45) earned.add('avg45');
      if (tot.avg >= 60) earned.add('avg60');
      if (tot.avg >= 80) earned.add('avg80');
    }
    if (t.turns.some(turn => turn.darts.includes('DB'))) earned.add('bull');
  }
  for (const t of trainings.filter(t => t.kind === 'clock')) {
    const st = clockState(t);
    darts += st.darts;
    if (st.done) earned.add('clock');
    if (st.done && st.darts <= 40) earned.add('clock40');
  }
  if (trainings.length >= 10) earned.add('t10');
  if (trainings.length >= 50) earned.add('t50');
  const streak = longestStreak(trainings.filter(t => !t.dateUnknown).map(t => t.startedAt));
  if (streak >= 3) earned.add('streak3');
  if (streak >= 7) earned.add('streak7');
  for (const m of data.matches) {
    const idx = m.players.findIndex(p => p.id === playerId);
    if (idx < 0) continue;
    const st = matchState(m);
    darts += st.totals[idx].darts;
    if (st.winner === idx && m.players.length > 1) earned.add('win');
    if (st.totals[idx].bestCheckout >= 100) earned.add('co100');
    if (st.totals[idx].t100) earned.add('ton');
    if (st.totals[idx].t140) earned.add('ton40');
    if (st.totals[idx].t180) earned.add('max');
  }
  if (darts >= 1000) earned.add('d1000');
  if (darts >= 10000) earned.add('d10000');
  return earned;
}
