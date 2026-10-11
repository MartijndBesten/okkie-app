// OKKIE. — Hulp & feedback (Meer → Hulp & feedback). Melding gaat naar de eigen OKKIE.-server (cloud/src/feedback.js);
// geen mailapp nodig. Mee gaan alleen: je bericht, eventueel je e-mailadres en schermafbeelding, en de technische
// gegevens die vooraf in het formulier staan. Nooit namen, trainingen, scores, tokens of codes.
import { request, apiAvailable } from './community-sync.js';

const ERR_KEY = 'okkie.errors';
export const FEEDBACK_MAIL = 'info@denckh.nl';

// Laatste foutmeldingen van deze sessie (max. 5), alleen op dit toestel. Ze gaan pas mee als je zelf iets instuurt.
const file = u => String(u || '').split(/[?#]/)[0].split('/').pop();
function remember(text) {
  try {
    const list = JSON.parse(sessionStorage.getItem(ERR_KEY) || '[]');
    list.push(String(text).replace(/https?:\/\/\S+/g, m => file(m)).slice(0, 300));
    sessionStorage.setItem(ERR_KEY, JSON.stringify(list.slice(-5)));
  } catch { /* geen opslag: niets bewaren */ }
}
export function captureErrors(win = window) {
  win.addEventListener('error', e => { if (e.message) remember(`${e.message} (${file(e.filename)}:${e.lineno || 0})`); });
  win.addEventListener('unhandledrejection', e => remember('Belofte mislukt: ' + (e.reason?.message || String(e.reason || ''))));
}
export function recentErrors() {
  try { return JSON.parse(sessionStorage.getItem(ERR_KEY) || '[]'); } catch { return []; }
}

export function deviceLabel(nav = navigator) {
  const ua = nav.userAgent || '';
  const device = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1) ? 'iPad'
    : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Onbekend toestel';
  const ios = ua.match(/OS (\d+)[_.](\d+)/), android = ua.match(/Android (\d+(?:\.\d+)?)/);
  const os = device === 'iPhone' || device === 'iPad' ? (ios ? `iOS ${ios[1]}.${ios[2]}` : '') : device === 'Android' && android ? `Android ${android[1]}` : '';
  const browser = /EdgA?\/|EdgiOS/.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /CriOS|Chrome\//.test(ua) ? 'Chrome'
    : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  return [device, os, browser].filter(Boolean).join(' · ');
}

// Precies wat er meegaat; dit wordt ook zo in het formulier getoond.
export function techInfo({ version, installed }) {
  return {
    version, device: deviceLabel(), installed: !!installed,
    display: `${Math.round(innerWidth)}×${Math.round(innerHeight)} @${Math.round((devicePixelRatio || 1) * 10) / 10}x`,
    lang: navigator.language || '', errors: recentErrors(),
  };
}

// Schermafbeelding verkleinen in de browser (max. 1280 px, JPEG): klein genoeg om te versturen, scherp genoeg om te lezen.
export async function shrinkImage(fileObj) {
  if (!fileObj || !/^image\//.test(fileObj.type)) throw new Error('Kies een afbeelding.');
  if (fileObj.size > 25 * 1024 * 1024) throw new Error('Deze afbeelding is te groot.');
  const url = URL.createObjectURL(fileObj);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('Deze afbeelding kan niet worden geopend.')); i.src = url; });
    for (const [max, q] of [[1280, .72], [1000, .62], [760, .55]]) {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale)); c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const data = c.toDataURL('image/jpeg', q);
      if (data.length <= 650_000) return data;
    }
    throw new Error('Deze afbeelding is te groot om te versturen.');
  } finally { URL.revokeObjectURL(url); }
}

