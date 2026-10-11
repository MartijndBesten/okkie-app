// OKKIE. — beeldmerk, woordmerk en app-icoon als SVG. Eén bron voor app, website en iconen
// (tools/make-icons.mjs maakt hieruit icons/*.svg en *.png).
// OKKIE komt van "oche" (uitgesproken als okkie): de werplijn waar een darter achter staat.

export const TAGLINE = 'Gooi. Scoor. Word beter.';

// Kleuren van het merk. Op een licht thema worden ring, uitsparing en pijl via CSS-variabelen omgezet.
export const BRAND = { dark: '#07120d', green: '#0f3b27', lime: '#b8ff3c', flight: '#3ddc84', cream: '#f3eedf' };

// De O: twee limoenringen met een pijl in de roos; in de veer zit de ronde OKKIE.-stip.
// Tekenvlak 0..100. vars=true gebruikt CSS-variabelen (inline in de app), anders vaste kleuren.
export function markShapes({ vars = false, knock = BRAND.dark, small = false } = {}) {
  const ring = vars ? 'var(--logo-ring, #b8ff3c)' : BRAND.lime;
  const cut = vars ? 'var(--logo-knock, #07120d)' : knock;
  const dart = vars ? 'var(--logo-dart, #f3eedf)' : BRAND.cream;
  // Op 16-32 px: dikkere ringen en een eenvoudiger pijl, zodat hij herkenbaar blijft.
  const rw = small ? 13 : 10, iw = small ? 11 : 8;
  return `<circle cx="50" cy="50" r="${small ? 37.5 : 39}" fill="none" stroke="${ring}" stroke-width="${rw}"/>
  <circle cx="50" cy="50" r="${small ? 14 : 16}" fill="none" stroke="${ring}" stroke-width="${iw}"/>
  <g transform="rotate(-45 50 50)" stroke-linecap="round" stroke-linejoin="round">
    <path d="M52 50 H80" stroke="${cut}" stroke-width="${small ? 14 : 11}"/>
    <path d="M78 50 L85 40 L97 38 L92 50 L97 62 L85 60 Z" fill="${cut}" stroke="${cut}" stroke-width="${small ? 7 : 5}"/>
    ${small ? `<path d="M50 50 H80" stroke="${dart}" stroke-width="7"/>` : `<path d="M50 50 H59" stroke="${dart}" stroke-width="2.2"/>
    <path d="M59 50 H72" stroke="${dart}" stroke-width="7"/>
    <path d="M62.5 46.5 V53.5 M66 46.5 V53.5 M69.5 46.5 V53.5" stroke="${cut}" stroke-width="1.4"/>
    <path d="M72 50 H81" stroke="${dart}" stroke-width="3"/>`}
    <path d="M78 50 L85 40 L97 38 L92 50 L97 62 L85 60 Z" fill="${BRAND.flight}"/>
    ${small ? '' : `<circle cx="88" cy="50" r="3.6" fill="${BRAND.lime}"/>`}
  </g>`;
}

// Losse O als bestand (icons/okkie-o.svg, website).
export function markSVG({ size } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${size ? ` width="${size}" height="${size}"` : ''} role="img" aria-label="O">
<title>O van OKKIE.: twee ringen met een pijl in de roos; in de veer zit de punt van OKKIE.</title>
${markShapes()}
</svg>`;
}

// "KKIE" als vectorpad (Inter Display Black Italic, SIL Open Font License): overal gelijk, zonder lettertype.
const KKIE = 'M-0.34 72H19.76L22.52 55.28L33.83 43.78L46.1 72H67.94L48.27 30.93L78.52 0H54.51L37.11 18.51C33.68 22.18 30.25 25.8 26.82 29.48L29.14 15.46L31.7 0H11.6Z M70.81 72H90.91L93.66 55.28L104.97 43.78L117.24 72H139.09L119.42 30.93L149.67 0H125.65L108.26 18.51C104.83 22.18 101.39 25.8 97.96 29.48L100.28 15.46L102.84 0H82.74Z M173.99 0H153.89L141.95 72H162.05Z M168.83 72H224.6L227.4 54.99H191.74L193.53 44.26H226.43L229.14 27.83H196.23L198.02 17.01H233.68L236.48 0H180.77Z';

// Woordmerk: O + KKIE + ronde stip. Tekenvlak 372 x 100.
export function logoSVG({ height = 40, mono = false, file = false } = {}) {
  const text = file ? BRAND.cream : mono ? 'currentColor' : 'var(--logo-text, #f3eedf)';
  const dot = file ? BRAND.lime : mono ? 'currentColor' : 'var(--logo-ring, #b8ff3c)';
  return `<svg ${file ? 'xmlns="http://www.w3.org/2000/svg" ' : ''}class="logo" height="${height}" viewBox="0 0 372 100" role="img" aria-label="OKKIE.">
  <g>${markShapes({ vars: !file })}</g>
  <path transform="translate(108 14)" fill="${text}" d="${KKIE}"/>
  <circle cx="358" cy="77" r="9.5" fill="${dot}"/>
</svg>`;
}

// App-icoon (vierkant, donkergroen vlak). maskable: extra veilige marge voor Android-maskers.
// small: vereenvoudigde O voor favicons (16-48 px).
export function iconSVG({ size = 512, maskable = false, rounded = true, small = false } = {}) {
  const rx = rounded && !maskable ? 112 : 0;
  const scale = maskable ? 3.1 : small ? 4.6 : 3.9; // O-breedte in px op 512
  const off = 256 - 50 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512"><defs>
  <linearGradient id="okbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#13482f"/><stop offset="1" stop-color="#06150e"/></linearGradient></defs>
  <rect width="512" height="512" rx="${rx}" fill="url(#okbg)"/>
  <g transform="translate(${off} ${off}) scale(${scale})">${markShapes({ knock: '#0b2a1c', small })}</g>
</svg>`;
}
