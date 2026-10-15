# Changelog

## 0.9.0 – Gebündelte Produktkarten und Versand-Ampel

- Gleiche Etsy-Produkte unabhängig von Bestellzeitpunkt und Farbvarianten zu aufklappbaren Hauptkarten bündeln.
- Pastell-Ampel: überfällig bis 2 Tage rot, genau 3 Tage gelb, ab 4 Tagen grün; früheste offene Versandfrist zuerst.
- Bestellunterkarten mit Etsy-Kundenname, Menge, Variante, Versanddatum, -art, Käufer-Versandkosten, gegebenenfalls Upgrade sowie manuell bearbeitbarem Dienstleister.
- Additive Migration ohne Datenverlust. Fehlende Versandinformationen bleiben ausdrücklich ungeklärt; Druckvorschläge und Drucker-Zuordnungen bleiben.

## 0.8.0 – Druckvorschläge und einheitliche Produktkarten

### Neu
- Größere Produktbilder mit festem Bildbereich, klarere Print-&-Pulse-Kacheln, drei Desktop-Spalten und gleich hohe Aktionsbuttons. „Gedruckt“ steht in einer Kachelreihe auf gleicher Höhe.
- Die Hinweise auf heutige und neue Bestellungen sind anklickbar. Die Detailansicht zeigt genau die zugehörigen Bestellnummern, Produkte, Farben, Mengen und Versandfristen.
- Datum und Uhrzeit des letzten erfolgreichen Etsy-Abgleichs direkt oben, ausdrücklich in deutscher Ortszeit (Europe/Berlin). Fehlgeschlagene Abgleiche ändern diesen Zeitstempel nicht.
- Konkrete lokale Druckvorschläge: Produkt/Farbe, Stückzahl, Drucker, Versandfrist und verfügbare 3MF. Gleiche Varianten werden gebündelt; gedruckte und reservierte Mengen werden berücksichtigt. Die Vorschläge bleiben unabhängig von Ansichtsfiltern.
- „Vorschlag übernehmen“ reserviert die Menge dauerhaft. Pro Drucker und Variante höchstens eine aktive Reservierung, mit Schutz vor doppelter Übernahme. Fertigmeldungen bauen die zugehörigen Reservierungen ab; „Freigeben“ hebt sie auf. Geschlossene Bestellungen und reduzierte Mengen werden abgeglichen.
- Unter Produkte je Drucker Plattenkapazität, Dauer in Minuten und Slicer hinterlegen. Ohne Profil zunächst ein Stück pro Vorschlag; 0 Minuten bedeutet unbekannt. Reservierte Varianten werden erst nach Abschluss oder Freigabe erneut vorgeschlagen.
- „Für [Slicer] laden“ lädt die hinterlegte 3MF und zeigt den Öffnen-Ablauf für Bambu Studio, OrcaSlicer, Snapmaker Orca oder PrusaSlicer. Der normale Download bleibt verfügbar.

### Grenzen und Daten
- Die Vorschläge nutzen nachvollziehbare lokale Regeln, keinen externen KI-Dienst. Sie starten keine Drucker und kennen keinen Live-Druckerstatus; „belegt“ basiert auf Reservierungen und manuell gesetzter Phase.
- Echtes direktes Öffnen im lokalen Slicer ist noch nicht enthalten: Eine native App kann die geschützte Home-Assistant-Ingress-Sitzung nicht übernehmen. Dafür wäre eine lokale Brücke erforderlich; derzeit die heruntergeladene Datei im zugeordneten Slicer öffnen.
- Plattenbelegung, Druckzeit und Farbzuordnung stammen aus deinen Angaben. Vor jedem Druck die 3MF im Slicer prüfen; gespeicherte Produktdateien werden nicht automatisch an eine Farbvariante angepasst.
- Additive Datenbankerweiterung erhält vorhandene Produktionsstände, Katalog, 3MF und Zugangsdaten. Profile und Reservierungen sind Teil der Home-Assistant-App-Sicherung, nicht des bisherigen JSON-Exports.

### Geprüft
- 24 automatisierte Tests, einschließlich Reservierung, doppelter Übernahme, Fertigmeldung, Mengenänderung, Auftragsabschluss und Migration.
- Browserprüfung: Bestelldetails, ausgerichtete Buttons, Reservierungen, Profil speichern, bytegleicher 3MF-Download und mobile Ansicht.

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