export async function sendFeedback({ kind, message, contact, website, startedAt, screenshot, meta }) {
  if (!apiAvailable()) throw new Error('Versturen kan hier niet.');
  return request('/v1/feedback', 'POST', { kind, message, contact, website, elapsed: Date.now() - startedAt, screenshot: screenshot || null, meta });
}

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function feedbackPage(st, info) {
  if (st.sent) {
    return `<section class="card fb-done" role="status" data-testid="feedback-sent"><h3>Bedankt!</h3>
      <p>Je ${st.sent === 'idee' ? 'idee is' : 'melding is'} verstuurd naar Denckh., de maker van OKKIE.${st.contactGiven ? ' Als het nodig is, krijg je antwoord op het adres dat je opgaf.' : ''}</p>
      <button class="btn secondary" data-act="fb-again">Nog iets sturen</button></section>`;
  }
  const can = apiAvailable();
  const row = (k, v) => `<li><span>${k}</span><b>${esc(v)}</b></li>`;
  return `<section class="card">
      <p class="muted">Loopt er iets mis of heb je een idee om OKKIE. beter te maken? Laat het weten. Je hoeft geen mailapp te openen.</p>
      <form data-form="feedback" class="fb-form" novalidate>
        <div class="seg" role="radiogroup" aria-label="Soort bericht">
          <label class="chip ${st.kind === 'probleem' ? 'on' : ''}"><input type="radio" name="kind" value="probleem" ${st.kind === 'probleem' ? 'checked' : ''} data-input="fb-kind">Probleem melden</label>
          <label class="chip ${st.kind === 'idee' ? 'on' : ''}"><input type="radio" name="kind" value="idee" ${st.kind === 'idee' ? 'checked' : ''} data-input="fb-kind">Idee insturen</label>
        </div>
        <label for="fb-msg">${st.kind === 'idee' ? 'Wat is je idee?' : 'Wat ging er mis?'}</label>
        <textarea id="fb-msg" name="message" rows="5" maxlength="2000" required data-input="fb-text" placeholder="${st.kind === 'idee' ? 'Bijvoorbeeld: ik zou graag…' : 'Wat deed je, en wat gebeurde er?'}">${esc(st.message)}</textarea>
        <label for="fb-contact">E-mailadres <small class="muted">(mag leeg; alleen als je antwoord wilt)</small></label>
        <input id="fb-contact" name="contact" type="email" maxlength="120" autocomplete="email" inputmode="email" value="${esc(st.contact)}" data-input="fb-text">
        <div class="fb-shot">
          ${st.screenshot ? `<img src="${st.screenshot}" alt="Gekozen schermafbeelding"><button type="button" class="btn ghost small" data-act="fb-shot-remove">Weghalen</button>`
            : `<label class="btn secondary file">${'Schermafbeelding toevoegen'}<input type="file" accept="image/*" data-input="fb-shot" hidden></label><small class="muted">Mag, hoeft niet.</small>`}
        </div>
        <div class="hp" aria-hidden="true"><label>Laat dit leeg<input name="website" tabindex="-1" autocomplete="off"></label></div>
        <details class="fb-info"><summary>Dit sturen we mee</summary>
          <ul class="fb-meta">${row('App', 'OKKIE. ' + info.version)}${row('Toestel', info.device || 'onbekend')}${row('Als app geïnstalleerd', info.installed ? 'ja' : 'nee')}${row('Scherm', info.display)}${row('Taal', info.lang)}
            ${row('Recente foutmeldingen', info.errors.length ? info.errors.length : 'geen')}</ul>
          ${info.errors.length ? `<pre class="fb-errors">${esc(info.errors.join('\n'))}</pre>` : ''}
          <p class="muted small">Plus je bericht, en je e-mailadres en schermafbeelding als je die toevoegt. Geen namen, trainingen, scores of codes. We bewaren meldingen maximaal 180 dagen. Zie de <a href="https://okkiedarts.nl/privacy/#feedback" target="_blank" rel="noopener">privacyverklaring</a>.</p>
        </details>
        ${st.error ? `<p class="fb-error" role="alert">${esc(st.error)}</p>` : ''}
        ${can ? `<button class="btn primary big" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Versturen…' : 'Versturen'}</button>` : `<p class="note">Versturen kan op dit adres niet. Mail je bericht naar <a href="mailto:${FEEDBACK_MAIL}">${FEEDBACK_MAIL}</a>.</p>`}
      </form>
      <p class="muted small fb-mail" ${can ? '' : 'hidden'}>Liever mailen? <a href="mailto:${FEEDBACK_MAIL}?subject=${encodeURIComponent('OKKIE. ' + info.version)}">${FEEDBACK_MAIL}</a></p>
    </section>`;
}
