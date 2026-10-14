/* ============================================================
   storage.js · Gemeinsamer Speicher-Baustein für alle Spiele
   ------------------------------------------------------------
   WARUM GIBT ES DIESE DATEI?
   Alle Spielstände und Highscores liegen NUR im Browser des
   Nutzers (localStorage) – nichts wird an den Server geschickt,
   es gibt keine Cookies. Damit nicht jedes Spiel sein eigenes
   Speicher-Chaos baut, laufen alle Zugriffe über dieses Modul.

   WICHTIG ZU localStorage:
   - speichert nur Strings → Objekte werden mit JSON.stringify
     verpackt und mit JSON.parse wieder ausgepackt
   - kann fehlen oder gesperrt sein (Privatmodus, Einstellungen)
     → deshalb ist JEDER Zugriff in try/catch gewickelt; die
     Spiele laufen dann einfach ohne gespeicherte Rekorde weiter
   - gilt pro Browser + Gerät: andere Besucher sehen diese
     Daten nie (darum gibt es auch keine "globalen" Highscores)

   NAMENSSCHEMA der Schlüssel:  ba:<spiel>:<name>
   z. B. ba:snake:topliste  –  "ba" steht für Browser-Arcade.
   Das Präfix verhindert Kollisionen mit anderen Seiten auf der
   gleichen Domain (z. B. während der Entwicklung auf localhost).
   ============================================================ */

const PRAEFIX = "ba";

/** Baut aus Spielname + Schlüssel den vollständigen localStorage-Key. */
function vollerSchluessel(spiel, schluessel) {
  return `${PRAEFIX}:${spiel}:${schluessel}`;
}

/**
 * Liest einen Wert. Gibt `standard` zurück, wenn nichts gespeichert
 * ist ODER der Zugriff fehlschlägt (z. B. Privatmodus).
 */
export function lade(spiel, schluessel, standard = null) {
  try {
    const roh = localStorage.getItem(vollerSchluessel(spiel, schluessel));
    // roh === null → es wurde noch nie etwas gespeichert
    return roh === null ? standard : JSON.parse(roh);
  } catch {
    return standard;
  }
}

/**
 * Speichert einen beliebigen JSON-fähigen Wert (Zahl, String,
 * Objekt, Array …). Gibt true/false zurück, je nachdem ob das
 * Speichern geklappt hat – die Spiele dürfen das ignorieren.
 */
export function speichere(spiel, schluessel, wert) {
  try {
    localStorage.setItem(vollerSchluessel(spiel, schluessel), JSON.stringify(wert));
    return true;
  } catch {
    return false;
  }
}

/** Löscht einen einzelnen gespeicherten Wert. */
export function entferne(spiel, schluessel) {
  try {
    localStorage.removeItem(vollerSchluessel(spiel, schluessel));
  } catch {
    /* bewusst ignoriert */
  }
}

/**
 * Löscht ALLE gespeicherten Daten eines Spiels (Reset-Knopf).
 * Dafür gehen wir alle localStorage-Schlüssel durch und entfernen
 * die, die mit "ba:<spiel>:" beginnen. Rückwärts zählen, weil
 * sich die Liste beim Entfernen verschiebt.
 */
export function spielZuruecksetzen(spiel) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${PRAEFIX}:${spiel}:`)) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* bewusst ignoriert */
  }
}

/* ------------------------------------------------------------
   Lokale Top-3-Liste (Arcade-Stil mit Initialen)
   Gespeichert wird ein Array aus Einträgen:
     [{ initialen: "LEN", punkte: 420, datum: "2026-10-09" }, …]
   "Lokal" heißt: nur die Versuche in DIESEM Browser – mehrere
   Personen am selben Gerät können sich so trotzdem vergleichen.
   ------------------------------------------------------------ */

const TOPLISTE_SCHLUESSEL = "topliste";
const TOPLISTE_GROESSE = 3;

/** Liefert die (sortierte) Topliste eines Spiels, max. 3 Einträge. */
export function topliste(spiel) {
  const liste = lade(spiel, TOPLISTE_SCHLUESSEL, []);
  return Array.isArray(liste) ? liste.slice(0, TOPLISTE_GROESSE) : [];
}

/**
 * Prüft, ob `punkte` einen Platz in der Topliste verdient hätte.
 * Nützlich, um das Initialen-Feld nur bei echten Rekorden zu zeigen.
 * `richtung`: "hoch" = mehr ist besser (Standard),
 *             "runter" = weniger ist besser (z. B. Versuche beim Raten).
 */
export function waereInTopliste(spiel, punkte, richtung = "hoch") {
  const liste = topliste(spiel);
  if (liste.length < TOPLISTE_GROESSE) return true; // noch Platz frei
  const schlechtester = liste[liste.length - 1].punkte; // Platz 3
  return richtung === "hoch" ? punkte > schlechtester : punkte < schlechtester;
}

/**
 * Trägt einen Versuch in die Topliste ein, sortiert sie und kürzt
 * auf 3 Einträge. Gibt den erreichten Platz zurück (1–3) oder
 * null, wenn es nicht gereicht hat.
 */
export function inToplisteEintragen(spiel, initialen, punkte, richtung = "hoch") {
  // Initialen säubern: max. 3 Zeichen, Großbuchstaben, Fallback "???"
  const sauber =
    String(initialen || "")
      .toUpperCase()
      .replace(/[^A-Z0-9ÄÖÜ]/g, "")
      .slice(0, 3) || "???";

  const liste = topliste(spiel);
  const eintrag = { initialen: sauber, punkte, datum: new Date().toISOString().slice(0, 10) };
  liste.push(eintrag);

  // Sortieren: bei "hoch" absteigend, bei "runter" aufsteigend
  liste.sort((a, b) => (richtung === "hoch" ? b.punkte - a.punkte : a.punkte - b.punkte));
  const gekuerzt = liste.slice(0, TOPLISTE_GROESSE);
  speichere(spiel, TOPLISTE_SCHLUESSEL, gekuerzt);

  const platz = gekuerzt.indexOf(eintrag);
  return platz === -1 ? null : platz + 1;
}

/**
 * Ändert nachträglich die Initialen eines Topliste-Eintrags (1-basierter
 * Platz). Wird vom Game-Over-Dialog genutzt: Rekorde werden erst STILL
 * mit den zuletzt benutzten Initialen eingetragen, und wer mag, tippt
 * danach in Ruhe andere ein – ohne "Trag dich jetzt ein!"-Zwang.
 */
export function initialenAendern(spiel, platz, initialen) {
  const liste = topliste(spiel);
  const eintrag = liste[platz - 1];
  if (!eintrag) return;
  eintrag.initialen =
    String(initialen || "")
      .toUpperCase()
      .replace(/[^A-Z0-9ÄÖÜ]/g, "")
      .slice(0, 3) || "???";
  speichere(spiel, TOPLISTE_SCHLUESSEL, liste);
}
