// OKKIE. Club. Besloten clubruimte; alle rechten worden door de server gecontroleerd (cloud/src/clubs.js).
// Club bij het bord: de beheerder hangt een QR-code bij het dartbord; wie scant, kiest of maakt hier zijn speler, doet
// mee en telt met elke training automatisch mee (js/club-auto.js, altijd uit te zetten). Lokale trainingen blijven op
// dit toestel; naar de club gaat alleen de samenvatting. Staat uit zonder CLUB_OPEN / CLUBS_ENABLED.
import { CLUB_OPEN, API_BASE } from '../community/config.js';
import { apiAvailable, getAccount, upsertAccount, dropAccount, syncAccount, request } from '../js/community-sync.js';
import { shareableTrainings, CLUB_KIND_LABELS, CLUB_KIND_HELP, clubValue, clubAverage } from '../js/club-share.js';
import { prepare, publicUrl, isNative } from '../js/native.js';
import { isStandalone } from '../js/install.js';
import { setClubAuto, clubAutoFor, dropClubAuto, autoShareClubs } from '../js/club-auto.js';
import { createStore, newPlayer, cleanName } from '../js/store.js';
import qrcode from '../js/vendor/qrcode.mjs';

await prepare();   // iPhone-app: duurzame kopie (op het web: niets)

const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (x, d = 2) => x == null ? '–' : Number(x).toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
const PREFS = 'okkie.club.v1';
const HIDDEN = 'okkie.club.verborgen';   // verbergen op dit toestel, per club: { clubId: [handle, ...] }
const REPORT_TO = 'info@denckh.nl';
// Uitnodigingslink en QR-code: landingspagina op okkiedarts.nl ("Je bent uitgenodigd voor …") met knop naar de app.
const INVITE_PAGE = 'https://okkiedarts.nl/club/uitnodiging/';
const ROLE = { admin: 'beheerder', captain: 'captain', member: 'lid' };
const leden = n => `${n} ${n === 1 ? 'lid' : 'leden'}`;
// "2026-11-08 22:00" → "zondag 8 november, 22:00"
const closeText = s => { const [d, t] = String(s).split(' '); const x = new Date(d + 'T12:00:00Z'); return Number.isFinite(x.getTime()) ? `${x.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}, ${t}` : s; };
const CONSENT_TEXT = 'Ik ben 16 jaar of ouder. Alleen leden van deze club zien mijn bijnaam, mijn gemiddelde van de laatste 4 weken, mijn resultaten bij clubtrainingen en de weekoefening en de trainingen die ik met de club deel (alleen wat ik zelf deel: per training, of automatisch als ik dat apart aanzet). Ik kan de club altijd verlaten; dan worden die gegevens gewist.';
const AUTO_HELP = 'Optioneel, staat standaard uit. Aan: na elke training gaat alleen de samenvatting naar de club (soort training, punten, aantal pijlen, hoogste beurt), ook trainingen die je gooit terwijl je op goedkeuring wacht of offline bent. Nooit losse pijlen, nooit trainingen van vóór het aanzetten. Uitzetten kan altijd in de club.';
// Starten vanuit de club: soorten die de app via ../#start= kan openen (js/app.js startFromLink).
const STARTABLE = ['score30', 'score60', 'score99', 'clock', 'bobs27', 'c121'];
const startLink = (kind, playerId) => `../#start=${encodeURIComponent(STARTABLE.includes(kind) || /^pijlen\d+$/.test(kind) ? kind : 'score30')}&speler=${encodeURIComponent(playerId)}`;
const startLabel = kind => STARTABLE.includes(kind) ? `Gooi de weekoefening: ${CLUB_KIND_LABELS[kind]}` : 'Start scoretraining (30 pijlen)';
// Welke training start de knop? Eerst een open clubtraining van de club zelf (scoretraining of rond de klok), anders de
// weekoefening als de club die heeft ingesteld, anders een gewone scoretraining.
const exStartKind = e => e.kind === 'clock' ? 'clock' : `pijlen${e.darts}`;
function startChoice(exercises, challenge) {
  const e = (exercises || []).find(x => x.open && x.canSubmit && (x.kind === 'score' || x.kind === 'clock'));
  if (e) return { kind: exStartKind(e), label: `Gooi de clubtraining: ${e.name}` };
  return { kind: challenge?.open ? challenge.kind : 'score30', label: startLabel(challenge?.open ? challenge.kind : null) };
}
// Posterpagina (A4/A5) om te printen of als pdf te bewaren. In de iPhone-app opent hij in Safari (printen en pdf).
const posterUrl = (code, club, direct, label = '') => (isNative() ? publicUrl('club/poster.html') : new URL('./poster.html', location.href).href) +
  '#' + new URLSearchParams({ code, club, ...(direct ? { direct: '1' } : {}), ...(label ? { label } : {}) }).toString();

function localData() {
  try { const d = JSON.parse(localStorage.getItem('oche.data') || 'null'); return d && Array.isArray(d.players) ? d : null; } catch { return null; }
}
const readJson = (k, f) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? f; } catch { return f; } };
const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privémodus */ } };

let data = localData();
const state = { playerId: '', clubs: null, club: null, tab: 'exercises', code: '' };
state.playerId = readJson(PREFS, {}).playerId && data?.players.some(p => p.id === readJson(PREFS, {}).playerId) ? readJson(PREFS, {}).playerId
  : (data?.players.find(p => p.id === data.activePlayerId) || data?.players[0])?.id || '';
const acct = () => getAccount(state.playerId);
const player = () => data?.players.find(p => p.id === state.playerId);
// Clubcode uit een QR-code of link: in het #-deel, gaat dus nooit naar een server.
const fromHash = location.hash.match(/club=([A-Za-z0-9-]{8,12})/)?.[1];
if (fromHash) { state.code = fromHash.toUpperCase().replace(/-/g, ''); history.replaceState(null, '', location.pathname + location.search); }

function status(msg = '', error = false) { const el = $('#status'); el.textContent = msg; el.classList.toggle('error', !!error); }
async function api(path, method = 'GET', payload = null, auth = true) {
  if (!navigator.onLine) throw new Error('Je bent offline. Je trainingen staan veilig op je telefoon; probeer het opnieuw als je internet hebt.');
  try { return await request(path, method, payload, auth ? acct()?.token : null); }
  catch (e) {
    if (e instanceof TypeError) throw new Error('Geen verbinding met OKKIE. Online. Controleer je internet en probeer het opnieuw.');
    if (e.status === 429) throw new Error('Even rustig aan: probeer het over een minuut opnieuw.');
    throw e;
  }
}
async function busy(btn, fn) {
  if (btn) btn.disabled = true;
  try { await fn(); } catch (e) { status(e.message, true); } finally { if (btn?.isConnected) btn.disabled = false; }
}
// ---------- clublogo ----------
// Standaardlogo: initialen van de club op een groene schijf (geen afbeelding nodig).
function defaultLogo(name) {
  const ini = String(name || '?').split(/\s+/).filter(w => /^[\p{L}\p{N}]/u.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
  return `<svg class="club-logo" viewBox="0 0 64 64" role="img" aria-label="Standaardlogo ${esc(name)}"><circle cx="32" cy="32" r="32" fill="#1f3b2a"/><text x="32" y="40" text-anchor="middle" font-size="22" font-weight="700" fill="#b8ff3c" font-family="system-ui,sans-serif">${esc(ini)}</text></svg>`;
}
const logoUrls = new Map();
async function loadLogo(clubId, version) {
  if (!version) return null;
  const key = clubId + '@' + version;
  if (logoUrls.has(key)) return logoUrls.get(key);
  const res = await fetch(API_BASE.replace(/\/$/, '') + `/v1/clubs/${clubId}/logo`, { headers: { Authorization: 'Bearer ' + acct()?.token }, cache: 'no-store' }).catch(() => null);
  if (!res?.ok) return null;
  const url = URL.createObjectURL(await res.blob());
  logoUrls.set(key, url);
  return url;
}
// Alleen JPG/PNG tot 1 MB; verkleinen en vierkant bijsnijden naar 256 × 256 in de browser. Opnieuw opslaan als JPEG
// haalt ook EXIF/GPS-gegevens weg (zoals bouwsteen B71).
async function squareLogo(file) {
  if (!['image/jpeg', 'image/png'].includes(file.type)) throw new Error('Kies een JPG- of PNG-afbeelding.');
  if (file.size > 1_000_000) throw new Error('Deze afbeelding is groter dan 1 MB. Kies een kleinere.');
  const img = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => { throw new Error('Deze afbeelding kan niet worden gelezen.'); });
  const s = Math.min(img.width, img.height), size = 256;
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);   // doorzichtige PNG: witte achtergrond
  ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
  return new Promise((ok, fail) => c.toBlob(b => b ? ok(b) : fail(new Error('Verkleinen is niet gelukt.')), 'image/jpeg', 0.85));
}
async function uploadLogo(clubId, blob) {
  const res = await fetch(API_BASE.replace(/\/$/, '') + `/v1/clubs/${clubId}/logo`, { method: 'PUT', headers: { Authorization: 'Bearer ' + acct()?.token, 'Content-Type': 'image/jpeg' }, body: blob });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Uploaden is niet gelukt.');
}
const reportClubLink = club => 'mailto:' + REPORT_TO + '?subject=' + encodeURIComponent('Melding OKKIE. Club: clubnaam of logo') +
  '&body=' + encodeURIComponent(`Ik meld de naam of het logo van een club in OKKIE. Club:\n\nClub: ${club.name}\nClubcode-ID: ${club.id}\n\nWaarom (bijv. ongepaste naam of afbeelding):\n`);

