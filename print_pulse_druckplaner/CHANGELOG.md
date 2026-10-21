# Changelog

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
