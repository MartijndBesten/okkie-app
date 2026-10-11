// OKKIE. Community. Nickname + vrijwillig openbaar gemaakte aggregaten.
// Geen externe trackers. Tokens en herstelcodes blijven lokaal op dit apparaat.
import { API_BASE, TURNSTILE_SITE_KEY, REGISTRATION_OPEN } from './config.js';
import { apiAvailable, getAccount, upsertAccount, dropAccount, publicSnapshots, syncAccount, request } from '../js/community-sync.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const fmt = (x, digits = 2) => Number(x || 0).toLocaleString('nl-NL', { minimumFractionDigits: digits, maximumFractionDigits: digits });
function getLocalData() {
  try {
    const d = JSON.parse(localStorage.getItem('oche.data') || 'null');
    return d && Array.isArray(d.players) && Array.isArray(d.trainings) ? d : null;
  } catch { return null; }
}
function activeLocalPlayer(data) {
  return data?.players?.find(p => p.id === data.activePlayerId) || data?.players?.[0] || null;
}
let local = getLocalData();
let playerId = activeLocalPlayer(local)?.id || '';
let period = 'week';
let turnstileToken = '';
let widgetId = null;
let lastResult = null;
let message = '';
let errorMessage = false;
let openProfile = null;

function notify(msg, error = false) { message = msg; errorMessage = error; renderAccount(); }
function publicScore(row) {
  return period === 'week' ? row.challenge30 === null ? null : row.challenge30 / 10 :
    row.darts ? (row.points * 3) / row.darts : null;
}
function renderBoard(result) {
  lastResult = result;
  const scores = $('#rankings');
  if (!result || !result.ranking?.length) {
    scores.innerHTML = '<div class="empty">Er zijn voor deze periode nog geen openbare scores. Word de eerste!</div>';
    return;
  }
  const items = result.ranking.map((row,i) => {
    const avg = publicScore(row);
    return '<tr><td class="rank-number">' + (i+1) + '</td><td><button type="button" data-handle="' + esc(row.handle) + '">' + esc(row.nickname) + '</button></td>' +
      '<td>' + (period === 'week' ? row.challenge30 == null ? '–' : fmt(row.challenge30,0) + ' pt' : fmt(row.points*3/row.darts)) + '</td>' +
      '<td>' + fmt(row.sessions,0) + '</td><td>' + (avg === null ? '–' : fmt(avg)) + '</td></tr>';
  }).join('');
  const col = period === 'week' ? 'Challenge' : 'Gemiddelde';
  scores.innerHTML = '<div style="overflow-x:auto"><table class="ranking"><thead><tr><th>#</th><th>Speler</th><th>' + col + '</th><th>Trainingen</th><th>3 pijlen</th></tr></thead><tbody>' + items + '</tbody></table></div>' +
    '<p class="help muted">' + esc(result.scoring) + '. Geen geldprijzen; uitslagen zijn op vertrouwen gebaseerd.</p>';
}
async function refreshLeaderboard() {
  if (!apiAvailable()) {
    $('#rankings').innerHTML = '<div class="empty">De publieke ranglijst wordt geactiveerd nadat de online database en privacy-instellingen klaar zijn. Trainen in OKKIE. werkt al gewoon.</div>';
    return;
  }
  $('#rankings').innerHTML = '<p class="muted">Ranglijst laden…</p>';
  try { renderBoard(await request('/v1/leaderboard?period=' + period)); }
  catch (e) { $('#rankings').innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
}
function localSelector() {
  if (!local?.players?.length) return '<p class="note">Maak eerst een speler aan in de OKKIE.-app op dit apparaat.</p>';
  return '<label for="localPlayer">Speler op deze telefoon</label><select id="localPlayer">' +
    local.players.map(p => '<option value="' + esc(p.id) + '"' + (p.id === playerId ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select>';
}
function renderAccount() {
  local = getLocalData();
  if (!local?.players?.some(p => p.id === playerId)) playerId = activeLocalPlayer(local)?.id || '';
  const root = $('#account');
  const prefix = localSelector();
  const note = message ? '<p class="status' + (errorMessage ? ' error' : '') + '" role="status">' + esc(message) + '</p>' : '';
  if (!playerId) {
    root.innerHTML = prefix + note + '<a class="btn primary" href="../">Maak eerst je spelersprofiel ↗</a>';
    return;
  }
  const acct = getAccount(playerId);
  if (!apiAvailable()) {
    root.innerHTML = prefix + note + '<p class="status pending">De online community is voorbereid maar nog niet verbonden met de database. Je bestaande trainingen blijven veilig lokaal.</p>' +
      '<p class="note">Zodra de beheerder de cloudservice activeert, kun je je nickname en te delen statistieken instellen.</p>';
    return;
  }
  if (!acct && !REGISTRATION_OPEN) {
    root.innerHTML = prefix + note +
      '<p class="status pending">Een openbaar profiel aanmaken kan nog niet. Eerst regelen we de privacyverklaring en toestemming van ouders voor spelers onder 16. De ranglijst kun je al bekijken; je trainingen blijven gewoon op deze telefoon.</p>';
    return;
  }
  if (!acct) {
    root.innerHTML = prefix + note +
      '<form id="join" class="recover"><label>Publieke nickname<input name="nickname" minlength="2" maxlength="24" placeholder="Bijv. Dartkoning" required autocomplete="nickname"></label>' +
      '<label class="check"><input type="checkbox" name="share" required><span>Ik geef toestemming om mijn nickname en samengevatte dartstatistieken openbaar te tonen. Mijn losse worpen en andere lokale spelers blijven privé.</span></label>' +
      '<label class="check"><input type="checkbox" name="age" required><span>Ik ben 16 jaar of ouder, of ik beheer deze speler als ouder/voogd met toestemming.</span></label>' +
      '<div id="turnstile-area"></div><button class="action" type="submit"' + (!TURNSTILE_SITE_KEY ? ' disabled' : '') + '>Maak openbaar profiel</button>' +
      (!TURNSTILE_SITE_KEY ? '<p class="note">Registratie is nog niet geactiveerd.</p>' : '') + '</form>' +
      '<div class="recover"><details><summary>Heb je al een profiel? Herstellen</summary><form id="recover">' +
      '<label>Profielcode (12 tekens)<input name="handle" minlength="12" maxlength="12" required autocomplete="off"></label>' +
      '<label>Geheime herstelcode<input name="recovery" minlength="64" maxlength="64" required autocomplete="off"></label>' +
      '<button class="action secondary" type="submit">Profiel herstellen</button></form></details></div>';
    if (TURNSTILE_SITE_KEY) startTurnstile();
    return;
  }
  const snapshots = publicSnapshots(local, playerId);
  const total = snapshots.find(x => x.period === 'all');
  const count = total?.sessions || 0;
  const avg = total?.darts ? fmt(total.points * 3 / total.darts) : '–';
  root.innerHTML = prefix + note +
    '<div class="player-view"><h3>' + esc(acct.nickname || acct.handle) + '</h3>' +
    '<p class="note">Profielcode: <strong>' + esc(acct.handle) + '</strong></p>' +
    '<p class="note">Status: <strong>' + (acct.enabled ? 'Openbaar' : 'Verborgen') + '</strong></p>' +
    '<div class="mini-stats"><div><span>Trainingen</span><b>' + count + '</b></div><div><span>Gemiddelde</span><b>' + avg + '</b></div></div></div>' +
    '<button type="button" class="action" data-action="sync">Publiceer huidige statistieken</button>' +
    '<p class="note">' + (acct.lastSync ? 'Laatst bijgewerkt: ' + esc(new Date(acct.lastSync).toLocaleString('nl-NL')) : 'Nog niet bijgewerkt') + '</p>' +
    '<button type="button" class="action secondary" data-action="visibility">' + (acct.enabled ? 'Profiel verbergen' : 'Profiel openbaar maken') + '</button>' +
    '<details class="recover"><summary>Nickname en herstelgegevens</summary>' +
    '<form id="rename"><label>Nieuwe nickname<input name="nickname" minlength="2" maxlength="24" value="' + esc(acct.nickname || '') + '" required></label><button type="submit" class="action secondary">Nickname wijzigen</button></form>' +
    '<p class="note">Bewaar de profielcode en herstelcode op een veilige plek. Daarmee kun je het profiel op een andere telefoon herstellen. Herstel vanaf een ander toestel beëindigt de oude toegang.</p>' +
    '<p class="account-code">Profiel: ' + esc(acct.handle) + '<br>Herstelcode: ' + esc(acct.recovery || '(niet op dit toestel beschikbaar)') + '</p>' +
    '<button type="button" class="action secondary" data-action="copy-recovery">Kopieer herstelgegevens</button>' +
    '<button type="button" class="action danger" data-action="delete">Verwijder mijn online profiel</button></details>';
}
async function startTurnstile() {
  const slot = $('#turnstile-area');
  if (!slot) return;
  turnstileToken = '';
  const render = () => {
    const dest = $('#turnstile-area');
    if (!dest || !window.turnstile) return;
    try { widgetId = window.turnstile.render(dest, { sitekey: TURNSTILE_SITE_KEY,
      callback: token => { turnstileToken = token; },
      'expired-callback': () => { turnstileToken = ''; } }); } catch { /* widget nog niet gereed */ }
  };
  if (window.turnstile) return render();
  if (document.querySelector('script[data-turnstile]')) return;
  const script = document.createElement('script');
  script.dataset.turnstile = '1';
  script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  script.async = true;
  script.onload = render;
  document.head.append(script);
}
async function showProfile(handle) {
  if (!/^[a-z0-9]{12}$/.test(handle)) return;
  const target = $('#rankings');
  if (!target) return;
  document.querySelector('#public-profile')?.remove();
  try {
    const r = await request('/v1/players/' + handle);
    const t = r.totals;
    const card = document.createElement('div');
    card.id = 'public-profile';
    card.className = 'player-view';
    card.innerHTML = '<h3>' + esc(r.player.nickname) + '</h3>' +
      (t ? '<div class="mini-stats"><div><span>Gemiddelde</span><b>' + fmt(t.darts ? t.points*3/t.darts : 0) + '</b></div>' +
        '<div><span>Scoretrainingen</span><b>' + fmt(t.sessions,0) + '</b></div>' +
        '<div><span>Hoogste beurt</span><b>' + fmt(t.highestTurn,0) + '</b></div>' +
        '<div><span>180 gegooid</span><b>' + fmt(t.hits180,0) + '</b></div></div>' :
        '<p class="muted">Nog geen openbare training</p>') +
      '<p class="note">Je ziet alleen gekozen openbare samenvattingen.</p>' +
      '<button type="button" class="action secondary" data-action="close-profile">Sluiten</button>';
    target.append(card);
  } catch (e) { notify(e.message,true); }
}
document.addEventListener('click', async e => {
  const tab = e.target.closest('[data-period]');
  if (tab) {
    period = tab.dataset.period;
    document.querySelectorAll('[data-period]').forEach(x => x.classList.toggle('active', x === tab));
    refreshLeaderboard();
    return;
  }
  const handle = e.target.closest('[data-handle]');
  if (handle) { showProfile(handle.dataset.handle); return; }
  const button = e.target.closest('[data-action]');
  if (!button) return;
  const acct = getAccount(playerId);
  if (button.dataset.action === 'close-profile') return document.querySelector('#public-profile')?.remove();
  if (!acct) return;
  try {
    button.disabled = true;
    if (button.dataset.action === 'sync') {
      await syncAccount(getLocalData(), playerId);
      message = 'Je openbare cijfers zijn bijgewerkt.';
    } else if (button.dataset.action === 'visibility') {
      const r = await request('/v1/me','PATCH',{ enabled: !acct.enabled },acct.token);
      upsertAccount(playerId,{ ...acct, enabled:r.enabled });
      message = r.enabled ? 'Je profiel is nu zichtbaar.' : 'Je profiel is verborgen.';
    } else if (button.dataset.action === 'copy-recovery') {
      await navigator.clipboard.writeText('OKKIE-profiel: ' + acct.handle + '\nHerstelcode: ' + acct.recovery);
      message = 'Herstelgegevens gekopieerd. Bewaar ze privé.';
    } else if (button.dataset.action === 'delete') {
      if (!confirm('Online profiel en alle gedeelde statistieken definitief verwijderen? Je lokale trainingen blijven bewaard.')) return;
      await request('/v1/me','DELETE',null,acct.token);
      dropAccount(playerId);
      message = 'Online profiel verwijderd. Lokale trainingen zijn behouden.';
    }
    errorMessage = false;
    renderAccount();
    refreshLeaderboard();
  } catch (err) { notify(err.message, true); }
  finally { button.disabled = false; }
});
document.addEventListener('change', e => {
  if (e.target.id === 'localPlayer') { playerId = e.target.value; message=''; renderAccount(); }
});
document.addEventListener('submit', async e => {
  const form = e.target;
  if (!['join','recover','rename'].includes(form.id)) return;
  e.preventDefault();
  if (!playerId) return;
  const current = getAccount(playerId);
  const fd = new FormData(form);
  try {
    if (form.id === 'join') {
      if (!turnstileToken) return notify('Voltooi eerst de anti-spamcontrole.',true);
      const r = await request('/v1/register','POST',{
        nickname: String(fd.get('nickname') || ''), share: fd.get('share') === 'on',
        ageConsent: fd.get('age') === 'on', turnstileToken
      });
      upsertAccount(playerId,{ ...r.account,token:r.token,recovery:r.recovery,enabled:true,lastSync:null });
      await syncAccount(getLocalData(), playerId);
      notify('Profiel aangemaakt. Bewaar de herstelcode via Nickname en herstelgegevens.');
      refreshLeaderboard();
    }
    if (form.id === 'recover') {
      const r = await request('/v1/recover','POST',{handle:String(fd.get('handle')||'').trim(),recovery:String(fd.get('recovery')||'').trim()});
      upsertAccount(playerId,{...r.account,token:r.token,recovery:r.recovery,enabled:r.enabled,lastSync:null});
      await syncAccount(getLocalData(),playerId);
      notify('Je profiel is hersteld op dit toestel.');
      refreshLeaderboard();
    }
    if (form.id === 'rename' && current) {
      const r = await request('/v1/me','PATCH',{ nickname:String(fd.get('nickname')||'') },current.token);
      upsertAccount(playerId,{...current,nickname:r.account.nickname});
      notify('Nickname aangepast.');
      refreshLeaderboard();
    }
  } catch (err) { notify(err.message,true); }
});
renderAccount();
refreshLeaderboard();
