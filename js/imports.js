// OKKIE — scoretrainingen die eerder in DartCounter zijn gegooid (overgenomen van screenshots, oktober 2026).
// Alleen de eindstand is bekend: 99 pijlen, totaalscore en (meestal) de hoogste beurt. De datum stond niet
// op de screenshots; die kan per training in de geschiedenis worden ingevuld.
import { summaryTraining } from './store.js';

export const DARTCOUNTER_SET = {
  id: 'dartcounter-2026-10',
  label: '10 scoretrainingen uit DartCounter',
  sessions: [
    { points: 1346, high: null, time: '13:43' },
    { points: 1234, high: 99, t180: 0, time: '12:46' },
    { points: 1396, high: 100, t180: 0, time: '12:35' },
    { points: 1271, high: 125, t180: 0, time: '11:27' },
    { points: 1171, high: 100, t180: 0, time: '16:30' },
    { points: 1369, high: 98, t180: 0, time: '18:41' },
    { points: 1122, high: 80, t180: 0, time: '15:55' },
    { points: 1265, high: null, time: '16:56' },
    { points: 1338, high: 86, t180: 0, time: '16:26' },
    { points: 1195, high: null, time: '16:07' },
  ],
};

// Vaste id's per speler, zodat dezelfde set nooit dubbel wordt toegevoegd.
export function dartCounterTrainings(playerId) {
  return DARTCOUNTER_SET.sessions.map((s, i) => {
    const t = summaryTraining({ playerId, points: s.points, darts: 99, high: s.high, t180: s.t180, source: 'DartCounter', id: `${DARTCOUNTER_SET.id}-${i + 1}-${playerId}` });
    // Onbekende datum: op volgorde achter elkaar zetten, vóór alles wat in OKKIE is gegooid.
    t.startedAt = new Date(Date.UTC(2026, 9, 1, 8, i)).toISOString();
    t.note = `Screenshot van ${s.time}`;
    return t;
  });
}

export function hasDartCounterSet(data, playerId) {
  return data.trainings.some(t => t.playerId === playerId && t.id.startsWith(DARTCOUNTER_SET.id + '-'));
}
