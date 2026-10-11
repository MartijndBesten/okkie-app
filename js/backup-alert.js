// Lokale back-upherinnering per speler. Geen netwerkverzoek.
export function completedCount(data, playerId) {
  return (data.trainings || []).filter(t => t.playerId === playerId && t.kind === 'score' && t.finishedAt && !t.summary && t.turns?.length).length;
}
function key(playerId) { return 'okkie.backup.last-count.' + playerId; }
export function due(data, playerId, storage = localStorage) {
  if (!playerId) return false;
  const count = completedCount(data, playerId);
  let last = 0;
  try { last = Number(storage.getItem(key(playerId)) || 0); } catch { return false; }
  return count >= Math.max(0, last) + 10;
}
export function dismissed(data, playerId, storage = localStorage) {
  if (!playerId) return;
  try { storage.setItem(key(playerId), String(completedCount(data, playerId))); } catch { /* privacy-modus */ }
}
export function backedUp(data, storage = localStorage) {
  for (const player of data.players || []) dismissed(data, player.id, storage);
}
