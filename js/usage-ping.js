// OKKIE. — Anonieme dagteller. Hooguit één keer per dag meldt de app aan onze eigen server (dezelfde als voor Darters)
// dat hij is geopend: alleen het versienummer en of dit toestel voor het eerst meldt. Geen ID, geen cookie, geen naam,
// geen scores. Op het toestel onthouden we alleen de datum van het laatste seintje. Werkt de server niet (offline,
// niet geactiveerd), dan gebeurt er niets; de app wacht nooit op dit seintje. Zie okkiedarts.nl/privacy/.
import { periodKey } from './logic.js';

export const PING_KEY = 'okkie.ping.v1';

export function pingDue(storage, now = new Date()) {
  let saved = null;
  try { saved = JSON.parse(storage.getItem(PING_KEY) || 'null'); } catch { saved = null; }
  const day = saved && typeof saved === 'object' ? saved.day : null;
  return { due: day !== periodKey(now, 'dag'), first: !day };
}

// send: (path, method, body) => Promise, zoals request() uit community-sync.js. Geeft true als het seintje verstuurd is.
export async function pingUsage({ version, send, storage = localStorage, now = new Date() }) {
  const { due, first } = pingDue(storage, now);
  if (!due) return false;
  try { await send('/v1/ping', 'POST', { version, first }); } catch { return false; }
  try { storage.setItem(PING_KEY, JSON.stringify({ day: periodKey(now, 'dag') })); } catch { /* geen opslag: morgen opnieuw */ }
  return true;
}
