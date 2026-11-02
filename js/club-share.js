// OKKIE. Club: een lokale training omzetten naar de samenvatting die naar de club mag (cloud/CLUB.md).
// Alleen soort, aantal pijlen, punten en hoogste beurt; nooit losse pijlen of tijdstippen. Alleen echte OKKIE.-trainingen
// (geen import uit een andere app), alleen afgerond.
// Sinds 1.10.0 ook de gerichte oefeningen Bob's 27 (eindscore) en 121 Checkout (hoogste uitgegooide doel).
import { trainingTotals, clockState } from './logic.js';
import { bobsState, c121State } from './drills.js';

export const CLUB_KIND_LABELS = { score30: 'Scoretraining 30 pijlen', score60: 'Scoretraining 60 pijlen', score99: 'Scoretraining 99 pijlen', clock: 'Rond de klok', bobs27: "Bob's 27", c121: '121 Checkout', free: 'Vrij trainen' };
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

// Gerichte oefening → samenvatting. Bob's 27 alleen volledig gespeeld (21 rondes); 121 alleen als er minstens één doel is
// uitgegooid. Punten = de eindscore (Bob's 27) of het hoogste uitgegooide doel (121). Geen rondes, pijlen of doelen.
export function clubDrill(d) {
  if (!d || !d.finishedAt) return null;
  if (d.kind === 'bobs27') {
    const st = bobsState(d.turns);
    return st.done ? { trainingId: String(d.id), kind: 'bobs27', darts: 63, points: st.score } : null;
  }
  if (d.kind === 'c121') {
    const st = c121State(d.turns);
    return st.best !== null && st.darts <= 90 ? { trainingId: String(d.id), kind: 'c121', darts: st.darts, points: st.best } : null;
  }
  return null;
}

// Trainingen en oefeningen van één speler uit de afgelopen dagen, nieuwste eerst, die met de club gedeeld kunnen worden.
export function shareableTrainings(data, playerId, days = 7, now = Date.now()) {
  const from = now - days * 864e5;
  const recent = x => x.playerId === playerId && Date.parse(x.finishedAt) >= from;
  return [
    ...(data?.trainings || []).filter(recent).map(t => ({ t, c: clubTraining(t) })),
    ...(data?.drills || []).filter(recent).map(t => ({ t, c: clubDrill(t) })),
  ].filter(x => x.c).sort((a, b) => Date.parse(b.t.finishedAt) - Date.parse(a.t.finishedAt));
}
export const clubAverage = (points, darts) => darts ? Math.round(points / darts * 300) / 100 : null;

// Eén getal per soort, zoals het in de ranglijst en feed staat.
export function clubValue(kind, { darts, points }) {
  if (kind === 'clock') return `${darts} pijlen`;
  if (kind === 'bobs27') return `${points} punten`;
  if (kind === 'c121') return `niveau ${points}`;
  const a = clubAverage(points, darts);
  return a === null ? '–' : a.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export const CLUB_KIND_HELP = {
  clock: 'Minder pijlen is beter.',
  bobs27: "Hoogste score van Bob's 27 (alle 21 rondes gegooid) telt; je beste poging telt.",
  c121: 'Hoogste uitgegooide doel in 121 Checkout telt; je beste poging telt.',
};
