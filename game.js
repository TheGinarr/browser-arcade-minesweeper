/* ============================================================
   MINESWEEPER · game.js
   ------------------------------------------------------------
   So funktioniert dieses Spiel
   1. Datenmodell: Das Feld ist KEINE Tabelle, sondern flache Arrays
      (minen[], aufgedeckt[], flaggen[]). Aus Spalte x / Zeile y wird
      der Index  y * spalten + x.  Das ist einfacher zu kopieren,
      zu füllen und zu durchlaufen als ein Array aus Arrays.
   2. Rechenlogik (Minen verteilen, Nachbarn zählen, Flood-Fill,
      Chording) steckt in REINEN Funktionen: Sie bekommen Daten rein,
      liefern ein Ergebnis und fassen weder DOM noch Speicher an.
      Dadurch lassen sie sich ohne Browser testen (siehe unten).
   3. Rendering: Jede Zelle ist ein <button> in einem CSS-Grid. DOM statt
      <canvas>, weil Buttons gratis Tastaturfokus, Screenreader-Labels
      und Touch-Ziele mitbringen – ideal für ein Puzzle ohne Bewegung.
   4. Eingabe: EIN Listener am Feld (Event Delegation) für Klick,
      Rechtsklick, langes Drücken (Touch) und Tastatur.
   5. Spielablauf: bereit → läuft → gewonnen/verloren. Erst der erste
      Klick verteilt die Minen und startet die Uhr.
   6. Speicher: pro Schwierigkeit eine eigene Topliste
      ("minesweeper-leicht" usw.), Punkte = Sekunden, weniger ist besser.
   ============================================================ */

import { lade, speichere, spielZuruecksetzen, topliste } from "./assets/storage.js";
import { bewegungReduziert, toplisteAnzeigen, gameOverDialog } from "./assets/ui.js";

/* ------------------------------------------------------------
   Konstanten
   ------------------------------------------------------------ */

/** Die drei Schwierigkeitsstufen. Schlüssel = Teil des Speicher-Namens. */
export const STUFEN = {
  leicht: { name: "Leicht", spalten: 9, zeilen: 9, minen: 10 },
  mittel: { name: "Mittel", spalten: 16, zeilen: 16, minen: 40 },
  schwer: { name: "Schwer", spalten: 30, zeilen: 16, minen: 99 },
};

const SPIEL = "minesweeper"; // Speicherbereich für allgemeine Einstellungen (z. B. gewählte Stufe)
const LANGER_DRUCK_MS = 400; // so lange Finger halten = Flagge
const DOPPELKLICK_MS = 350; // max. Abstand zweier Klicks für "Chording"
const WELLE_MS_PRO_FELD = 28; // Verzögerung der Aufdeck-Welle pro Feld Abstand
const WELLE_MAX_MS = 700; // Obergrenze, damit große Flächen nicht ewig brauchen
const MAX_SEKUNDEN = 5999; // 99:59 – mehr kann "mm:ss" nicht darstellen

/** Speicher-Schlüssel der Topliste einer Stufe, z. B. "minesweeper-leicht". */
const toplisteKey = (stufe) => `${SPIEL}-${stufe}`;

/* ============================================================
   TEIL 1 · Reine Rechenfunktionen (kein DOM, kein Speicher)
   Diese Funktionen sind exportiert, damit man sie in Node testen kann.

   Getestet (mit Node) an diesem 5×5-Beispiel, M = Mine:

       . . . . .        berechnete Zahlen:   1 1 1 0 0
       . M . . .                             1 M 2 1 1
       . . . M .                             1 1 2 M 1   (M zählt hier 0)
       . . . . .                             0 0 1 2 2
       . . . . M                             0 0 0 1 M

   - Nachbarzählung: Jede Zahl stimmt mit der Handrechnung überein,
     z. B. zeigt das Feld zwischen beiden oberen Minen eine 2.
   - Flood-Fill ab der leeren Ecke unten links deckt genau die 0er-Fläche
     (5 Felder) samt ihrem Zahlenrand (6 Felder) auf – nie eine Mine –
     und blockiert an Flaggen. Ein Stresstest mit 200×200 leeren Feldern
     läuft ohne Stack Overflow durch.
   - Chording: erst bei genau 2 Flaggen um die "2" kommt eine Liste mit
     den übrigen Nachbarn zurück; bei 0, 1 oder 3 Flaggen eine leere.
   - Minen verteilen: für alle drei Stufen und JEDES mögliche Startfeld
     gibt es die richtige Minenzahl, Startfeld und Nachbarn sind frei.
   ============================================================ */

