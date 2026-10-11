// OKKIE. — gegevens overzetten tussen twee OKKIE.-installaties. Zie VERHUIZING.md.
//
// Waarom: browseropslag hoort bij één adres. De verhuizing van martijndbesten.github.io/dartlog/ naar
// app.okkiedarts.nl begint daarom leeg, en een op het iPhone-beginscherm gezette app kan los van Safari
// staan. De speler zet zijn gegevens bewust over; er wordt nooit iets gewist en nooit automatisch doorgestuurd.
//
// Drie routes, allemaal met dezelfde controle:
// 1. Automatisch tussen twee vensters (postMessage, uitsluitend tussen precies het oude en het nieuwe adres).
// 2. Overzetcode via kopiëren en plakken (werkt ook vanuit een geïnstalleerde iPhone-app).
// 3. Het gewone back-upbestand.
// Samenvoegen gaat op ID: twee keer overzetten geeft nooit dubbele spelers, trainingen of wedstrijden.
// Na afloop wordt niet alleen geteld, maar per record de inhoud vergeleken (vingerafdruk) en per speler
// het aantal trainingen, pijlen, punten en het gemiddelde.
import { parseBackup, mergeData } from './store.js';
import { trainingTotals, avg3 } from './logic.js';

// open: of de verhuizing op het oude adres wordt aangekondigd. Pas op true zetten als app.okkiedarts.nl
// live staat en de overdracht op echte toestellen is getest (VERHUIZING.md, stap 4).
export const PROD = { oldOrigin: 'https://martijndbesten.github.io', oldPath: '/dartlog/', newApp: 'https://app.okkiedarts.nl/', open: false };

// Alleen voor tests op localhost: localStorage 'okkie.dev' = { transfer: { oldOrigin, oldPath, newApp, open } }.
const isLocal = () => typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
export function config() {
  if (!isLocal()) return PROD;
  try { return { ...PROD, ...(JSON.parse(localStorage.getItem('okkie.dev') || '{}').transfer || {}) }; } catch { return PROD; }
}
export const NEW_APP = () => config().newApp;
export const newOrigin = () => new URL(config().newApp).origin;
export function role() {
  if (typeof location === 'undefined') return null;
  const c = config();
  if (location.origin === c.oldOrigin && location.pathname.startsWith(c.oldPath)) return 'old';
  if (location.origin === newOrigin()) return 'new';
  return null;
}
export const announce = () => role() === 'old' && config().open === true;

// ---------- Inhoud, telling en vingerafdruk ----------
export function summary(d) {
  return { players: d.players.length, trainings: d.trainings.length, matches: d.matches.length, active: !!(d.active?.training || d.active?.match) };
}
export function summaryText(s) {
  const n = (v, one, more) => `${v} ${v === 1 ? one : more}`;
  return `${n(s.players, 'speler', 'spelers')}, ${n(s.trainings, 'training', 'trainingen')}, ${n(s.matches, 'wedstrijd', 'wedstrijden')}${s.active ? ' en een lopende training' : ''}`;
}

// Vaste volgorde van sleutels, zodat dezelfde inhoud altijd dezelfde tekst oplevert.
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v ?? null);
}
export const recordKey = canon;
const byId = list => [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}
// Vingerafdruk van alles wat telt: spelers, trainingen (elke pijl), wedstrijden en de lopende sessies.
export function fingerprint(d) {
  return sha256(canon({ players: byId(d.players), trainings: byId(d.trainings), matches: byId(d.matches), active: d.active || { training: null, match: null } }));
}

// Per speler: trainingen, pijlen, punten en gemiddelde (scoretrainingen).
export function playerStats(d, playerId, onlyIds = null) {
  const ts = d.trainings.filter(t => t.playerId === playerId && (!onlyIds || onlyIds.has(t.id)));
  let darts = 0, points = 0;
  for (const t of ts.filter(t => t.kind === 'score')) { const x = trainingTotals(t); darts += x.darts; points += x.points; }
  return { trainings: ts.length, darts, points, avg: avg3(points, darts) };
}

