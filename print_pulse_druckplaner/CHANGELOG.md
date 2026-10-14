# Changelog

## 0.7.0 – Produktionszentrale und Produktkatalog

### Neu
- Produktionslinie mit den Phasen Geplant, Im Druck und Gedruckt. Phase manuell wechseln; fertige Mengen werden weiterhin bewusst verbucht.
- Kachelansicht mit drei Spalten am Desktop sowie kompakte Listenansicht; Ansichtswechsel wird im Browser gespeichert.
- Kombinierbare Filter: Versandtermin, Stückzahl, Phase, Drucker und heute eingegangene Bestellungen. Suche umfasst Produkt, Farbvariante, Etsy-ID und Bestellnummer.
- Sortierung nach Versandpriorität, Menge oder Produktname. Empfehlung für den nächsten geplanten Auftrag anhand der frühesten bekannten Versandfrist.
- Print-&-Pulse-Logo, Salbeigrün und warme Goldtöne; überarbeitete Karten, Fortschrittsbalken und Bedienelemente.
- Anzeige „Heute bestellt“ anhand des Etsy-Bestelldatums (Europe/Berlin) und „Neu“ für nach dem ersten Abgleich hinzugekommene offene Bestellungen. „Als gesehen markieren“ bestätigt neue Eingänge.
- Reiter Produkte mit dauerhaftem Katalog, Produktdetails, lokalen Namen und Drucknotizen. Bekannte Bestellprodukte werden übernommen; aktive Etsy-Listings lassen sich zusätzlich importieren. Eigene Produkte können manuell angelegt werden.
- Eine 3MF-Datei pro Produkt und Drucker: H2D, P1S Old, P1S New, Snapmaker U1, A1 mini und Prusa MK4. Hochladen, herunterladen, ersetzen und entfernen; bis 100 MB pro Datei.
- Direkter Zugang zu Produktdetails und 3MF-Dateien aus der Auftragskarte.

### Daten und Updates
- Additive Datenbankmigration erhält Bestellstände, eigene Produktnamen, Druckerzuordnungen und Etsy-Zugangsdaten.
- Katalog und 3MF-Dateien liegen ausschließlich in der lokalen App-Datenbank unter /data. Normale App-Updates behalten sie bei. Home-Assistant-Sicherungen der App schließen sie ein.
- Der bisherige JSON-Export bleibt eine Sicherung der Produktionsstände; er enthält keinen vollständigen Produktkatalog und keine 3MF-Dateien. Dafür eine Home-Assistant-App-Sicherung verwenden.
- Hochgeladene 3MF-Dateien werden als ZIP-Projektcontainer geprüft, nie entpackt oder ausgeführt. Ein ungültiger Upload ersetzt keine vorhandene Datei.
- Changelog zusätzlich im App-Verzeichnis, damit Home Assistant die Versionshinweise anzeigen kann.

### Hinweise
- „Gedruckt“ verändert nur die lokale Produktion, nicht den Versandstatus auf Etsy. Produktionsphasen sind manuell und kein Live-Druckerstatus.
- „Heute bestellt“ zählt aktuell offene, produktionsrelevante Bestellungen; bereits versendete Bestellungen sind nicht Teil dieser Ansicht.
- Die Dateien dienen als gespeicherte Druckprojekte; automatisches Senden oder Starten auf einem Drucker ist nicht enthalten.

