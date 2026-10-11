// OKKIE. Mijn vrienden: rekenregels voor vergelijken en ranglijsten (zie cloud/VRIENDEN.md, "Berekeningen").
// Puur en zonder opslag: werkt alleen op de samengevatte cijfers die de API per lid teruggeeft.
//
// - Gemiddelde = punten × 3 / pijlen (gewogen per pijl, dus lange trainingen tellen naar verhouding mee).
// - Beste 30/60/99 = hoogste totaal in één afgeronde training van precies 30/60/99 pijlen, als gemiddelde per 3 pijlen.
// - Week = maandag t/m zondag (UTC), gelijk aan de app en de openbare ranglijst.
// - Minimaal 90 pijlen voor de algemene ranglijst, 30 voor de weekranglijst; anders "nog te weinig pijlen".
// - Verbetering = gemiddelde deze week − gemiddelde van de weken ervoor (max. 7), beide met minstens 30 pijlen.
// - Gelijke stand: meer pijlen gaat voor, daarna alfabetisch op nickname.

export const MIN_DARTS_ALL = 90;
export const MIN_DARTS_WEEK = 30;
export const avg3 = (points, darts) => (darts > 0 ? (points * 3) / darts : null);
export const bestAvg = (total, darts) => (total == null ? null : (total * 3) / darts);
const byNick = (a, b) => a.nickname.localeCompare(b.nickname, 'nl');

export function summarize(member, week) {
  const a = member.average, r = member.records;
  const all = a?.all, wk = a?.week;
  const weeks = a?.weeks || [];
  const before = weeks.filter(w => w.week !== week);
  const beforeDarts = before.reduce((s, w) => s + w.darts, 0);
  const beforePoints = before.reduce((s, w) => s + w.points, 0);
  const weekAvg = wk && wk.darts >= MIN_DARTS_WEEK ? avg3(wk.points, wk.darts) : null;
  const prevAvg = beforeDarts >= MIN_DARTS_WEEK ? avg3(beforePoints, beforeDarts) : null;
  const best30 = bestAvg(r?.all?.best30, 30);
  return {
    handle: member.handle, nickname: member.nickname, you: !!member.you, role: member.role, share: member.share,
    darts: all?.darts || 0,
    trainings: all?.sessions || 0,
    average: all && all.darts ? avg3(all.points, all.darts) : null,
    averageEligible: !!all && all.darts >= MIN_DARTS_ALL,
    weekDarts: wk?.darts || 0,
    weekTrainings: wk?.sessions || 0,
    weekAverage: weekAvg,
    improvement: weekAvg != null && prevAvg != null ? weekAvg - prevAvg : null,
    highestTurn: r?.all?.highestTurn ?? null,
    best30, best60: bestAvg(r?.all?.best60, 60), best99: bestAvg(r?.all?.best99, 99),
    hits180: r?.all?.hits180 ?? null, hits140: r?.all?.hits140 ?? null, hits100: r?.all?.hits100 ?? null,
    // Record deze week: het beste 30-pijlengemiddelde of de hoogste beurt is deze week gegooid.
    recordThisWeek: !!r?.week && ((r.week.best30 != null && r.week.best30 === r.all?.best30) ||
      (r.week.highestTurn != null && r.week.highestTurn > 0 && r.week.highestTurn === r.all?.highestTurn)),
    challenge: member.challenge?.points ?? null,
    trend: weeks.map(w => ({ week: w.week, average: w.darts >= MIN_DARTS_WEEK ? avg3(w.points, w.darts) : null, darts: w.darts })),
  };
}

function rank(rows, value, eligible, darts = r => r.darts) {
  const ok = rows.filter(r => eligible(r) && value(r) != null)
    .sort((a, b) => value(b) - value(a) || darts(b) - darts(a) || byNick(a, b));
  let place = 0, last = null;
  const ranked = ok.map((r, i) => {
    const v = value(r);
    if (v !== last) { place = i + 1; last = v; }
    return { ...r, value: v, place };
  });
  const waiting = rows.filter(r => !ok.includes(r)).sort(byNick);
  return { ranked, waiting };
}

export function leaderboards(members, week) {
  const rows = members.map(m => summarize(m, week));
  return {
    rows,
    overall: rank(rows, r => r.average, r => r.averageEligible),
    week: rank(rows, r => r.weekAverage, r => r.weekDarts >= MIN_DARTS_WEEK, r => r.weekDarts),
    challenge: rank(rows, r => r.challenge, () => true),
    improvement: rank(rows, r => r.improvement, () => true),
    records: {
      highestTurn: rank(rows, r => r.highestTurn || null, () => true),
      best30: rank(rows, r => r.best30, () => true),
      best60: rank(rows, r => r.best60, () => true),
      best99: rank(rows, r => r.best99, () => true),
      hits180: rank(rows, r => r.hits180 || null, () => true),
    },
  };
}

// Verschuiving ten opzichte van de vorige keer dat deze speler de ranglijst bekeek (alleen lokaal bewaard).
export function movement(ranked, previous = {}) {
  return Object.fromEntries(ranked.map(r => [r.handle, previous[r.handle] == null ? 0 : previous[r.handle] - r.place]));
}
export const placesOf = ranked => Object.fromEntries(ranked.map(r => [r.handle, r.place]));
