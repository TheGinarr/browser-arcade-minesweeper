/* ============================================================
   keks.js · Der ehrlichste Cookie-Hinweis des Internets
   ------------------------------------------------------------
   Eine Parodie auf Cookie-Banner. Die Seite setzt keine eigenen
   Cookies (siehe Datenschutz), deshalb gibt es hier nichts
   einzuwilligen. Beide Knöpfe tun dasselbe: Sie schließen den
   Hinweis, und das merkt sich der Browser (localStorage, wie die
   Highscores). Der Hinweis blockiert nichts, stiehlt keinen Fokus
   und ist kein Dialog, nur ein Kasten am unteren Rand.
   ============================================================ */

import { lade, speichere } from "./storage.js";

const SCHLUESSEL = "keks-gelesen";

function zeigen() {
  if (lade("global", SCHLUESSEL, false)) return;

  // Pfad zur Datenschutzseite: Seiten in Unterordnern verlinken das Favicon mit "../"
  const basis = document.querySelector('link[rel="icon"]')?.getAttribute("href")?.startsWith("../")
    ? "../"
    : "";

  const box = document.createElement("section");
  box.className = "keks";
  box.setAttribute("aria-label", "Hinweis zu Cookies");
  box.innerHTML = `
    <p><span aria-hidden="true">🍪</span> Diese Website verwendet keine eigenen Cookies.
      Deine Highscores bleiben in deinem Browser, Kekse musst du selbst mitbringen.
      <a href="${basis}datenschutz.html">Datenschutz</a></p>
    <div class="keks-knoepfe">
      <button type="button" class="knopf">Zur Kenntnis genommen</button>
      <button type="button" class="knopf">Ebenfalls zur Kenntnis genommen</button>
    </div>`;
  box.querySelectorAll("button").forEach((k) =>
    k.addEventListener("click", () => {
      speichere("global", SCHLUESSEL, true);
      box.classList.add("weg");
      setTimeout(() => box.remove(), 250);
    }),
  );
  // Bewusst NICHT in <body>: Der body hat eine Einblend-Animation mit
  // transform, und darin würde position:fixed relativ zum body statt zum
  // Bildschirm rechnen. Direkt unter <html> klebt der Kasten unten am Rand.
  document.documentElement.append(box);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", zeigen);
else zeigen();
