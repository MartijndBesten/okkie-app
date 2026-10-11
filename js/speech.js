// OKKIE. — Gesproken aanmoedigingen (Meer → Instellingen, standaard uit). Gebruikt alleen de spraak van het toestel zelf
// (Web Speech API): geen geluidsbestanden, geen externe dienst, geen namen in de tekst. Zonder spraak gebeurt er niets.
// iPhone: spreken mag alleen direct na een tik; alle aanroepen hieronder gebeuren binnen de tik op een pijl of knop.

const synth = () => (typeof window !== 'undefined' && window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function') ? window.speechSynthesis : null;
export const speechSupported = () => !!synth();

let voices = [];
function loadVoices() { try { voices = synth()?.getVoices() || []; } catch { voices = []; } }
if (synth()) { loadVoices(); synth().addEventListener?.('voiceschanged', loadVoices); }

// Beste stem voor een taal: exacte taal, dan 'verbeterde/natuurlijke' stemmen, dan stemmen op het toestel zelf.
export function pickVoice(list, lang) {
  const want = lang.toLowerCase(), base = want.slice(0, 2);
  const norm = v => String(v.lang || '').toLowerCase().replace('_', '-');
  const score = v => (norm(v) === want ? 8 : 0) + (/premium|enhanced|natural|neural|verbeterd|siri/i.test(v.name) ? 4 : 0) + (v.localService ? 2 : 0) + (v.default ? 1 : 0);
  return list.filter(v => norm(v).startsWith(base)).sort((a, b) => score(b) - score(a))[0] || null;
}
export const hasDutchVoice = () => { loadVoices(); return !voices.length || !!pickVoice(voices, 'nl-NL'); };

let lastSaid = '', lastAt = 0;
// priority: 180-call onderbreekt wat er nog in de wachtrij staat; gewone zinnen sluiten aan (max. één extra).
export function say(text, { lang = 'nl-NL', rate = 1, pitch = 1, priority = false } = {}) {
  const s = synth();
  if (!s || !text) return false;
  const t = Date.now();
  if (text === lastSaid && t - lastAt < 8000) return false;   // nooit twee keer hetzelfde achter elkaar
  try {
    // Alleen onderbreken als er echt iets klinkt: direct na cancel() slikt Safari soms de volgende zin in.
    if (priority && (s.speaking || s.pending)) s.cancel();
    else if (s.pending) return false;
    if (s.paused) s.resume();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang; u.rate = rate; u.pitch = pitch; u.volume = 1;
    if (!voices.length) loadVoices();
    const v = pickVoice(voices, lang);
    if (v) u.voice = v;
    s.speak(u);
    lastSaid = text; lastAt = t;
    return true;
  } catch { return false; }
}

// De klassieke dartscall bij 180, in het Engels.
export const call180 = () => say('One hundred and eighty!', { lang: 'en-GB', rate: 0.88, pitch: 0.95, priority: true });

const nl = n => String(Math.round(n * 10) / 10).replace('.', ',');

// Welke zin hoort bij een beurt? Alleen bij betekenisvolle momenten; anders null (stil).
// prevMax: hoogste beurt ooit van deze speler vóór deze beurt (trainingen en wedstrijden).
export function turnLine(score, prevMax) {
  if (score === 180) return { call180: true, text: prevMax < 180 ? 'Je eerste honderdtachtig. Geweldig!' : null };
  if (score >= 140 && prevMax < 140) return { text: prevMax < 100 ? 'Je eerste honderdveertig plus! Mooi gegooid.' : 'Je eerste honderdveertig plus!' };
  if (score >= 100 && prevMax < 100) return { text: 'Je eerste honderd plus! Mooi zo.' };
  if (score >= 100 && score > prevMax) return { text: `Nieuwe hoogste beurt: ${score}!` };
  return null;
}

// Na een training: record gaat voor; anders een duidelijke verbetering ten opzichte van de laatste trainingen.
export function trainingLine({ records = [], improved = false, goalReached = false }) {
  if (records.length) {
    const r = records[0];
    return { text: `Nieuw persoonlijk record! ${r.label}: ${r.spoken}.` };
  }
  if (goalReached) return { text: 'Doel gehaald! Sterk gegooid.' };
  if (improved) return { text: 'Sterke training! Duidelijk beter dan je laatste keren.', improvement: true };
  return null;
}

export function checkoutLine(score, dart) {
  if (dart === 'DB') return { text: score >= 100 ? `${score} uit, op de bull! Wat een finish.` : 'Uitgegooid op de bull! Prachtig.' };
  if (score >= 100) return { text: `${score} uit! Wat een finish.` };
  return null;
}

export const spokenNumber = nl;