/**
 * Liefert die Indizes aller (bis zu 8) Nachbarfelder eines Feldes.
 * Die Randprüfung ist wichtig: Ohne sie würde x = -1 oder x = spalten
 * auf das Feld in der Nachbar-ZEILE zeigen (Index "läuft um die Ecke").
 */
export function nachbarIndizes(index, spalten, zeilen) {
  const x = index % spalten; // % = Rest → Spalte
  const y = Math.floor(index / spalten); // Ganzzahldivision → Zeile
  const liste = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue; // das Feld selbst ist kein Nachbar
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= spalten || ny < 0 || ny >= zeilen) continue; // außerhalb
      liste.push(ny * spalten + nx);
    }
  }
  return liste;
}

/**
 * Verteilt die Minen zufällig – ERST NACH dem ersten Klick.
 *
 * WARUM ERST DANN? Würden die Minen beim Spielstart verteilt, könnte der
 * allererste Klick schon eine Mine treffen. Das wäre reines Pech ohne jede
 * Entscheidung des Spielers und fühlt sich unfair an. Außerdem ist ein
 * erster Klick auf ein Feld OHNE Nachbarminen am wertvollsten: Er öffnet
 * per Flood-Fill gleich eine Fläche, mit der man logisch weiterarbeiten
 * kann. Darum bleibt das angeklickte Feld UND seine Nachbarn minenfrei.
 *
 * Technik: "Teil-Mischen" (Fisher-Yates). Wir sammeln alle erlaubten
 * Felder in einer Liste und tauschen zufällig `anzahl` Stück nach vorne.
 * Das ist garantiert ohne Doppelte (anders als "würfle, bis ein freies
 * Feld kommt", was bei vollen Feldern ewig dauern könnte).
 *
 * `zufall` ist austauschbar (Standard Math.random), damit Tests mit einer
 * festen Zufallsfolge reproduzierbar laufen.
 */
export function minenVerteilen(spalten, zeilen, anzahl, sichererIndex, zufall = Math.random) {
  const gesamt = spalten * zeilen;
  const gesperrt = new Set([sichererIndex, ...nachbarIndizes(sichererIndex, spalten, zeilen)]);

  const kandidaten = [];
  for (let i = 0; i < gesamt; i++) {
    if (!gesperrt.has(i)) kandidaten.push(i);
  }

  // Falls ein winziges Feld weniger freie Plätze hat als Minen gewünscht
  const n = Math.min(anzahl, kandidaten.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(zufall() * (kandidaten.length - i)); // zufälliger Platz ab i
    [kandidaten[i], kandidaten[j]] = [kandidaten[j], kandidaten[i]]; // tauschen
  }

  const minen = new Array(gesamt).fill(false);
  for (let i = 0; i < n; i++) minen[kandidaten[i]] = true;
  return minen;
}

/** Zählt für JEDES Feld, wie viele Nachbarn eine Mine sind (0–8). */
export function nachbarZahlenBerechnen(minen, spalten, zeilen) {
  return minen.map(
    (_, index) => nachbarIndizes(index, spalten, zeilen).filter((nb) => minen[nb]).length,
  );
}

/**
 * Flood-Fill: Welche Felder gehen auf, wenn man `start` aufdeckt?
 *
 * Regel: Ein Feld mit 0 Nachbarminen deckt automatisch alle Nachbarn auf;
 * trifft das auf einen Nachbarn wieder zu, geht es dort weiter usw.
 * Felder mit Zahl werden aufgedeckt, aber nicht weiterverfolgt.
 *
 * ITERATIV MIT STAPEL (stack) STATT REKURSIV:
 * Die naheliegende Lösung wäre eine Funktion, die sich für jeden Nachbarn
 * selbst aufruft. Bei einer leeren Fläche über das ganze Feld (30×16 = 480
 * Felder) wären das hunderte verschachtelte Aufrufe. Jeder Aufruf belegt
 * Platz auf dem Aufrufstapel des Browsers; ist der voll, bricht das Spiel
 * mit "Maximum call stack size exceeded" ab. Mit einer eigenen Liste
 * (`stapel`) und einer while-Schleife liegt die Arbeit dagegen im normalen
 * Arbeitsspeicher und kann beliebig groß werden.
 *
 * Es wird NICHTS verändert; das Ergebnis ist nur die Liste der Indizes,
 * die neu aufzudecken sind. Flaggen und schon offene Felder bleiben
 * unberührt. Minen werden nie erreicht: Nur Felder mit 0 Nachbarminen
 * geben die Suche an ihre Nachbarn weiter, und neben einer 0 liegt per
 * Definition keine Mine.
 */
