# 0.11.17 · Etsy-Bestandswarnung im Produktionsdashboard

- Schmaler, zunächst eingeklappter Warnbanner unter den Kennzahlen: rot für 0/vergriffene Etsy-Mengen, gelb bei 1 bis 2 Stück (Schwelle veränderbar).
- Berücksichtigt sowohl Etsy-Gesamtmengen als auch aktivierte Varianten; inaktive/Entwurf/abgelaufene Listings ausgeschlossen, ausverkaufte Listings erfasst.
- Betroffene Varianten werden je Listing gruppiert, bei vielen Kombinationen zunächst nur drei Namen; Klick springt zur Produktkarte.
- Schwellenwert in Einstellungen von 1 bis 99, Vorgabe 3; nur Anzeige und keine schreibenden Änderungen an Etsy, Bestand oder Druckprofilen.
- Etsy-Katalog-Aktualisierungszeit wird sichtbar genannt: Bestandsdaten basieren auf dem zuletzt erfolgreichen Katalogabgleich, nicht auf Live-Etsy-Updates.
- Regressionen für 0/1/2/3 Grenzen, ausverkaufte/inaktive Produkte, 784 Varianten und stabile Bestände.

# 0.11.16 · Druckprofile und Master-3MF in Safari

- Robuster Datenabruf: Nach einem HTML-Fehler des Home-Assistant-Ingress wird eine konkrete Meldung mit HTTP-Status angezeigt statt der unverständlichen Safari-Ausnahme „The string did not match the expected pattern“.
- API-Ladefehler und Darstellungsfehler werden getrennt behandelt; die letzte gültige Liste von Druckprofilen bleibt erhalten.
- Backend liefert bei einem Lese-/Datenbankfehler eine kontrollierte JSON-Antwort statt einer abgebrochenen Verbindung; keine Veränderung gespeicherter Profile oder Masterdateien.
- Neuer Safari/WebKit-Browsertest prüft das Anzeigen realer Druckprofile, HTML-Fehlerantworten und die Wiederherstellung nach einem fehlgeschlagenen Abruf.

# 0.11.15 · Home-Assistant-Verbindung repariert

- Startkommando auf S6 with-contenv korrigiert: Python erhält den für Home Assistant benötigten Supervisor-Token.
- Der Drucker-Einrichtungsdialog zeigt zunächst nur Status, Fortschritt, Restzeit und Druckdatei; weitere Sensoren sind einklappbar.
- Eindeutige Sensoren werden bei der ersten Einrichtung automatisch vorgeschlagen; bei zwei P1S bleibt die manuelle Zuordnung wichtig.
- Regressionstests für Token-Start, vereinfachtes Formular und Sensorvorschläge.
- Vorhandene Bestands-, Filament- und Druckdateien bleiben unverändert.

# 0.11.14 · Live-Drucker-Monitor

- Fünf kompakte Status-Tachos im Produktionsdashboard, abgestimmt auf das 11-Zoll-Tablet.
- Neuer Reiter Drucker mit Detailkarten für H2D, P1S Old/New, A1 mini und Snapmaker U1.
- Sensorzuordnung mit eindeutigen Vorschlägen, bewusst getrennte Konfiguration beider P1S.
- Lesender Home-Assistant-API-Zugang, Backend-Cache, Offline-/Fehlersignalisierung ohne erfundene Werte.
- Temperatur-, Datei-, Schicht- und AMS-Details, soweit passende Sensoren existieren.
- Updatefeste lokale Konfiguration; bestehende Lager- und Filamentdaten unverändert.

# 0.11.13 · Masterdateien & Filamentbelegung

- 3MF-Masterdateien drucker- und variantenbezogen ablegen und als Versionen sichern.
- AMS-/AMS-HT-/externe Filamentquellen aus dem eigenen Spulenbestand zuweisen.
- Farbnummern und Filamentnotizen mit rückwärtskompatibler Datenbankmigration.
- Produktkatalog und kompakte Farbcodes auf Produktionskarten.
- SMB-Ordnerpfad kopieren, Datei-Download und separates Backup über die HA-share-Freigabe.

# Changelog

## 0.11.12 – Filament-Autovervollständigung und Farbcodes

