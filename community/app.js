// OKKIE. Darters. Iedereen ziet het overzicht; elke lokale speler zet met één schakelaar zelf delen aan of uit.
// Alleen samengevatte cijfers gaan online. Inlog- en herstelcodes blijven op dit toestel.
import { DARTERS_OPEN } from './config.js';
import { apiAvailable, getAccount, upsertAccount, dropAccount, publicSnapshots, syncAccount, request } from '../js/community-sync.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const fmt = (x, digits = 2) => Number(x || 0).toLocaleString('nl-NL', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const per3 = (points, darts) => darts ? points * 3 / darts : null;
function getLocalData() {
  try {
    const d = JSON.parse(localStorage.getItem('oche.data') || 'null');
    return d && Array.isArray(d.players) && Array.isArray(d.trainings) ? d : null;
  } catch { return null; }
}
let local = getLocalData();
let period = 'all';
let joining = null;          // speler-ID waarvoor het aanzetformulier open staat
let message = '', errorMessage = false;
const online = () => DARTERS_OPEN && apiAvailable();
function notify(msg, error = false) { message = msg; errorMessage = error; renderPlayers(); }

// ---------- Overzicht (voor iedereen) ----------
const best = (v, n) => v == null ? '–' : fmt(v / n, 1);
function renderBoard(result) {
  const rows = result?.ranking || [];
  if (!rows.length) {
    $('#rankings').innerHTML = '<div class="empty">Nog niemand deelt cijfers voor deze periode. Word de eerste!</div>';
    return;
  }
  $('#rankings').innerHTML = '<ol class="darters" data-testid="darters-list">' + rows.map((r, i) => {
    // Beste trainingen alleen tonen als ze er zijn (30/60/99 pijlen); alles staat ook in het profiel (tik op de naam).
    const bests = [[30, r.best30, 10], [60, r.best60, 20], [99, r.best99, 33]].filter(([, v]) => v != null).map(([n, v, t]) => 'beste ' + n + ' <b>' + best(v, t) + '</b>');
    return '<li><span class="d-rank">' + (i + 1) + '</span><button type="button" class="d-name" data-handle="' + esc(r.handle) + '">' + esc(r.nickname) + '</button>' +
      '<span class="d-avg" title="gemiddelde per 3 pijlen"><small>gem.</small> <strong>' + fmt(per3(r.points, r.darts)) + '</strong></span>' +
      '<span class="d-stats"><span><b>' + fmt(r.sessions, 0) + '</b> ' + (r.sessions === 1 ? 'training' : 'trainingen') + '</span><span>hoogste beurt <b>' + fmt(r.highestTurn, 0) + '</b></span>' +
      bests.map(x => '<span>' + x + '</span>').join('') + '</span></li>';
  }).join('') + '</ol><p class="help muted">Gemiddelde per 3 pijlen, vanaf 30 pijlen in deze periode. Iedereen voert zelf in; geen prijzen.</p>';
}
async function refreshBoard() {
  if (!online()) { $('#rankings').innerHTML = '<div class="empty">Darters is nu niet bereikbaar. Trainen in OKKIE. werkt gewoon.</div>'; return; }
  try { renderBoard(await request('/v1/leaderboard?period=' + period)); }
  catch (e) { $('#rankings').innerHTML = '<div class="empty">' + esc(e.message) + ' Probeer het later opnieuw; trainen werkt gewoon.</div>'; }
}
async function showProfile(handle) {
  if (!/^[a-z0-9]{12}$/.test(handle)) return;
  document.querySelector('#public-profile')?.remove();
  try {
    const r = await request('/v1/players/' + handle);
    const t = r.totals;
    const card = document.createElement('div');
    card.id = 'public-profile';
    card.className = 'player-view';
    card.innerHTML = '<h3>' + esc(r.player.nickname) + '</h3>' + (t ?
      '<div class="mini-stats"><div><span>Gemiddelde</span><b>' + fmt(per3(t.points, t.darts)) + '</b></div>' +
      '<div><span>Trainingen</span><b>' + fmt(t.sessions, 0) + '</b></div><div><span>Hoogste beurt</span><b>' + fmt(t.highestTurn, 0) + '</b></div>' +
      '<div><span>Beste 30 / 60 / 99</span><b>' + best(t.best30, 10) + ' / ' + best(t.best60, 20) + ' / ' + best(t.best99, 33) + '</b></div>' +
      '<div><span>100+ / 140+ / 180</span><b>' + fmt(t.hits100, 0) + ' / ' + fmt(t.hits140, 0) + ' / ' + fmt(t.hits180, 0) + '</b></div></div>' +
      (r.trend?.length ? '<p class="note">Laatste weken: ' + r.trend.slice(0, 6).reverse().map(w => esc(w.period.slice(-3)) + ' ' + fmt(per3(w.points, w.darts), 1)).join(' · ') + '</p>' : '')
      : '<p class="muted">Nog geen gedeelde training.</p>') +
      '<button type="button" class="action secondary" data-action="close-profile">Sluiten</button>';
    $('#rankings').append(card);
  } catch (e) { notify(e.message, true); }
}

