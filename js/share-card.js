// OKKIE. — Scorekaart om een training te delen (Uitslag → Deel je score). Wordt op het toestel getekend; er gaat
// niets naar een server. Bewust zonder naam: je deelt hem zelf, met wie je wilt.
import { logoSVG } from './brand.js';

const C = { bg: '#07120d', surface: '#10241a', line: '#254735', text: '#f3eedf', muted: '#a9b8ad', lime: '#b8ff3c', gold: '#ffc53d' };
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

function loadLogo() {
  return new Promise(ok => {
    const img = new Image();
    img.onload = () => ok(img); img.onerror = () => ok(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(logoSVG({ height: 100, file: true }));
  });
}
function round(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

// card: { title, value, unit, badge, tiles: [[label, value]...], date }
export async function drawScoreCard(card) {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.8, H * 0.32, 40, W * 0.8, H * 0.32, 700);
  glow.addColorStop(0, 'rgba(184,255,60,0.16)'); glow.addColorStop(1, 'rgba(184,255,60,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  const logo = await loadLogo();
  if (logo) ctx.drawImage(logo, (W - 372 * 0.9) / 2, 96, 372 * 0.9, 90);
  ctx.textAlign = 'center';
  ctx.fillStyle = C.muted; ctx.font = `700 40px ${FONT}`;
  ctx.fillText(card.title, W / 2, 300);
  ctx.fillStyle = C.lime; ctx.font = `italic 900 250px ${FONT}`;
  ctx.fillText(card.value, W / 2, 560);
  ctx.fillStyle = C.text; ctx.font = `600 42px ${FONT}`;
  ctx.fillText(card.unit, W / 2, 640);
  let y = 700;
  if (card.badge) {
    ctx.font = `800 38px ${FONT}`;
    const w = ctx.measureText(card.badge).width + 80;
    round(ctx, (W - w) / 2, y, w, 76, 38); ctx.fillStyle = 'rgba(255,197,61,0.16)'; ctx.fill();
    ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = C.gold; ctx.fillText(card.badge, W / 2, y + 51);
    y += 116;
  } else y += 40;
  const tiles = (card.tiles || []).slice(0, 3);
  const tw = (W - 120 - (tiles.length - 1) * 24) / Math.max(1, tiles.length);
  tiles.forEach(([label, value], i) => {
    const x = 60 + i * (tw + 24);
    round(ctx, x, y, tw, 190, 30); ctx.fillStyle = C.surface; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = C.muted; ctx.font = `600 32px ${FONT}`; ctx.fillText(label, x + tw / 2, y + 66);
    ctx.fillStyle = C.text; ctx.font = `800 70px ${FONT}`; ctx.fillText(String(value), x + tw / 2, y + 150);
  });
  ctx.fillStyle = C.muted; ctx.font = `500 32px ${FONT}`;
  if (card.date) ctx.fillText(card.date, W / 2, H - 200);
  round(ctx, 160, H - 150, W - 320, 92, 46); ctx.fillStyle = C.lime; ctx.fill();
  ctx.fillStyle = '#0b1a06'; ctx.font = `800 38px ${FONT}`;
  ctx.fillText('Train ook gratis · okkiedarts.nl', W / 2, H - 92);
  return new Promise((ok, no) => c.toBlob(b => (b ? ok(b) : no(new Error('Afbeelding maken lukt niet.'))), 'image/jpeg', 0.9));
}

// Delen via het deelmenu van de telefoon; lukt bestanden delen niet, dan bewaren als afbeelding.
export async function shareCard(blob, text, filename = 'okkie-score.jpg') {
  const file = new File([blob], filename, { type: 'image/jpeg' });
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try { await navigator.share({ files: [file], text }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  downloadCard(blob, filename);
  return 'downloaded';
}
export function downloadCard(blob, filename = 'okkie-score.jpg') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
