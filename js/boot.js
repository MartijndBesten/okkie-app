// OKKIE. — opstarten. In de iPhone-app eerst de duurzame kopie controleren (js/native.js), dan pas de app laden,
// zodat de app nooit met lege opslag begint terwijl de trainingen in de kopie staan. In de browser direct door.
import { prepare, hideSplash } from './native.js';

// Chrome kan de installatievraag al sturen voordat app.js geladen is: vasthouden, app.js neemt hem over.
addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.__okkieInstallEvent = e; });

try { await prepare(); } catch (e) { console.warn('OKKIE. opstarten:', e?.message || e); }
try { await import('./app.js'); } finally { hideSplash(); }