// ---------- clubtrainingen ----------
const reportExerciseLink = (club, e) => 'mailto:' + REPORT_TO + '?subject=' + encodeURIComponent('Melding OKKIE. Club: clubtraining') +
  '&body=' + encodeURIComponent(`Ik meld een clubtraining in OKKIE. Club:\n\nClub: ${club.name}\nClub-ID: ${club.id}\nTraining: ${e.name}\n\nWaarom:\n`);
const EX_KIND = { score: 'Scoretraining', clock: 'Rond de klok', target: 'Doel-oefening', checkout: 'Checkout-reeks' };
const dutchDate = d => new Date(d + 'T12:00:00Z').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
function exSettings(e) {
  if (e.kind === 'score') return `${e.darts} pijlen, zoveel mogelijk punten`;
  if (e.kind === 'clock') return '1 t/m 20 en de bull, zo min mogelijk pijlen';
  if (e.kind === 'target') return `${e.darts} pijlen op ${e.target === 'DB' ? 'de bull' : e.target === 'SB' ? '25' : e.target}, zoveel mogelijk raak`;
  return `Uitgooien: ${e.checkouts.join(', ')}`;
}
function exValue(e, r) {
  if (e.kind === 'score') return fmt(r.average);
  if (e.kind === 'clock') return `${r.value} pijlen`;
  return `${r.value}/${e.kind === 'target' ? e.darts : e.checkouts.length}`;
}
// Echte trainingen op deze telefoon die bij een score- of klokoefening passen.
function matchingTrainings(e) {
  const list = shareableTrainings(localData(), state.playerId, 60).filter(({ t }) => t.finishedAt.slice(0, 10) >= e.startsOn && t.finishedAt.slice(0, 10) <= e.endsOn);
  return list.filter(({ c }) => e.kind === 'clock' ? c.kind === 'clock' : c.kind !== 'clock' && c.kind !== 'bobs27' && c.kind !== 'c121' && c.darts === e.darts);
}
async function exercisesHtml() {
  const id = state.club.id;
  const r = await api(`/v1/clubs/${id}/exercises`);
  const cards = [];
  for (const e of r.exercises) {
    const d = await api(`/v1/clubs/${id}/exercises/${e.id}`);
    const hidden = hiddenFor(id);
    const rows = d.ranking.filter(x => !hidden.has(x.handle));
    let form = '';
    if (e.open && e.canSubmit) {
      if (e.kind === 'score' || e.kind === 'clock') {
        const m = matchingTrainings(e);
        form = m.length ? `<form class="share-row" data-ex="${esc(e.id)}"><label class="field">Training op deze telefoon<select name="training">${m.map(({ t, c }) =>
          `<option value="${esc(t.id)}">${esc(String(t.finishedAt).slice(0, 10))} · ${c.kind === 'clock' ? `${c.darts} pijlen` : fmt(clubAverage(c.points, c.darts))}</option>`).join('')}</select></label><button class="btn primary">Insturen</button></form>`
          : `<p class="help">Gooi in OKKIE. een ${e.kind === 'clock' ? 'training rond de klok' : `scoretraining van ${e.darts} pijlen (eigen aantal beurten: ${e.darts / 3})`}; daarna kun je hem hier insturen.</p>`;
      } else {
        const max = e.kind === 'target' ? e.darts : e.checkouts.length;
        form = `<form class="share-row" data-ex="${esc(e.id)}"><label class="field">${e.kind === 'target' ? `Aantal raak (van ${max})` : `Aantal uitgegooid (van ${max})`}<input name="hits" type="number" inputmode="numeric" min="0" max="${max}" required></label><button class="btn primary">Insturen</button></form>
          <p class="help">Zelf ingevoerd; in de ranglijst staat erbij dat het handmatig is.</p>`;
      }
    }
    cards.push(`<section class="card ex-card"><div class="ex-head"><h3>${esc(e.name)}</h3><span class="tag">${esc(EX_KIND[e.kind])}${e.teamName ? ' · ' + esc(e.teamName) : ''}</span></div>
      ${e.description ? `<p>${esc(e.description)}</p>` : ''}<p class="help">${esc(exSettings(e))} · ${esc(dutchDate(e.startsOn))} t/m ${esc(dutchDate(e.endsOn))} (22:00)${e.open ? '' : ' · gesloten'}</p>
      ${rows.length ? `<ol class="board">${rows.map(x => boardRow(x, exValue(e, x), x.manual ? 'zelf ingevoerd' : '')).join('')}</ol>` : '<p class="help">Nog geen resultaten.</p>'}
      <p class="help"><a href="${esc(reportExerciseLink(state.club.club, e))}" data-testid="report-exercise">Meld deze training</a> als de naam of uitleg ongepast is.</p>
      ${e.open && e.canSubmit && (e.kind === 'score' || e.kind === 'clock') ? `<p><a class="btn outline" href="${esc(startLink(exStartKind(e), state.playerId))}" data-testid="ex-start">Gooi deze training</a></p>` : ''}
      ${form}${e.canManage ? `<p><button class="btn danger" type="button" data-delex="${esc(e.id)}">Training verwijderen</button></p>` : ''}</section>`);
  }
  const teams = r.canCreate.teams === 'all' ? state.club.teams : state.club.teams.filter(t => r.canCreate.teams.includes(t.id));
  const canCreate = r.canCreate.club || teams.length;
  const today = new Date().toISOString().slice(0, 10), inWeek = new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10);
  const create = canCreate ? `<details class="card"${cards.length ? '' : ' open'}><summary><b>Nieuwe clubtraining</b></summary><form id="exercise">
      <p class="help">Jullie bepalen zelf de naam, de oefening, het aantal pijlen en hoe lang hij loopt. Elke clubtraining krijgt een eigen ranglijst.</p>
      <label class="field">Naam<input name="name" required maxlength="40" placeholder="Bijv. Dubbel 16 trainen"></label>
      <label class="field">Korte uitleg<textarea name="description" maxlength="200" rows="2" placeholder="Wat moeten de leden doen?"></textarea></label>
      <label class="field">Type<select name="kind"><option value="score">Scoretraining (eigen aantal pijlen)</option><option value="clock">Rond de klok</option><option value="target">Doel-oefening (pijlen op één vak)</option><option value="checkout">Checkout-reeks</option></select></label>
      <label class="field" data-for="score target">Aantal pijlen<input name="darts" type="number" min="3" max="300" step="3" value="30"></label>
      <label class="field" data-for="target">Doelvak<input name="target" value="D16" maxlength="3" placeholder="D16, T20, DB"></label>
      <label class="field" data-for="checkout">Uitgooiwaarden (komma's)<input name="checkouts" value="40, 81, 121" placeholder="40, 81, 121"></label>
      <div class="row"><label class="field">Start<input name="startsOn" type="date" value="${today}" required></label><label class="field">Einde<input name="endsOn" type="date" value="${inWeek}" required></label></div>
      <label class="field">Voor<select name="teamId">${r.canCreate.club ? '<option value="">De hele club</option>' : ''}${teams.map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></label>
      <button class="btn primary">Clubtraining toevoegen</button></form></details>` : '';
  const empty = `<section class="card" data-testid="no-exercises"><p class="help">${canCreate ? 'Er lopen nog geen clubtrainingen. Maak hieronder jullie eerste: jullie bepalen zelf hoe hij eruitziet.' : 'Er lopen nu geen clubtrainingen; de beheerder of je captain maakt ze. Je trainingen tellen wel mee in de feed en bij Vorm.'}</p></section>`;
  return autoHtml(r.exercises) + (cards.join('') || empty) + create + shareHtml();
}
function syncExerciseForm() {
  const f = $('#exercise'); if (!f) return;
  const k = f.elements.kind.value;
  // style.display i.p.v. hidden: de stijl van .field (display) zou het hidden-attribuut overschrijven.
  f.querySelectorAll('[data-for]').forEach(el => { el.style.display = el.dataset.for.split(' ').includes(k) ? '' : 'none'; });
}

