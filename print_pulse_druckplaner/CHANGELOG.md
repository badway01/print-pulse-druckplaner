# 0.11.20 · P1S New: Bambu-Sensoren korrekt zuordnen

- Deutsch benannte Bambu-HA-Drucksensoren für P1S New automatisch zuordnen, sofern tatsächlich vorhanden.
- Zustände „Fertig“, „Bereit“, „Druckt“ und „Pausiert“ erkennen.
- Kein manueller Eintrag von Sensor-IDs; keine Änderung an Lager, Bestellungen oder 3MF.

# 0.11.19 · Drucker direkt verbinden, 3MF-Daten vorsichtig laden

- Echte Sensor-IDs für H2D, P1S Old und Snapmaker U1 voreingestellt, ausschließlich bei vorhandenen HA-Entitäten.
- P1S New ohne Druckdaten bleibt unverbunden; Shelly-Werte werden nicht als Druckstatus verwendet.
- A1 mini aus Dashboard und Drucker-Reiter entfernt, 3MF-Profile weiterhin verfügbar.
- Vorhandene beschädigte JSON-Zuordnungen oder ältere Spulen-Spalten blockieren nicht mehr alle Druckprofile.

# 0.11.18 · Druckerautomatik + großer Fertig-Button

- Echte HA-Druckstatus-Sensoren werden je Drucker erkannt und eindeutig zugeordnet.
- P1S Old/New werden nicht automatisch vertauscht; bei fehlender Namenszuordnung eine einmalige Auswahl.
- Ohne Druckerintegration klarer Hinweis statt zahlreicher ungeeigneter AMS-Sensoreinträge.
- „Fertig“ in Produktionskarten deutlich größer und grün für das Wandtablet.

# 0.11.17 · Frühwarnung für Etsy-Verfügbarkeit

- Übersichtlicher Warnbanner bei niedrigen Etsy-Mengen (rot 0, gelb 1–2, Standardwarnschwelle 3).
- Varianten im aufklappbaren Bereich und direkter Sprung zur Produktkarte.
- Schwellenwert in den Einstellungen; Anzeige nur für aktive/ausverkaufte Listings und Daten mit tatsächlichem Etsy-Bestand.
- Letzte Etsy-Katalogaktualisierung sichtbar, keine automatische Schreibaktion bei Etsy.

# 0.11.16 · Safari-Fehlermeldung beim Laden der Druckprofile

- API-Fehler und HTML-Fehlantworten werden als verständliche Meldung angezeigt.
- Fehlender Abruf löscht keine gespeicherten Druckprofile, 3MF-Dateien oder Lagerdaten.
- Neue automatische Browserprüfung mit Safari/WebKit.

# 0.11.15 · Home-Assistant-Sensoren repariert

- Home-Assistant-API-Token wird beim Start korrekt aus der S6-Containerumgebung übernommen.
- Druckersensoren werden bei eindeutigen Treffern vorausgewählt; zunächst nur vier Felder sichtbar.
- Weitere Temperatur-, AMS- und Druckkopfsensoren bleiben einklappbar.

# 0.11.14 · Druckerstatus im Dashboard

- Fünf kompakte Bambu/Snapmaker-Tachos mit Fortschritt, Restzeit und Status.
- Detailansicht mit Sensorzuordnung, Temperaturen und optionalen Filamentfachdaten.
- Lokale Home-Assistant-API, Lesemodus und sicherer Offline-Zustand.

# 0.11.13 · Masterdateien & Filamentbelegung

- 3MF-Masterdateien drucker- und variantenbezogen ablegen und als Versionen sichern.
- AMS-/AMS-HT-/externe Filamentquellen aus dem eigenen Spulenbestand zuweisen.
- Farbnummern und Filamentnotizen mit rückwärtskompatibler Datenbankmigration.
- Produktkatalog und kompakte Farbcodes auf Produktionskarten.
- SMB-Ordnerpfad kopieren, Datei-Download und separates Backup über die HA-share-Freigabe.

# Changelog

