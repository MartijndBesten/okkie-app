// OKKIE. — Zelf kiezen welke statistieken je ziet (Statistieken → Pas mijn statistieken aan). Geen DOM.
// Twee soorten: 'one' = het uitslagscherm na één training, 'many' = het statistiekenscherm over al je trainingen.
// Bewaard per speler in data.settings.statView = { [spelerId]: { one: [...], many: [...] } }, alleen als iemand iets
// heeft aangepast. Ontbreekt het, dan geldt de standaardweergave. Trainingen en spelers zelf veranderen nooit.

export const STAT_OPTIONS = [
  { key: 'avg', label: 'Gemiddelde per 3 pijlen', scopes: ['one', 'many'] },
  { key: 'high', label: 'Hoogste beurt', hint: { one: 'met beurtnummer en de drie pijlen' }, scopes: ['one', 'many'] },
  { key: 'low', label: 'Laagste beurt', scopes: ['one', 'many'] },
  { key: 'turns', label: 'Score per beurt (grafiek)', hint: { many: 'van je laatste training' }, scopes: ['one', 'many'] },
  { key: 'points', label: 'Totaal gescoorde punten', scopes: ['one', 'many'] },
  { key: 'darts', label: 'Aantal gegooide pijlen', scopes: ['one', 'many'] },
  { key: 'tons', label: 'Aantal 100+, 140+ en 180', scopes: ['one', 'many'] },
  { key: 'bestWorst', label: 'Beste en slechtste training', scopes: ['many'] },
  { key: 'prev', label: 'Vergelijking met mijn vorige training', hint: { many: 'en je laatste 10 met de 10 daarvoor' }, scopes: ['one', 'many'] },
  { key: 'trend', label: 'Ontwikkeling over meerdere trainingen', scopes: ['many'] },
  { key: 'records', label: 'Persoonlijke records', hint: { one: 'melding bij een nieuw record' }, scopes: ['one', 'many'] },
  { key: 'heatmap', label: 'Trefferkaart', scopes: ['many'] },
  { key: 'badges', label: 'Badges', scopes: ['many'] },
  { key: 'matches', label: 'Wedstrijden', scopes: ['many'] },
];

export const SCOPES = {
  one: { label: 'Na een training', sub: 'Het uitslagscherm van één training.' },
  many: { label: 'Al je trainingen', sub: 'Het statistiekenscherm, over meerdere trainingen.' },
};

// Standaard alleen het belangrijkste.
export const DEFAULTS = {
  one: ['avg', 'high', 'turns', 'tons', 'prev', 'records'],
  many: ['avg', 'high', 'bestWorst', 'tons', 'prev', 'trend', 'records', 'heatmap', 'badges', 'matches'],
};

export const optionsFor = scope => STAT_OPTIONS.filter(o => o.scopes.includes(scope));
const valid = (scope, key) => STAT_OPTIONS.some(o => o.key === key && o.scopes.includes(scope));

function clean(scope, list) {
  return Array.isArray(list) ? [...new Set(list.filter(k => typeof k === 'string' && valid(scope, k)))] : null;
}

// Wat ziet deze speler? Leest alleen; ongeldige of vervalste waarden (uit een back-up) vallen terug op de standaard.
export function statView(settings, playerId) {
  const own = settings?.statView && typeof settings.statView === 'object' ? settings.statView[playerId] : null;
  const out = { custom: false };
  for (const scope of Object.keys(SCOPES)) {
    const list = own && typeof own === 'object' ? clean(scope, own[scope]) : null;
    out[scope] = new Set(list || DEFAULTS[scope]);
    if (list) out.custom = true;
  }
  return out;
}

export const shows = (view, scope, key) => view[scope].has(key);

// Eén vinkje aan of uit. Maakt het item voor deze speler pas aan bij de eerste aanpassing.
export function setStat(settings, playerId, scope, key, on) {
  if (!SCOPES[scope] || !valid(scope, key) || !playerId) return false;
  const now = statView(settings, playerId);
  const set = now[scope];
  if (on) set.add(key); else set.delete(key);
  const order = optionsFor(scope).map(o => o.key);
  if (!settings.statView || typeof settings.statView !== 'object') settings.statView = {};
  const prev = settings.statView[playerId] && typeof settings.statView[playerId] === 'object' ? settings.statView[playerId] : {};
  settings.statView[playerId] = { ...Object.fromEntries(Object.keys(SCOPES).map(s => [s, clean(s, prev[s]) || [...DEFAULTS[s]]])), [scope]: order.filter(k => set.has(k)) };
  return true;
}

// Standaardweergave herstellen: de eigen keuzes van deze speler weghalen.
export function resetStats(settings, playerId) {
  if (!settings?.statView || !(playerId in settings.statView)) return false;
  delete settings.statView[playerId];
  if (!Object.keys(settings.statView).length) delete settings.statView;
  return true;
}
