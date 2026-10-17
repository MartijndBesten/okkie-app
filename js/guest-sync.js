// OKKIE. Spelen op een andere telefoon, met behoud van je eigen statistieken.
//
// Op de telefoon van een vriend: een medespeler met een eigen OKKIE.-profiel wordt gekoppeld met een koppelcode van
// zijn eigen telefoon. Die code hoort bij precies één training. Na die training gaat alleen de samenvatting (dag,
// pijlen, punten, hoogste beurt, 100+/140+/180) naar zijn inbox; lukt dat niet (offline), dan blijft hij in de wachtrij.
// Op je eigen telefoon: de inbox wordt opgehaald, als training toegevoegd (eenmalig, op vast ID) en daarna bevestigd.
// Sinds 1.6.0 werkt dezelfde code ook voor één 301/501-wedstrijd: dan gaat alleen de eindstand (legs, winnaar) en de
// eigen wedstrijdcijfers van die speler mee, en komt hij bij je wedstrijden (nooit bij trainingen of Darters).
//
// Alles hier is aanvullend: zonder code of account verandert er niets aan gewoon trainen.
import { trainingTotals, matchState, periodKey } from './logic.js';
import { summaryTraining } from './store.js';
import { request, apiAvailable, getAccount, readAccounts, queueCommunitySync, OTHER_PHONE } from './community-sync.js';

// Dag van gooien in de tijd van deze telefoon (niet UTC): een training om 0:30 hoort bij die dag, niet bij gisteren.
const localDay = iso => periodKey(new Date(iso), 'dag');

export const GUEST_KEY = 'okkie.guest.v1';
export { OTHER_PHONE };
const empty = () => ({ links: {}, queue: [] });
export function readGuest(storage = localStorage) {
  try { const d = JSON.parse(storage.getItem(GUEST_KEY) || 'null'); return d && d.links && Array.isArray(d.queue) ? d : empty(); } catch { return empty(); }
}
function saveGuest(d, storage = localStorage) { storage.setItem(GUEST_KEY, JSON.stringify(d)); }
export const normalizeCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const prettyCode = c => { const n = normalizeCode(c); return n.slice(0, 4) + '-' + n.slice(4, 8); };

// Koppeling van een lokale speler (op de telefoon van de vriend) aan een eigen profiel elders.
export function guestLink(playerId, storage = localStorage) { return readGuest(storage).links[playerId] || null; }
export function linkGuest(playerId, code, nickname, storage = localStorage) {
  const d = readGuest(storage);
  d.links[playerId] = { code: normalizeCode(code), nickname, usedFor: null, linkedAt: new Date().toISOString() };
  saveGuest(d, storage);
}
// Speler verwijderd op deze telefoon: koppeling weg. Trainingen in de wachtrij horen bij de vriend zelf en blijven.
export function unlinkGuest(playerId, storage = localStorage) {
  const d = readGuest(storage);
  if (!d.links[playerId]) return;
  delete d.links[playerId];
  saveGuest(d, storage);
}
// Bij de start van een training: elke gekoppelde speler met een ongebruikte code hoort bij déze training.
export function claimGuests(training, storage = localStorage) {
  const d = readGuest(storage);
  const claimed = [];
  for (const pid of training.players || [training.playerId]) {
    const l = d.links[pid];
    if (l?.code && !l.usedFor) { l.usedFor = training.id; claimed.push(pid); }
  }
  saveGuest(d, storage);
  return claimed;
}
// Training zonder worpen gestopt: codes weer vrijgeven.
export function releaseGuests(trainingId, storage = localStorage) {
  const d = readGuest(storage);
  for (const l of Object.values(d.links)) if (l.usedFor === trainingId) l.usedFor = null;
  saveGuest(d, storage);
}
export function guestSummary(tr) {
  const t = trainingTotals(tr);
  return { id: tr.id, date: localDay(tr.finishedAt || tr.startedAt), darts: t.darts, points: t.points,
    high: t.high ?? null, tons: t.tons || 0, t140: t.t140 || 0, t180: t.t180 || 0 };
}
// Na de training: de gekoppelde spelers krijgen hun eigen training in de wachtrij (code is daarna verbruikt).
export function queueGuestTrainings(groupTrainingId, savedTrainings, storage = localStorage) {
  const d = readGuest(storage);
  let n = 0;
  for (const tr of savedTrainings) {
    const l = d.links[tr.playerId];
    if (!l || l.usedFor !== groupTrainingId || !l.code) continue;
    const s = guestSummary(tr);
    // Zelfde regel als bij gedeelde cijfers: alleen scoretrainingen met volledige beurten van 3 pijlen.
    if (s.darts >= 3 && tr.kind === 'score' && (tr.turns || []).every(x => x.darts.length === 3)) { d.queue.push({ code: l.code, nickname: l.nickname, playerId: tr.playerId, training: s }); n++; }
    l.code = null; l.usedFor = null;
  }
  saveGuest(d, storage);
  return n;
}
// Wedstrijd: alleen wat nodig is voor de eigen wedstrijdstatistieken van speler `idx` (geen namen, geen beurten).
export function guestMatchSummary(m, idx) {
  const st = matchState(m), t = st.totals[idx];
  return { id: m.id, date: localDay(m.finishedAt || m.startedAt), start: m.settings.start, bestOf: m.settings.bestOf,
    doubleOut: !!m.settings.doubleOut, players: m.players.length, me: idx, won: st.won, winner: st.winner, stopped: !!m.stopped || st.winner === null,
    darts: t.darts, points: t.points, high: t.high || 0, bestCheckout: t.bestCheckout || 0, t100: t.t100, t140: t.t140, t180: t.t180 };
}
// Na de wedstrijd (uitgespeeld of gestopt): elke gekoppelde speler die echt gooide krijgt zijn eigen uitslag in de wachtrij.
// Een gestopte wedstrijd heeft geen winnaar; daar verzinnen we niets bij.
export function queueGuestMatch(matchId, m, storage = localStorage) {
  const d = readGuest(storage);
  const names = [];
  m.players.forEach((mp, idx) => {
    const l = mp.id && d.links[mp.id];
    if (!l || l.usedFor !== matchId || !l.code) return;
    const s = guestMatchSummary(m, idx);
    if (m.players.length > 1 && s.darts > 0) { d.queue.push({ code: l.code, nickname: l.nickname, playerId: mp.id, match: s }); names.push(l.nickname); l.code = null; }
    l.usedFor = null;   // niet gegooid: code blijft bruikbaar
  });
  saveGuest(d, storage);
  return names;
}