## 0.11.12 – Filamentvorschläge und HEX-Farben

- Hersteller-, Material- und Farbvorschläge bei der Eingabe, mit Farbmuster und automatisch eingetragenem HEX-Farbcode.
- Vorhandene Farben und eigene Hersteller werden für spätere Eingaben wieder vorgeschlagen.
- Duplikatsperre für unterschiedliche Schreibweisen; Farbwerte manuell korrigierbar.

## 0.11.11 – Filament & Einkauf

- Neuer eigener Filament-Reiter mit kompakter Farbliste, Preise, Links, Regalspulen und Einkaufsliste.
- Warenkorb mit Spule als Icon, Mengenänderung und Eingangsbuchung erst nach tatsächlicher Lieferung.
- Vierte Kennzahl „Versandkritisch“ statt 9.738 ungeprüfter Varianten.
- Lokale getrennte Speicherung ohne Etsy-Änderungen.

## 0.11.10 – Versand-Countdown

- Versanddatum plus Countdown auf jeder aktuellen Etsy-Bestellkarte und in den Details.
- „Noch N Tage“, „Heute versenden“ oder „N Tage überfällig“; Ampelfarben unverändert.
- Aktualisierung zum Berliner Tageswechsel ohne neuen Etsy-Aufruf; keine Änderung von Beständen oder Datenbanken.

## 0.11.9 – Etsy-Auftragsdruck

- Direkt in offenen Etsy-Bestellkarten auf „Drucken“ tippen, Position und Stückzahl bestätigen.
- Auftragsdruck je Etsy-Transaktion starten, fertigmelden oder abbrechen; direkte Rückwirkung auf „Im Druck“, die Nachdruckempfehlung und den Lagerbestand.
- Schutz vor doppelten Fertigbuchungen und saubere einmalige Versand-Abbuchung.
- Bereits laufende Auftragsdrucke bleiben nach Versand/Stornierung über die Produktkarte bearbeitbar.
- Bestehende Bestände und Etsy-Zugangsdaten bleiben erhalten. Keine Druckerfernsteuerung, keine Etsy-Schreibzugriffe.


## 0.11.8 – Lagerbestand je Variante direkt sichtbar

- Produktkarten zeigen die vorhandenen Stückzahlen mit Variantennamen direkt unter „In Druck“, ohne Aufklappen.
- Kleine Variantenlisten zeigen auch Nullbestände und ausdrücklich noch ungezählte Varianten. Bei großen Listen werden vorhandene Varianten einzeln und leere/ungezählte Varianten als Anzahl angezeigt.
- Antippen einer Bestandszeile öffnet genau diese Variante zum Bearbeiten.
- Lagerbestand und Nachdruckbedarf bleiben getrennt erkennbar; gespeicherte Mengen unverändert.

## 0.11.7 – Druckaktionen direkt auf der Produktkarte

- Gut antippbarer „In Druck“-Button direkt auf jeder Produktkarte, auch bei eingeklappten Varianten.
- Variante und Stückzahl im gemeinsamen Dialog wählen und bestätigen; bei vielen Kombinationen Auswahl nach Merkmalen.
- Laufende Druckmengen je Variante sowie „Fertig“ und „Abbruch“ direkt auf der Karte sichtbar.
- Erst erfolgreich fertig gemeldete Stücke erhöhen den Lagerbestand; Teilmengen bleiben möglich.
- Bestellkarten und Bestelldetails verwenden die deutschen Produkttitel aus dem gespeicherten Shopkatalog statt der käufersprachigen Etsy-Bestelltexte. Unbekannte Produkte erscheinen als „Artikel“ mit Listing-ID.
- Keine zusätzlichen Etsy-Abfragen und keine Änderung am Datenbankschema. Gespeicherte Bestände und Zugangsdaten bleiben erhalten.

## 0.11.6 – Etsy-Abgleich gegen HTTP 429 abgesichert

