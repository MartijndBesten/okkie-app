// OKKIE community: alleen geaggregeerde scoretrainingen publiceren.
// Lokale trainingdata, pijlen, spelersnamen en matches worden NIET naar de server gestuurd.
import { points } from './logic.js';
import { API_BASE } from '../community/config.js';

export const COMMUNITY_KEY = 'okkie.community.v1';
// Trainingen die je op een andere telefoon gooide (via koppelcode, zie guest-sync.js): echte OKKIE.-trainingen
// waarvan alleen de samenvatting op je eigen telefoon staat. Die tellen mee; samenvattingen uit andere apps niet.
export const OTHER_PHONE = 'Andere telefoon';

export function readAccounts(storage = localStorage) {
  try {
    const data = JSON.parse(storage.getItem(COMMUNITY_KEY) || '{}');
    return data && data.version === 1 && data.accounts && typeof data.accounts === 'object' ? data.accounts : {};
  } catch { return {}; }
}
export function saveAccounts(accounts, storage = localStorage) {
  storage.setItem(COMMUNITY_KEY, JSON.stringify({ version: 1, accounts }));
}
export function getAccount(playerId, storage = localStorage) {
  return readAccounts(storage)[playerId] || null;
}
export function upsertAccount(playerId, account, storage = localStorage) {
  const accounts = readAccounts(storage);
  accounts[playerId] = account;
  saveAccounts(accounts, storage);
}
export function dropAccount(playerId, storage = localStorage) {
  const accounts = readAccounts(storage);
  delete accounts[playerId];
  saveAccounts(accounts, storage);
}
function weekStart(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
function summaryTemplate(period) {
  return { period, darts: 0, points: 0, sessions: 0, highestTurn: 0, hits100: 0, hits140: 0, hits180: 0, best30: null, best60: null, best99: null, challenge30: null };
}
function addSummary(target, source) {
  target.darts += source.darts;
  target.points += source.points;
  target.sessions++;
  target.highestTurn = Math.max(target.highestTurn, source.highestTurn);
  target.hits100 += source.hits100;
  target.hits140 += source.hits140;
  target.hits180 += source.hits180;
  // Beste training van precies 60 / 99 pijlen (voor Mijn vrienden).
  if (source.darts === 60) target.best60 = Math.max(target.best60 ?? 0, source.points);
  if (source.darts === 99) target.best99 = Math.max(target.best99 ?? 0, source.points);
  if (source.darts === 30) {
    target.best30 = Math.max(target.best30 ?? 0, source.points);
    // De eerste afgeronde 30-pijlentraining per periode telt voor de challenge.
    if (target.challenge30 === null) target.challenge30 = source.points;
  }
}
export function publicSnapshots(data, playerId) {
  const groups = new Map([['all', summaryTemplate('all')]]);
  const fromOtherPhone = t => t.source === OTHER_PHONE && t.summary && !(t.turns || []).length;
  const sessions = (data.trainings || []).filter(t =>
    t && t.playerId === playerId && t.kind === 'score' && t.finishedAt && (fromOtherPhone(t) || (!t.summary &&
    Array.isArray(t.turns) && t.turns.length && t.turns.every(turn => Array.isArray(turn.darts) && turn.darts.length === 3)))
  ).sort((a,b) => new Date(a.finishedAt) - new Date(b.finishedAt) || String(a.id).localeCompare(String(b.id)));
  for (const t of sessions) {
    const day = new Date(t.finishedAt);
    if (!Number.isFinite(day.getTime())) continue;
    const w = weekStart(t.finishedAt);
    const month = day.toISOString().slice(0, 7);
    if (fromOtherPhone(t)) {
      const s = t.summary;
      const source = { darts: s.darts, points: s.points, highestTurn: s.high || 0, hits100: s.tons || 0, hits140: s.t140 || 0, hits180: s.t180 || 0 };
      for (const key of ['all', 'week:' + w, 'month:' + month]) {
        if (!groups.has(key)) groups.set(key, summaryTemplate(key));
        addSummary(groups.get(key), source);
      }
      continue;
    }
    const turnPoints = t.turns.map(turn => turn.darts.reduce((s, code) => {
      const n = points(code);
      return s + (Number.isFinite(n) && n >= 0 && n <= 60 ? n : 0);
    }, 0));
    const source = {
      darts: t.turns.length * 3,
      points: turnPoints.reduce((s,n) => s+n, 0),
      highestTurn: Math.max(...turnPoints),
      hits100: turnPoints.filter(n => n >= 100).length,
      hits140: turnPoints.filter(n => n >= 140).length,
      hits180: turnPoints.filter(n => n === 180).length
    };
    for (const key of ['all', 'week:' + w, 'month:' + month]) {
      if (!groups.has(key)) groups.set(key, summaryTemplate(key));
      addSummary(groups.get(key), source);
    }
  }
  // Geen exacte trainingsmomenten of losse dartworpen worden verstuurd.
  const all = groups.get('all');
  const dated = [...groups.values()].filter(x => x.period !== 'all' && x.sessions > 0).slice(-189);
  return all?.sessions ? [all, ...dated] : dated;
}
export function apiAvailable() {
  return /^https:\/\/[^/]+/.test(API_BASE) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API_BASE);
}
export async function request(path, method = 'GET', payload = null, token = null) {
  if (!apiAvailable()) throw new Error('De gedeelde statistieken zijn nog niet geactiveerd.');
  const headers = { Accept: 'application/json' };
  if (payload !== null) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(API_BASE.replace(/\/$/, '') + path, {
    method, headers, body: payload === null ? undefined : JSON.stringify(payload),
    cache: 'no-store'
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Kan OKKIE Cloud niet bereiken (' + response.status + ').');
  return body;
}
// replace: true alleen als de speler zelf trainingen verwijderde; anders weigert de server minder pijlen dan online.
export async function syncAccount(data, playerId, storage = localStorage, { replace = false } = {}) {
  const acct = getAccount(playerId, storage);
  if (!acct?.token || !acct.enabled || !apiAvailable()) return { skipped: true };
  const stamp = acct.pendingAt;
  const snapshots = publicSnapshots(data, playerId);
  const result = await request('/v1/me/snapshots', 'PUT', replace ? { snapshots, replace: true } : { snapshots }, acct.token);
  // Opnieuw lezen: tijdens het versturen kan er een nieuwe wijziging zijn gemarkeerd; die blijft dan staan.
  const now = getAccount(playerId, storage) || acct;
  now.lastSync = new Date().toISOString();
  if (now.pendingAt === stamp) { delete now.pendingAt; delete now.pendingReplace; }
  upsertAccount(playerId, now, storage);
  return result;
}
export function queueCommunitySync(data, playerIds, opts = {}, storage = localStorage) {
  if (!apiAvailable()) return;
  const ids = [...new Set(playerIds || [])];
  for (const id of ids) {
    const acct = getAccount(id, storage);
    if (!acct?.enabled) continue;
    // Eerst markeren: sluit de app of valt het internet weg vóór het antwoord, dan gaat het later alsnog mee.
    upsertAccount(id, { ...acct, pendingAt: Date.now(), ...(opts.replace || acct.pendingReplace ? { pendingReplace: true } : {}) }, storage);
    syncAccount(data, id, storage, { replace: !!(opts.replace || acct.pendingReplace) }).catch(() => {});
  }
}
// Bij het opstarten en zodra er weer internet is: wat nog niet verstuurd was alsnog versturen.
export function resumePendingSync(data, storage = localStorage) {
  if (!apiAvailable() || !data?.players) return [];
  const ids = Object.entries(readAccounts(storage)).filter(([id, a]) => a?.pendingAt && a.enabled && data.players.some(p => p.id === id)).map(([id]) => id);
  for (const id of ids) syncAccount(data, id, storage, { replace: !!getAccount(id, storage).pendingReplace }).catch(() => {});
  return ids;
}
