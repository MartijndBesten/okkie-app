// OKKIE. als iPhone-app (Capacitor, zie IOS-APP.md). In de browser en de PWA doet dit bestand niets.
//
// Waarom: de app draait in een eigen webview (capacitor://localhost) met eigen localStorage. Die is van de app,
// maar iOS garandeert niet dat webviewopslag altijd blijft staan. Daarom:
// - Duurzame kopie: alle OKKIE.-sleutels uit localStorage gaan ook naar een bestand in Library/OKKIE/ van de
//   app (zit in de iCloud-/computerback-up van de iPhone, wordt niet opgeruimd zoals een cache). Twee vaste
//   bestanden om en om (A/B) met een volgnummer: een afgebroken schrijfactie raakt nooit beide.
// - Bij het starten: ontbreekt oche.data in localStorage maar staat het wel in de kopie, dan eerst terugzetten,
//   pas daarna start de app (js/boot.js). Staat oche.data er wel, dan is localStorage leidend.
// - Delen en bewaren gaan via het iOS-deelmenu (Bewaar in Bestanden, AirDrop, WhatsApp); trillen via Haptics.
// Plugins komen van de native kant (window.Capacitor.Plugins); er is geen bundler of build-stap nodig.

export const FORMAT = 'okkie-native-opslag';
export const DIR = 'LIBRARY';
export const FOLDER = 'OKKIE';
export const SLOTS = ['opslag-a.json', 'opslag-b.json'];
// Openbare adressen voor links die buiten de app moeten werken (bijv. de ouderlink van Darters).
export const WEB_APP = 'https://app.okkiedarts.nl/';
const SKIP = new Set(['okkie.dev', 'okkie.errors']);
export const durableKey = k => typeof k === 'string' && /^(oche|okkie|dartlog)\./.test(k) && !SKIP.has(k);

const cap = () => {
  const c = typeof window !== 'undefined' ? window.Capacitor : null;
  try { return c?.isNativePlatform?.() ? c : null; } catch { return null; }
};
export const isNative = () => !!cap();
export const platform = () => cap()?.getPlatform?.() || 'web';
const plugin = name => cap()?.Plugins?.[name] || null;

// Link naar een pagina van de app die ook buiten de app moet werken.
export function publicUrl(path, loc = typeof location !== 'undefined' ? location : null) {
  return isNative() || !loc ? new URL(path, WEB_APP).href : new URL(path, loc.href).href;
}

// ---------- Duurzame kopie van localStorage ----------
export function snapshot(storage) {
  const items = {};
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (durableKey(k)) { const v = storage.getItem(k); if (typeof v === 'string') items[k] = v; }
  }
  return items;
}

function valid(m) {
  return m && m.format === FORMAT && Number.isSafeInteger(m.seq) && m.items && typeof m.items === 'object' && !Array.isArray(m.items);
}
// Nieuwste geldige kopie van de twee bestanden (hoogste volgnummer).
export function pickNewest(texts) {
  let best = null;
  for (const t of texts) {
    if (typeof t !== 'string' || !t) continue;
    let m; try { m = JSON.parse(t); } catch { continue; }
    if (valid(m) && (!best || m.seq > best.seq)) best = m;
  }
  return best;
}

// Alleen terugzetten als de trainingen in localStorage ontbreken. Dan alle ontbrekende sleutels terug; niets
// overschrijven wat er (nog) staat.
export function restoreInto(storage, mirror) {
  if (!valid(mirror) || typeof mirror.items['oche.data'] !== 'string') return { restored: false, reason: 'geen kopie' };
  if (storage.getItem('oche.data') != null) return { restored: false, reason: 'localStorage heeft gegevens' };
  let keys = 0;
  for (const [k, v] of Object.entries(mirror.items)) {
    if (!durableKey(k) || typeof v !== 'string' || storage.getItem(k) != null) continue;
    storage.setItem(k, v); keys++;
  }
  return { restored: true, keys, savedAt: mirror.savedAt || null };
}

// fs: { read(name) -> string|null, write(name, text), list?() -> namen } ; los te testen zonder iPhone.
export function createMirror({ fs, storage, delay = 800, now = () => new Date().toISOString(), timer = setTimeout, clear = clearTimeout }) {
  let seq = 0, pending = null, chain = Promise.resolve(), last = null;
  const api = {
    async load() {
      const texts = [];
      // Alleen bestaande bestanden lezen (geen foutmeldingen in het iOS-logboek bij de eerste start).
      let names = SLOTS;
      if (fs.list) { try { const have = await fs.list(); names = SLOTS.filter(n => have.includes(n)); } catch { names = []; } }
      for (const name of names) { try { texts.push(await fs.read(name)); } catch { texts.push(null); } }
      const m = pickNewest(texts);
      if (m) seq = Math.max(seq, m.seq);
      last = m ? JSON.stringify(m.items) : null;
      return m;
    },
    // Schrijft alleen als er iets veranderd is. Om en om naar A en B.
    write() {
      chain = chain.then(async () => {
        const items = snapshot(storage);
        const body = JSON.stringify(items);
        if (body === last || typeof items['oche.data'] !== 'string') return false;
        const next = seq + 1;
        const doc = JSON.stringify({ format: FORMAT, version: 1, seq: next, savedAt: now(), items });
        await fs.write(SLOTS[next % 2], doc);
        seq = next; last = body;
        return true;
      }).catch(e => { console.warn('OKKIE. duurzame kopie:', e?.message || e); return false; });
      return chain;
    },
    schedule() { if (pending) clear(pending); pending = timer(() => { pending = null; api.write(); }, delay); },
    flush() { if (pending) { clear(pending); pending = null; } return api.write(); },
    get seq() { return seq; },
  };
  return api;
}