- Bezahlte offene Bestellungen und Versandänderungen werden alle 15 Minuten mit wenigen API-Aufrufen aktualisiert.
- Der vollständige Etsy-Produktkatalog inklusive Bildern und Varianten wird nur noch einmal täglich geladen, statt alle 15 Minuten.
- Bei HTTP 429 respektiert der Druckplaner `Retry-After` und verwendet eine automatisch ansteigende, lokal gespeicherte Wartezeit. Diese bleibt auch nach einem App-Neustart bestehen.
- Während einer Etsy-Pause ist die manuelle Aktualisierung deaktiviert; der nächste zulässige Versuch wird angezeigt. Bestehende Lagerbestände bleiben nutzbar.
- Getrennte Zeitstempel für den letzten Bestellabgleich und den letzten Katalogabgleich; manuelle Schaltfläche heißt jetzt „Bestellungen aktualisieren“.
- Fehler beim Katalogabruf verwerfen keine erfolgreich geladenen Bestellungen und verändern weder reale Lagerbestände noch laufende Druckmengen.
- Neue Sicherheitstests für HTTP 429, Abklingzeit, Datenbestand und Teilabgleich. Etsy-Zugriff bleibt schreibgeschützt.

## 0.11.5 – Aktuelle Bestellungen und Tablet-Ansicht

- Originales Print-&-Pulse-Logo mit Handschriftzug und Puls-/Herzmotiv als optimierte lokale Grafik im Header integriert.
- Salbeigrün, Mint, Gold, Creme und Anthrazit als durchgängige Farbpalette für Header, Karten, Filter und Aktionen; Dringlichkeitsfarben bleiben klar unterscheidbar.
- Kompaktes Etsy-Bestellkarussell oberhalb der unveränderten Produkt- und Lagerkarten.
- Nur offene, bezahlte Bestellungen; stornierte, erstattete, noch ungeklärte und versendete Bestellungen werden nicht angezeigt.
- Sortierung „Versand zuerst“ (Standard, unbekannte Fristen hinten) oder „Neueste zuerst“; Auswahl wird im Browser gespeichert.
- Wischen nach links/rechts auf Tablet und Handy, Pfeilnavigation am PC, Details je Bestellung mit Artikeln und Varianten.
- Versandfrist farbig gekennzeichnet; ist sie bei Etsy nicht vorhanden, wird ausdrücklich „Versandfrist unbekannt“ angezeigt.
- 11-Zoll-Querformat optimiert: auf breiten Ansichten drei Produktionskarten pro Zeile, kurze Bestellkarten und große Touchflächen.
- Kompatible Ergänzung der lokalen SQLite-Datenbank; Lagerbestände, laufende Drucke und Etsy-Zugang bleiben erhalten.
- Ergänzte Tests für stornierte Bestellungen, Datenübernahme, Migration, Sortierung und Tablet-Layout.
- Etsy-Daten bleiben schreibgeschützt. Automatische Aktualisierung erfolgt wie bisher alle 15 Minuten.


## 0.11.4 – Nachdruckvarianten auf einen Blick

- Nachdruckmengen je Variante direkt auf der Produktkarte oberhalb der Variantenauswahl, auch im eingeklappten Zustand.
- Klick auf einen Bedarf öffnet die zugehörige Variante für Bestands- und Druckaktionen.
- Bei mehreren Merkmalen bleibt die komplette Kombination sichtbar. Ungezählte Varianten werden ausdrücklich als offen gekennzeichnet.
- Lange Bedarfslisten bleiben innerhalb der Karte scrollbar. Bestandsdaten unverändert.

## 0.11.3 – Ruhige Hintergrundaktualisierung

- Bestehende Karten, Bilder und Bedienelemente bei Hintergrundaktualisierungen erhalten; nur geänderte Inhalte anpassen.
- Bestandsänderungen bleiben auch ohne Neuladen sichtbar. Variantenwahl und geöffnete Hinweise bleiben erhalten.
- Gespeicherte Bestände bleiben beim normalen HA-App-Update erhalten; keine Datenbankänderung.
- Browserprüfung kontrolliert unveränderte DOM-Elemente sowohl bei unveränderten Daten als auch bei externen Bestandsänderungen.