// ---------- Extra sleutels naast de trainingsgegevens ----------
// Online profielen (Community, Mijn vrienden), gastkoppelingen en back-upherinneringen. Zonder deze
// sleutels zou je na de verhuizing de toegang tot je online profiel kwijt zijn.
const EXTRA_KEYS = ['okkie.community.v1', 'okkie.guest.v1', 'okkie.vrienden.v1'];
// Deze sleutels geven toegang tot een online profiel of andermans koppelcode. Via het automatische venster
// blijven ze op het toestel (alleen tussen precies twee adressen); in een overzetcode alleen als je dat
// zelf aanvinkt, want een code kan per ongeluk in een appje of notitie belanden.
export const SECRET_KEYS = ['okkie.community.v1', 'okkie.guest.v1'];
export function hasSecrets(extras) { return SECRET_KEYS.some(k => extras && extras[k]); }
export function withoutSecrets(extras) { return Object.fromEntries(Object.entries(extras || {}).filter(([k]) => !SECRET_KEYS.includes(k))); }
const BACKUP_PREFIX = 'okkie.backup.last-count.';
export function readExtras(storage) {
  const out = {};
  try {
    for (const k of EXTRA_KEYS) { const v = storage.getItem(k); if (v) out[k] = v; }
    for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k?.startsWith(BACKUP_PREFIX)) out[k] = storage.getItem(k); }
  } catch { /* privémodus: alleen de trainingen */ }
  return out;
}
// Nooit iets overschrijven wat in de ontvangende app al staat.
export function writeExtras(storage, extras = {}) {
  const parse = v => { try { return JSON.parse(v); } catch { return null; } };
  for (const [k, v] of Object.entries(extras)) {
    if (typeof v !== 'string' || !(EXTRA_KEYS.includes(k) || k.startsWith(BACKUP_PREFIX))) continue;
    const have = storage.getItem(k);
    if (k === 'okkie.community.v1') {
      const inc = parse(v)?.accounts, cur = parse(have)?.accounts || {};
      if (!inc || typeof inc !== 'object') continue;
      const merged = { ...cur };
      for (const [pid, acc] of Object.entries(inc)) if (!merged[pid]) merged[pid] = acc;
      storage.setItem(k, JSON.stringify({ version: 1, accounts: merged }));
    } else if (k.startsWith(BACKUP_PREFIX)) {
      storage.setItem(k, String(Math.max(Number(have) || 0, Number(v) || 0)));
    } else if (!have) storage.setItem(k, v);
  }
}

// ---------- Bewuste wijzigingen onthouden ----------
// Een record dat je in deze app zelf hebt verwijderd of samengevoegd, mag bij opnieuw overzetten niet
// terugkomen en is geen "conflict". Daarom onthoudt de app:
// - removed: { players, trainings, matches } met de ID's die je bewust hebt verwijderd;
// - playerAliases: { verdwenenId: blijvendId } na het samenvoegen van twee spelers.
const KINDS = ['players', 'trainings', 'matches'];
const MAX_REMEMBER = 5000;
export function removedSets(d) {
  const r = d && typeof d.removed === 'object' && d.removed ? d.removed : {};
  return Object.fromEntries(KINDS.map(k => [k, new Set(Array.isArray(r[k]) ? r[k] : [])]));
}
export function rememberRemoved(d, kind, ids) {
  if (!KINDS.includes(kind)) return;
  const sets = removedSets(d);
  for (const id of ids) if (id) sets[kind].add(id);
  d.removed = Object.fromEntries(KINDS.map(k => [k, [...sets[k]].slice(-MAX_REMEMBER)]));
}
const aliasesOf = d => (d && typeof d.playerAliases === 'object' && d.playerAliases ? d.playerAliases : {});
// Volg een keten van samenvoegingen tot de speler die er nog is (A→B, B→C geeft C).
function aliasMap(...sources) {
  const all = Object.assign({}, ...sources.map(aliasesOf));
  return id => { let x = id, n = 0; while (x && all[x] && n++ < 20) x = all[x]; return x; };
}
function mapRecord(kind, rec, map, removedPlayers = new Set()) {
  if (kind === 'trainings') {
    const t = { ...rec, playerId: map(rec.playerId) };
    if (rec.groupPlayers) t.groupPlayers = rec.groupPlayers.map(map);
    return t;
  }
  if (kind === 'matches') return { ...rec, players: rec.players.map(p => ({ ...p, id: p.id && (removedPlayers.has(p.id) ? null : map(p.id)) })) };
  return rec;
}
function mapActive(active, map) {
  const out = { training: null, match: null, ...(active || {}) };
  if (out.training) out.training = { ...out.training, playerId: map(out.training.playerId), players: (out.training.players || [out.training.playerId]).map(map) };
  if (out.match) out.match = { ...out.match, players: out.match.players.map(p => ({ ...p, id: p.id && map(p.id) })) };
  return out;
}

