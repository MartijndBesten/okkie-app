// OKKIE. — Persoonlijke uitdaging: alleen vergeleken met je eigen eerdere trainingen. Geen streaks, geen dagbeloningen.
// Puur rekenwerk (geen DOM), zodat het los te testen is.
import { trainingTotals, matchState } from './logic.js';

const MIN_HISTORY = 3;   // pas een doel als er minstens 3 vergelijkbare trainingen zijn
const RECENT = 5;        // "je laatste keren" = de laatste 5

// Afgeronde scoretrainingen van deze speler met dezelfde lengte (30/60/99/vrij/eigen), oud → nieuw.
// Vrij trainen telt pas vanaf 30 pijlen; trainingen zonder datum (uit een andere app) tellen niet mee.
export function comparable(trainings, playerId, limitTurns) {
  const lim = limitTurns || 0;
  return trainings
    .filter(t => t.playerId === playerId && t.kind === 'score' && (t.limitTurns || 0) === lim && !t.dateUnknown && t.finishedAt)
    .map(t => ({ t, tot: trainingTotals(t) }))
    .filter(x => x.tot.darts >= (lim ? lim * 3 : 30))
    .sort((a, b) => (a.t.startedAt < b.t.startedAt ? -1 : 1));
}

const round1 = n => Math.round(n * 10) / 10;
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;

// Doel voor de volgende training: iets boven je recente niveau, nooit hoger dan je record; dicht bij je record → record.
export function goalFor(trainings, playerId, limitTurns) {
  const list = comparable(trainings, playerId, limitTurns);
  if (list.length < MIN_HISTORY) return null;
  const recent = mean(list.slice(-RECENT).map(x => x.tot.avg));
  const best = Math.max(...list.map(x => x.tot.avg));
  const step = Math.max(1, recent * 0.04);
  if (best - recent <= step) return { target: round1(best + 0.1), recent: round1(recent), best: round1(best), record: true };
  return { target: Math.ceil((recent + step) * 2) / 2, recent: round1(recent), best: round1(best), record: false };
}

// Duidelijke verbetering: minstens 10% (en 3 punten) boven het gemiddelde van je laatste 5 vergelijkbare trainingen.
export function improvedClearly(avg, before) {
  if (before.length < MIN_HISTORY) return false;
  const recent = mean(before.slice(-RECENT).map(x => x.tot.avg));
  return avg >= recent + Math.max(3, recent * 0.1);
}

// Hoogste beurt ooit (trainingen en wedstrijden) van een speler.
export function highestTurn(data, playerId) {
  let max = 0;
  for (const t of data.trainings) if (t.playerId === playerId && t.kind === 'score') max = Math.max(max, trainingTotals(t).high || 0);
  for (const m of data.matches) {
    const i = m.players.findIndex(p => p.id === playerId);
    if (i >= 0) max = Math.max(max, matchState(m).totals[i]?.high || 0);
  }
  return max;
}
