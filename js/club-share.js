// OKKIE. Club: een lokale training omzetten naar de samenvatting die naar de club mag (cloud/CLUB.md).
// Alleen soort, aantal pijlen, punten en hoogste beurt; nooit losse pijlen of tijdstippen. Alleen echte OKKIE.-trainingen
// (geen import uit een andere app), alleen afgerond.
import { trainingTotals, clockState } from './logic.js';

export const CLUB_KIND_LABELS = { score30: 'Scoretraining 30 pijlen', score60: 'Scoretraining 60 pijlen', score99: 'Scoretraining 99 pijlen', clock: 'Rond de klok', free: 'Vrij trainen' };
const FIXED = { 30: 'score30', 60: 'score60', 99: 'score99' };

export function clubTraining(t) {
  if (!t || !t.finishedAt || t.source || t.summary) return null;
  if (t.kind === 'clock') {
    const c = clockState(t);
    return c.done ? { trainingId: String(t.id), kind: 'clock', darts: c.darts, points: 0 } : null;
  }
  const tot = trainingTotals(t);
  if (!tot.darts || tot.darts % 3) return null;
  const fixed = t.limitTurns && t.limitTurns * 3 === tot.darts ? FIXED[tot.darts] : null;
  return { trainingId: String(t.id), kind: fixed || 'free', darts: tot.darts, points: tot.points, high: tot.high ?? null };
}
// Trainingen van één speler uit de afgelopen dagen, nieuwste eerst, die met de club gedeeld kunnen worden.
export function shareableTrainings(data, playerId, days = 7, now = Date.now()) {
  const from = now - days * 864e5;
  return (data?.trainings || [])
    .filter(t => t.playerId === playerId && Date.parse(t.finishedAt) >= from)
    .map(t => ({ t, c: clubTraining(t) })).filter(x => x.c)
    .sort((a, b) => Date.parse(b.t.finishedAt) - Date.parse(a.t.finishedAt));
}
export const clubAverage = (points, darts) => darts ? Math.round(points / darts * 300) / 100 : null;
