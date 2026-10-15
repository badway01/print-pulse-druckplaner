# Changelog

## 0.9.0 – Gebündelte Produktkarten und Versand-Ampel

- Gleiche Etsy-Produkte über unterschiedliche Bestellungen und Varianten auf einer kompakten Hauptkarte, mit Anzahl oben links und aufklappbaren Unterkarten.
- Dezent rot für überfällig bis 2 Tage, gelb für 3 Tage und grün ab 4 Tagen bis zum Versand. Frühester offener Termin zählt, dringende Produkte erscheinen zuerst.
- Unterkarten je Bestellung mit Etsy-Kundenname, Versandfrist, Varianten, gedruckten Mengen, Versandart und Versandkosten (wenn von Etsy übermittelt), optionalem Upgrade und bearbeitbarem Versanddienstleister.
- Neue Felder werden ergänzend in der bestehenden Datenbank angelegt, ohne alte Druckstände zu löschen. Noch nicht von Etsy gelieferte Versandinformationen werden nicht geraten.
- Standardansicht ist die dreispaltige Kachelansicht; bisherige Druckverwaltung und Reservierung bleiben bestehen.

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