function showDuplicateHint(form, nickname) {
  form.querySelector('.dup')?.remove();
  const box = document.createElement('div');
  box.className = 'dup status';
  box.setAttribute('role', 'alert');
  box.innerHTML = '<p><b>Er staat al een ‘' + esc(nickname) + '’ in Darters.</b> Ben jij dat, vanaf een andere telefoon of uit Safari? Zet dat profiel dan hier terug; dan ontstaat er geen tweede.</p>' +
    '<div class="d-buttons"><button class="action secondary" type="button" data-action="open-recover">Mijn profiel terugzetten</button></div>' +
    '<p class="note">Is het iemand anders? Kies dan liever een andere naam, of tik nog een keer op <b>Delen aanzetten</b> voor een nieuw profiel.</p>';
  form.querySelector('.d-buttons').before(box);
}

// ---------- Jouw spelers: één schakelaar per speler ----------
function playerBlock(p) {
  const acct = getAccount(p.id);
  const on = !!acct?.token && !acct.groupsOnly;
  const all = publicSnapshots(local, p.id).find(x => x.period === 'all');
  let body = '';
  if (joining === p.id) {
    body = '<form class="d-join" data-join="' + esc(p.id) + '">' +
      '<label>Naam in het overzicht<input name="nickname" minlength="2" maxlength="24" required value="' + esc(p.name) + '" autocomplete="nickname"></label>' +
      '<p class="help">Voornaam of bijnaam; gebruik geen achternaam.</p>' +
      '<fieldset><legend>Leeftijd</legend><label class="check"><input type="radio" name="age" value="adult" required><span>16 jaar of ouder</span></label>' +
      '<label class="check"><input type="radio" name="age" value="minor"><span>Jonger dan 16 <small>(eerst zegt een ouder of verzorger “ja” via een link)</small></span></label></fieldset>' +
      '<p class="help">Zichtbaar voor iedereen: deze naam, gemiddelde, aantal trainingen, hoogste beurt en beste 30/60/99. Nooit: losse pijlen of tijdstippen.</p>' +
      '<div class="d-buttons"><button class="action" type="submit">Delen aanzetten</button><button class="action secondary" type="button" data-action="cancel">Annuleren</button></div></form>';
  } else if (on && acct.waitingParent) {
    body = '<p class="status pending">Wacht op toestemming van een ouder of verzorger. Tot dan is niets zichtbaar en bewaren we geen cijfers.</p>' +
      (acct.consentLink ? '<div class="d-buttons"><button class="action" type="button" data-action="share-parent" data-player="' + esc(p.id) + '">Stuur de link naar je ouder</button>' +
        '<button class="action secondary" type="button" data-action="copy-parent" data-player="' + esc(p.id) + '">Kopieer link</button></div>' : '') +
      '<button class="link" type="button" data-action="new-parent" data-player="' + esc(p.id) + '">Nieuwe link maken</button>';
  } else if (on) {
    body = '<p class="status">Zichtbaar als <b>' + esc(acct.nickname || p.name) + '</b>' + (all ? ' · ' + all.sessions + ' trainingen · gemiddelde ' + fmt(per3(all.points, all.darts)) : '') + '.</p>' +
      '<details class="recover"><summary>Naam wijzigen of andere telefoon</summary>' +
      '<form data-rename="' + esc(p.id) + '"><label>Naam in het overzicht<input name="nickname" minlength="2" maxlength="24" value="' + esc(acct.nickname || '') + '" required></label><button type="submit" class="action secondary">Opslaan</button></form>' +
      '<p class="note">Op een andere telefoon terugzetten kan met deze gegevens. Bewaar ze privé; terugzetten op een andere telefoon beëindigt de toegang op deze.</p>' +
      '<p class="account-code">Profiel: ' + esc(acct.handle) + '<br>Herstelcode: ' + esc(acct.recovery || '(niet op dit toestel)') + '</p>' +
      '<button type="button" class="action secondary" data-action="copy-recovery" data-player="' + esc(p.id) + '">Kopieer herstelgegevens</button></details>';
  } else if (acct?.groupsOnly) {
    body = '<p class="note">Deze speler had een besloten profiel uit Mijn vrienden. Dat blijft besloten en staat niet in Darters. Zet delen aan om zichtbaar te worden.</p>';
  }
  return '<div class="d-player" data-testid="darter-' + esc(p.id) + '"><div class="d-head"><b>' + esc(p.name) + '</b>' +
    '<label class="switch"><input type="checkbox" role="switch" data-toggle="' + esc(p.id) + '"' + (on || joining === p.id ? ' checked' : '') + '>' +
    '<span>Mijn statistieken delen met andere darters</span></label></div>' + body + '</div>';
}
function renderPlayers() {
  local = getLocalData();
  const root = $('#account');
  const note = message ? '<p class="status' + (errorMessage ? ' error' : '') + '" role="status">' + esc(message) + '</p>' : '';
  if (!local?.players?.length) { root.innerHTML = note + '<a class="btn primary" href="../">Maak eerst een speler aan in de app</a>'; return; }
  if (!online()) { root.innerHTML = note + '<p class="status pending">Delen kan nu niet: Darters is niet bereikbaar. Je trainingen blijven veilig op deze telefoon.</p>'; return; }
  root.innerHTML = note + local.players.map(playerBlock).join('') +
    '<details class="recover" id="recover-box"><summary>Al gedeeld op een andere telefoon, of twee keer in de lijst?</summary>' +
    '<p class="note">Sta je er twee keer in? Dan is er per ongeluk een tweede profiel gemaakt, bijvoorbeeld in Safari én in de app op je beginscherm. Open OKKIE. op de plek waar het profiel staat dat weg mag en zet daar bij Darters delen uit: dat profiel en de cijfers ervan verdwijnen dan. Je trainingen blijven gewoon bewaard. Het profiel van een andere telefoon hierheen halen kan hieronder, met de profiel- en herstelcode van die telefoon.</p><form id="recover">' +
    '<label>Speler op deze telefoon<select name="player">' + local.players.map(p => '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>').join('') + '</select></label>' +
    '<label>Profielcode (12 tekens)<input name="handle" minlength="12" maxlength="12" required autocomplete="off"></label>' +
    '<label>Herstelcode<input name="recovery" minlength="64" maxlength="64" required autocomplete="off"></label>' +
    '<button class="action secondary" type="submit">Terugzetten</button></form></details>';
}
const parentUrl = token => location.origin + location.pathname + '#ouder=' + token;
async function shareParent(acct) {
  const text = `Mag ${acct.nickname} zijn of haar dartscores delen in OKKIE. Darters? Bekijk het en geef toestemming: ${acct.consentLink}`;
  if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* geannuleerd */ } }
  location.href = 'https://wa.me/?text=' + encodeURIComponent(text);
}
// Wacht een kind op toestemming? Kijk of de ouder intussen "ja" heeft gezegd en verstuur dan de cijfers.
async function refreshWaiting() {
  for (const p of local?.players || []) {
    const acct = getAccount(p.id);
    if (!acct?.token || !acct.waitingParent) continue;
    try {
      const me = await request('/v1/me', 'GET', null, acct.token);
      if (me.enabled) { upsertAccount(p.id, { ...acct, waitingParent: false, consentLink: null }); await syncAccount(getLocalData(), p.id); message = acct.nickname + ' is nu zichtbaar in Darters.'; }
    } catch (e) { if (/Niet ingelogd/.test(e.message)) { dropAccount(p.id); message = 'Toestemming is ingetrokken; ' + p.name + ' deelt niet meer.'; } }
  }
  renderPlayers(); refreshBoard();
}

