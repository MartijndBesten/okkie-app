// OKKIE. — installatiebegeleiding voor nieuwe gebruikers. Iedereen kan OKKIE. direct gebruiken zonder
// installatie; dit is alleen een compact advies op een logisch moment.
//
// Regels:
// - Alleen op het definitieve adres (app.okkiedarts.nl). Op het oude adres niet aansporen tot installeren:
//   die installatie zou later weer verhuisd moeten worden (en op iPhone is dat het lastigst).
// - Nooit in de geïnstalleerde app zelf.
// - Alleen voor nieuwe gebruikers: na het aanmaken van de eerste speler, en hooguit één herinnering na
//   de eerste training. Bestaande gebruikers zien niets nieuws (alleen de vaste uitleg onder Meer).
// - Op iPhone kan een app op het beginscherm een eigen, lege opslag krijgen. Heeft iemand al trainingen,
//   dan eerst een back-up of overzetcode aanbieden.

export const INSTALL_ORIGINS = ['https://app.okkiedarts.nl'];
export const STATE_KEY = 'okkie.install.v1';

const isLocal = loc => /^(localhost|127\.0\.0\.1)$/.test(loc.hostname);
// Tests op localhost: localStorage 'okkie.dev' = { install: true }.
export function originAllowed(loc = location, storage = localStorage) {
  if (INSTALL_ORIGINS.includes(loc.origin)) return true;
  if (!isLocal(loc)) return false;
  try { return JSON.parse(storage.getItem('okkie.dev') || '{}').install === true; } catch { return false; }
}

export function isStandalone(win = window) {
  return !!(win.matchMedia?.('(display-mode: standalone)').matches || win.matchMedia?.('(display-mode: fullscreen)').matches || win.navigator?.standalone);
}

export function platform(nav = navigator) {
  const ua = nav.userAgent || '';
  // iPadOS meldt zich als Mac met aanraakscherm
  if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'other';
}
// Op iPhone kan installeren vanuit Safari en (sinds iOS 16.4) ook vanuit Chrome/Edge via het deelmenu.
export function iosBrowser(nav = navigator) {
  const ua = nav.userAgent || '';
  if (/CriOS/.test(ua)) return 'chrome';
  if (/EdgiOS/.test(ua)) return 'edge';
  if (/FxiOS/.test(ua)) return 'firefox';
  return 'safari';
}

export function readState(storage = localStorage) {
  try { return JSON.parse(storage.getItem(STATE_KEY) || '{}') || {}; } catch { return {}; }
}
export function writeState(patch, storage = localStorage) {
  try { storage.setItem(STATE_KEY, JSON.stringify({ ...readState(storage), ...patch })); } catch { /* privémodus */ }
}

// Direct na het aanmaken van de eerste speler (alleen nieuwe gebruikers komen via het welkomstscherm).
export function offerAfterWelcome({ allowed, standalone, state }) {
  return allowed && !standalone && !state.offeredAt && !state.installedAt;
}
// Eén herinnering op het beginscherm na de eerste afgeronde training, alleen als het advies eerder is
// getoond (dus alleen voor nieuwe gebruikers) en niet is weggeklikt.
export function remindOnHome({ allowed, standalone, state, finished }) {
  return allowed && !standalone && !!state.offeredAt && !state.installedAt && !state.remindedAt && finished >= 1;
}
