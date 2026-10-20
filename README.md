# Print & Pulse · Lager v0.1

Eine bewusst kleine Home-Assistant-App für deinen echten Lagervorrat: Etsy-Produkte mit Bild und Titel, separate Etsy-Menge, echte Bestände mit **− / Zahl / +**, laufende Drucke und nachvollziehbare Nachdruckempfehlungen.

## Update in Home Assistant

Der Neustart heißt in der Oberfläche **Lager v0.1**. Die technische App-Version ist **0.11.0**, damit Home Assistant sie als Update der vorherigen 0.10.0 anbietet. Repository, Ordner und App-Slug bleiben identisch. In der HA-App-Verwaltung nach Updates suchen, sichern und aktualisieren. Nicht deinstallieren oder eine zweite App anlegen.

Die alte Oberfläche (Dashboard, Bestellverwaltung, Drucker, 3MF-Dateien und Produktionslinien) ist vollständig ersetzt. Bestehende Etsy-Zugangsdaten bleiben lokal erhalten. Alte Tabellen werden aus Rücksichtsgründen nicht gelöscht, aber nicht mehr verwendet. Frühere Produktionsstände sind **keine Lagerzählung** und werden nicht übernommen.

**Einmalige Etsy-Freigabe:** Die bisherige Verbindung las nur Bestellungen (`transactions_r`). Für Varianten benötigt Etsy zusätzlich `listings_r`. Bei entsprechendem Hinweis unter **Einstellungen → Etsy-Freigabe öffnen** erneut erlauben und die vollständige Rückleitungsadresse einfügen. Schlüssel müssen bei gleicher Installation nicht neu eingegeben werden. Etsy erhält ausschließlich Lesezugriffe; die angebotenen Mengen werden nie überschrieben.

## So nutzt du das Lager

1. Produkte laden lassen. Aktive, ausverkaufte, inaktive, abgelaufene und Entwurfs-Listings werden eingelesen; entfernte bereits bekannte Produkte bleiben als solche erhalten.
2. Varianten öffnen und einmal **Zählen** wählen. Tatsächliche fertige Stücke inklusive reservierter / gepackter Ware erfassen. Unbekannt wird niemals als null angenommen. Die Einheit ist die Etsy-Verkaufseinheit: ein 2er-Set zählt als ein Set, nicht zwei einzelne Stücke.
3. **− / +** korrigiert den echten Bestand. Auf die Zahl tippen erlaubt die Direkteingabe. Neu sortiert wird erst nach fünf Sekunden Bedienpause.
4. **Im Druck** erfasst die gestartete Menge. **Fertig** bucht die erfolgreiche Menge ins Lager. **Abbruch** entfernt fehlgeschlagene Stücke nur aus der Druckmenge. Es wird kein Drucker ferngesteuert.
5. Offene bezahlte Bestellungen reservieren Bestand. Neu erkannter Versand bereits beobachteter offener Positionen zieht die Stücke genau einmal ab. Historische versandte Bestellungen werden beim ersten Import nicht nachträglich abgebucht. Stornierungen/Erstattungen lösen keine Versandabbuchung aus. Retouren nach Rückerhalt selbst einbuchen. Bestandskorrekturen dürfen den automatischen Versandabzug nicht vorwegnehmen.
6. **Rückgängig** nimmt die letzte Bestands-/Druckmengenänderung zurück, solange die Variante inzwischen nicht weiter verändert oder versendet wurde.

## Empfehlungen und Badges

- Karten mit ungedecktem Kundenbedarf bzw. leerem Vorrat zuerst (rot), danach Nachfüllbedarf (gelb), ungezählte Varianten, ausreichend versorgte Produkte (grün).
- Vorschlag = **offene Bestellmenge + Zielvorrat − gezählter Bestand − im Druck**, mindestens null.
- Zielvorrat = aufgerundeter höherer Tagesdurchschnitt aus 7 bzw. 30 Tagen × Vorratstage (anfangs 7), mindestens der je Variante eingestellte Mindestbestand (anfangs 2).
- Reichweite verwendet nur frei verfügbare fertige Ware; „Im Druck“ reduziert die Nachdruckmenge, nicht die sofortige Verfügbarkeit.
- **Nur auf Bestellung**: manuell pro Produkt. Keine Vorratsempfehlung, aber fehlende Kundenmengen bleiben sichtbar.
- **Bestseller**: mindestens fünf verkaufte Verkaufseinheiten in 30 Tagen und unter den obersten 20 % der geladenen Produkte nach Absatz (aufgerundet, mindestens ein Platz). Die Berechnung zählt offene bezahlte und versandte Verkäufe; Erstattungen und unklare Zahlungen bleiben ausgeschlossen.
- Beide Badges stehen **untereinander unten rechts**. Alle Angaben zu Verkäufen zählen Stück/Verkaufseinheiten, nicht die Anzahl Bestellungen.
- Inaktive/entfernte Produkte erhalten keine Vorratsempfehlung; offene Kundenmengen bleiben berücksichtigt.

Die Prognose ist eine einfache lokale Rechenregel. Sie erkennt keine zukünftigen Saisonspitzen. Neue Produkte haben zunächst den Mindestbestand als Ziel; bei null Verkäufen wird keine erfundene Reichweite angezeigt. Für individuelle Produkte „Nur auf Bestellung“ aktivieren.

## Daten und Sicherheit

Alle 15 Minuten automatischer Abgleich, zusätzlich manuell. Bei unvollständigem Bestellabruf bleibt der letzte komplette Stand erhalten. Nicht eindeutig zuordenbare Bestellvarianten werden ausdrücklich als zusätzlicher Prüfbedarf angezeigt. Bei fehlender Varianten-Leseberechtigung können aktive Produktbilder und Etsy-Mengen schon erscheinen, die Inventarerfassung wartet auf die Freigabe.

Die lokale SQLite-Datenbank unter `/data/production.sqlite3` enthält Zugangsdaten, Lagerbestand, aggregierbare Bestellpositionen und Änderungen. Keine Kundennamen/Adressen werden durch v0.1 neu gespeichert. Vorherige Daten bleiben in alten Tabellen für einen möglichen Rollback erhalten. Eine vollständige Home-Assistant-App-Sicherung enthält die Daten; der frühere JSON-Export ist entfallen. Keine Zugangsdaten, Datenbanken oder echten Shopdaten gehören nach GitHub.

Zugriff ausschließlich über Home Assistant Ingress. Keine externen Ports, keine externe KI, keine laufenden Dienst-Abos. Bestehende App-Daten bleiben bei einem normalen Update erhalten.

## Entwicklung und Prüfung

Python-Standardbibliothek, SQLite, HTML/CSS/JavaScript. Lokale Tests mit ausschließlich synthetischen Daten:

```sh
python -m unittest discover -s tests -v
python scripts/check_public.py
python -m py_compile print_pulse_druckplaner/app.py
node --check print_pulse_druckplaner/web/app.js
```

Die automatisierten Prüfungen ersetzen keinen echten Test mit deiner Etsy-Freigabe und deiner Home-Assistant-Installation. Nach dem ersten Abgleich eine Bestellung und eine Variante gegen Etsy und das Regal prüfen.
