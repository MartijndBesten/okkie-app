// OKKIE. — Wat zegt de stem nog meer? De "Veel, met grapjes"-stand van de gesproken aanmoedigingen (standaard als de
// stem aan staat; "Alleen hoogtepunten" gebruikt alleen speech.js). Geen DOM en geen spraak hier: alleen welke zin bij
// welk moment hoort. Kindvriendelijk, plagen hooguit lief, nooit namen (de spraak kan via een online dienst lopen).
import { turnScore, CLOCK_TARGETS } from './logic.js';

const pick = (list, rnd = Math.random) => list[Math.min(list.length - 1, Math.floor(rnd() * list.length))];
const nl = n => String(Math.round(n * 10) / 10).replace('.', ',');
const same = ds => ds.length === 3 && ds[0] !== 'M' && ds.every(c => c === ds[0]);

// Hoeveel beurten op rij (tot en met de laatste) voldoen aan `test`?
function run(scores, test) {
  let n = 0;
  for (let i = scores.length - 1; i >= 0 && test(scores[i]); i--) n++;
  return n;
}

// Grappige of bijzondere beurten; die zijn zeldzaam genoeg om er altijd iets van te zeggen.
function special(darts, score, rnd) {
  const bulls = darts.filter(c => c === 'DB').length;
  if (bulls === 3) return 'Drie keer de bull! Dit is een rodeo!';
  if (bulls === 2) return 'Twee keer de bull! Ben jij een cowboy?';
  if (score === 0) return pick(['Nul! Het bord hangt hier, hoor!', 'Drie keer mis. De muur zegt dankjewel!', 'Oeps! Die pijlen wilden even op vakantie.', 'Nul punten. Even opwarmen zeker?'], rnd);
  if (score === 26 && [...darts].sort().join() === 'S1,S20,S5') return 'Twintig, vijf, één. Bed and breakfast! Ontbijt is inbegrepen.';
  if (darts.every(c => c === 'S1')) return 'Drie keer één. Ook dat is een kunst!';
  if (same(darts) && score < 180) return pick(['Drie keer in hetzelfde vak! Strak!', 'Drie op een rij! Precisiewerk!'], rnd);
  if (bulls === 1) return pick(['In de roos! Bull!', 'Bull! Precies in het midden!'], rnd);
  return null;
}

function bigScore(score, rnd) {
  if (score >= 140 && score < 180) return pick(['Honderdveertig plus! Wat een beurt!', `Wauw, ${score}! Heerlijk!`, `${score}! Daar kan je mee thuiskomen!`], rnd);
  if (score >= 100 && score < 140) return pick(['Honderd plus! Lekker!', `${score}! Netjes gegooid!`, 'Boem, honderd plus!', 'Ton! Ga zo door!'], rnd);
  return null;
}

// Eén beurt van 3 pijlen in een scoretraining. Alleen aanroepen als speech.js (turnLine) niets bijzonders had.
// scores: alle volledige beurten van deze speler in deze training, de huidige als laatste. n: beurtnummer van deze speler.
// limit: aantal beurten (null = vrij). progress: of deze speler de voortgang hoort (bij samen trainen alleen de eerste).
export function turnTalk({ darts, scores, n, limit = null, progress = true }, rnd) {
  const score = turnScore(darts);
  let line = special(darts, score, rnd) || bigScore(score, rnd);
  if (!line) {
    const prev = scores[scores.length - 2];
    const hot = run(scores, s => s >= 60), cold = run(scores, s => s < 20);
    if (prev !== undefined && prev < 20 && score >= 60) line = pick(['Kijk eens aan, de comeback!', 'Zo, dat is beter!'], rnd);
    else if (hot >= 3 && hot % 3 === 0) line = pick(['Je zit in de flow!', 'Hij zit erin! Lekker ritme!', 'Drie goede beurten op rij! Vasthouden!'], rnd);
    else if (cold >= 3 && cold % 3 === 0) line = pick(['Even de arm losschudden. Jij kan dit!', 'Rustig ademen en gooien. Komt goed!', 'Kom op, de volgende wordt beter!'], rnd);
  }
  let tail = null;
  if (progress && limit) {
    if (limit >= 3 && n === limit - 1) tail = line ? 'Nog één beurt!' : pick(['Nog één beurt! Maak er wat moois van!', 'Laatste beurt komt eraan! Vol gas!'], rnd);
    else if (limit >= 10 && n === Math.floor(limit / 2)) tail = line ? 'Halverwege!' : pick(['Halverwege! Lekker bezig!', 'De helft zit erop! Doorgaan!'], rnd);
  } else if (progress && !limit && n % 10 === 0) tail = line ? `Al ${n} beurten!` : pick([`Al ${n} beurten! Wat een doorzetter!`, `${n} beurten! Je bent lekker bezig!`], rnd);
  return line && tail ? `${line} ${tail}` : line || tail;
}