export function floodFill(start, nachbarZahlen, aufgedeckt, flaggen, spalten, zeilen) {
  const gesehen = new Uint8Array(spalten * zeilen); // 0/1-Merkzettel gegen Endlosschleifen
  const stapel = [start];
  const ergebnis = [];

  while (stapel.length > 0) {
    const index = stapel.pop(); // letztes Element nehmen (LIFO)
    if (gesehen[index]) continue;
    gesehen[index] = 1;
    if (aufgedeckt[index] || flaggen[index]) continue; // offen oder geflaggt: überspringen

    ergebnis.push(index);
    if (nachbarZahlen[index] === 0) {
      for (const nb of nachbarIndizes(index, spalten, zeilen)) {
        if (!gesehen[nb]) stapel.push(nb);
      }
    }
  }
  return ergebnis;
}

/**
 * Chording: Welche Felder würde ein Doppelklick auf eine aufgedeckte Zahl
 * öffnen? Nur wenn rund um das Feld GENAU so viele Flaggen stehen, wie die
 * Zahl angibt (nicht mehr, nicht weniger). Dann sind alle übrigen Nachbarn
 * laut Spieler sicher. Gibt eine leere Liste zurück, wenn die Bedingung
 * nicht erfüllt ist.
 */
export function chordingKandidaten(index, nachbarZahlen, aufgedeckt, flaggen, spalten, zeilen) {
  if (!aufgedeckt[index] || nachbarZahlen[index] === 0) return [];
  const nachbarn = nachbarIndizes(index, spalten, zeilen);
  const anzahlFlaggen = nachbarn.filter((nb) => flaggen[nb]).length;
  if (anzahlFlaggen !== nachbarZahlen[index]) return [];
  return nachbarn.filter((nb) => !aufgedeckt[nb] && !flaggen[nb]);
}

