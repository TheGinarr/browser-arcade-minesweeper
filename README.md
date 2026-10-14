# Minesweeper

Minesweeper im Browser: Decke alle sicheren Felder auf, markiere Minen mit Flaggen und spiele auf drei Schwierigkeitsstufen um die beste Zeit.

Teil der Sammlung „Browser-Arcade“, hier als
eigenständiges Spiel: nur HTML, CSS und Vanilla-JavaScript, keine Abhängigkeiten,
kein Build-Schritt, keine Cookies, kein Tracking. Spielstände und Highscores liegen
nur im localStorage des Browsers.

## Starten

Wegen der ES-Module braucht es einen (beliebigen) Webserver:

```bash
python3 -m http.server 8000
# dann http://localhost:8000/ öffnen
```

Oder den Ordner auf einen statischen Hoster laden (GitHub Pages, Netlify, eigener Webserver).

## Aufbau

- `index.html` – Spielseite mit Anleitung und Lernbox „Wie funktioniert der Code?“
- `game.js` – Spiellogik und Zeichnen, ausführlich auf Deutsch kommentiert
- `assets/` – gemeinsame Bausteine (Design, Speicher, Dialoge) und lokale Schriften
- `impressum.html`, `datenschutz.html` – **Vorlagen** mit Platzhaltern in eckigen Klammern, vor dem Veröffentlichen ausfüllen (keine Rechtsberatung)

## Code-Stil

Der Code ist mit [Prettier](https://prettier.io) formatiert (Einstellungen in `.prettierrc.json`,
Editor-Grundlagen in `.editorconfig`): 2 Leerzeichen Einrückung, eine CSS-Regel pro Zeile,
höchstens 100 Zeichen pro Zeile. Vor einem Commit einfach `npx prettier --write .` ausführen.

## Lizenz

Code: MIT (`LICENSE`). Schriften: SIL Open Font License 1.1 (`assets/fonts/OFL-LIZENZ.txt`).
Alle Grafiken entstehen im Code, ohne fremde Bilddateien.