- Hersteller, Material und Farben erhalten gut antippbare Vorschläge beim Eintippen, inklusive bereits gespeicherter eigener Filamente.
- Offizielle Farbwerte für Bambu Lab PLA Basic/PLA Matte sowie SUNLU PLA, PLA+ und einige Silk-Farben als lokaler Katalog: Farbmuster und HEX-Code werden bei Auswahl automatisch übernommen. Manuelle Farbcodes bleiben änderbar; für andere Hersteller werden keine erfundenen Farbcodes ausgegeben.
- Bambu / Bambu Lab sowie Schreibweisen wie Jadeweiß / Jade-Weiß / Jade White werden als dieselbe Filamentvariante erkannt.
- Duplikate werden im Formular mit Hinweis auf vorhandenen Eintrag abgefangen und zusätzlich in der SQLite-Speicherung atomar verhindert. Bestehende Daten werden nicht überschrieben oder zusammengeführt.
- Kein externer Dienst oder zusätzliche Etsy-Anfrage; Quellen und Einschränkungen stehen in der README.

## 0.11.11 – Filamentlager und Einkaufsliste

- Neuer Bereich „Filament & Einkauf“ im Tablet-Druckplaner. Manuelles Verzeichnis mit Hersteller, Farbname, Material, Farbmuster, voller Spulenzahl, Preis und HTTPS-Einkaufslink.
- Kompakte Spulen-Zeilen statt großer Produktkarten, mit Spulen-Warenkorb pro Farbe und eigener Einkaufsliste. Mengen +/- ändern und direkt zum hinterlegten Shop öffnen.
- „Erhalten“ übernimmt ausschließlich tatsächlich eingetroffene Spulen von der Einkaufsliste in den physischen Filamentbestand. Anlegen, Bearbeiten und Löschen möglich; keine automatische Bestellung.
- „Noch zählen“ in den vier Kennzahlen durch „Versandkritisch“ ersetzt: offene Etsy-Bestellungen mit höchstens zwei Kalendertagen bis zur Versandfrist oder überfällig. Variantenfilter „Noch zählen“ bleibt erhalten.
- Filamentdaten in separater lokaler SQLite-Tabelle; bestehende Bestände, Etsy-Zugangsdaten und Druckaufträge unverändert. Keine zusätzliche Etsy-API-Nutzung.

## 0.11.10 – Versand-Countdown auf aktuellen Bestellungen

- Jede offene Bestellkarte zeigt das Etsy-Versanddatum und daneben die verbleibenden Kalendertage („Noch 1 Tag“, „Noch 2 Tage“ usw.).
- Am Versandtag erscheint „Heute versenden“, nach Fristüberschreitung „1 Tag überfällig“ bzw. „N Tage überfällig“. Unbekannte Fristen werden nicht geschätzt.
- Farbkennzeichnung bleibt bestehen: rot bei 0–2 Tagen bzw. überfällig, gelb bei 3 Tagen, grün ab 4 Tagen.
- Countdown verwendet Berliner Kalendertage und aktualisiert sich automatisch bei Tageswechsel, auch ohne Etsy-Synchronisierung; Anzeige auch in den Bestelldetails.
- Reine Oberflächenänderung: Lagerbestände, zugeordnete Drucke, Etsy-Zugangsdaten und Datenbankschema bleiben unverändert.

## 0.11.9 – Etsy-Auftragsdruck direkt auf Bestellkarten

- Neuer „Drucken“-Button auf Etsy-Bestellkarten: bei einem Artikel öffnet sich direkt die Stückzahlbestätigung, bei mehreren Positionen die positionsgenaue Auswahl.
- Jeder Auftragsdruck ist mit der originalen Etsy-Transaktions-ID und exakt einer Lager-Variante verknüpft. Laufende Drucke direkt bei der Bestellung oder in der Produktkarte fertigmelden/abbrechen.
- Start setzt nur „Im Druck“ hoch und reduziert dadurch den Nachdruckbedarf; der echte Bestand wächst erst bei „Fertig“. Nach Etsy-Versand wird bereits zugeordneter, noch laufender Druck nicht irrtümlich doppelt eingebucht.
- Auftragsgebundene Mengen sind gegen allgemeine Fertig-/Abbruchbuchungen geschützt; begrenzte Restmengen und Versionsprüfungen verhindern versehentliche Doppelbuchungen.
- Bereits gespeicherte Etsy-Aufträge ohne Transaktions-ID brauchen einen erneuten Bestellabgleich; unklare Varianten können nicht ungeprüft gedruckt werden.
- Eigene SQLite-Tabelle nur für Auftragsdruck-Zuordnung, ohne Änderungen oder Zurücksetzen bestehender Bestandsdaten. Keine Etsy-Schreibberechtigung, keine Druckerfernsteuerung.
- Neue Regressionstests für Teilmengen, Mehrfachbuchungen, Versand vor/nach Fertigmeldung, Abbruch und Update-Migration.


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