/** Sekunden → "mm:ss", z. B. 75 → "01:15". */
export function zeitText(sekunden) {
  const mm = String(Math.floor(sekunden / 60)).padStart(2, "0");
  const ss = String(sekunden % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/* ============================================================
   TEIL 2 · Spielzustand und DOM
   `z` ist der Zustand der aktuellen Runde und wird bei jedem neuen Spiel
   komplett neu angelegt. `el` sammelt die DOM-Elemente, die wir oft brauchen.
   ============================================================ */

let z = null; // Zustand der laufenden Runde
let stufeKey = "leicht"; // gewählte Schwierigkeit
const el = {}; // DOM-Elemente (werden in init() gefüllt)

// Eingabe-Hilfsvariablen (gehören nicht zur Runde, sondern zur Bedienung)
let letzterPointerTyp = "mouse"; // "mouse" | "touch" | "pen" – wer hat zuletzt gedrückt?
let druckTimer = null; // läuft, solange ein Finger gehalten wird
let langerDruckAusgeloest = false;
let druckStart = { x: 0, y: 0 };
let letzterKlick = { index: -1, zeit: 0 }; // für die Doppelklick-Erkennung

/** true, solange man noch Felder aufdecken oder flaggen darf. */
function spielAktiv() {
  return z.phase === "bereit" || z.phase === "laeuft";
}

/** Startet eine neue Runde in der aktuell gewählten Stufe. */
function neuesSpiel() {
  alleTimerStoppen();
  const s = STUFEN[stufeKey];
  const gesamt = s.spalten * s.zeilen;
  z = {
    stufe: s,
    gesamt,
    phase: "bereit", // "bereit" → "laeuft" → "gewonnen" | "verloren"
    minen: null, // erst nach dem ersten Klick gefüllt (siehe minenVerteilen)
    nachbarZahlen: null,
    aufgedeckt: new Array(gesamt).fill(false),
    flaggen: new Array(gesamt).fill(false),
    anzahlAufgedeckt: 0,
    anzahlFlaggen: 0,
    sekunden: 0,
    startZeit: 0,
    timerId: null,
    dialogTimerId: null,
    fokusIndex: 0, // welche Zelle ist per Tab erreichbar (siehe "Roving Tabindex")
    zellen: [], // die <button>-Elemente, Index = Feldindex
  };
  feldBauen();
  hudZeichnen();
  toplisteAktualisieren();
  statusSagen("");
}

/** Räumt Uhr und verzögerte Dialoge der alten Runde weg. */
function alleTimerStoppen() {
  if (!z) return;
  timerStoppen();
  clearTimeout(z.dialogTimerId);
  z.dialogTimerId = null;
}

/** Baut das Raster aus <button>-Zellen. */
function feldBauen() {
  const s = z.stufe;
  el.feld.replaceChildren(); // alte Zellen entfernen
  el.feld.classList.remove("schuettel");
  el.buehne.classList.remove("blitz");
  el.feld.dataset.stufe = stufeKey; // CSS wählt danach die Zellgröße
  el.feld.style.setProperty("--spalten", String(s.spalten));

  // DocumentFragment: erst im Speicher zusammenbauen, dann EINMAL einfügen.
  // Das ist schneller, als 480-mal einzeln ins sichtbare DOM zu schreiben.
  const sammler = document.createDocumentFragment();
  for (let i = 0; i < z.gesamt; i++) {
    const knopf = document.createElement("button");
    knopf.type = "button";
    knopf.className = "zelle";
    knopf.dataset.index = String(i);
    // "Roving Tabindex": nur EINE Zelle ist per Tab erreichbar, der Rest
    // per Pfeiltasten. Sonst müsste man bei 480 Feldern 480-mal Tab drücken.
    knopf.tabIndex = i === 0 ? 0 : -1;
    z.zellen.push(knopf);
    zelleBeschriften(i);
    sammler.append(knopf);
  }
  el.feld.append(sammler);
}

/** Setzt den Screenreader-Text einer Zelle, z. B. "Zeile 3, Spalte 4: Flagge". */
function zelleBeschriften(i, zustandsText) {
  const s = z.stufe;
  const x = (i % s.spalten) + 1;
  const y = Math.floor(i / s.spalten) + 1;
  let zustand = zustandsText;
  if (!zustand) {
    if (z.aufgedeckt[i]) {
      const n = z.nachbarZahlen[i];
      zustand = n === 0 ? "leer" : `${n} ${n === 1 ? "benachbarte Mine" : "benachbarte Minen"}`;
    } else {
      zustand = z.flaggen[i] ? "Flagge" : "verdeckt";
    }
  }
  z.zellen[i].setAttribute("aria-label", `Zeile ${y}, Spalte ${x}: ${zustand}`);
}

/**
 * Überträgt den Zustand EINER Zelle ins DOM (Klassen + Zahl).
 * `verzoegerungMs` setzt --v: das CSS nutzt es als transition-delay, wodurch
 * die Zelle erst nach dieser Zeit "aufklappt" → gestaffelte Welle.
 */
function zelleZeichnen(i, verzoegerungMs = 0) {
  const knopf = z.zellen[i];
  const offen = z.aufgedeckt[i];

  if (verzoegerungMs > 0) knopf.style.setProperty("--v", `${verzoegerungMs}ms`);
  knopf.classList.toggle("offen", offen);
  knopf.classList.toggle("flagge", z.flaggen[i] && !offen);

  if (offen) {
    const zahl = z.nachbarZahlen[i];
    knopf.dataset.zahl = String(zahl); // CSS färbt per [data-zahl="3"]
    knopf.textContent = zahl > 0 ? String(zahl) : ""; // textContent: nie innerHTML
  }
  zelleBeschriften(i);
}

/** Wellen-Verzögerung: je weiter weg vom Klick, desto später (außer bei reduzierter Bewegung). */
function wellenVerzoegerung(index, ursprung) {
  if (bewegungReduziert()) return 0;
  const sp = z.stufe.spalten;
  const dx = (index % sp) - (ursprung % sp);
  const dy = Math.floor(index / sp) - Math.floor(ursprung / sp);
  // Math.hypot = Luftlinie → kreisförmige Welle statt eckiger
  return Math.min(WELLE_MAX_MS, Math.round(Math.hypot(dx, dy) * WELLE_MS_PRO_FELD));
}

/* ------------------------------------------------------------
   HUD, Topliste, Status
   ------------------------------------------------------------ */

function hudZeichnen() {
  el.hudMinen.textContent = String(z.stufe.minen - z.anzahlFlaggen); // darf negativ werden
  el.hudZeit.textContent = zeitText(z.sekunden);
  const beste = topliste(toplisteKey(stufeKey))[0];
  el.hudBest.textContent = beste ? zeitText(beste.punkte) : "--:--";
}

/** Zeigt die Topliste der aktuell gewählten Stufe (Punkte sind Sekunden → mm:ss). */
function toplisteAktualisieren() {
  toplisteAnzeigen(el.topliste, toplisteKey(stufeKey), zeitText);
  el.toplisteTitel.textContent = `Lokale Top 3 · ${STUFEN[stufeKey].name}`;
}

/** Meldung für Screenreader (sichtbar ist sie nicht). */
function statusSagen(text) {
  el.status.textContent = text;
}

/* ------------------------------------------------------------
   Uhr
   Wir zählen nicht "pro Tick +1", sondern rechnen bei jedem Tick aus der
   echten Uhrzeit (performance.now). Intervalle können im Hintergrund-Tab
   gedrosselt werden – die Zeitdifferenz bleibt trotzdem korrekt.
   ------------------------------------------------------------ */
function timerStarten() {
  z.startZeit = performance.now();
  z.timerId = setInterval(timerTick, 250); // 4× pro Sekunde, damit die Anzeige nie hängt
}

function timerTick() {
  z.sekunden = Math.min(MAX_SEKUNDEN, Math.floor((performance.now() - z.startZeit) / 1000));
  el.hudZeit.textContent = zeitText(z.sekunden);
}

function timerStoppen() {
  clearInterval(z.timerId);
  z.timerId = null;
}

/* ------------------------------------------------------------
   Spiellogik: aufdecken, flaggen, chording, Sieg, Niederlage
   ------------------------------------------------------------ */

/** Erster Klick: Minen verteilen, Zahlen berechnen, Uhr starten. */
function spielStarten(ersterIndex) {
  const s = z.stufe;
  z.minen = minenVerteilen(s.spalten, s.zeilen, s.minen, ersterIndex);
  z.nachbarZahlen = nachbarZahlenBerechnen(z.minen, s.spalten, s.zeilen);
  z.phase = "laeuft";
  timerStarten();
}

/** Aufdecken per Klick/Tipp/Enter. */
function deckeAuf(index) {
  if (!spielAktiv()) return;
  if (z.aufgedeckt[index] || z.flaggen[index]) return; // Flaggen schützen vor Fehlklicks
  if (z.phase === "bereit") spielStarten(index);

  if (z.minen[index]) {
    verloren([index]);
    return;
  }
  zellenAufdecken(index, index);
  hudZeichnen();
  siegPruefen();
}

/** Deckt `start` samt Flood-Fill-Fläche auf und zeichnet sie als Welle. */
function zellenAufdecken(start, ursprung) {
  const s = z.stufe;
  const liste = floodFill(start, z.nachbarZahlen, z.aufgedeckt, z.flaggen, s.spalten, s.zeilen);
  for (const i of liste) {
    z.aufgedeckt[i] = true;
    z.anzahlAufgedeckt++;
    zelleZeichnen(i, wellenVerzoegerung(i, ursprung));
  }
}

/** Chording auf einer aufgedeckten Zahl (siehe chordingKandidaten). */
function chording(index) {
  if (!spielAktiv() || z.phase === "bereit") return;
  const s = z.stufe;
  const kandidaten = chordingKandidaten(
    index,
    z.nachbarZahlen,
    z.aufgedeckt,
    z.flaggen,
    s.spalten,
    s.zeilen,
  );
  if (kandidaten.length === 0) return;

  // Erst alle sicheren aufdecken, dann (falls eine Flagge falsch saß) verlieren.
  // So sieht man, was durch das Chording alles aufgegangen ist.
  const treffer = kandidaten.filter((i) => z.minen[i]);
  for (const i of kandidaten) {
    if (!z.minen[i] && !z.aufgedeckt[i]) zellenAufdecken(i, index);
  }
  hudZeichnen();
  if (treffer.length > 0) {
    verloren(treffer);
    return;
  }
  siegPruefen();
}

/** Flagge setzen/entfernen. Vor dem ersten Klick erlaubt – Minen gibt es dann ja noch nicht. */
function flaggeUmschalten(index) {
  if (!spielAktiv() || z.aufgedeckt[index]) return;
  z.flaggen[index] = !z.flaggen[index];
  z.anzahlFlaggen += z.flaggen[index] ? 1 : -1;
  zelleZeichnen(index);
  hudZeichnen();
}

/** Gewonnen, sobald alle Nicht-Minen-Felder offen sind (Flaggen sind dafür egal). */
function siegPruefen() {
  if (z.anzahlAufgedeckt === z.gesamt - z.stufe.minen) gewonnen();
}

function gewonnen() {
  z.phase = "gewonnen";
  timerStoppen();
  // mind. 1 Sekunde: Eine 0-Sekunden-Zeit gäbe es sonst bei einem Glückstreffer-Erstklick
  z.sekunden = Math.max(
    1,
    Math.min(MAX_SEKUNDEN, Math.floor((performance.now() - z.startZeit) / 1000)),
  );

  // Alle Minen automatisch flaggen – Belohnung fürs Auge
  const sichtbarMachen = [];
  z.minen.forEach((istMine, i) => {
    if (istMine && !z.flaggen[i]) sichtbarMachen.push(i);
  });
  sichtbarMachen.forEach((i, reihenfolge) => {
    z.flaggen[i] = true;
    z.anzahlFlaggen++;
    zelleZeichnen(i, bewegungReduziert() ? 0 : Math.min(WELLE_MAX_MS, reihenfolge * 12));
  });
  hudZeichnen();
  el.buehne.classList.add("blitz"); // kurzes Aufleuchten (CSS, s. style.css)
  statusSagen(`Gewonnen in ${zeitText(z.sekunden)}.`);

  // Kurz warten, damit man das gelöste Feld noch sieht, dann der gemeinsame Dialog.
  // Bei SIEG: gameOverDialog → er fragt selbst nach den Initialen, falls es für die Top 3 reicht.
  const sekunden = z.sekunden;
  z.dialogTimerId = setTimeout(() => {
    const dialog = gameOverDialog({
      spiel: toplisteKey(stufeKey),
      titel: "GEWONNEN!",
      punkte: sekunden,
      punkteText: zeitText(sekunden),
      richtung: "runter", // kürzere Zeit = besser
      format: zeitText, // Topliste im Dialog als mm:ss anzeigen
      neustart: neuesSpiel,
    });
    // Endet der Dialog (Knopf oder Esc), zeigen Seite und HUD die neue Topliste
    beiDialogEnde(dialog, () => {
      toplisteAktualisieren();
      hudZeichnen();
    });
  }, 800);
}

/** Verloren: alle Minen zeigen, getroffene rot, kurz schütteln. `treffer` = ausgelöste Minen. */
function verloren(treffer) {
  z.phase = "verloren";
  timerStoppen();
  const s = z.stufe;
  const ursprung = treffer[0];

  z.minen.forEach((istMine, i) => {
    const knopf = z.zellen[i];
    if (istMine && !z.flaggen[i]) {
      // Nicht entdeckte Mine: gestaffelt (Abstand zum Treffer) sichtbar machen
      knopf.style.setProperty("--v", `${wellenVerzoegerung(i, ursprung)}ms`);
      knopf.classList.add("mine");
      if (treffer.includes(i)) knopf.classList.add("getroffen");
      zelleBeschriften(i, "Mine");
    } else if (!istMine && z.flaggen[i]) {
      knopf.classList.add("falsch"); // Flagge auf sicherem Feld
      zelleBeschriften(i, "falsche Flagge");
    }
  });

  // Schüttel-Animation: Klasse setzen, nach dem Ende wieder entfernen,
  // damit sie beim nächsten Verlieren erneut abspielen kann.
  if (!bewegungReduziert()) {
    el.feld.classList.add("schuettel");
    el.feld.addEventListener("animationend", () => el.feld.classList.remove("schuettel"), {
      once: true,
    });
  }
  statusSagen("Mine getroffen. Verloren.");

  // Niederlage: eigener, schlanker Dialog – bewusst KEIN Topliste-Eintrag
  z.dialogTimerId = setTimeout(() => {
    const dialog = schlankerDialog({
      titel: "BOOM!",
      gross: zeitText(z.sekunden),
      text: `Du hast eine Mine getroffen (${s.name}).`,
      neustart: neuesSpiel,
    });
    beiDialogEnde(dialog, hudZeichnen);
  }, 1000);
}

/**
 * Führt `aktion` aus, sobald ein Dialog endet.
 * Zwei Ereignisse sind nötig: "close" (Dialog wurde geschlossen) und
 * "cancel" (Esc gedrückt). Bei Esc entfernt der Dialog sich selbst aus der
 * Seite, bevor "close" ausgelöst werden könnte, darum lauschen wir auf beide.
 * `aktion` darf deshalb auch zweimal laufen und muss harmlos sein.
 */
function beiDialogEnde(dialog, aktion) {
  dialog.addEventListener("close", aktion);
  dialog.addEventListener("cancel", aktion);
}

/**
 * Schlanker Dialog im gleichen Look wie gameOverDialog (.spiel-dialog),
 * aber ohne Topliste und Initialen. Alle Texte per textContent – die
 * Werte kommen zwar von uns, aber so bleibt es eine sichere Gewohnheit.
 */
function schlankerDialog({ titel, gross, text, neustart }) {
  document.getElementById("spiel-dialog")?.remove(); // evtl. alten Dialog entfernen

  const dialog = document.createElement("dialog");
  dialog.className = "spiel-dialog";
  dialog.id = "spiel-dialog";

  const h2 = document.createElement("h2");
  h2.textContent = titel;
  const grossText = document.createElement("p");
  grossText.className = "gross";
  grossText.textContent = gross;
  const absatz = document.createElement("p");
  absatz.textContent = text;

  const aktionen = document.createElement("div");
  aktionen.className = "aktionen";
  const nochmal = document.createElement("button");
  nochmal.type = "button";
  nochmal.className = "knopf primaer";
  nochmal.textContent = "Nochmal";
  const uebersicht = document.createElement("a");
  uebersicht.className = "knopf";
  uebersicht.href = "./";
  uebersicht.style.display = "none"; // Einzel-Repo: keine Spieleübersicht
  uebersicht.textContent = "Zur Übersicht";
  aktionen.append(nochmal, uebersicht);

  dialog.append(h2, grossText, absatz, aktionen);

  nochmal.addEventListener("click", () => {
    dialog.close();
    dialog.remove();
    neustart?.();
  });
  dialog.addEventListener("cancel", () => dialog.remove()); // Esc

  document.body.append(dialog);
  dialog.showModal();
  nochmal.focus();
  return dialog;
}

/* ============================================================
   TEIL 3 · Eingabe
   ============================================================ */

/** Findet zur Ereignis-Quelle die Zelle und gibt deren Index zurück (oder -1). */
function indexAus(ereignisZiel) {
  const zelle = ereignisZiel.closest?.(".zelle");
  return zelle ? Number(zelle.dataset.index) : -1;
}

/** Setzt die per Tab erreichbare Zelle ("Roving Tabindex"). */
function fokusSetzen(index, fokussieren) {
  z.zellen[z.fokusIndex].tabIndex = -1;
  z.zellen[index].tabIndex = 0;
  z.fokusIndex = index;
  if (fokussieren) z.zellen[index].focus();
}

function eingabeEinrichten() {
  const feld = el.feld;

  /* --- Maus und Touch: Pointer Events ----------------------------
     pointerdown/-up/-move vereinheitlichen Maus, Finger und Stift.
     e.pointerType verrät, womit gerade gedrückt wurde. */
  feld.addEventListener("pointerdown", (e) => {
    letzterPointerTyp = e.pointerType;
    // Wichtig: Merker IMMER zurücksetzen. Manche Browser schicken nach
    // einem langen Druck kein "click" mehr – der Merker würde sonst den
    // nächsten echten Tipp verschlucken.
    langerDruckAusgeloest = false;
    clearTimeout(druckTimer);

    const index = indexAus(e.target);
    if (index < 0 || e.pointerType === "mouse") return; // Maus flaggt per Rechtsklick

    druckStart = { x: e.clientX, y: e.clientY };
    druckTimer = setTimeout(() => {
      langerDruckAusgeloest = true;
      flaggeUmschalten(index);
      navigator.vibrate?.(15); // kurzes Haptik-Feedback, wo es das gibt
    }, LANGER_DRUCK_MS);
  });

  // Wandert der Finger weit weg, will der Nutzer scrollen, nicht flaggen
  feld.addEventListener("pointermove", (e) => {
    if (!druckTimer) return;
    if (Math.hypot(e.clientX - druckStart.x, e.clientY - druckStart.y) > 10) {
      clearTimeout(druckTimer);
      druckTimer = null;
    }
  });
  for (const name of ["pointerup", "pointercancel", "pointerleave"]) {
    feld.addEventListener(name, () => {
      clearTimeout(druckTimer);
      druckTimer = null;
    });
  }

  /* --- Klick: Aufdecken bzw. Chording ---------------------------- */
  feld.addEventListener("click", (e) => {
    const index = indexAus(e.target);
    if (index < 0) return;

    // Dieser Klick gehört zu einem langen Druck, der schon flaggte → ignorieren
    if (langerDruckAusgeloest) {
      langerDruckAusgeloest = false;
      return;
    }

    if (z.aufgedeckt[index]) {
      // Aufgedeckte Zahl: Chording per Doppelklick bzw. Doppeltipp.
      // Wir messen den Abstand selbst statt dem "dblclick"-Ereignis zu
      // vertrauen: Das verhält sich auf Handys uneinheitlich.
      // e.detail === 0 heißt: Der Klick kam von der Tastatur (Enter/Leertaste).
      const jetzt = performance.now();
      const doppelt = letzterKlick.index === index && jetzt - letzterKlick.zeit < DOPPELKLICK_MS;
      letzterKlick = { index, zeit: jetzt };
      if (e.detail === 0 || doppelt) {
        letzterKlick = { index: -1, zeit: 0 };
        chording(index);
      }
      return;
    }

    // Normales Aufdecken. Merker zurücksetzen, damit ein schneller zweiter
    // Klick auf das frisch geöffnete Feld nicht sofort als Chording zählt.
    letzterKlick = { index: -1, zeit: 0 };
    deckeAuf(index);
  });

  /* --- Rechtsklick: Flagge ---------------------------------------
     Ohne preventDefault() würde das Browser-Kontextmenü aufgehen.
     Am Handy löst ein langer Druck ebenfalls "contextmenu" aus – dort
     flaggt aber schon der Timer oben, deshalb hier nur bei Maus. */
  el.buehne.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (letzterPointerTyp !== "mouse") return;
    const index = indexAus(e.target);
    if (index >= 0) flaggeUmschalten(index);
  });

  /* --- Tastatur ---------------------------------------------------
     Enter/Leertaste lösen bei einem <button> von allein "click" aus
     (siehe oben). Hier kommen nur Pfeile und die F-Taste dazu. */
  feld.addEventListener("keydown", (e) => {
    const index = indexAus(e.target);
    if (index < 0) return;
    const sp = z.stufe.spalten;
    let x = index % sp;
    let y = Math.floor(index / sp);

    switch (e.key) {
      case "ArrowLeft":
        x--;
        break;
      case "ArrowRight":
        x++;
        break;
      case "ArrowUp":
        y--;
        break;
      case "ArrowDown":
        y++;
        break;
      case "f":
      case "F":
        e.preventDefault();
        flaggeUmschalten(index);
        return;
      default:
        return; // alles andere nicht anfassen
    }
    e.preventDefault(); // Pfeile sollen die Seite nicht scrollen
    x = Math.max(0, Math.min(sp - 1, x)); // am Rand stehen bleiben
    y = Math.max(0, Math.min(z.stufe.zeilen - 1, y));
    fokusSetzen(y * sp + x, true);
  });

  // Bekommt eine Zelle Fokus (Klick oder Tab), merken wir sie als Tab-Ziel
  feld.addEventListener("focusin", (e) => {
    const index = indexAus(e.target);
    if (index >= 0 && index !== z.fokusIndex) fokusSetzen(index, false);
  });
}

