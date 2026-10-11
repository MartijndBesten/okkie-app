// OKKIE serviceworker: app-bestanden offline beschikbaar. Gebruikersgegevens staan in localStorage
// en worden hier nooit aangeraakt. Verhoog VERSION bij elke release.
const VERSION = 'okkie-v1.5.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/community-sync.js',
  './js/backup-alert.js',
  './community/config.js',
  './js/logic.js',
  './js/store.js',
  './js/board.js',
  './js/chart.js',
  './js/achievements.js',
  './js/brand.js',
  './js/icons.js',
  './js/transfer.js',
  './js/install.js',
  './js/imports.js',
  './js/group-stats.js',
  './js/guest-sync.js',
  './vrienden/',
  './vrienden/index.html',
  './vrienden/vrienden.css',
  './vrienden/vrienden.js',
  './ontdek/site.css',
  './uitleg/',
  './uitleg/index.html',
  './uitleg/uitleg.css',
  './uitleg/uitleg.js',
  './uitleg/score-oefening.js',
  './icons/icon.svg',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/denckh-logo-signature-light.svg',
  './icons/denckh-logo-signature.svg',
  './icons/okkie-o.svg',
];

self.addEventListener('install', event => {
  // cache: 'reload' = rechtstreeks van de server, niet uit de browsercache. GitHub Pages geeft bestanden
  // max-age=600; zonder dit kon een nieuwe versie tot 10 minuten een oude app.js naast nieuwe modules opslaan.
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => (k.startsWith('okkie-') || k.startsWith('oche-')) && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Netwerk eerst (altijd de nieuwste, onderling passende bestanden) en offline uit de cache.
// Zo lopen HTML en JavaScript van verschillende versies nooit door elkaar.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Bestanden altijd bij de server nagaan (no-cache: hervalideren, meestal een snelle 304), om dezelfde reden.
  // Een navigatie zelf blijft ongewijzigd: die mag niet opnieuw worden opgebouwd (redirect-regels).
  const fresh = req.mode === 'navigate' ? req : new Request(req, { cache: 'no-cache' });
  event.respondWith(
    fetch(fresh).then(res => {
      if (res.ok) {
        const copy = res.clone();
        // Bewaar de bezochte pagina onder zijn eigen URL. Een uitlegpagina mag nooit
        // de offline app-shell ('./index.html') overschrijven.
        caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const pathname = new URL(req.url).pathname;
        if (pathname.endsWith('/uitleg/')) return caches.match('./uitleg/index.html');
        if (pathname.endsWith('/vrienden/')) return caches.match('./vrienden/index.html');
        if (pathname.endsWith('/')) return caches.match('./index.html');
      }
      return Response.error();
    })
  );
});
