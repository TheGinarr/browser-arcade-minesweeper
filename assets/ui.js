/* ============================================================
   ui.js · Gemeinsame UI-Bausteine für alle Spiele
   ------------------------------------------------------------
   Hier liegt alles, was mehrere Spiele brauchen, aber nichts
   mit der Spiellogik zu tun hat:
     - bewegungReduziert()  → Animations-Wunsch des Nutzers
     - zahlHochzaehlen()    → weicher Zähler-Ticker fürs HUD
     - toplisteAnzeigen()   → Top-3-Liste als HTML rendern
     - gameOverDialog()     → fertiger Dialog inkl. Initialen-
                              Eingabe und Topliste
   Die Spiele importieren daraus nur, was sie brauchen:
     import { gameOverDialog } from "./assets/ui.js";
   ============================================================ */

import {
  topliste,
  waereInTopliste,
  inToplisteEintragen,
  initialenAendern,
  lade,
  speichere,
} from "./storage.js";
import { spruchFuer } from "./sprueche.js";

/**
 * true, wenn der Nutzer im Betriebssystem "Bewegung reduzieren"
 * aktiviert hat. CSS-Animationen schaltet style.css dann schon
 * selbst ab – Spiele nutzen diese Funktion zusätzlich für
 * JS-gesteuerte Effekte (Partikel, Kamera-Shake, Zähler-Ticker …).
 */
export function bewegungReduziert() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Lässt eine Zahl in einem Element weich von ihrem alten Wert zum
 * neuen hochticken (z. B. Punkte im HUD). Bei reduzierter Bewegung
 * wird der Wert einfach direkt gesetzt.
 *
 * requestAnimationFrame ruft `schritt` einmal pro Bildschirm-Frame
 * auf (meist 60×/Sek.) – das ist die Standard-Technik für flüssige
 * JS-Animationen, weil der Browser das Timing selbst optimiert.
 */
export function zahlHochzaehlen(element, zielWert, dauerMs = 400) {
  const startWert = Number(element.textContent.replace(/[^\d-]/g, "")) || 0;
  if (bewegungReduziert() || startWert === zielWert) {
    element.textContent = zielWert;
    return;
  }
  const startZeit = performance.now();
  function schritt(jetzt) {
    // fortschritt läuft von 0 → 1
    const fortschritt = Math.min((jetzt - startZeit) / dauerMs, 1);
    // "easeOut": am Anfang schnell, am Ende sanft auslaufend
    const eased = 1 - Math.pow(1 - fortschritt, 3);
    element.textContent = Math.round(startWert + (zielWert - startWert) * eased);
    if (fortschritt < 1) requestAnimationFrame(schritt);
  }
  requestAnimationFrame(schritt);
}

/**
 * Trägt einen Rekord STILL in die Topliste ein – ohne Dialog, ohne
 * Aufforderung. Verwendet die zuletzt benutzten Initialen (oder "???").
 * Gibt den erreichten Platz (1–3) zurück, sonst null.
 * Die Casino-Spiele nutzen das nach einem großen Gewinn: Die Topliste
 * auf der Seite aktualisiert sich einfach, mehr passiert nicht.
 */
export function stillEintragen(spiel, punkte, richtung = "hoch") {
  const zaehlt = richtung === "hoch" ? punkte > 0 : true;
  if (!zaehlt || !waereInTopliste(spiel, punkte, richtung)) return null;
  const initialen = String(lade("global", "initialen", "")).slice(0, 3) || "???";
  return inToplisteEintragen(spiel, initialen, punkte, richtung);
}

/**
 * Rendert die lokale Top-3-Liste eines Spiels in einen Container.
 * `formatierer` darf die Punktzahl hübsch machen (z. B. "12 Versuche").
 * `hervorhebenPlatz` (1–3) markiert einen frisch eingetragenen Platz dezent.
 */
export function toplisteAnzeigen(
  container,
  spiel,
  formatierer = (p) => String(p),
  hervorhebenPlatz = null,
) {
  const liste = topliste(spiel);
  container.innerHTML = ""; // alten Inhalt leeren
  const ul = document.createElement("ul");
  ul.className = "topliste";

  if (liste.length === 0) {
    const li = document.createElement("li");
    li.className = "leer";
    li.textContent = "Noch keine Einträge – sei die/der Erste!";
    ul.append(li);
  }

  liste.forEach((eintrag, i) => {
    const li = document.createElement("li");
    if (hervorhebenPlatz === i + 1) li.classList.add("neu");
    // textContent statt innerHTML für die Werte → gespeicherte
    // Zeichen werden nie als HTML interpretiert (XSS-Schutz,
    // auch wenn hier nur eigene Daten liegen: saubere Gewohnheit).
    const platz = document.createElement("span");
    platz.className = "platz";
    platz.textContent = `${i + 1}.`;
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = eintrag.initialen;
    const punkte = document.createElement("span");
    punkte.className = "punkte";
    punkte.textContent = formatierer(eintrag.punkte);
    li.append(platz, name, punkte);
    ul.append(li);
  });

  container.append(ul);
}