// Wachtrij versturen. Netwerkfout: blijft staan. Al ontvangen: weg (geen dubbele). Code ongeldig: blijft met melding.
export async function flushGuestQueue(storage = localStorage) {
  const d = readGuest(storage);
  if (!d.queue.length || !apiAvailable()) return { sent: [], failed: [] };
  const sent = [], failed = [];
  for (const item of [...d.queue]) {
    try {
      const r = item.match ? await request('/v1/guest/match', 'POST', { code: prettyCode(item.code), match: item.match })
        : await request('/v1/guest/training', 'POST', { code: prettyCode(item.code), training: item.training });
      sent.push(r.nickname || item.nickname);
      d.queue = d.queue.filter(x => x !== item);
    } catch (e) {
      if (e instanceof TypeError) break; // geen verbinding: later opnieuw
      item.error = e.message;
      failed.push(item);
    }
  }
  saveGuest(d, storage);
  return { sent, failed };
}
export async function previewCode(code) {
  return request('/v1/guest/preview', 'POST', { code: prettyCode(code) });
}
export async function makeGuestCode(playerId, storage = localStorage) {
  const acct = getAccount(playerId, storage);
  if (!acct?.token) throw new Error('Maak eerst een online profiel via Mijn vrienden.');
  return request('/v1/me/guest-pass', 'POST', {}, acct.token);
}
// Eigen telefoon: inbox ophalen en eenmalig toevoegen. Pas na lokaal opslaan bevestigen (niets kan verloren gaan).
export async function pullInbox(data, save, storage = localStorage) {
  if (!apiAvailable()) return 0;
  let added = 0;
  for (const [playerId, acct] of Object.entries(readAccounts(storage))) {
    if (!acct?.token || !data.players.some(p => p.id === playerId)) continue;
    let list, matches;
    try { const r = await request('/v1/me/inbox', 'GET', null, acct.token); list = r.trainings || []; matches = r.matches || []; } catch { continue; }
    if (!list.length && !matches.length) continue;
    const ids = [];
    // Wedstrijden: bij de wedstrijden van deze speler, herkenbaar als "andere telefoon"; vaste ID = nooit dubbel.
    const me = data.players.find(p => p.id === playerId);
    for (const it of matches) {
      const id = 'gast-' + it.id;
      if (!data.matches.some(m => m.id === id)) {
        const others = it.players - 1;
        let k = 0;
        const players = Array.from({ length: it.players }, (_, i) => i === it.me ? { id: playerId, name: me.name } : { id: null, name: others > 1 ? `Tegenstander ${++k}` : 'Tegenstander' });
        const at = it.date + 'T12:00:00.000Z';
        data.matches.push({ id, startedAt: at, finishedAt: at, source: OTHER_PHONE, settings: { start: it.start, bestOf: it.bestOf, doubleOut: !!it.doubleOut },
          players, legs: [], ...(it.stopped ? { stopped: true } : {}),
          summary: { me: it.me, won: it.won, winner: it.winner, darts: it.darts, points: it.points, high: it.high, bestCheckout: it.bestCheckout, t100: it.t100, t140: it.t140, t180: it.t180 } });
        added++;
      }
      ids.push(it.id);
    }
    for (const it of list) {
      const id = 'gast-' + it.id;
      if (!data.trainings.some(t => t.id === id)) {
        const t = summaryTraining({ playerId, points: it.points, darts: it.darts, high: it.high, t180: it.t180, date: it.date + 'T12:00:00Z', source: OTHER_PHONE, id });
        if (!t) continue;
        t.summary.tons = it.tons; t.summary.t140 = it.t140;
        t.note = 'Gegooid op een andere telefoon';
        data.trainings.push(t);
        added++;
      }
      ids.push(it.id);
    }
    save();
    try { await request('/v1/me/inbox/ack', 'POST', { ids }, acct.token); } catch { /* volgende keer opnieuw; dubbel toevoegen kan niet */ }
    queueCommunitySync(data, [playerId]);
  }
  return added;
}
