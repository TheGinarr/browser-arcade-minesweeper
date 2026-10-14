/* ============================================================
   sprueche.js · Ein bisschen Trost nach dem Game Over
   ------------------------------------------------------------
   Pro Spiel eine kleine Liste. gameOverDialog() in ui.js zieht
   zufällig einen Spruch, wenn es für das Spiel welche gibt.
   Bewusst nur Arcade-Spiele: In den Casino-Spielen wird nicht über
   Verluste gewitzelt (simuliertes Glücksspiel, siehe Jugendschutz).
   Schlüssel = Speicher-Schlüssel des Spiels.
   ============================================================ */

const ALLGEMEIN = [
  "Insert Coin … ach nee, ist ja gratis. Nochmal!",
  "Das war nur Training. Ganz bestimmt.",
  "Kein Geld verloren. Nur ein bisschen Würde.",
];

const SPRUECHE = {
  snake: [
    "Die Schlange hat zu sich selbst gefunden. Leider wörtlich.",
    "Wand: 1, Schlange: 0.",
    "Lang werden ist leicht. Lang bleiben nicht.",
  ],
  froschsprung: [
    "Der Frosch hatte Vorfahrt. Die Autos sahen das anders.",
    "Quak. (Übersetzung: Nochmal!)",
    "Merke: Krokodile sind keine Brücken.",
  ],
  mauerbrecher: [
    "Die Mauer steht noch. Die Mauer lacht.",
    "Der Ball wollte einfach mal raus.",
    "Physik 1, du 0.",
  ],
  meteorsturm: [
    "Der Weltraum ist groß. Die Brocken leider auch.",
    "Hyperraum ist keine Strategie. Okay, manchmal schon.",
    "Das UFO lässt grüßen. Es war nichts Persönliches.",
  ],
  pixelrex: [
    "Ausgestorben. Schon wieder.",
    "Eiszapfen von unten betrachtet: unangenehm.",
    "Laufen ist auch nur Hinfallen mit Stil.",
  ],
  flattervogel: [
    "Schwerkraft: ungeschlagen seit Anbeginn der Zeit.",
    "Die Säule stand da schon vorher.",
    "Flattern ist keine Garantie.",
  ],
};

/** Zufälliger Spruch für das Spiel oder null (z. B. Casino). */
export function spruchFuer(spiel) {
  const liste = SPRUECHE[spiel];
  if (!liste) return null;
  const alle = [...liste, ...ALLGEMEIN];
  return alle[Math.floor(Math.random() * alle.length)];
}