// ---------- Samenvoegen ----------
// Ontvangen gegevens eerst vertalen naar deze app: samengevoegde spelers krijgen hun blijvende ID en
// bewust verwijderde records komen niet terug.
function prepareIncoming(base, incoming) {
  const map = aliasMap(base);
  const rm = removedSets(base);
  const alias = aliasesOf(base);
  return {
    ...incoming,
    players: incoming.players.filter(p => !alias[p.id] && !rm.players.has(p.id)),
    trainings: incoming.trainings.filter(t => !rm.trainings.has(t.id) && !rm.players.has(t.playerId)).map(t => mapRecord('trainings', t, map)),
    matches: incoming.matches.filter(m => !rm.matches.has(m.id)).map(m => mapRecord('matches', m, map, rm.players)),
    active: mapActive(incoming.active, map),
  };
}
// Nieuwe app leeg: alles overnemen (ook lopende training en instellingen). Anders veilig samenvoegen op ID:
// wat hier al staat blijft zoals het is. Een lopende training of wedstrijd wordt alleen overgenomen als er
// hier geen loopt én hij hier niet al is afgerond (anders zou hij twee keer meetellen).
export function mergeTransfer(base, incoming) {
  const inc = prepareIncoming(base, incoming);
  const empty = !base.players.length && !base.trainings.length && !base.matches.length && !base.active?.training && !base.active?.match;
  if (empty) {
    const out = structuredClone(inc);
    if (base.removed) out.removed = structuredClone(base.removed);
    if (base.playerAliases) out.playerAliases = { ...base.playerAliases };
    return { data: out, skippedActive: null };
  }
  const out = mergeData(base, inc);
  out.active = { training: null, match: null, ...(out.active || {}) };
  let skippedActive = null;
  const it = inc.active?.training, im = inc.active?.match;
  if (it) {
    const finishedHere = out.trainings.some(t => t.id === it.id || t.groupId === it.id);
    const known = (it.players || [it.playerId]).every(id => out.players.some(p => p.id === id));
    if (!out.active.training && !finishedHere && known) out.active.training = structuredClone(it);
    else if (canon(out.active.training) !== canon(it)) skippedActive = finishedHere ? 'afgerond' : known ? 'bezet' : 'onbekende speler';
  }
  if (im) {
    const finishedHere = out.matches.some(m => m.id === im.id);
    if (!out.active.match && !finishedHere) out.active.match = structuredClone(im);
    else if (canon(out.active.match) !== canon(im)) skippedActive = skippedActive || (finishedHere ? 'afgerond' : 'bezet');
  }
  return { data: out, skippedActive };
}

