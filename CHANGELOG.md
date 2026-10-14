# Änderungen

## 0.6.0 – Gedruckt direkt auf der Produktkarte

- Sicherheitsrichtlinie für HTTPS-Produktbilder vom Etsy-CDN korrigiert; HTTP-Test für statische Dateien und Sicherheitsheader ergänzt.

- Ein hervorgehobener Button mit Druckersymbol verbucht unmittelbar **genau ein** fertig gedrucktes Stück.
- Bei mehreren benötigten Stücken bleibt „Mehrere Stück …“ für Sammeldrucke erhalten.
- Mehrfachklicks während einer Buchung werden abgefangen.
- Bei vollständig erledigten Produktvarianten erscheint „Vollständig gedruckt“.
- Rückkorrekturen weiterhin über „Positionen“, ohne Etsy-Bestellungen als versendet zu markieren.
- Enthält auch die noch nicht veröffentlichte v0.5 (Dreispaltenansicht und Etsy-Produktbild oben rechts).

## 0.5.0 – Kompakte Karten und Etsy-Produktbilder

- Drei Karten nebeneinander auf breiten Desktopansichten; Tablet zwei, iPhone eine.
- Das erste Etsy-Listingbild erscheint oben rechts (70 × 70 Pixel).
- Bilder werden über die bestehende nur lesende Etsy-API abgefragt und lokal gecacht.
- Fehlende Bilder blockieren weder Synchronisierung noch Druckplanung.
- Es werden keine API-Schlüssel oder Etsy-Kundendaten in GitHub gespeichert.


## 0.4.0 – Repository-Vorbereitung (noch nicht veröffentlicht)

- Fest kodierte Shop- und Listing-Bezüge entfernt.
- Öffentliche Repo-Struktur für Home Assistant vorbereitet.
- Wiederherstellung lokaler Produktionsdaten aus einem JSON-Export für die spätere Migration ergänzt.
- Kein Upload von Etsy-Secrets, Tokens oder Bestelldaten.
- Kein produktiver Etsy- oder Supervisor-Livetest durchgeführt.