export function startTalk(kind, rnd) {
  if (kind === 'match') return pick(['Game on! Veel plezier!', 'Game on! Wie gooit het eerst uit?'], rnd);
  if (kind === 'clock') return pick(['Rond de klok! Begin maar bij één.', 'Tik tak, rond de klok! Eerst de één.'], rnd);
  return pick(['Daar gaan we! Veel plezier!', 'Pijlen klaar? Gooien maar!', 'Oké, focus! Jij kan dit!'], rnd);
}

// Rond de klok, na een beurt (of de laatste pijl): before/after = aantal geraakte doelen vóór en na deze beurt.
export function clockTalk(before, after, hitsThisTurn, rnd) {
  const last = CLOCK_TARGETS.length - 1;                       // index van de bull
  if (after >= CLOCK_TARGETS.length) return null;            // klaar: dat zegt de afsluiting
  if (before < last && after === last) return 'Alle getallen gehad! Nu nog de bull!';
  if (before < 10 && after >= 10) return pick(['Halverwege de klok! Tik tak!', 'De helft van de klok! Lekker!'], rnd);
  if (hitsThisTurn === 3) return pick(['Drie raak! Tik, tak, tok!', 'Drie op rij! Die klok loopt!'], rnd);
  return null;
}

// Na de training, als er geen record, doel of duidelijke verbetering te melden is (dat doet speech.js).
export function doneTalk({ kind, avg = 0, prevAvg = null, darts = 0, group = false }, rnd) {
  if (group) return pick(['Klaar! Goed gegooid allemaal!', 'Training klaar! Lekker samen gegooid!'], rnd);
  if (kind === 'clock') return `Klaar! Rond de klok in ${darts} pijlen. ${pick(['Top gedaan!', 'Lekker!'], rnd)}`;
  const tail = prevAvg !== null && avg > prevAvg ? 'Beter dan vorige keer!' : pick(['Lekker getraind!', 'Goed bezig!', 'Mooi werk!'], rnd);
  return `Klaar! Gemiddeld ${nl(avg)}. ${tail}`;
}

// 301/501: na een gewone beurt (geen bust, niet uit). score: deze beurt; next: rest van wie nu moet gooien.
export function matchTalk({ darts, score, next, doubleOut = true }, rnd) {
  const line = special(darts, score, rnd) || bigScore(score, rnd);
  let call = null;
  if (doubleOut && next === 2) call = 'Het gekkenhuis! Nog dubbel één.';
  else if (next === 170) call = 'Nog honderdzeventig. De big fish!';
  else if (next === 50) call = 'Nog vijftig. De bull!';
  else if (doubleOut && next <= 40 && next % 2 === 0 && next > 0) call = `Nog ${next}. Dubbel ${next / 2}!`;
  return line && call ? `${line} ${call}` : line || call;
}

export function bustTalk(rnd) {
  return pick(['Bust! Net iets te veel.', 'Oeps, overgegooid! Volgende keer beter.', 'Bust! Rekenen is ook een sport.'], rnd);
}

// Uitgegooid zonder 100+ of bull (dat doet speech.js).
export function checkoutTalk(score, lastDart, rnd) {
  if (lastDart === 'D1') return 'Dubbel één! Eindelijk uit het gekkenhuis!';
  return pick(['Uitgegooid! Lekker!', `${score} uit! Netjes!`, 'Raak! Uitgegooid!'], rnd);
}
