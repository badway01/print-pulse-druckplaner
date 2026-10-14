# Druckplaner v0.4 – öffentlich bereinigter Quellcode

Lokale Home-Assistant-App für Etsy-Produktion. Keine mitgelieferten echten Bestellungen, Shop-IDs, Listing-IDs, Zugangsdaten, persönlichen Adressen oder Produktkürzel. Shopbezogene Daten werden erst nach lokalem Etsy-OAuth in der App-Datenbank `/data/production.sqlite3` erzeugt.

**Nicht produktiv verifiziert:** Bitte reale Bestellungsmengen und Versandfristen mit Etsy abgleichen.

Zum Umzug aus einer lokal installierten App siehe die README des Repository-Stammverzeichnisses.

## Neu in v0.6
- Dreispaltige Desktopansicht und 70-px-Produktvorschau aus dem ersten Etsy-Listingbild.
- Bilder müssen für das Listing über die Etsy-API abrufbar sein; sonst erscheint ein neutraler Platzhalter.
- Ein vorhandener v0.4-Datenbestand bleibt bei einem normalen Home-Assistant-App-Update erhalten.


### Direkt verbuchen (v0.6)
Auf der Produktkarte verbucht „🖨 Gedruckt“ (bzw. „+1 gedruckt“) genau ein fertig gedrucktes Stück. Bei Sammeldrucken können mehrere Stück über „Mehrere Stück …“ eingetragen werden. Eine versehentliche Buchung lässt sich unter „Positionen“ korrigieren.
