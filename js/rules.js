// OKKIE. — Dartregels & afmetingen (Meer → Dartregels & afmetingen). Alleen tekst en een tekening, geen logica.
// Gecontroleerd met: WDF Playing and Tournament Rules (20e ed., 2018) art. 1–6 en 12, DRA Rule Book 2026
// (regels van de PDC) art. 6, en het Algemeen Wedstrijdreglement van de NDB. Steeltip; softtip kan afwijken.

// Zijaanzicht op schaal (1 m = 126,6 eenheden): bord aan de muur, bull op 1,73 m, werplijn op 2,37 m,
// diagonaal 2,934 m van het midden van de bull naar de achterkant van de werplijn op de vloer.
function drawing() {
  const F = 262;            // vloer
  const X0 = 52;            // voorkant bord
  const BULL = F - 219;     // 1,73 m
  const OCHE = X0 + 300;    // 2,37 m
  return `<svg class="rules-drawing" viewBox="8 0 384 306" role="img" aria-labelledby="rd-t rd-d">
    <title id="rd-t">Maattekening dartbord</title>
    <desc id="rd-d">Zijaanzicht: het midden van de bull hangt 1,73 meter boven de vloer. Van de voorkant van het bord tot de achterkant van de werplijn is het 2,37 meter. Schuin van de bull naar de achterkant van de werplijn op de vloer is het 2,934 meter.</desc>
    <defs><marker id="rd-a" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 9 5 0 9z" class="rd-arrow"/></marker></defs>
    <path class="rd-wall" d="M36 4V${F}"/>
    <path class="rd-floor" d="M14 ${F}H388"/>
    <rect class="rd-board" x="38" y="${BULL - 32}" width="14" height="64" rx="3"/>
    <circle class="rd-bull" cx="${X0}" cy="${BULL}" r="5"/>
    <rect class="rd-oche" x="${OCHE - 8}" y="${F - 7}" width="8" height="7" rx="1"/>
    <path class="rd-diag" d="M${X0} ${BULL}L${OCHE} ${F}"/>
    <path class="rd-dim" d="M80 ${BULL}V${F - 1}" marker-start="url(#rd-a)" marker-end="url(#rd-a)"/>
    <path class="rd-guide" d="M${X0 + 6} ${BULL}H86"/>
    <path class="rd-dim" d="M${X0} ${F + 22}H${OCHE}" marker-start="url(#rd-a)" marker-end="url(#rd-a)"/>
    <path class="rd-guide" d="M${X0} ${F - 40}V${F + 30}M${OCHE} ${F - 9}V${F + 30}"/>
    <text class="rd-val" x="92" y="${F - 52}">1,73 m</text>
    <text class="rd-sub" x="92" y="${F - 32}">vloer tot midden bull</text>
    <text class="rd-val" x="${(X0 + OCHE) / 2}" y="${F + 44}" text-anchor="middle">2,37 m</text>
    <text class="rd-val acc" transform="translate(${(X0 + OCHE) / 2 + 26} ${(BULL + F) / 2 - 12}) rotate(36.1)" text-anchor="middle">2,934 m</text>
    <text class="rd-sub" x="64" y="${BULL - 12}">bull</text>
    <text class="rd-sub" x="388" y="${F - 40}" text-anchor="end">werplijn</text>
    <path class="rd-guide" d="M372 ${F - 34}L${OCHE + 2} ${F - 9}"/>
  </svg>`;
}

export function rulesPage() {
  return `<section class="card rules-card">
      <h3>Zo hang je het bord op</h3>
      <p class="muted small">Officiële maten voor steeltip darts (pijlen met een stalen punt).</p>
      <div class="rules-figure">${drawing()}</div>
      <ul class="rules-measures">
        <li><b>1,73 m</b><span>Hoogte: van de vloer tot het midden van de bull.</span></li>
        <li><b>2,37 m</b><span>Werpafstand: van de voorkant van het bord tot de achterkant van de werplijn, waar je tenen staan. Recht over de vloer gemeten.</span></li>
        <li><b>2,934 m</b><span>Controlemaat: schuin van het midden van de bull naar de achterkant van de werplijn op de vloer. Klopt deze, dan klopt het geheel. In de regels afgerond tot 2,93 m.</span></li>
      </ul>
    </section>
    <section class="card rules-card">
      <h3>Scores op het bord</h3>
      <ul class="rules-list">
        <li>Elk vak telt het getal aan de rand: <b>1 t/m 20</b>.</li>
        <li>Smalle buitenste ring: <b>dubbel</b> (× 2). Smalle binnenste ring: <b>triple</b> (× 3).</li>
        <li>Groene ring rond het midden: <b>25</b>. Het midden, de bull: <b>50</b>.</li>
        <li>Een beurt is <b>3 pijlen</b>. De hoogste beurt is <b>180</b>: drie keer triple 20.</li>
        <li>Alleen pijlen die in het bord blijven zitten tot de score is genoteerd, tellen. Valt een pijl eruit of stuitert hij terug, dan telt hij niet en gooi je hem niet opnieuw.</li>
        <li>De punt bepaalt het vak, ook als de pijl tegen een draad zit.</li>
      </ul>
    </section>
    <section class="card rules-card">
      <h3>501 in het kort</h3>
      <ul class="rules-list">
        <li>Iedereen begint op <b>501</b>. Om de beurt gooi je 3 pijlen; je score gaat van je stand af.</li>
        <li><b>Dubbel uitgooien:</b> je moet precies op 0 eindigen, met je laatste pijl in een dubbel of in de bull (50 telt als dubbel 25). Heb je 40 over, dan gooi je dubbel 20.</li>
        <li><b>Bust:</b> gooi je meer dan je over hebt, houd je 1 over, of kom je op 0 zonder dubbel? Dan telt die hele beurt niet. Je stand gaat terug naar wat hij was en je beurt is meteen voorbij.</li>
        <li><b>Leg:</b> één spel van 501. Wie het eerst uitgooit, wint de leg. De volgende leg begint de andere speler.</li>
        <li><b>Set:</b> een oneven aantal legs, bijvoorbeeld best of 5: wie er het eerst 3 wint. Een wedstrijd is ‘best of’ een aantal legs of sets.</li>
        <li><b>Wie begint:</b> ieder gooit één pijl op de bull; wie het dichtst bij zit, begint.</li>
      </ul>
      <p class="muted small">In OKKIE. kun je bij een wedstrijd ‘double out’ uitzetten. Dan mag je met elk vak uitgooien: handig om te beginnen.</p>
    </section>
    <p class="muted small rules-source">Bronnen: <a href="https://dartswdf.com/rules" target="_blank" rel="noopener">WDF Playing and Tournament Rules</a> (art. 1–6, 12) en het <a href="https://www.thedra.co.uk/dra-rulebook" target="_blank" rel="noopener">DRA Rule Book 2026</a> (regels van de PDC). Bij een club of toernooi gelden de regels van de organisatie. Softtip (elektronisch) kan andere maten hebben.</p>`;
}
