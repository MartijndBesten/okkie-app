// OKKIE. Club bij het bord: trainingen tellen automatisch mee voor je club.
// Per speler en per club, alleen als de speler het zelf expliciet aanzet (standaard UIT); altijd weer uit te zetten in de club.
// Vanaf dat moment gaat van elke afgeronde training alleen de samenvatting (club-share.js: soort, pijlen, punten,
// hoogste beurt) naar de clubfeed, naar elke open clubtraining waar hij bij past en naar de weekoefening als de club die
// heeft ingesteld. Nooit losse pijlen of tijdstippen.
// Wacht je nog op goedkeuring of ben je offline, dan blijft de training staan en gaat hij later alsnog mee
// (hoogstens 14 dagen terug: zo lang toont de clubfeed trainingen).
import { shareableTrainings } from './club-share.js';

export const CLUB_AUTO_KEY = 'okkie.club.auto';
export const AUTO_DAYS = 14;
const SENT_MAX = 300;

export function readClubAuto(storage = localStorage) {
  try {
    const d = JSON.parse(storage.getItem(CLUB_AUTO_KEY) || 'null');
    return d && d.version === 1 && d.links && typeof d.links === 'object' ? d : { version: 1, links: {} };
  } catch { return { version: 1, links: {} }; }
}
function writeClubAuto(d, storage) { try { storage.setItem(CLUB_AUTO_KEY, JSON.stringify(d)); } catch { /* privémodus */ } }

export const clubAutoFor = (playerId, clubId, storage = localStorage) => readClubAuto(storage).links[playerId]?.[clubId] || null;

// Aan of uit zetten. Aanzetten telt vanaf nu (eerdere trainingen kun je in de club zelf insturen).
export function setClubAuto(playerId, clubId, { name, on = true } = {}, storage = localStorage, now = new Date()) {
  const d = readClubAuto(storage);
  const mine = (d.links[playerId] ||= {});
  const old = mine[clubId];
  mine[clubId] = { name: name || old?.name || '', on: !!on, since: on && !old?.on ? now.toISOString() : old?.since || now.toISOString(), sent: old?.sent || [] };
  writeClubAuto(d, storage);
  return mine[clubId];
}
// Club verlaten of opgeheven: niets meer versturen.
export function dropClubAuto(playerId, clubId, storage = localStorage) {
  const d = readClubAuto(storage);
  if (!d.links[playerId]?.[clubId]) return;
  delete d.links[playerId][clubId];
  if (!Object.keys(d.links[playerId]).length) delete d.links[playerId];
  writeClubAuto(d, storage);
}

// Maandag 00:00 (lokale tijd) van de week waarin `now` valt: alleen trainingen van deze week tellen voor de weekoefening.
export function weekStartLocal(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

const localDate = ms => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Wat moet er nog naar welke club? Pure functie (getest in tests/unit/club-auto.test.js).
export function pendingClubShares(data, links, now = new Date()) {
  const out = [];
  const monday = weekStartLocal(now).getTime();
  for (const [playerId, clubs] of Object.entries(links || {})) {
    if (!data?.players?.some(p => p.id === playerId)) continue;
    const list = shareableTrainings(data, playerId, AUTO_DAYS, now.getTime());
    for (const [clubId, link] of Object.entries(clubs)) {
      if (!link?.on) continue;
      const since = Date.parse(link.since), sent = new Set(link.sent || []);
      for (const { t, c } of list) {
        const at = Date.parse(t.finishedAt);
        if (!(at >= since) || sent.has(c.trainingId)) continue;
        out.push({ playerId, clubId, clubName: link.name, training: c, challenge: at >= monday ? 'auto' : false, finishedOn: localDate(at) });
      }
    }
  }
  // Oudste eerst: dan klopt de volgorde in de feed.
  return out.reverse();
}

// Past deze training bij een open clubtraining? Scoretraining met hetzelfde aantal pijlen, of rond de klok, en gegooid
// binnen de looptijd. Doel-oefeningen en checkout-reeksen voert een lid zelf in.
export function exerciseFits(e, training, finishedOn) {
  if (!e?.open || !e.canSubmit) return false;
  if (finishedOn && (finishedOn < e.startsOn || finishedOn > e.endsOn)) return false;
  if (e.kind === 'clock') return training.kind === 'clock';
  return e.kind === 'score' && ['score30', 'score60', 'score99', 'free'].includes(training.kind) && training.darts === e.darts;
}
async function shareWithExercises(item, send, tok) {
  const list = (await send(`/v1/clubs/${item.clubId}/exercises`, 'GET', undefined, tok))?.exercises || [];
  const out = [];
  for (const e of list.filter(x => exerciseFits(x, item.training, item.finishedOn))) {
    const r = await send(`/v1/clubs/${item.clubId}/exercises/${e.id}/results`, 'POST', { trainingId: item.training.trainingId, darts: item.training.darts, points: item.training.points }, tok);
    out.push({ id: e.id, name: e.name, best: !!r?.best, value: r?.value });
  }
  return out;
}

function markSent(playerId, clubId, trainingId, storage) {
  const d = readClubAuto(storage);
  const link = d.links[playerId]?.[clubId];
  if (!link) return;
  link.sent = [...(link.sent || []).filter(x => x !== trainingId), trainingId].slice(-SENT_MAX);
  writeClubAuto(d, storage);
}

// Versturen. send(path, method, body, token) = request() uit community-sync.js; token(playerId) = clubaccount.
// Geeft per club terug wat er meetelde. Netwerkfout: stoppen, volgende keer verder. 404 (nog niet toegelaten of geen
// lid meer): laten staan. 400/409 (ongeldig of niet passend): als verstuurd markeren, anders blijft hij terugkomen.
let running = null;
export function autoShareClubs(data, { send, token, storage = localStorage, now = new Date() } = {}) {
  if (running) return running;
  running = (async () => {
    const done = [];
    const skip = new Set();   // club waarvoor je (nog) geen lid bent: de rest van die club deze keer overslaan
    for (const item of pendingClubShares(data, readClubAuto(storage).links, now)) {
      const key = item.playerId + '|' + item.clubId;
      const tok = token(item.playerId);
      if (!tok || skip.has(key)) continue;
      // Vlak voor het versturen opnieuw kijken: net uitgezet (of club verlaten) = niets meer delen, ook niet uit de wachtrij.
      if (!clubAutoFor(item.playerId, item.clubId, storage)?.on) continue;
      try {
        const r = await send(`/v1/clubs/${item.clubId}/trainings`, 'POST', { training: item.training, feed: true, challenge: item.challenge }, tok);
        markSent(item.playerId, item.clubId, item.training.trainingId, storage);
        // Server van vóór 1.12.0 (geen `exercises` in het antwoord): de app stuurt het resultaat zelf in bij passende clubtrainingen.
        const exerciseResults = Array.isArray(r?.exercises) ? r.exercises : await shareWithExercises(item, send, tok).catch(() => []);
        done.push({ ...item, challengeResult: r?.challenge || null, exerciseResults });
      } catch (e) {
        if (e?.status === 404 || e?.status === 401 || e?.status === 403) { skip.add(key); continue; }
        if (e?.status === 400 || e?.status === 409) { markSent(item.playerId, item.clubId, item.training.trainingId, storage); continue; }
        break;   // offline of server niet bereikbaar
      }
    }
    return done;
  })().finally(() => { running = null; });
  return running;
}