const hiddenFor = clubId => new Set(readJson(HIDDEN, {})[clubId] || []);
function setHidden(clubId, set) { const all = readJson(HIDDEN, {}); if (set.size) all[clubId] = [...set].slice(-500); else delete all[clubId]; writeJson(HIDDEN, all); }
const reportLink = (club, r) => 'mailto:' + REPORT_TO + '?subject=' + encodeURIComponent('Melding OKKIE. Club: ' + r.handle) +
  '&body=' + encodeURIComponent(`Ik meld een clublid in OKKIE. Club:\n\nClub: ${club}\nNaam: ${r.nickname}\nProfielcode: ${r.handle}\n\nWaarom:\n`);

// ---------- schermen ----------
function playerPicker() {
  if (!data?.players?.length || data.players.length === 1) return data?.players?.length ? `<p class="muted small">Speler op deze telefoon: <b>${esc(player()?.name)}</b></p>` : '';
  return `<label class="field">Speler op deze telefoon<select id="player">${data.players.map(p => `<option value="${esc(p.id)}"${p.id === state.playerId ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>`;
}
function unavailable(text) { $('#vr').innerHTML = `<section class="card"><h2>OKKIE. Club</h2><p>${esc(text)}</p><p><a class="btn outline" href="../">Terug naar de app</a></p></section>`; }

function startView() {
  const mine = state.clubs || [];
  const noPlayers = !data?.players?.length;
  $('#vr').innerHTML = `${playerPicker()}
    ${mine.length ? `<section class="card"><h2>Mijn clubs</h2><ol class="board">${mine.map(c => `<li><span class="who"><b>${esc(c.name)}</b>
      <small>${c.status === 'pending' ? 'Wacht op de beheerder' : `${leden(c.members)} · ${ROLE[c.role]}`}</small></span><span></span>
      ${c.status === 'pending' ? `<button class="btn outline" type="button" data-cancel="${esc(c.id)}">Intrekken</button>` : `<button class="btn primary" type="button" data-open="${esc(c.id)}">Openen</button>`}</li>`).join('')}</ol></section>` : ''}
    <section class="card"><h2>${mine.length ? 'Nog een club?' : 'Speel mee met je club'}</h2>
      <p class="help">Scan de QR-code bij het dartbord van je club met de camera van je telefoon. Geen QR-code bij de hand? Vul de clubcode in.</p>
      <form id="code" class="row"><label class="field">Clubcode<input name="code" required autocomplete="off" autocapitalize="characters" maxlength="12" value="${esc(state.code)}" placeholder="Bijv. K7M2Q9RT"></label>
        <button class="btn primary">Verder</button></form></section>
    <details class="card"${mine.length ? '' : ' open'}><summary><b>Gratis een club oprichten</b></summary>
      <form id="create"><p class="help">Voor je dartvereniging, kantine, café of team. Jij wordt beheerder: je krijgt een QR-code om bij het bord te hangen, maakt jullie eigen clubtrainingen en houdt overzicht over de leden. Gratis.</p>
        <label class="field">Naam van de club<input name="name" required maxlength="40" placeholder="Bijv. DC De Roos"></label>
        ${noPlayers ? '<label class="field">Jouw naam of bijnaam<input name="player" required maxlength="24" autocomplete="nickname"></label>' : ''}
        <label class="check"><input type="checkbox" name="consent" required><span>${esc(CONSENT_TEXT)}</span></label>
        <button class="btn primary">Club oprichten</button></form></details>`;
}
// ---------- QR-code gescand: club herkennen → speler kiezen of maken → meedoen → gooien ----------
async function joinFlow() {
  let pv;
  try { pv = await api('/v1/clubs/preview', 'POST', { code: state.code }, false); }
  catch (e) { if (e.status === 404) return badCode(); throw e; }
  state.preview = pv;
  const name = pv.club.name, direct = !!pv.code?.direct, players = data?.players || [];
  const pick = players.length ? `<div class="who-list" role="radiogroup" aria-label="Wie gooit er?">${players.map(p => `<label class="pick"><input type="radio" name="who" value="${esc(p.id)}"${p.id === state.playerId ? ' checked' : ''}><span>${esc(p.name)}</span></label>`).join('')}
      <label class="pick"><input type="radio" name="who" value="new"><span>Nieuwe speler</span></label></div>
      <label class="field" data-newname style="display:none">Naam of bijnaam<input name="name" maxlength="24" autocomplete="nickname"></label>`
    : '<label class="field">Je naam of bijnaam<input name="name" required maxlength="24" autocomplete="nickname" placeholder="Zoals je club je kent"></label>';
  // In de browser (niet in de iPhone-app en niet als app op het beginscherm): de opslag van de browser staat los van
  // de app. Waarschuwen vóór er een tweede, losse speler ontstaat; nooit suggereren dat dat vanzelf samenkomt.
  const inBrowser = !isNative() && !isStandalone();
  const appNote = inBrowser ? `<section class="card app-note" data-testid="app-note"><h3>Gebruik je OKKIE. al als app?</h3>
      <p>Open dan <b>de app</b> op deze telefoon, kies <b>OKKIE. Club</b> en vul daar deze code in: <b class="club-code small-code">${esc(state.code)}</b></p>
      <p class="help">De browser en de app delen geen spelers of trainingen. Meedoen hier maakt een aparte speler in deze browser; die gaat niet vanzelf over naar de app.${players.length ? '' : ' Nog geen OKKIE.-app? Dan kun je hier gewoon meedoen.'}</p></section>` : '';
  $('#vr').innerHTML = `${players.length ? '' : appNote}<section class="card join-hero" data-testid="join-hero">
      <div class="eyebrow">${pv.code?.kind === 'personal' ? 'Je bent uitgenodigd voor' : 'Je speelt mee voor'}</div>
      <h2 class="join-club">${esc(name)}</h2>
      <p class="muted small">${leden(pv.club.members)}${pv.code?.label && pv.code.kind === 'board' ? ' · ' + esc(pv.code.label) : ''}</p>
      <ol class="join-steps"><li>Kies wie er gooit</li><li>Gooi je pijlen en tik je score in</li><li>Deel je score met de club: per training, of automatisch</li></ol>
      ${direct ? '' : '<p class="help">De beheerder laat nieuwe spelers eerst toe. Tot dan zie je de club nog niet.</p>'}</section>
    <form id="joinflow" class="card"><h3>${players.length ? 'Wie gooit er?' : 'Hoe heet je?'}</h3>${pick}
      <label class="check"><input type="checkbox" name="consent" required><span>${esc(CONSENT_TEXT)}</span></label>
      <label class="check auto-choice"><input type="checkbox" name="auto"><span><b>Ja, mijn trainingen tellen automatisch mee voor ${esc(name)}</b><small>${esc(AUTO_HELP)}</small></span></label>
      <button class="btn primary big">Meedoen met ${esc(name)}</button>
      <p class="help">Gratis, zonder reclame en zonder e-mailadres. Je trainingen blijven op je telefoon.</p></form>
    ${players.length ? appNote : ''}
    <p class="center"><button class="btn outline" type="button" data-other>Andere code of eigen club</button></p>`;
}
function badCode() {
  $('#vr').innerHTML = `<section class="card" data-testid="bad-code"><h2>Deze clubcode werkt niet (meer)</h2>
    <p>De club heeft waarschijnlijk een nieuwe QR-code gemaakt, of de persoonlijke uitnodiging is al gebruikt of verlopen. Vraag de beheerder om de nieuwe code.</p>
    <p class="row"><button class="btn primary" type="button" data-other>Code intypen</button> <a class="btn outline" href="../">Gewoon trainen</a></p></section>`;
}
// Na het meedoen: meteen gooien. De knop opent de juiste training in de app voor de gekozen speler.
async function joinedView(r, auto) {
  const active = r.status === 'active';
  let start = startChoice(null, null);
  if (active && r.club.id) {
    try {
      const [c, ex] = await Promise.all([api('/v1/clubs/' + r.club.id), api(`/v1/clubs/${r.club.id}/exercises`).catch(() => null)]);
      start = startChoice(ex?.exercises, c.thisWeek?.challenge);
    } catch { /* knop met scoretraining */ }
  }
  $('#vr').innerHTML = `<section class="card join-done" data-testid="join-done">
      <h2>${active ? `Je doet mee met ${esc(r.club.name)}!` : `Je aanmelding staat klaar bij ${esc(r.club.name)}`}</h2>
      <p>${active ? (auto ? 'Gooi een training: je score telt direct mee voor de club.' : 'Je bent lid. Automatisch meetellen staat uit: na een training kies je in de club zelf wat je deelt. Aanzetten kan bij Trainingen.')
        : 'De beheerder laat je zo snel mogelijk toe. ' + (auto ? 'Gooi gerust alvast: omdat je automatisch meetellen hebt aangezet, tellen je trainingen mee zodra je erin zit.' : 'Daarna kun je in de club trainingen delen of automatisch meetellen aanzetten.')}</p>
      <p><a class="btn primary big" href="${esc(startLink(start.kind, state.playerId))}" data-testid="start-training">${esc(active ? start.label : 'Start scoretraining (30 pijlen)')}</a></p>
      ${active && r.club.id ? `<p><button class="btn outline" type="button" data-open="${esc(r.club.id)}">Naar de club</button></p>` : `<p><button class="btn outline" type="button" data-home>Mijn clubs</button></p>`}</section>`;
}
// Nieuwe speler op deze telefoon, rechtstreeks in de opslag van de app (zelfde formaat en sleutel als js/app.js).
function addLocalPlayer(name) {
  const store = createStore(localStorage);
  const d = store.load().data;
  let p = d.players.find(x => x.name.toLowerCase() === name.toLowerCase());
  if (!p) { p = newPlayer(name, d.players.length); d.players.push(p); }
  d.activePlayerId = p.id;
  if (!store.save(d)) throw new Error('Opslaan op deze telefoon lukt niet. Staat privé surfen aan? Zet het uit en scan opnieuw.');
  data = d;
  return p.id;
}
// Account voor deze speler: bestaand (Darters of Mijn vrienden) of nieuw, altijd niet-openbaar.
async function ensureAccount(kind, code) {
  if (acct()?.token) return acct();
  const name = player()?.name || 'Speler';
  const body = { nickname: name.slice(0, 24), age: 'adult', [kind]: code };
  const r = await api('/v1/register', 'POST', body, false);
  upsertAccount(state.playerId, { id: r.account.id, handle: r.account.handle, nickname: r.account.nickname, token: r.token, recovery: r.recovery,
    enabled: true, groupsOnly: true, club: true, createdAt: new Date().toISOString() });
  return acct();
}
async function markClub() {
  const a = acct();
  if (a && !a.club) upsertAccount(state.playerId, { ...a, club: true, enabled: true, groupsOnly: a.groupsOnly ?? !a.enabled });
  // Weekcijfers voor de vormranglijst (alleen samenvattingen, zoals bij Darters).
  try { await syncAccount(localData(), state.playerId); } catch { /* volgt bij de volgende training */ }
}

async function openClub(id) {
  if (state.club?.id !== id) state.newInvite = null;
  // Wat nog niet mee was (offline gegooid, of gegooid terwijl je op goedkeuring wachtte) eerst versturen.
  if (clubAutoFor(state.playerId, id)?.on) await autoShareClubs(localData(), { send: request, token: pid => getAccount(pid)?.token }).catch(() => []);
  state.club = await api('/v1/clubs/' + id);
  state.club.id = id;
  renderClub();
}
function boardRow(r, value, sub = '') {
  return `<li class="${r.you ? 'you' : ''}"><span class="place">${r.rank ?? ''}</span><span class="who"><b>${esc(r.nickname)}${r.you ? ' (jij)' : ''}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="num">${value}</span></li>`;
}
function weekHtml(view) {
  const c = view.challenge;
  if (!c) return `<p class="help">Er is deze week geen weekoefening. ${state.club.club.role === 'admin' ? 'Instellen kan bij Beheer → Vaste weekoefening; nodig is het niet.' : 'Je trainingen tellen mee bij de clubtrainingen, in de feed en bij Vorm.'}</p>`;
  const hidden = hiddenFor(state.club.id);
  const rows = (view.ranking || []).filter(r => !hidden.has(r.handle));
  const value = r => clubValue(c.kind, r);
  const rec = view.record;
  return `<h3>${esc(CLUB_KIND_LABELS[c.kind])}</h3><p class="help">${c.open ? `Gooi hem wanneer het jou uitkomt; de ranglijst sluit ${esc(closeText(c.closesAt))}.` : 'Deze ranglijst is gesloten.'}
    ${esc(CLUB_KIND_HELP[c.kind] || 'Gemiddelde per 3 pijlen; je beste poging telt.')}${c.kind === 'bobs27' || c.kind === 'c121' ? ' Je resultaat komt uit de oefening in OKKIE.: speel hem en deel hem hieronder.' : ''}</p>
    ${rec ? `<p class="club-record" data-testid="club-record">Clubrecord ${esc(CLUB_KIND_LABELS[c.kind])}: <b>${esc(clubValue(c.kind, { darts: c.darts || rec.value, points: rec.value }))}</b> · ${esc(rec.nickname)}</p>` : ''}
    ${rows.length ? `<ol class="board">${rows.map(r => boardRow(r, value(r))).join('')}</ol>` : '<p class="help">Nog niemand heeft deze oefening gegooid. Jij als eerste?</p>'}
    ${hiddenNote(view.ranking || [])}`;
}
function hiddenNote(list) {
  const n = list.filter(r => hiddenFor(state.club.id).has(r.handle)).length;
  return n ? `<p class="help hidden-note">${n} verborgen op dit toestel. <button class="btn outline" type="button" data-unhide>Weer tonen</button></p>` : '';
}
async function tabBody() {
  const id = state.club.id, me = state.club.club;
  if (state.tab === 'week') {
    const prev = await api(`/v1/clubs/${id}/challenge?week=previous`);
    return `<section class="card">${weekHtml(state.club.thisWeek)}</section>${prev.challenge ? `<details class="card"><summary><b>Vorige week</b></summary>${weekHtml(prev)}</details>` : ''}`;
  }
  if (state.tab === 'form') {
    const r = await api(`/v1/clubs/${id}/form`);
    const hidden = hiddenFor(id);
    const rows = r.ranking.filter(x => !hidden.has(x.handle)).map((x, i) => ({ ...x, rank: x.average == null ? '' : i + 1 }));
    return `<section class="card"><h3>Vorm: laatste ${r.weeks} weken</h3><p class="help">Gemiddelde per 3 pijlen over alle trainingen van de laatste ${r.weeks} weken (vanaf 30 pijlen).</p>
      <ol class="board">${rows.map(x => boardRow(x, x.average == null ? '–' : fmt(x.average), `${x.sessions} training${x.sessions === 1 ? '' : 'en'}`)).join('')}</ol>${hiddenNote(r.ranking)}</section>`;
  }
  if (state.tab === 'feed') {
    const r = await api(`/v1/clubs/${id}/feed`);
    const hidden = hiddenFor(id);
    const items = r.feed.filter(f => !hidden.has(f.handle));
    return `<section class="card"><h3>Clubfeed</h3><p class="help">Trainingen die leden met de club delen (automatisch of zelf), van de laatste 14 dagen. Alleen zichtbaar voor leden van deze club.</p>
      ${items.length ? items.map(f => `<div class="feed-item"><span><b>${esc(f.nickname)}${f.you ? ' (jij)' : ''}</b><small>${esc(CLUB_KIND_LABELS[f.kind] || f.kind)} · ${esc(f.at.slice(0, 10))}</small></span>
        <span>${esc(clubValue(f.kind, f))}${f.you || me.role === 'admin' ? ` <button class="btn outline" type="button" data-unfeed="${esc(f.id)}" aria-label="Bericht verwijderen">✕</button>` : ''}</span></div>`).join('') : '<p class="help">Nog geen trainingen in de feed. Gooi een training: met automatisch meetellen aan staat hij hier meteen.</p>'}
      ${hiddenNote(r.feed)}</section>`;
  }
  if (state.tab === 'team') {
    const teams = state.club.teams.filter(t => me.role === 'admin' || t.captain === acct()?.handle);
    const parts = [];
    for (const t of teams) {
      const r = await api(`/v1/clubs/${id}/teams/${t.id}`);
      parts.push(`<section class="card"><h3>${esc(r.team.name)}</h3><p class="help">Vorm van de laatste ${r.weeks} weken${r.challenge ? ' en de weekoefening' : ''}. Checkout-percentages volgen later.</p>
        <ol class="board">${r.players.map(p => boardRow(p, p.average == null ? '–' : fmt(p.average), `${p.sessions} trainingen${r.challenge ? ` · weekoefening: ${p.thisWeek ? `${p.thisWeek.rank}e` : 'nog niet'}` : ''}`)).join('')}</ol></section>`);
    }
    return parts.join('') || '<section class="card"><p class="help">Je bent nog geen captain van een team.</p></section>';
  }
  if (state.tab === 'members') {
    const isAdmin = me.role === 'admin';
    const teamName = tid => state.club.teams.find(t => t.id === tid)?.name || '';
    const hidden = hiddenFor(id);
    return `<section class="card"><h3>Leden (${state.club.members.length})</h3><ol class="board">${state.club.members.map(m => `<li class="${m.you ? 'you' : ''}"><span class="who"><b>${esc(m.nickname)}${m.you ? ' (jij)' : ''}</b>
      <small>${ROLE[m.role]}${m.teamId ? ' · ' + esc(teamName(m.teamId)) : ''}${hidden.has(m.handle) ? ' · verborgen' : ''}</small></span><span></span>
      ${m.you ? '' : `<span><button class="btn outline" type="button" data-hide="${esc(m.handle)}">${hidden.has(m.handle) ? 'Tonen' : 'Verbergen'}</button>
        <a class="btn outline" href="${esc(reportLink(state.club.club.name, m))}">Melden</a>
        ${isAdmin ? `<select data-role="${esc(m.handle)}" aria-label="Rol van ${esc(m.nickname)}">${Object.entries(ROLE).map(([k, t]) => `<option value="${k}"${m.role === k ? ' selected' : ''}>${t}</option>`).join('')}</select>
        <select data-team="${esc(m.handle)}" aria-label="Team van ${esc(m.nickname)}"><option value="">Geen team</option>${state.club.teams.map(t => `<option value="${esc(t.id)}"${m.teamId === t.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
        <button class="btn danger" type="button" data-remove="${esc(m.handle)}">Verwijderen</button>` : ''}</span>`}</li>`).join('')}</ol>
      <p class="help">Verbergen geldt alleen op dit toestel. Ongepaste naam of verdachte score? Meld het; we kijken er binnen een paar dagen naar. De beheerder kan resultaten en leden verwijderen.</p>
      <p class="help">Ongepaste clubnaam of clublogo? <a href="${esc(reportClubLink(state.club.club))}" data-testid="report-club">Meld de clubnaam of het logo</a>.</p></section>
      <section class="card"><h3>Club verlaten</h3><p class="help">Je lidmaatschap, je weekresultaten en je berichten in de feed van deze club worden gewist. Je trainingen op deze telefoon blijven.</p>
        <button class="btn danger" type="button" data-leave>Club verlaten</button></section>`;
  }
  if (state.tab === 'exercises') return exercisesHtml();
  if (state.tab === 'admin') return adminHtml();
  return '';
}
// Automatisch meetellen (per speler op deze telefoon) + direct gooien.
function autoHtml(exercises) {
  const on = !!clubAutoFor(state.playerId, state.club.id)?.on;
  const start = startChoice(exercises, state.club.thisWeek.challenge);
  return `<section class="card auto-card" data-testid="auto-card"><label class="check"><input type="checkbox" id="auto"${on ? ' checked' : ''}>
      <span><b>Mijn trainingen tellen automatisch mee</b><small>${on ? 'Na elke training gaan je punten naar de clubfeed en naar elke clubtraining waar hij bij past. Alleen de samenvatting, nooit losse pijlen.' : 'Staat uit: je deelt alleen trainingen die je hieronder zelf instuurt.'}</small></span></label>
    <p><a class="btn primary" href="${esc(startLink(start.kind, state.playerId))}" data-testid="club-start">${esc(start.label)}</a></p></section>`;
}
function shareHtml() {
  const list = shareableTrainings(localData(), state.playerId, 7);
  const c = state.club.thisWeek.challenge;
  if (!list.length) return '<section class="card"><h3>Zelf een training insturen</h3><p class="help">Je hebt de afgelopen 7 dagen geen afgeronde training op deze telefoon. Gooi er een; met automatisch meetellen aan telt hij vanzelf mee.</p></section>';
  return `<details class="card"><summary><b>Zelf een training insturen</b></summary><p class="help">Voor trainingen van vóór je lidmaatschap, of als automatisch meetellen uit staat. Kies per training wat je met de club deelt. Alleen soort, punten (bij Bob's 27 de eindscore, bij 121 het hoogste doel), aantal pijlen en hoogste beurt gaan mee; nooit losse pijlen.</p>
    ${list.slice(0, 10).map(({ t, c: s }) => {
      const fits = c && c.open && c.kind === s.kind;
      return `<form class="share-row" data-share="${esc(t.id)}"><span><b>${esc(CLUB_KIND_LABELS[s.kind])}</b> <small class="muted">${esc(String(t.finishedAt).slice(0, 10))} · ${esc(clubValue(s.kind, s))}</small>
        <span class="opts"><label><input type="checkbox" name="feed"> In de clubfeed</label>${fits ? '<label><input type="checkbox" name="challenge" checked> Weekoefening</label>' : ''}</span></span>
        <button class="btn outline">Delen</button></form>`;
    }).join('')}</details>`;
}
function qrSvg(text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true, alt: 'QR-code met de clubcode' });
}
// ---------- uitnodigen: QR-code bij het bord en persoonlijke uitnodiging ----------
const inviteLink = code => INVITE_PAGE + '#club=' + code;
// Oudere server zonder codes-lijst: alleen de hoofdcode (met goedkeuring).
const allCodes = () => state.club.club.codes || [{ code: state.club.club.inviteCode, kind: 'board', label: '', direct: false, primary: true }];
const boardCodes = () => allCodes().filter(x => x.kind === 'board');
const expiry = s => { const d = new Date(String(s).replace(' ', 'T') + 'Z'); return Number.isFinite(d.getTime()) ? d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' }) : ''; };
function boardCard(k, main) {
  const name = state.club.club.name;
  return `<div class="board-code" data-testid="board-code">
    ${main ? '' : `<h4>${esc(k.label || 'Extra bordcode')}</h4>`}
    <div class="club-qr">${qrSvg(inviteLink(k.code))}</div><p class="club-code">${esc(k.code)}</p>
    <label class="check"><input type="checkbox" data-direct="${esc(k.code)}"${k.direct ? ' checked' : ''}><span><b>Nieuwe spelers direct toelaten</b>
      <small>${k.direct ? 'Aan: wie scant, doet meteen mee. Iedereen die de QR-code ziet, kan lid worden; verwijderen kan altijd bij Leden.' : 'Uit: jij laat elke nieuwe speler eerst toe bij Aanmeldingen. Hun trainingen tellen daarna alsnog mee.'}</small></span></label>
    <div class="row"><a class="btn primary" href="${esc(posterUrl(k.code, name, k.direct, main ? '' : k.label))}" target="_blank" rel="noopener" data-testid="poster-link">Poster afdrukken (A4/A5)</a>
      <button class="btn outline" type="button" data-sharelink="${esc(inviteLink(k.code))}" data-sharekind="board">Link delen</button>
      <button class="btn outline" type="button" data-renew="${esc(k.code)}">Nieuwe code maken</button>
      ${main ? '' : `<button class="btn danger" type="button" data-delcode="${esc(k.code)}">Verwijderen</button>`}</div></div>`;
}
function invitesHtml() {
  const boards = boardCodes(), main = boards.find(x => x.primary) || boards[0], extra = boards.filter(x => x !== main);
  const personal = allCodes().filter(x => x.kind === 'personal');
  const fresh = state.newInvite;
  const multi = !!state.club.club.codes;   // server met meerdere codes (sinds Club bij het bord)
  return `<section class="card" data-testid="invite-board"><h3>QR-code bij het bord</h3>
      <p class="help">Print deze QR-code en hang hem bij het dartbord, in de kantine of het clubhuis. Wie scant, kiest zijn naam en speelt meteen mee voor de club.</p>
      ${boardCard(main, true)}
      <p class="help">Nieuwe code maken? Dan werken de oude code en alle geprinte posters direct niet meer. Handig als de code op de verkeerde plek terecht is gekomen.</p>
      ${multi ? `<details><summary><b>Meer borden of groepen</b> ${extra.length ? `(${extra.length})` : ''}</summary>
        <p class="help">Een eigen QR-code per bord, ruimte of groep (bijvoorbeeld bovenzaal of jeugd). Iedereen komt in dezelfde club.</p>
        ${extra.map(k => boardCard(k, false)).join('')}
        <form id="newboard" class="row"><input name="label" maxlength="30" placeholder="Bijv. Bord 2 of Jeugd" aria-label="Naam van de extra QR-code"><button class="btn outline">Extra QR-code maken</button></form></details>` : ''}</section>
    ${multi ? `<section class="card" data-testid="invite-personal"><h3>Persoonlijke uitnodiging</h3>
      <p class="help">Voor één speler, bijvoorbeeld via WhatsApp. De link werkt één keer, is 14 dagen geldig en de speler is meteen lid, zonder goedkeuring.</p>
      ${fresh ? `<div class="invite-new" data-testid="invite-new"><p><b>Uitnodiging${fresh.label ? ' voor ' + esc(fresh.label) : ''}</b> · geldig tot ${esc(expiry(fresh.expiresAt))}</p>
        <div class="club-qr">${qrSvg(inviteLink(fresh.code))}</div><p class="club-code small-code">${esc(fresh.code)}</p>
        <p class="row"><button class="btn primary" type="button" data-sharelink="${esc(inviteLink(fresh.code))}" data-sharekind="personal">Uitnodiging delen</button></p></div>` : ''}
      <form id="newinvite" class="row"><input name="label" maxlength="30" placeholder="Voor wie? (optioneel)" aria-label="Voor wie is de uitnodiging?"><button class="btn primary">Uitnodiging maken</button></form>
      ${personal.length ? `<h4>Open uitnodigingen</h4><p class="help">De naam zie alleen jij als beheerder.</p><ol class="board invite-list">${personal.map(k => `<li><span class="who"><b>${esc(k.label || 'Zonder naam')}</b><small>${esc(k.code)} · geldig tot ${esc(expiry(k.expiresAt))}</small></span><span></span>
        <span><button class="btn outline" type="button" data-sharelink="${esc(inviteLink(k.code))}" data-sharekind="personal">Delen</button> <button class="btn danger" type="button" data-delcode="${esc(k.code)}">Intrekken</button></span></li>`).join('')}</ol>` : ''}</section>` : ''}`;
}
async function adminHtml() {
  const id = state.club.id, c = state.club.club;
  const reqs = (await api(`/v1/clubs/${id}/requests`)).requests;
  const next = await api(`/v1/clubs/${id}/challenge?week=next`);
  const kinds = Object.entries(CLUB_KIND_LABELS).filter(([k]) => k !== 'free');
  const logo = await loadLogo(id, c.logo);
  const reqHtml = `<section class="card"><h3>Aanmeldingen (${reqs.length})</h3>${reqs.length ? `<ol class="board">${reqs.map(r => `<li><span class="who"><b>${esc(r.nickname)}</b><small>aangevraagd ${esc(r.requestedAt)}</small></span><span></span>
      <span><button class="btn primary" type="button" data-approve="${esc(r.handle)}">Toelaten</button> <button class="btn outline" type="button" data-reject="${esc(r.handle)}">Afwijzen</button></span></li>`).join('')}</ol>` : `<p class="help">Geen nieuwe aanmeldingen. ${boardCodes().some(x => !x.direct) ? 'Wie de QR-code bij het bord scant, verschijnt hier.' : 'Je bordcode laat nieuwe spelers direct toe, dus hier komt niemand meer langs.'}</p>`}</section>`;
  return `${reqs.length ? reqHtml + invitesHtml() : invitesHtml() + reqHtml}
    <section class="card"><h3>Vaste weekoefening (optioneel)</h3>
      <p class="help">Niet nodig: bij Trainingen maken jullie eigen clubtrainingen en bepalen jullie alles zelf. Wil je daarnaast elke week een vaste oefening met een ranglijst die zondag 22:00 sluit, kies hem dan hier. Zonder keuze is er geen weekoefening.</p>
      <form id="challenge"><label class="field">Deze week<select name="kind">${state.club.thisWeek.challenge ? '' : '<option value="" selected>Geen weekoefening</option>'}${kinds.map(([k, t]) => `<option value="${k}"${state.club.thisWeek.challenge?.kind === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label><button class="btn primary">Opslaan</button></form>
      <form id="challenge-next"><label class="field">Volgende week<select name="kind">${next.challenge ? '' : '<option value="" selected>Geen weekoefening</option>'}${kinds.map(([k, t]) => `<option value="${k}"${next.challenge?.kind === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label><button class="btn outline">Klaarzetten</button></form>
      <p class="help">Als er al resultaten zijn, kan de oefening van deze week niet meer wijzigen. Een verdachte score verwijder je bij de ranglijst van deze week:</p>
      ${(state.club.thisWeek.ranking || []).map(r => `<button class="btn outline" type="button" data-unresult="${esc(r.handle)}">Resultaat ${esc(r.nickname)} verwijderen</button>`).join(' ')}</section>
    <section class="card"><h3>Clubprofiel</h3>
      <form id="profile" class="row"><label class="field">Clubnaam<input name="name" required maxlength="40" value="${esc(c.name)}"></label><button class="btn primary">Naam opslaan</button></form>
      <div class="logo-edit">${logo ? `<img class="club-logo" src="${esc(logo)}" alt="Logo van ${esc(c.name)}">` : defaultLogo(c.name)}
        <div><label class="btn outline file-btn">Logo kiezen<input type="file" id="logo-file" accept="image/jpeg,image/png" hidden></label>
        ${logo ? '<button class="btn outline" type="button" data-dellogo>Logo verwijderen</button>' : ''}
        <p class="help">JPG of PNG, hoogstens 1 MB. OKKIE. maakt het vierkant en klein (256 × 256). Alleen leden van de club zien het logo; zonder logo tonen we de initialen.</p></div></div></section>
    <section class="card"><h3>Teams</h3>${state.club.teams.length ? `<ol class="board">${state.club.teams.map(t => `<li><span class="who"><b>${esc(t.name)}</b><small>captain: ${esc(state.club.members.find(m => m.handle === t.captain)?.nickname || 'nog geen')}</small></span><span></span>
      <span><select data-captain="${esc(t.id)}" aria-label="Captain van ${esc(t.name)}"><option value="">Geen captain</option>${state.club.members.map(m => `<option value="${esc(m.handle)}"${t.captain === m.handle ? ' selected' : ''}>${esc(m.nickname)}</option>`).join('')}</select>
      <button class="btn danger" type="button" data-delteam="${esc(t.id)}">Verwijderen</button></span></li>`).join('')}</ol>` : '<p class="help">Nog geen teams.</p>'}
      <form id="team" class="row"><input name="name" required maxlength="40" placeholder="Naam van het team" aria-label="Naam van het team"><button class="btn outline">Team toevoegen</button></form></section>
    <section class="card"><h3>Club opheffen</h3><p class="help">Alle leden, teams, weekoefeningen, resultaten en berichten van deze club worden gewist.</p><button class="btn danger" type="button" data-delclub>Club opheffen</button></section>`;
}
async function renderClub() {
  const c = state.club.club;
  // Eigen clubtrainingen staan voorop. Het tabblad Weekoefening is er alleen als de club er een heeft ingesteld.
  const tabs = [['exercises', 'Trainingen'], ...(state.club.thisWeek?.challenge || state.tab === 'week' ? [['week', 'Weekoefening']] : []), ['form', 'Vorm'], ['feed', 'Feed'], ...(c.role !== 'member' ? [['team', 'Team']] : []), ['members', 'Leden'], ...(c.role === 'admin' ? [['admin', `Beheer${c.pending ? ` (${c.pending})` : ''}`]] : [])];
  if (!tabs.some(([k]) => k === state.tab)) state.tab = 'exercises';
  $('#vr').innerHTML = `<p><button class="back btn outline" type="button" data-home>← Mijn clubs</button></p>
    <header class="g-head club-head"><span id="club-logo">${defaultLogo(c.name)}</span><span><h2>${esc(c.name)}</h2><p class="muted small">${leden(state.club.members.length)} · jij bent ${ROLE[c.role]}</p></span></header>
    <div class="tabs" role="tablist" aria-label="Onderdelen">${tabs.map(([k, t]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${state.tab === k}">${t}</button>`).join('')}</div>
    <div role="tabpanel" id="panel"><p class="muted">Laden…</p></div>`;
  loadLogo(state.club.id, c.logo).then(url => { if (url && $('#club-logo')) $('#club-logo').innerHTML = `<img class="club-logo" src="${esc(url)}" alt="Logo van ${esc(c.name)}">`; });
  try { $('#panel').innerHTML = await tabBody(); syncExerciseForm(); } catch (e) { $('#panel').innerHTML = `<p class="help">${esc(e.message)}</p>`; }
}
async function home() {
  state.club = null;
  if (!acct()?.token) { state.clubs = []; return startView(); }
  try {
    state.clubs = (await api('/v1/clubs')).clubs;
    // Niet meer in de club (verwijderd, afgewezen of club opgeheven): niets meer automatisch versturen.
    for (const id of Object.keys(readJson('okkie.club.auto', {}).links?.[state.playerId] || {})) if (!state.clubs.some(c => c.id === id)) dropClubAuto(state.playerId, id);
  }
  catch (e) {
    if (e.status === 401) { dropAccount(state.playerId); state.clubs = []; status('Dit profiel is niet meer geldig op deze telefoon.', true); }
    else throw e;
  }
  startView();
}

// ---------- acties ----------
document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const id = state.club?.id, d = b.dataset;
  const after = async (msg, reload = true) => { status(msg); if (reload) await openClub(id); };
  if (d.open) busy(b, () => openClub(d.open));
  else if (d.other !== undefined) { state.code = ''; status(''); busy(b, home); }
  else if (d.home !== undefined) busy(b, home);
  // Trainingen, Weekoefening en Beheer altijd vers ophalen: in de kantine gooien anderen ondertussen door.
  else if (d.tab) { state.tab = d.tab; busy(b, ['exercises', 'week', 'admin', 'members'].includes(d.tab) ? () => openClub(id) : renderClub); }
  else if (d.cancel) busy(b, async () => { await api(`/v1/clubs/${d.cancel}/me`, 'DELETE'); dropClubAuto(state.playerId, d.cancel); status('Aanmelding ingetrokken.'); await home(); });
  else if (d.hide) { const s = hiddenFor(id); s.has(d.hide) ? s.delete(d.hide) : s.add(d.hide); setHidden(id, s); renderClub(); }
  else if (d.unhide !== undefined) { setHidden(id, new Set()); renderClub(); }
  else if (d.unfeed) busy(b, async () => { await api(`/v1/clubs/${id}/feed/${d.unfeed}`, 'DELETE'); await after('Bericht verwijderd.'); });
  else if (d.leave !== undefined) {
    if (!confirm('Club verlaten? Je weekresultaten en berichten in deze club worden gewist. Je trainingen op deze telefoon blijven.')) return;
    busy(b, async () => { await api(`/v1/clubs/${id}/me`, 'DELETE'); dropClubAuto(state.playerId, id); status('Je hebt de club verlaten; je clubgegevens zijn gewist.'); await home(); });
  }
  else if (d.approve || d.reject) busy(b, async () => { await api(`/v1/clubs/${id}/requests/${d.approve || d.reject}`, 'POST', { approve: !!d.approve }); await after(d.approve ? 'Lid toegelaten.' : 'Aanvraag afgewezen.'); });
  else if (d.remove) {
    if (!confirm('Dit lid uit de club verwijderen? Zijn resultaten en berichten in deze club worden gewist.')) return;
    busy(b, async () => { await api(`/v1/clubs/${id}/members/${d.remove}`, 'DELETE'); await after('Lid verwijderd.'); });
  }
  else if (d.renew) {
    if (!confirm('Nieuwe code maken? De oude code en alle geprinte QR-posters werken dan direct niet meer. Print daarna de nieuwe poster.')) return;
    // Oudere server zonder codes-routes: de route van 1.10.0 vernieuwt de hoofdcode.
    busy(b, async () => { await api(state.club.club.codes ? `/v1/clubs/${id}/codes/${d.renew}/renew` : `/v1/clubs/${id}/code`, 'POST'); await after('Nieuwe code gemaakt. De oude werkt niet meer; vervang de poster bij het bord.'); });
  }
  else if (d.delcode) {
    if (!confirm('Deze code ongeldig maken? Wie hem daarna scant of opent, kan er niet meer mee lid worden.')) return;
    busy(b, async () => { await api(`/v1/clubs/${id}/codes/${d.delcode}`, 'DELETE'); if (state.newInvite?.code === d.delcode) state.newInvite = null; await after('Code ongeldig gemaakt.'); });
  }
  else if (d.sharelink) busy(b, async () => {
    const name = state.club.club.name;
    const text = d.sharekind === 'personal' ? `Je bent uitgenodigd voor ${name} in OKKIE. Club. Deze link werkt één keer: ${d.sharelink}`
      : `Speel mee voor ${name} in OKKIE.: scan de QR-code bij het bord of open ${d.sharelink}`;
    if (navigator.share) await navigator.share({ text }).catch(() => {}); else { await navigator.clipboard?.writeText(text); status('Link gekopieerd.'); }
  });
  else if (d.unresult) busy(b, async () => { await api(`/v1/clubs/${id}/results/${d.unresult}`, 'DELETE'); await after('Resultaat verwijderd.'); });
  else if (d.dellogo !== undefined) busy(b, async () => { await api(`/v1/clubs/${id}/logo`, 'DELETE'); await after('Logo verwijderd.'); });
  else if (d.delex) {
    if (!confirm('Deze clubtraining verwijderen? De ranglijst ervan verdwijnt ook.')) return;
    busy(b, async () => { await api(`/v1/clubs/${id}/exercises/${d.delex}`, 'DELETE'); status('Clubtraining verwijderd.'); await renderClub(); });
  }
  else if (d.delteam) busy(b, async () => { await api(`/v1/clubs/${id}/teams/${d.delteam}`, 'DELETE'); await after('Team verwijderd.'); });
  else if (d.delclub !== undefined) {
    if (!confirm('Club opheffen? Alles van deze club wordt gewist, voor alle leden.')) return;
    busy(b, async () => { await api(`/v1/clubs/${id}`, 'DELETE'); dropClubAuto(state.playerId, id); status('Club opgeheven.'); await home(); });
  }
});
document.addEventListener('change', e => {
  const t = e.target, id = state.club?.id;
  if (t.name === 'kind' && t.form?.id === 'exercise') { syncExerciseForm(); return; }
  if (t.id === 'logo-file' && t.files?.[0]) {
    busy(null, async () => { await uploadLogo(id, await squareLogo(t.files[0])); status('Logo opgeslagen.'); await openClub(id); });
    return;
  }
  if (t.id === 'auto') {
    setClubAuto(state.playerId, id, { name: state.club.club.name, on: t.checked });
    status(t.checked ? 'Je trainingen tellen vanaf nu automatisch mee.' : 'Automatisch meetellen staat uit.');
    renderClub();
    return;
  }
  if (t.dataset.direct) {
    busy(null, async () => { await api(`/v1/clubs/${id}/codes/${t.dataset.direct}`, 'PATCH', { direct: t.checked }); status(t.checked ? 'Nieuwe spelers doen nu direct mee.' : 'Nieuwe spelers laat je nu eerst toe.'); await openClub(id); });
    return;
  }
  if (t.id === 'player') { state.playerId = t.value; writeJson(PREFS, { playerId: t.value }); busy(null, home); }
  else if (t.dataset.role) busy(null, async () => { await api(`/v1/clubs/${id}/members/${t.dataset.role}`, 'PATCH', { role: t.value }); status('Rol gewijzigd.'); await openClub(id); });
  else if (t.dataset.team !== undefined && t.matches('select[data-team]')) busy(null, async () => { await api(`/v1/clubs/${id}/members/${t.dataset.team}`, 'PATCH', { teamId: t.value || null }); status('Team gewijzigd.'); await openClub(id); });
  else if (t.dataset.captain) busy(null, async () => { await api(`/v1/clubs/${id}/teams/${t.dataset.captain}`, 'PATCH', { captain: t.value || null }); status('Captain gewijzigd.'); await openClub(id); });
});
document.addEventListener('change', e => {
  // QR-flow: "Nieuwe speler" gekozen → naamveld tonen.
  // style.display i.p.v. hidden: label.field heeft display:block en zou hidden overschrijven.
  if (e.target.name === 'who') { const n = $('[data-newname]'); if (n) { const show = e.target.value === 'new'; n.style.display = show ? '' : 'none'; if (show) n.querySelector('input').focus(); } }
});
document.addEventListener('submit', e => {
  const f = e.target, btn = f.querySelector('button'), id = state.club?.id;
  e.preventDefault();
  if (f.id === 'code') {
    state.code = f.elements.code.value.trim().toUpperCase().replace(/[\s-]/g, '');
    busy(btn, joinFlow);
  }
  else if (f.id === 'joinflow') busy(btn, async () => {
    if (!f.elements.consent.checked) throw new Error('Bevestig eerst dat je 16 jaar of ouder bent en wat je met de club deelt.');
    const who = f.elements.who?.value || 'new';
    if (who === 'new') {
      const name = cleanName(f.elements.name.value);
      if (!name) throw new Error('Vul je naam of bijnaam in.');
      state.playerId = addLocalPlayer(name);
    } else state.playerId = who;
    writeJson(PREFS, { playerId: state.playerId });
    await ensureAccount('clubCode', state.code);
    const r = await api('/v1/clubs/join', 'POST', { code: state.code, consent: true });
    await markClub();
    const auto = !!f.elements.auto.checked;
    if (r.club?.id) setClubAuto(state.playerId, r.club.id, { name: r.club.name, on: auto });
    state.code = '';
    status(r.already && r.status === 'active' ? `Je was al lid van ${r.club.name}.` : '');
    await joinedView(r, auto);
  });
  else if (f.id === 'create') busy(btn, async () => {
    if (!f.elements.consent.checked) throw new Error('Bevestig eerst wat je met de club deelt.');
    if (f.elements.player) {
      const name = cleanName(f.elements.player.value);
      if (!name) throw new Error('Vul je naam of bijnaam in.');
      state.playerId = addLocalPlayer(name);
      writeJson(PREFS, { playerId: state.playerId });
    }
    await ensureAccount('clubFounder', true);
    const r = await api('/v1/clubs', 'POST', { name: f.elements.name.value, consent: true });
    await markClub();
    status(`${r.club.name} is aangemaakt. Jij bent beheerder. Print de QR-code en hang hem bij het bord.`);
    state.tab = 'admin';
    await openClub(r.club.id);
  });
  else if (f.dataset.share) busy(btn, async () => {
    const item = shareableTrainings(localData(), state.playerId, 7).find(x => String(x.t.id) === f.dataset.share);
    const feed = !!f.elements.feed?.checked, challenge = !!f.elements.challenge?.checked;
    if (!item) throw new Error('Training niet gevonden.');
    if (!feed && !challenge) throw new Error('Kies of je de training in de feed en/of bij de weekoefening zet.');
    const r = await api(`/v1/clubs/${id}/trainings`, 'POST', { training: item.c, feed, challenge });
    status(r.challenge ? (r.challenge.best ? 'Gedeeld: dit is je beste resultaat van de week.' : 'Gedeeld; je eerdere resultaat deze week was beter en blijft staan.') : 'Gedeeld in de clubfeed.');
    await openClub(id);
  });
  else if (f.id === 'challenge' || f.id === 'challenge-next') busy(btn, async () => {
    if (!f.elements.kind.value) return status('Er is geen weekoefening ingesteld. Dat is prima: jullie eigen clubtrainingen staan bij Trainingen.');
    await api(`/v1/clubs/${id}/challenge`, 'PUT', { kind: f.elements.kind.value, ...(f.id === 'challenge-next' ? { week: 'next' } : {}) });
    status('Weekoefening opgeslagen.'); await openClub(id);
  });
  else if (f.id === 'profile') busy(btn, async () => { await api(`/v1/clubs/${id}`, 'PATCH', { name: f.elements.name.value }); status('Clubnaam opgeslagen.'); await openClub(id); });
  else if (f.id === 'exercise') busy(btn, async () => {
    const el = f.elements, kind = el.kind.value;
    const body = { name: el.name.value, description: el.description.value, kind, startsOn: el.startsOn.value, endsOn: el.endsOn.value, teamId: el.teamId.value || null };
    if (kind === 'score' || kind === 'target') body.darts = Number(el.darts.value);
    if (kind === 'target') body.target = el.target.value.trim().toUpperCase();
    if (kind === 'checkout') body.checkouts = el.checkouts.value.split(/[,;\s]+/).filter(Boolean).map(Number);
    await api(`/v1/clubs/${id}/exercises`, 'POST', body);
    status('Clubtraining toegevoegd; de leden zien hem bij Trainingen.'); await renderClub();
  });
  else if (f.dataset.ex) busy(btn, async () => {
    const r = await api(`/v1/clubs/${id}/exercises/${f.dataset.ex}`);
    const e = r.exercise;
    let body;
    if (f.elements.hits) body = { hits: Number(f.elements.hits.value) };
    else {
      const m = matchingTrainings(e).find(x => String(x.t.id) === f.elements.training.value);
      if (!m) throw new Error('Training niet gevonden.');
      body = { trainingId: m.c.trainingId, darts: m.c.darts, points: m.c.points };
    }
    const res = await api(`/v1/clubs/${id}/exercises/${f.dataset.ex}/results`, 'POST', body);
    status(res.best ? 'Ingestuurd: dit is je beste resultaat.' : 'Ingestuurd; je eerdere resultaat was beter en blijft staan.'); await renderClub();
  });
  else if (f.id === 'newinvite') busy(btn, async () => {
    const r = await api(`/v1/clubs/${id}/codes`, 'POST', { kind: 'personal', label: f.elements.label.value });
    state.newInvite = r.code;
    status('Uitnodiging gemaakt. Deel hem met de speler; hij werkt één keer.');
    await openClub(id);
  });
  else if (f.id === 'newboard') busy(btn, async () => {
    await api(`/v1/clubs/${id}/codes`, 'POST', { kind: 'board', label: f.elements.label.value });
    status('Extra QR-code gemaakt.'); await openClub(id);
  });
  else if (f.id === 'team') busy(btn, async () => { await api(`/v1/clubs/${id}/teams`, 'POST', { name: f.elements.name.value }); status('Team toegevoegd.'); await openClub(id); });
});

// ---------- start ----------
if (!CLUB_OPEN || !apiAvailable()) unavailable('OKKIE. Club is nog niet beschikbaar. We testen het eerst met een paar dartverenigingen.');
else if (state.code) busy(null, joinFlow);   // QR-code of link: meteen de club tonen, ook zonder speler op deze telefoon
else busy(null, home);
// Nog een QR-code of link geopend terwijl deze pagina al open staat (alleen het #-deel verandert): die club tonen.
addEventListener('hashchange', () => {
  const c = location.hash.match(/club=([A-Za-z0-9-]{8,12})/)?.[1];
  if (!c || !CLUB_OPEN || !apiAvailable()) return;
  state.code = c.toUpperCase().replace(/-/g, '');
  history.replaceState(null, '', location.pathname + location.search);
  status('');
  busy(null, joinFlow);
});