## 0.11.2 – Kompakte Variantenauswahl

- Mehrere Varianten über Auswahlfelder statt einer langen Liste bedienen: beispielsweise Katzenfarbe und Laternenfarbe.
- Nur die gewählte Kombination mit Bestand und Druckaktionen anzeigen. Auswahl bleibt beim automatischen Aktualisieren erhalten.
- Abhängige Auswahlfelder bieten nur vorhandene Kombinationen an; einteilige oder ungewöhnliche Variantenbezeichnungen erhalten eine direkte Variantenauswahl.
- Browserprüfung mit 784 Kombinationen, eindeutiger Bestandszuordnung und erhaltener Auswahl.

## 0.11.1 – Übersicht aufgeräumt

- Nur aktive Etsy-Listings in Produktübersicht, Suche, Filtern und Kennzahlen. Inaktive Angebote bleiben intern für vorhandene Bestellzuordnungen erhalten.
- Gleich hohe Karten pro Reihe; zweizeilige Titel und unten ausgerichtete Badges.
- Hinweise klein und standardmäßig eingeklappt. Aufgeklappte Hinweise bleiben beim automatischen Aktualisieren geöffnet.
- Globale Hinweise werden einmal oberhalb der Übersicht angezeigt.

## 0.11.0 – Lager-Neustart v0.1

Technische Update-Version 0.11.0, neue Produktversion **Lager v0.1**. Die höhere technische Version ermöglicht das normale Home-Assistant-Update von 0.10.0.

### Neu

- Kompletter Neustart mit einer übersichtlichen Lagerseite.
- Etsy-Produkte mit Bild und Titel; Etsy-Angebotsmenge strikt getrennt vom tatsächlichen Bestand.
- Varianten aufklappbar, echte Bestände per Minus/Plus oder Direkteingabe.
- Ungezählte Bestände ausdrücklich „Zählen“ statt erfundener Nullbestände.
- Laufende Druckmengen erfassen, fertige Mengen einlagern und Fehldruckmengen zurücknehmen.
- Reservierungen aus offenen bezahlten Bestellungen; idempotente Lagerabbuchung bei bestätigtem Versand.
- Verkaufszahlen der letzten 7/30 Tage, geschätzte Reichweite und automatische Nachdruckmengen.
- Einstellbares Vorratsziel und Mindestbestand je Variante.
- Badge „Nur auf Bestellung“ und automatischer „Bestseller“ untereinander unten rechts.
- Farbiger Kartenrand, Suche und Filter für Nachdrucken, Im Druck und Noch zählen.
- Letzte Bestandsänderung rückgängig machen, sofern keine neuere Buchung/Versandabbuchung vorliegt.
- Automatische Priorisierung nach Bedarf; Umsortieren nach fünf Sekunden Bedienpause.
- Automatischer Etsy-Abgleich alle 15 Minuten und sichtbarer letzter erfolgreicher Abgleich.
- Hinweise bei fehlenden Berechtigungen, unzugeordneten Varianten und Bestandsabweichungen.

### Entfernt

Alte Dashboard-, Bestell-, Drucker-, Produktionslinien- und 3MF-Oberflächen. Kein Druckerstart, keine Sensorzuordnung und kein alter JSON-Export in v0.1.

### Updatehinweise

Etsy-Zugangsdaten und alte Daten bleiben bei einem normalen App-Update erhalten. Neue Lagerbestände einmal selbst zählen. Für Varianten kann eine einmalige erneute Etsy-Freigabe für `listings_r` nötig sein; die App führt ausschließlich Lesezugriffe auf Etsy aus. Historische Produktionsstände werden nicht als Lagerbestand interpretiert. Vollständige Sicherung über Home Assistant verwenden.

### Prüfung

Synthetische Tests für Bestandskorrekturen, Reservierungen, Versand-Deduplizierung, Stornierungen, Rückgängig, Empfehlungen, Varianten, Migration und Zugriffsschutz. Kein Live-Abgleich mit privaten Etsy-/HA-Daten während der Entwicklung.