// Welke velden verschillen tussen twee versies van hetzelfde record?
function changedKeys(a, b) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => canon(a[k]) !== canon(b[k]));
}
// Verschillen die een speler in deze app zelf kan hebben aangebracht.
function explained(kind, inc, here, removedPlayers) {
  const keys = changedKeys(inc, here);
  if (kind === 'players') return keys.every(k => ['name', 'color'].includes(k)) ? (keys.includes('name') ? `naam verschilt: hier "${here.name}", daar "${inc.name}" (hier blijft "${here.name}")` : 'kleur verschilt') : null;
  if (kind === 'trainings') {
    // Alleen bij een score uit een andere app kun je de datum invullen; pijlen en scores liggen vast.
    return inc.source && keys.every(k => ['startedAt', 'finishedAt', 'dateUnknown'].includes(k)) ? 'datum verschilt (hier blijft de datum van deze app)' : null;
  }
  if (kind === 'matches') {
    if (keys.length !== 1 || keys[0] !== 'players' || inc.players.length !== here.players.length) return null;
    // Alleen namen verschillen (hernoemd), of een speler is hier bewust verwijderd (dan staat id op null).
    const ok = inc.players.every((p, i) => here.players[i].id === p.id || (here.players[i].id === null && removedPlayers.has(p.id)));
    return ok ? 'spelersnaam verschilt (hier blijft de naam van deze app)' : null;
  }
  return null;
}
const LABEL = { players: 'speler', trainings: 'training', matches: 'wedstrijd' };
function describe(kind, rec) {
  if (kind === 'players') return rec.name;
  const when = rec.startedAt ? new Date(rec.startedAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  if (kind === 'matches') return `${rec.settings?.start || ''} ${rec.players.map(p => p.name).join(' – ')} (${when})`;
  return `${rec.kind === 'clock' ? 'rond de klok' : rec.limitTurns ? rec.limitTurns * 3 + ' pijlen' : 'vrije training'} van ${when}`;
}

// Controle na het samenvoegen, per record:
// - identiek: precies gelijk;
// - aangepast: hier bewust anders (hernoemd, datum ingevuld, samengevoegd of verwijderd) en zo gebleven;
// - conflict: zelfde ID, andere inhoud zonder verklaring (bijv. andere pijlen) — hier blijft de eigen versie;
// - ontbreekt: niet aanwezig en niet bewust verwijderd.
// status: 'identiek' | 'aangepast' | 'aandacht' (lopende training niet overgenomen) | 'probleem'.
export function verifyTransfer(incoming, merged) {
  const map = aliasMap(merged, incoming);
  const rm = removedSets(merged);
  const res = { identical: 0, adjusted: [], conflicts: [], missing: [], players: [], active: 'geen' };
  for (const kind of KINDS) {
    const have = new Map(merged[kind].map(x => [x.id, x]));
    for (const raw of incoming[kind]) {
      const target = kind === 'players' ? map(raw.id) : raw.id;
      const y = have.get(target);
      if (!y) {
        const gone = rm[kind].has(raw.id) || (kind === 'trainings' && rm.players.has(raw.playerId)) || (kind === 'players' && target !== raw.id && rm.players.has(target));
        if (gone) res.adjusted.push({ kind, id: raw.id, what: `${LABEL[kind]} ${describe(kind, raw)}`, why: 'hier bewust verwijderd' });
        else res.missing.push({ kind, id: raw.id, what: `${LABEL[kind]} ${describe(kind, raw)}` });
        continue;
      }
      if (kind === 'players' && target !== raw.id) { res.adjusted.push({ kind, id: raw.id, what: `speler ${raw.name}`, why: `samengevoegd met ${y.name}` }); continue; }
      const x = mapRecord(kind, raw, map, rm.players), yy = mapRecord(kind, y, map, rm.players);
      if (canon(x) === canon(yy)) { res.identical++; continue; }
      const why = explained(kind, x, yy, rm.players);
      if (why) res.adjusted.push({ kind, id: raw.id, what: `${LABEL[kind]} ${describe(kind, raw)}`, why });
      else res.conflicts.push({ kind, id: raw.id, what: `${LABEL[kind]} ${describe(kind, raw)}`, fields: changedKeys(x, yy) });
    }
  }
  // Per speler: trainingen, pijlen, punten en gemiddelde over wat er is aangekomen (bewust verwijderd telt niet mee).
  const arrived = incoming.trainings.filter(t => !rm.trainings.has(t.id) && !rm.players.has(t.playerId));
  const ids = new Set(arrived.map(t => t.id));
  const incMapped = { ...incoming, trainings: arrived.map(t => mapRecord('trainings', t, map)) };
  for (const p of incoming.players) {
    const target = map(p.id);
    if (rm.players.has(p.id) || rm.players.has(target)) continue;
    const a = playerStats(incMapped, target, ids), b = playerStats(merged, target, ids);
    const conflicted = res.conflicts.some(c => c.kind === 'trainings' && incMapped.trainings.find(t => t.id === c.id)?.playerId === target);
    res.players.push({ id: target, name: merged.players.find(q => q.id === target)?.name || p.name, ...a, same: !conflicted && a.trainings === b.trainings && a.darts === b.darts && a.points === b.points });
  }
  const it = incoming.active?.training, im = incoming.active?.match;
  if (it || im) {
    const act = mapActive(incoming.active, map), here = mapActive(merged.active, map);
    const doneHere = (it && merged.trainings.some(t => t.id === it.id || t.groupId === it.id)) || (im && merged.matches.some(m => m.id === im.id));
    const same = (!it || canon(act.training) === canon(here.training)) && (!im || canon(act.match) === canon(here.match));
    res.active = same ? 'overgenomen' : doneHere ? 'al afgerond' : 'niet overgenomen';
  }
  const problem = res.missing.length || res.conflicts.length || res.players.some(p => !p.same);
  res.status = problem ? 'probleem' : res.active === 'niet overgenomen' ? 'aandacht' : (res.adjusted.length || res.active === 'al afgerond') ? 'aangepast' : 'identiek';
  res.ok = !problem;
  return res;
}

// Twee spelers met dezelfde naam (bijv. eerst in de nieuwe app begonnen, daarna overgezet) samenvoegen
// tot één speler. Alleen als ze nooit samen in één wedstrijd of training zaten en niet allebei online zijn.
// De samenvoeging wordt onthouden, zodat opnieuw overzetten de oude speler niet terugbrengt.
export function mergePlayers(d, keepId, dropId, accounts = {}) {
  if (keepId === dropId) return { error: 'Dat is dezelfde speler.' };
  const keep = d.players.find(p => p.id === keepId), drop = d.players.find(p => p.id === dropId);
  if (!keep || !drop) return { error: 'Speler niet gevonden.' };
  const together = list => list.some(ids => ids.includes(keepId) && ids.includes(dropId));
  if (together(d.matches.map(m => m.players.map(p => p.id))) || together(d.trainings.filter(t => t.groupPlayers).map(t => t.groupPlayers))
    || together([d.active?.training?.players || [], (d.active?.match?.players || []).map(p => p.id)])) {
    return { error: `${keep.name} en ${drop.name} hebben samen gegooid; dat zijn dus twee verschillende spelers.` };
  }
  if (accounts[keepId] && accounts[dropId]) return { error: 'Beide spelers hebben een online profiel. Samenvoegen kan dan niet.' };
  const out = structuredClone(d);
  const map = id => (id === dropId ? keepId : id);
  out.trainings.forEach(t => { t.playerId = map(t.playerId); if (t.groupPlayers) t.groupPlayers = t.groupPlayers.map(map); });
  out.matches.forEach(m => m.players.forEach(p => { if (p.id === dropId) { p.id = keepId; p.name = keep.name; } }));
  const at = out.active?.training;
  if (at) { at.players = (at.players || [at.playerId]).map(map); at.playerId = map(at.playerId); }
  out.active?.match?.players.forEach(p => { if (p.id === dropId) { p.id = keepId; p.name = keep.name; } });
  out.players = out.players.filter(p => p.id !== dropId);
  if (out.activePlayerId === dropId) out.activePlayerId = keepId;
  const aliases = Object.fromEntries(Object.entries(aliasesOf(d)).map(([k, v]) => [k, v === dropId ? keepId : v]));
  aliases[dropId] = keepId;
  out.playerAliases = aliases;
  return { data: out, moveAccount: !accounts[keepId] && !!accounts[dropId] };
}
export function sameNamePairs(d) {
  const seen = new Map(), pairs = [];
  for (const p of d.players) {
    const k = p.name.trim().toLowerCase();
    if (seen.has(k)) pairs.push([seen.get(k), p]); else seen.set(k, p);
  }
  return pairs;
}

// ---------- Overzetcode (klembord) ----------
export const PREFIX = 'OKKIE-OVERZETTEN-1:';
const toB64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
async function gzip(bytes, mode) {
  const stream = new Blob([bytes]).stream().pipeThrough(mode === 'in' ? new CompressionStream('gzip') : new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function makePackage(data, extras = {}, { secrets = true } = {}) {
  const omitted = secrets ? [] : SECRET_KEYS.filter(k => extras[k]);
  return { app: 'okkie', kind: 'overzetten', v: 1, exportedAt: new Date().toISOString(), data, extras: secrets ? extras : withoutSecrets(extras), omitted, fingerprint: await fingerprint(data) };
}
// Controleert vorm (zelfde regels als een back-up) én vingerafdruk: een afgebroken of veranderde code wordt geweigerd.
export async function openPackage(pkg) {
  if (!pkg || pkg.app !== 'okkie' || !pkg.data) return { error: 'Dit zijn geen OKKIE.-gegevens.' };
  const r = parseBackup(JSON.stringify({ app: 'okkie', data: pkg.data }));
  if (r.error) return r;
  if (pkg.fingerprint && pkg.fingerprint !== await fingerprint(pkg.data)) return { error: 'De gegevens zijn onderweg veranderd of onvolledig. Maak een nieuwe code in de oude app.' };
  return { data: r.data, extras: pkg.extras || {}, omitted: Array.isArray(pkg.omitted) ? pkg.omitted : [], fingerprint: pkg.fingerprint || null };
}
// Overzetcode: standaard zonder online profielsleutels (secrets: false).
export async function pack(data, extras = {}, { secrets = false } = {}) {
  const json = JSON.stringify(await makePackage(data, extras, { secrets }));
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream === 'undefined') return PREFIX + 'j:' + toB64(bytes);
  return PREFIX + 'z:' + toB64(await gzip(bytes, 'in'));
}
export async function unpack(text) {
  const t = String(text || '').trim().replace(/\s+/g, '');
  if (!t.startsWith(PREFIX)) return { error: 'Dit is geen OKKIE.-overzetcode. Kopieer hem opnieuw in de andere app.' };
  try {
    const kind = t.slice(PREFIX.length, PREFIX.length + 1), b64 = t.slice(PREFIX.length + 2);
    const bytes = fromB64(b64);
    const json = new TextDecoder().decode(kind === 'z' ? await gzip(bytes, 'out') : bytes);
    return openPackage(JSON.parse(json));
  } catch { return { error: 'De code is onvolledig of beschadigd. Kopieer hem opnieuw in de andere app.' }; }
}

// ---------- Automatisch tussen twee vensters (alleen deze twee adressen) ----------
// Oude app: opent de nieuwe app, wacht op "klaar", stuurt de gegevens en wacht op de controle.
export function sendViaWindow(pkg, { timeout = 25000, open = (u, n) => window.open(u, n) } = {}) {
  return new Promise((resolve, reject) => {
    const target = newOrigin();
    const nonce = Math.random().toString(36).slice(2);
    const win = open(NEW_APP() + '#overzetten', '_blank');
    if (!win) return reject(new Error('popup'));
    let sent = false;
    const done = (fn, v) => { clearTimeout(timer); removeEventListener('message', onMsg); fn(v); };
    const timer = setTimeout(() => done(reject, new Error('timeout')), timeout);
    function onMsg(e) {
      if (e.origin !== target || e.source !== win || !e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'okkie-transfer-ready' && !sent) { sent = true; win.postMessage({ type: 'okkie-transfer', nonce, pkg }, target); }
      if (e.data.nonce !== nonce) return;
      if (e.data.type === 'okkie-transfer-done') done(resolve, e.data.result);
      if (e.data.type === 'okkie-transfer-error') done(reject, new Error(e.data.error || 'mislukt'));
    }
    addEventListener('message', onMsg);
  });
}
// Nieuwe app, geopend door de oude met #overzetten: meldt zich, ontvangt, voegt samen, stuurt de controle terug.
export function receiveViaWindow(onPackage) {
  if (typeof window === 'undefined' || !/overzetten/.test(location.hash) || !window.opener) return false;
  const from = config().oldOrigin;
  let got = false;
  const ping = setInterval(() => { try { window.opener.postMessage({ type: 'okkie-transfer-ready' }, from); } catch { /* venster dicht */ } }, 400);
  setTimeout(() => clearInterval(ping), 25000);
  addEventListener('message', async e => {
    if (got || e.origin !== from || e.source !== window.opener || e.data?.type !== 'okkie-transfer') return;
    got = true; clearInterval(ping);
    const r = await openPackage(e.data.pkg);
    if (r.error) return e.source.postMessage({ type: 'okkie-transfer-error', nonce: e.data.nonce, error: r.error }, from);
    const result = await onPackage(r);
    e.source.postMessage({ type: 'okkie-transfer-done', nonce: e.data.nonce, result }, from);
  });
  history.replaceState(null, '', location.pathname + location.search);
  return true;
}

// ---------- Volledige ontvangst (gedeeld door alle routes) ----------
// Geeft de nieuwe gegevens en een controleverslag terug; schrijft niets weg (dat doet de app).
// (De vingerafdruk van het pakket is al bij openPackage gecontroleerd; hier gaat het om wat er nu staat.)
export async function receive(base, opened) {
  const { data, skippedActive } = mergeTransfer(base, opened.data);
  const check = verifyTransfer(opened.data, data);
  return { data, report: { ...check, skippedActive, omitted: opened.omitted || [], received: summary(opened.data), here: summary(data) } };
}