/**
 * Zeigt den Game-Over-Dialog eines Spiels.
 *
 * optionen = {
 *   spiel:       "snake"            // Schlüssel für den Speicher
 *   titel:       "GAME OVER"        // Überschrift
 *   punkte:      42                 // erreichte Punktzahl
 *   punkteText:  "42 Punkte"        // optional: hübsche Anzeige
 *   richtung:    "hoch" | "runter"  // mehr oder weniger ist besser?
 *   format:      (p) => `${p} …`    // optional: Punkteformat der Topliste
 *   neustart:    () => { … }        // wird bei "Nochmal" aufgerufen
 * }
 *
 * ZUM EINTRAGEN: Reicht das Ergebnis für die Top 3, wird es STILL mit
 * den zuletzt benutzten Initialen eingetragen und in der Liste nur
 * dezent markiert. Darunter steht eine kleine, unaufdringliche Zeile,
 * in der man die Initialen ändern KANN – keine Aufforderung, kein
 * eigener Knopf, kein "Trag dich jetzt ein!". Wer den Dialog einfach
 * wegklickt, hat trotzdem seinen Eintrag.
 */
export function gameOverDialog(optionen) {
  const {
    spiel,
    titel = "GAME OVER",
    punkte,
    punkteText,
    richtung = "hoch",
    format,
    neustart,
  } = optionen;

  // Gibt es den Dialog schon (vom letzten Mal)? Dann aufräumen.
  document.getElementById("spiel-dialog")?.remove();

  const dialog = document.createElement("dialog");
  dialog.className = "spiel-dialog";
  dialog.id = "spiel-dialog";

  // Still eintragen (0 Punkte zählen nie als Rekord, das prüft
  // stillEintragen selbst). platz ist 1–3 oder null.
  const platz = stillEintragen(spiel, punkte, richtung);

  // Grundgerüst des Dialogs. Die dynamischen Werte (Punkte) werden
  // unten per textContent gesetzt – nie ungeprüft in HTML mischen.
  dialog.innerHTML = `
    <h2></h2>
    <p class="gross"></p>
    <p class="spruch" hidden></p>
    <div class="topliste-halter"></div>
    ${
      platz
        ? `
      <p class="initialen-zeile">Eingetragen als
        <input class="initialen klein" maxlength="3" autocomplete="off"
               spellcheck="false" aria-label="Initialen ändern (3 Zeichen)">
      </p>
    `
        : ""
    }
    <div class="aktionen">
      <button class="knopf primaer" data-rolle="nochmal">Nochmal</button>
      
    </div>`;

  dialog.querySelector("h2").textContent = titel;
  dialog.querySelector(".gross").textContent = punkteText ?? String(punkte);
  // Ein kleiner Trost-Spruch (nur Arcade-Spiele, siehe sprueche.js)
  const spruch = spruchFuer(spiel);
  if (spruch) {
    const zeile = dialog.querySelector(".spruch");
    zeile.textContent = spruch;
    zeile.hidden = false;
  }

  const halter = dialog.querySelector(".topliste-halter");
  toplisteAnzeigen(halter, spiel, format, platz);

  // --- Dezente Initialen-Änderung: wirkt direkt beim Tippen ----
  if (platz) {
    const eingabe = dialog.querySelector(".initialen");
    eingabe.value = String(lade("global", "initialen", "")).slice(0, 3) || "???";
    eingabe.addEventListener("input", () => {
      const initialen = eingabe.value.trim().toUpperCase().slice(0, 3);
      if (!initialen) return;
      speichere("global", "initialen", initialen);
      initialenAendern(spiel, platz, initialen);
      toplisteAnzeigen(halter, spiel, format, platz);
    });
  }

  // --- "Nochmal" startet das Spiel neu ------------------------
  dialog.querySelector('[data-rolle="nochmal"]').addEventListener("click", () => {
    dialog.close();
    dialog.remove();
    neustart?.();
  });

  // Esc (= "cancel"-Event) soll den Dialog auch sauber entfernen
  dialog.addEventListener("cancel", () => dialog.remove());

  document.body.append(dialog);
  dialog.showModal();
  // Fokus bewusst auf "Nochmal", NICHT auf die Initialen-Eingabe –
  // der Eintrag ist ja schon passiert, niemand MUSS hier etwas tippen.
  dialog.querySelector('[data-rolle="nochmal"]')?.focus();
  return dialog;
}