// ---------- Ouder of verzorger (link uit WhatsApp, zonder account) ----------
let parentToken = (location.hash.match(/ouder=([a-f0-9]{64})/) || [])[1];
if (parentToken) history.replaceState(null, '', location.pathname);
// De link kan ook binnenkomen terwijl deze pagina al open is (alleen het #-deel verandert).
addEventListener('hashchange', () => {
  const t = (location.hash.match(/ouder=([a-f0-9]{64})/) || [])[1];
  if (!t) return;
  parentToken = t; history.replaceState(null, '', location.pathname); renderParent();
});
async function renderParent() {
  const box = $('#parent');
  try {
    const c = await request('/v1/darters/consent/preview', 'POST', { token: parentToken });
    box.innerHTML = '<section class="card parent" data-testid="parent-view"><h2>Toestemming voor ' + esc(c.child) + '</h2>' +
      (c.confirmed ? '<p class="status">Je hebt toestemming gegeven. ' + esc(c.child) + ' staat in Darters.</p>' +
        '<button class="action danger" type="button" data-action="withdraw">Toestemming intrekken en alles online wissen</button>' :
        '<p><b>' + esc(c.child) + '</b> wil zijn of haar dartscores delen in OKKIE. Darters. Dat overzicht is voor iedereen te bekijken.</p>' +
        '<p>Zichtbaar: de naam “' + esc(c.child) + '”, gemiddelde, aantal trainingen, hoogste beurt en beste 30/60/99. Nooit zichtbaar: losse pijlen, tijdstippen, achternaam, foto’s of berichten. OKKIE. heeft geen chat.</p>' +
        '<label class="check"><input type="checkbox" id="is-parent"><span>Ik ben de ouder of verzorger</span></label>' +
        '<div class="d-buttons"><button class="action" type="button" data-action="confirm">Ik geef toestemming</button></div>' +
        '<p class="note">Je kunt later via deze link de toestemming intrekken; dan wissen we alles online. Link geldig tot ' + esc(new Date(c.expiresAt + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })) + '.</p>') +
      '<p class="note"><a href="https://okkiedarts.nl/privacy/#darters" target="_blank" rel="noopener">Privacyverklaring</a></p></section>';
  } catch (e) { box.innerHTML = '<section class="card parent"><h2>Deze link werkt niet meer</h2><p>' + esc(e.message) + '</p></section>'; }
}

