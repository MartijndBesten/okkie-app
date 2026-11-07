// OKKIE. Club bij het bord: printbare poster (A4/A5) met clubnaam, QR-code, korte code en uitleg.
// Alles komt uit het #-deel van het adres (gaat naar geen enkele server); de QR-code wordt hier lokaal gemaakt.
// Zelfde link als in Beheer: okkiedarts.nl/club/uitnodiging/#club=CODE → "Speel mee" → de app.
import qrcode from '../js/vendor/qrcode.mjs';

export const INVITE_PAGE = 'https://okkiedarts.nl/club/uitnodiging/';
const CODE = /^[A-HJKMNP-Z2-9]{8}(?:[A-HJKMNP-Z2-9]{2})?$/;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// K7M2Q9RT → K7M2 Q9RT: makkelijker over te typen.
export const groupCode = code => code.replace(/(.{4})(?=.)/g, '$1 ');

export function posterHtml({ code, club, direct, label }) {
  const q = qrcode(0, 'Q');   // extra foutcorrectie: een poster in de kantine krijgt vlekken en kreukels
  q.addData(INVITE_PAGE + '#club=' + code);
  q.make();
  const qr = q.createSvgTag({ cellSize: 8, margin: 0, scalable: true, alt: `QR-code: speel mee voor ${club}` });
  return `<header class="band"><img src="../icons/logo.svg" alt="OKKIE." class="logo"><span>OKKIE. CLUB</span></header>
    <section class="body">
      <p class="kicker">Speel mee voor</p>
      <h2 class="club" data-testid="poster-club">${esc(club)}</h2>
      ${label ? `<p class="label">${esc(label)}</p>` : ''}
      <div class="qr" data-testid="poster-qr">${qr}</div>
      <p class="scan">Scan deze code en speel mee voor ${esc(club)}</p>
      <ol class="steps">
        <li><span><b>Scan</b> met de camera van je telefoon</span></li>
        <li><span><b>Kies je naam</b> en gooi je pijlen</span></li>
        <li><span><b>Deel je score met de club</b><small>Zet <i>automatisch meetellen</i> aan: je training en scores tellen direct mee voor de club.${direct ? '' : ' De beheerder laat nieuwe spelers eerst toe.'}</small></span></li>
      </ol>
      <p class="new">Nog geen OKKIE.? Scan en doe mee. <span>Gratis, zonder reclame, zonder account.</span></p>
      <p class="manual">Lukt scannen niet? Open <b>app.okkiedarts.nl/club</b> en vul de code in:<br><span class="code" data-testid="poster-code">${esc(groupCode(code))}</span></p>
    </section>
    <footer class="foot">Alleen leden van de club zien de clubranglijst · voor spelers van 16 jaar en ouder · okkiedarts.nl</footer>`;
}

export function readPosterHash(hash) {
  const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const code = (p.get('code') || '').toUpperCase().replace(/[\s-]/g, '');
  const club = (p.get('club') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!CODE.test(code) || club.length < 2) return null;
  return { code, club, direct: p.get('direct') === '1', label: (p.get('label') || '').trim().slice(0, 30) };
}

if (typeof document !== 'undefined') {
  const sheet = document.getElementById('sheet');
  const info = readPosterHash(location.hash);
  if (info) {
    sheet.innerHTML = posterHtml(info);
    document.title = `Clubposter ${info.club} — OKKIE. Club`;
  } else document.getElementById('print').disabled = true;
  const setFormat = f => {
    sheet.classList.toggle('a5', f === 'A5');
    sheet.classList.toggle('a4', f !== 'A5');
    document.getElementById('page-size').textContent = `@page { size: ${f === 'A5' ? 'A5' : 'A4'} portrait; margin: 0; }`;
  };
  document.querySelectorAll('input[name=format]').forEach(r => r.addEventListener('change', () => setFormat(r.value)));
  document.getElementById('print').addEventListener('click', () => window.print());
}