/* ============================================================
   TEIL 4 · Start
   ============================================================ */

/** Markiert den Stufen-Knopf der gewählten Schwierigkeit (aria-pressed). */
function stufenKnoepfeAktualisieren() {
  for (const knopf of document.querySelectorAll(".stufen-leiste [data-stufe]")) {
    knopf.setAttribute("aria-pressed", String(knopf.dataset.stufe === stufeKey));
  }
}

function stufeWaehlen(neueStufe) {
  if (!STUFEN[neueStufe] || neueStufe === stufeKey) return;
  stufeKey = neueStufe;
  speichere(SPIEL, "stufe", stufeKey); // beim nächsten Besuch wieder da
  stufenKnoepfeAktualisieren();
  neuesSpiel(); // rendert auch HUD und Topliste der neuen Stufe neu
}

function init() {
  el.feld = document.getElementById("feld");
  el.buehne = el.feld.closest(".buehne");
  el.hudMinen = document.getElementById("hud-minen");
  el.hudZeit = document.getElementById("hud-zeit");
  el.hudBest = document.getElementById("hud-best");
  el.topliste = document.getElementById("topliste");
  el.toplisteTitel = document.getElementById("topliste-titel");
  el.status = document.getElementById("status");

  // Gemerkte Stufe laden; unbekannte Werte (z. B. von Hand verändert) ignorieren
  const gemerkt = lade(SPIEL, "stufe", "leicht");
  stufeKey = STUFEN[gemerkt] ? gemerkt : "leicht";
  stufenKnoepfeAktualisieren();

  for (const knopf of document.querySelectorAll(".stufen-leiste [data-stufe]")) {
    knopf.addEventListener("click", () => stufeWaehlen(knopf.dataset.stufe));
  }
  document.getElementById("neues-spiel").addEventListener("click", neuesSpiel);

  // Reset: alle drei Toplisten löschen, Anzeige neu rendern (gewählte Stufe bleibt)
  document.getElementById("reset").addEventListener("click", () => {
    for (const key of Object.keys(STUFEN)) spielZuruecksetzen(toplisteKey(key));
    toplisteAktualisieren();
    hudZeichnen();
  });

  eingabeEinrichten();
  neuesSpiel();
}

// In Node (Tests) gibt es kein `document` – dort wollen wir nur die reinen
// Funktionen oben importieren und das Spiel NICHT starten.
if (typeof document !== "undefined") init();