// ---------- Acties ----------
document.addEventListener('click', async e => {
  const tab = e.target.closest('[data-period]');
  if (tab) {
    period = tab.dataset.period;
    document.querySelectorAll('[data-period]').forEach(x => x.classList.toggle('active', x === tab));
    return refreshBoard();
  }
  const h = e.target.closest('[data-handle]');
  if (h) return showProfile(h.dataset.handle);
  const button = e.target.closest('[data-action]');
  if (!button) return;
  const act = button.dataset.action, pid = button.dataset.player;
  const acct = pid ? getAccount(pid) : null;
  try {
    button.disabled = true;
    if (act === 'close-profile') document.querySelector('#public-profile')?.remove();
    else if (act === 'cancel') { joining = null; renderPlayers(); }
    else if (act === 'open-recover') { const d = document.getElementById('recover-box'); if (d) { d.open = true; d.scrollIntoView({ block: 'center' }); d.querySelector('input[name=handle]')?.focus(); } }
    else if (act === 'copy-recovery' && acct) { await navigator.clipboard.writeText('OKKIE-profiel: ' + acct.handle + '\nHerstelcode: ' + acct.recovery); notify('Herstelgegevens gekopieerd. Bewaar ze privé.'); }
    else if (act === 'share-parent' && acct) await shareParent(acct);
    else if (act === 'copy-parent' && acct) { await navigator.clipboard.writeText(acct.consentLink); notify('Link gekopieerd. Stuur hem naar je ouder of verzorger.'); }
    else if (act === 'new-parent' && acct) {
      const r = await request('/v1/darters/consent/request', 'POST', {}, acct.token);
      if (r.confirmed) return refreshWaiting();
      upsertAccount(pid, { ...acct, consentLink: parentUrl(r.consentToken) }); notify('Nieuwe link gemaakt (7 dagen geldig).');
    } else if (act === 'confirm') {
      if (!$('#is-parent')?.checked) throw new Error('Vink eerst aan dat je de ouder of verzorger bent.');
      await request('/v1/darters/consent/confirm', 'POST', { token: parentToken, parent: true }); await renderParent(); refreshBoard();
    } else if (act === 'withdraw') {
      if (!confirm('Toestemming intrekken? Het profiel en alle gedeelde cijfers worden online gewist. De trainingen op de telefoon blijven.')) return;
      await request('/v1/darters/consent/withdraw', 'POST', { token: parentToken });
      $('#parent').innerHTML = '<section class="card parent"><h2>Toestemming ingetrokken</h2><p>Alles is online gewist. De trainingen op de telefoon van je kind blijven bewaard.</p></section>';
      refreshBoard();
    }
  } catch (err) { notify(err.message, true); }
  finally { if (button.isConnected) button.disabled = false; }
});
document.addEventListener('change', async e => {
  const pid = e.target.dataset?.toggle;
  if (!pid) return;
  const acct = getAccount(pid);
  const on = !!acct?.token && !acct.groupsOnly;
  if (e.target.checked && !on) {
    if (acct?.groupsOnly) {
      // Oud besloten profiel: alleen na deze bewuste keuze zichtbaar maken (een kind eerst met toestemming).
      try {
        const r = await request('/v1/me', 'PATCH', { enabled: true }, acct.token);
        upsertAccount(pid, { ...acct, groupsOnly: false, enabled: r.enabled });
        await syncAccount(getLocalData(), pid); notify('Delen staat aan.'); refreshBoard();
      } catch (err) {
        if (/ouder of verzorger/.test(err.message)) {
          const r = await request('/v1/darters/consent/request', 'POST', {}, acct.token);
          upsertAccount(pid, { ...acct, groupsOnly: false, waitingParent: true, consentLink: parentUrl(r.consentToken) }); notify('Vraag nu een ouder of verzorger om toestemming.');
        } else notify(err.message, true);
      }
      return;
    }
    joining = pid; message = ''; renderPlayers();
    document.querySelector('[data-join] input[name=nickname]')?.focus();
  } else if (!e.target.checked && on) {
    if (!confirm('Delen uitzetten? Je verdwijnt meteen uit Darters en je gedeelde cijfers worden online gewist. Je trainingen op deze telefoon blijven.')) { e.target.checked = true; return; }
    try {
      await request('/v1/me', 'DELETE', null, acct.token);
      dropAccount(pid); notify('Delen staat uit. Je staat niet meer in Darters; je trainingen blijven op deze telefoon.'); refreshBoard();
    } catch (err) { e.target.checked = true; notify(err.message, true); }
  } else if (!e.target.checked && joining === pid) { joining = null; renderPlayers(); }
});
document.addEventListener('submit', async e => {
  const form = e.target;
  const fd = new FormData(form);
  if (!form.matches('[data-join], [data-rename], #recover')) return;
  e.preventDefault();
  const btn = form.querySelector('[type=submit]');
  if (btn) btn.disabled = true;
  try {
    if (form.dataset.join) {
      const pid = form.dataset.join;
      const age = fd.get('age');
      if (!age) throw new Error('Kies je leeftijd.');
      const nickname = String(fd.get('nickname') || '').trim().replace(/\s+/g, ' ');
      // Staat deze naam al in Darters? Dan is het vaak hetzelfde profiel van een andere telefoon of uit Safari.
      // Eerst vragen; terugzetten voorkomt een tweede profiel. Niets wordt samengevoegd of verwijderd.
      if (form.dataset.confirmed !== nickname.toLowerCase()) {
        let taken = false;
        try { taken = ((await request('/v1/leaderboard?period=all')).ranking || []).some(x => x.nickname.trim().toLowerCase() === nickname.toLowerCase()); } catch { /* offline: niet blokkeren */ }
        if (taken) { form.dataset.confirmed = nickname.toLowerCase(); showDuplicateHint(form, nickname); return; }
      }
      const r = await request('/v1/darters/join', 'POST', { nickname, age });
      upsertAccount(pid, { ...r.account, token: r.token, recovery: r.recovery, enabled: true, lastSync: null,
        waitingParent: !!r.needsParent, consentLink: r.consentToken ? parentUrl(r.consentToken) : null });
      joining = null;
      if (r.needsParent) { notify('Bijna klaar: stuur de link naar je ouder of verzorger. Tot die “ja” zegt, is niets zichtbaar.'); return; }
      await syncAccount(getLocalData(), pid);
      notify('Delen staat aan. Na elke training worden je cijfers vanzelf bijgewerkt.'); refreshBoard();
    } else if (form.dataset.rename) {
      const pid = form.dataset.rename, acct = getAccount(pid);
      const r = await request('/v1/me', 'PATCH', { nickname: String(fd.get('nickname') || '') }, acct.token);
      upsertAccount(pid, { ...acct, nickname: r.account.nickname }); notify('Naam aangepast.'); refreshBoard();
    } else {
      const pid = String(fd.get('player'));
      const r = await request('/v1/recover', 'POST', { handle: String(fd.get('handle') || '').trim(), recovery: String(fd.get('recovery') || '').trim() });
      upsertAccount(pid, { ...r.account, token: r.token, recovery: r.recovery, enabled: true, lastSync: null });
      notify('Je profiel staat nu op deze telefoon. Trainingen van je oude telefoon tellen niet automatisch mee; gebruik daarvoor een back-up of overzetcode.');
      refreshBoard();
    }
  } catch (err) { notify(err.message, true); }
  finally { if (btn?.isConnected) btn.disabled = false; }
});

// Op een andere telefoon delen uitgezet, of het profiel daar teruggezet? Dan staat het hier ook uit
// (de server kent dit toestel dan niet meer). De trainingen op deze telefoon blijven gewoon staan.
async function verifyAccounts() {
  if (!online()) return;
  let changed = false;
  for (const p of local?.players || []) {
    const acct = getAccount(p.id);
    if (!acct?.token || acct.waitingParent) continue;
    try { await request('/v1/me', 'GET', null, acct.token); }
    catch (e) {
      if (e.status !== 401) continue;
      dropAccount(p.id); changed = true;
      message = 'Delen staat uit voor ' + p.name + ': dat is op een andere telefoon uitgezet of het profiel staat nu daar. De trainingen op deze telefoon blijven.';
    }
  }
  if (changed) { renderPlayers(); refreshBoard(); }
}

if (parentToken) renderParent();
renderPlayers();
refreshBoard();
verifyAccounts();
if (online()) refreshWaiting();