function capacitorFs() {
  const F = plugin('Filesystem');
  if (!F) return null;
  return {
    async list() { return ((await F.readdir({ path: FOLDER, directory: DIR })).files || []).map(f => (typeof f === 'string' ? f : f.name)); },
    async read(name) {
      try { return (await F.readFile({ path: `${FOLDER}/${name}`, directory: DIR, encoding: 'utf8' })).data; }
      catch { return null; }   // bestand bestaat (nog) niet
    },
    async write(name, text) {
      // recursive: maakt Library/OKKIE zelf aan (een losse mkdir meldt een fout als de map al bestaat).
      await F.writeFile({ path: `${FOLDER}/${name}`, directory: DIR, data: text, encoding: 'utf8', recursive: true });
    },
  };
}

// Elke wijziging in localStorage plant een kopie (ook vanuit community/ en andere pagina's).
function watchStorage(storage, mirror) {
  const proto = Object.getPrototypeOf(storage);
  if (proto.__okkieWatched) return;
  const set = proto.setItem, remove = proto.removeItem;
  proto.setItem = function (k, v) { set.call(this, k, v); if (this === storage && durableKey(String(k))) mirror.schedule(); };
  proto.removeItem = function (k) { remove.call(this, k); if (this === storage && durableKey(String(k))) mirror.schedule(); };
  Object.defineProperty(proto, '__okkieWatched', { value: true });
}

let mirror = null;
export const lastRestore = { restored: false };
// Vóór de app start (js/boot.js en de losse pagina's). Op het web direct klaar.
export async function prepare({ storage = typeof localStorage !== 'undefined' ? localStorage : null } = {}) {
  if (!isNative() || !storage || mirror) return lastRestore;
  const fs = capacitorFs();
  if (!fs) return lastRestore;
  mirror = createMirror({ fs, storage });
  try {
    const m = await mirror.load();
    Object.assign(lastRestore, m ? restoreInto(storage, m) : { restored: false, reason: 'geen kopie' });
    if (lastRestore.restored) console.log(`OKKIE. opslag teruggezet uit kopie (${lastRestore.keys} sleutels, van ${lastRestore.savedAt || 'onbekend'})`);
  } catch (e) { console.warn('OKKIE. kopie lezen:', e?.message || e); }
  watchStorage(storage, mirror);
  mirror.schedule();   // eerste keer (of na een update zonder kopie): meteen een kopie maken
  const flush = () => mirror?.flush();
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  plugin('App')?.addListener?.('appStateChange', s => { if (!s?.isActive) flush(); });
  installShare();
  setTimeout(hideSplash, 4000);   // vangnet: nooit blijven hangen op het startscherm
  return lastRestore;
}
export const flushStorage = () => mirror?.flush() || Promise.resolve(false);

// ---------- Delen en bewaren ----------
const blobToBase64 = blob => new Promise((ok, no) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''));
  r.onerror = () => no(r.error);
  r.readAsDataURL(blob);
});
const safeName = n => String(n || 'okkie').replace(/[^\w.\-]+/g, '-').slice(0, 80) || 'okkie';
const abort = () => { const e = new Error('Delen geannuleerd'); e.name = 'AbortError'; return e; };
const cancelled = e => /cancel|annul/i.test(String(e?.message || e?.errorMessage || e));

async function shareNative({ title, text, url, files } = {}) {
  const Share = plugin('Share'), F = plugin('Filesystem');
  if (!Share) throw new Error('Delen is niet beschikbaar.');
  const uris = [];
  for (const f of files || []) {
    const path = `delen/${safeName(f.name)}`;
    await F.writeFile({ path, directory: 'CACHE', data: await blobToBase64(f), recursive: true });
    uris.push((await F.getUri({ path, directory: 'CACHE' })).uri);
  }
  try {
    await Share.share({ title, text, url, ...(uris.length ? { files: uris } : {}), dialogTitle: title || 'OKKIE.' });
  } catch (e) { throw cancelled(e) ? abort() : e; }
}
// navigator.share en canShare zoals in Safari, maar via het native deelmenu: bestaande code hoeft niet te veranderen.
function installShare() {
  try {
    Object.defineProperty(navigator, 'share', { configurable: true, value: data => shareNative(data) });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
  } catch { /* laat de webview-versie staan */ }
}
// Bestand bewaren (back-up, scorekaart): in de app via het deelmenu ("Bewaar in Bestanden").
export async function saveFile(name, blob, title = 'OKKIE.') {
  if (!isNative()) return 'web';
  try { await shareNative({ title, files: [new File([blob], name, { type: blob.type || 'application/octet-stream' })] }); return 'shared'; }
  catch (e) { if (e.name === 'AbortError') return 'cancelled'; throw e; }
}

// ---------- Trillen, statusbalk, startscherm ----------
// ms of een patroon (zoals navigator.vibrate). true = afgehandeld door de app.
export function haptic(pattern) {
  const H = plugin('Haptics');
  if (!H) return false;
  const long = Array.isArray(pattern) ? pattern.length > 2 : Number(pattern) >= 30;
  (long ? H.notification({ type: 'SUCCESS' }) : H.impact({ style: Number(pattern) >= 20 ? 'MEDIUM' : 'LIGHT' }))?.catch?.(() => {});
  return true;
}
// Donker thema: lichte tekst in de statusbalk (style DARK), licht thema: donkere tekst.
export function applyTheme(theme) {
  plugin('StatusBar')?.setStyle?.({ style: theme === 'light' ? 'LIGHT' : 'DARK' })?.catch?.(() => {});
}
let splashHidden = false;
export function hideSplash() {
  if (splashHidden) return;
  splashHidden = true;
  plugin('SplashScreen')?.hide?.({ fadeOutDuration: 200 })?.catch?.(() => {});
}
