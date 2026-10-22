## Version 0.11.16 · Fehler beim Laden von Druckprofilen in Safari

Der Ausdruck „The string did not match the expected pattern“ ist eine allgemeine Safari-Fehlermeldung und kann auch bei einer HTML-Fehlantwort von Home Assistant auftreten. Die neue Version erklärt bei nicht lesbaren API-Antworten die Ursache verständlicher, erhält die letzte gültige Druckprofilliste und behandelt serverseitige Leseprobleme ohne Datenveränderung. Zusätzlich prüft die CI nun den Druckprofilabruf mit dem Safari-Browsermotor WebKit.

## Update 0.11.15: Home-Assistant-Sensoren

In Version 0.11.14 startete die App ohne with-contenv; dadurch war der Supervisor-Token in Python nicht sichtbar und die Meldung „Home-Assistant-Zugriff in dieser Umgebung nicht verfügbar“ erschien. **Version 0.11.15 korrigiert den Start**. Nach Installation die App neu starten.

Unter **Drucker → Sensoren zuordnen** werden bei vorhandener Home-Assistant-Integration jetzt eindeutige Sensoren automatisch vorgeschlagen. Die vier Grundfelder sind sichtbar, alle weiteren Temperatursensoren stehen unter **Weitere Sensoren**. Werden keine Sensoren gefunden, zuerst die passende Bambu- beziehungsweise Snapmaker-Integration in Home Assistant prüfen. Identische P1S-Modelle Old und New müssen anhand ihrer wirklichen HA-Entitäten unterschieden werden. Es werden weiterhin **keine** Zugangsdaten der Drucker benötigt oder gespeicherte Lagerdaten verändert.

# Print & Pulse · Lager v0.1

Eine bewusst kleine Home-Assistant-App für deinen echten Lagervorrat: Etsy-Produkte mit Bild und Titel, separate Etsy-Menge, echte Bestände mit **− / Zahl / +**, laufende Drucke und nachvollziehbare Nachdruckempfehlungen.

## Update in Home Assistant

Der Neustart heißt in der Oberfläche **Lager v0.1**. Die aktuelle technische App-Version ist **0.11.14**. Home Assistant erkennt sie als Update der bisherigen 0.11.13. Repository, Ordner und App-Slug bleiben identisch. In der HA-App-Verwaltung nach Updates suchen, sichern und aktualisieren. Nicht deinstallieren oder eine zweite App anlegen.

Die alte Oberfläche (Dashboard, Bestellverwaltung, Drucker, 3MF-Dateien und Produktionslinien) ist vollständig ersetzt. Bestehende Etsy-Zugangsdaten bleiben lokal erhalten. Alte Tabellen werden aus Rücksichtsgründen nicht gelöscht, aber nicht mehr verwendet. Frühere Produktionsstände sind **keine Lagerzählung** und werden nicht übernommen.

**Einmalige Etsy-Freigabe:** Die bisherige Verbindung las nur Bestellungen (`transactions_r`). Für Varianten benötigt Etsy zusätzlich `listings_r`. Bei entsprechendem Hinweis unter **Einstellungen → Etsy-Freigabe öffnen** erneut erlauben und die vollständige Rückleitungsadresse einfügen. Schlüssel müssen bei gleicher Installation nicht neu eingegeben werden. Etsy erhält ausschließlich Lesezugriffe; die angebotenen Mengen werden nie überschrieben.

## Neu in 0.11.14: Drucker-Monitor für Bambu und Snapmaker U1

**Fünf Drucker auf einen Blick:** Auf der Produktionsseite steht unter den Hauptreitern, direkt vor den Etsy-Bestellungen, eine schmale Leiste mit fünf Tachos: Bambu H2D, P1S Old, P1S New, A1 mini und Snapmaker U1. Sie zeigen tatsächlichen Druckstatus, Prozentfortschritt und Restzeit, soweit Home-Assistant-Sensoren diese Werte liefern. Bei fehlender Einrichtung, Offline oder ungültigen Sensorwerten gibt es **keine erfundenen Fortschrittszahlen**.

Im neuen Reiter **Drucker** findest du zu jedem Gerät eine großzügigere Karte mit aktueller Druckdatei, Status, Restzeit, Temperaturen, Schichten und optionaler AMS-Belegung. Beim Snapmaker U1 sind die Temperaturen von T0, T1, T2 und T3 vorgesehen, beim H2D links/rechts. Angezeigt wird nur, was die jeweilige HA-Integration tatsächlich liefert. Der Monitor ist **ausschließlich lesend**; er steuert die Drucker nicht und bucht keine Lagerbestände.

**Einmalige Einrichtung:** In Home Assistant zuerst die entsprechende **Bambu Lab**-Integration für deine vier Bambu-Drucker und eine passende **Snapmaker-U1**-Integration installieren und die Geräte dort verbinden. Danach im Druckplaner **Drucker → Sensoren zuordnen** öffnen und mindestens den tatsächlichen `print_status`- bzw. `print_state`-Sensor je Drucker auswählen. Fortschritt, Restzeit, Datei und Temperaturen sind optional. Über **Passende Sensoren vorschlagen** werden nur eindeutige Treffer angeboten; bei zwei P1S mit ähnlich benannten Sensoren die **Old/New-Zuordnung manuell prüfen**, damit keine Geräte vertauscht werden. Eingaben werden updatefest unter `/data/production.sqlite3` gespeichert und verändern die vorhandenen Etsy-/Lagerdaten nicht.

Die App nutzt ausschließlich lesend die offizielle Home-Assistant-Core-API über den Supervisor-Proxy (`homeassistant_api: true`); die Berechtigung wird durch Home Assistant bei der Aktualisierung bereitgestellt. Der Token bleibt auf dem HA-System. Statusabfrage circa alle 20 Sekunden; der Server verwendet kurzzeitig einen 12-Sekunden-Cache. Ohne die genannten HA-Integrationen zeigt die Oberfläche **Einrichten** beziehungsweise **Offline**. Die Veröffentlichung kann die Geräte nicht selbst in deinem Home Assistant einbinden.

## Neu in 0.11.13: Master-3MF, Druckprofile und interne Filamentcodes

Im Tab **Produktkatalog & 3MF** oder direkt über **3MF & Farben** auf einer Produktionskarte lässt sich pro Etsy-Produkt und Drucker (optional pro Variante) eine eigene AMS-/AMS-HT-/Externe-Spule-Belegung aus dem Filamentlager hinterlegen. Auf Produktionskarten erscheinen die zugehörigen Farbmuster und internen Codes. Der Code und ein frei nutzbares Notizfeld werden in der Filamentverwaltung gepflegt.

**3MF-Masterdateien** können über denselben Dialog hochgeladen werden (maximal 100 MB, gültiges 3MF-/ZIP-Archiv); frühere Uploads werden nicht überschrieben und sind einzeln herunterladbar. Die Dateien liegen getrennt von App-Updates unter `/share/print-pulse/masterdateien/<Etsy-Produkt-ID>/<Drucker>/`. Dafür ist in der Add-on-Konfiguration `share:rw` freigegeben. Zum direkten Öffnen im Windows-Explorer die Home-Assistant-App **Samba share** aktivieren und `\\homeassistant\share\print-pulse\masterdateien` als Netzwerkordner verwenden. Über **Ordnerpfad kopieren** lässt sich der passende Unterordner in den Explorer einfügen. Je nach lokalem Hostnamen `homeassistant` durch deine HA-IP ersetzen. Der Browser kann aus Sicherheitsgründen nicht zuverlässig den Explorer direkt starten.

**Backup:** Die Dateiablage unter `/share` muss in Home-Assistant-Sicherungen einbezogen und idealerweise zusätzlich extern gesichert werden. Die SQLite-Zuordnungen unter `/data` überstehen normale Updates. Vor Installation ein Backup erstellen. Die Samba-Freigabe ist nur für den Windows-Explorer nötig – Upload und Download funktionieren direkt im Dashboard.

## Neu in 0.11.12: Vorschläge mit Hersteller-Farbcode

Beim Anlegen eines Filaments schlägt der Druckplaner **Hersteller, Material und Farbname** vor. „Bambu“ führt zu **Bambu Lab**; nach Eingabe von „Jade“ erscheint beispielsweise **Jade-Weiß (PLA Basic)** mit dem Hersteller-HEX-Code **#FFFFFF** und einem Farbmuster, die per Auswahl in das Formular übernommen werden. Die Farbvorschläge sind abhängig vom Hersteller und, sofern eindeutig gewählt, vom Material. Schon erfasste eigene Farben und Hersteller stehen ebenfalls zur Auswahl. Der HEX-Code ist auch manuell änderbar, etwa bei Sonderfarben. Eine Vorschau zeigt den gespeicherten Farbcode jederzeit.

Der lokale Startkatalog enthält offiziell veröffentlichte Farbcodes für ausgewählte **Bambu Lab PLA Basic/Matte**- und **SUNLU PLA/PLA+/Silk**-Farben. Für andere Hersteller wie eSUN, Polymaker oder Prusament stehen die Herstellernamen und bereits selbst erfasste Filamente zur Auswahl; unbekannte Farbcodes werden **nicht automatisch geraten**. Ein Farbwert ist eine digitale Annäherung und kein Nachweis für die exakte Druckfarbe. Quellen: [Bambu Lab PLA Basic](https://store.bblcdn.eu/s8/default/903b60b06ac142e9b1b49ad53cfa4c82/Bambu_PLA_Basic_Hex_Code.pdf), [Bambu Lab PLA Matte](https://store.bblcdn.com/s1/default/699cd85d9a194edea3423dc34e164579/Bambu_PLA_Matte_10_rolls_Hex_Code.pdf), [SUNLU PLA](https://www.sunlu.com/de/products/pla-3d-printing-filament), [SUNLU Silk](https://www.sunlu.com/products/Silk%20PLA%2B2.0).

Ein bereits vorhandener Eintrag mit demselben Hersteller, Material und derselben Farbe wird im Formular hervorgehoben und serverseitig blockiert, auch bei abweichenden Schreibweisen wie „Jadeweiß“ und „Jade-Weiß“. Der bestehende Eintrag kann dann direkt bearbeitet werden. Schon vorhandene Filamente, Preise und Einkaufsmengen bleiben unangetastet.

## Neu in 0.11.11: Filament & Einkauf

Über den neuen Tab **Filament & Einkauf** führst du ein eigenes manuelles Spulenverzeichnis. **+ Filament anlegen**: Hersteller, Farbbezeichnung, Material, sichtbare Farbprobe, Anzahl tatsächlich **voller Spulen** im Regal, Preis pro Spule und optionaler HTTPS-Einkaufslink. Die kompakte Zeile enthält einen Einkaufswagen mit Filamentspule: **Auf Liste** legt eine Spule auf die **Einkaufsliste**, ein erneuter Klick ergänzt eine weitere. Dort die Menge mit **− / +** korrigieren, Preisgesamtwert ansehen und den hinterlegten Shop öffnen. **Erhalten** nur nach tatsächlicher Lieferung drücken – erst dann wird die eingekaufte Menge zum Spulenbestand addiert und aus der Einkaufsliste entfernt. Es wird weder automatisch bestellt noch Filamentverbrauch aus Druckjobs geschätzt. Leere Eingabelisten sind normal: Deine echten Filamentfarben werden nicht aus Etsy-Produkten geraten.

Die vierte Kennzahl oben heißt jetzt **Versandkritisch** und zählt offene Etsy-Bestellungen, deren Versanddatum heute, innerhalb der nächsten zwei Kalendertage oder überfällig ist; bei unbekannter Frist wird nicht geraten. Der Produktfilter „Noch zählen“ bleibt erhalten. Filamentdaten werden separat in der vorhandenen SQLite-Datei unter `/data` gespeichert; alle bisherigen Druck- und Lagerdaten sowie Etsy-Zugangsdaten bleiben beim normalen Update erhalten.

## Neu in 0.11.10: Versand-Countdown

Auf jeder offenen Etsy-Bestellkarte steht neben dem genauen Versanddatum jetzt die Restzeit: **„Noch 1 Tag“, „Noch 2 Tage“, „Heute versenden“** oder bei überfälligen Aufträgen **„1 Tag überfällig“** / **„N Tage überfällig“**. Die Farben bleiben wie bisher rot (0–2 Tage oder überfällig), gelb (3 Tage) und grün (ab 4 Tagen). Die Berechnung basiert auf dem Kalendertag in Europa/Berlin und wechselt automatisch zum Tageswechsel – auch ohne erneute Etsy-Abfrage. Bei unbekannter Versandfrist wird keine Zeit geschätzt. Die Anzeige erscheint auch in den Bestelldetails. Daten und Lagerbestände bleiben unverändert.

## Neu in 0.11.9: Auftragsdruck direkt aus Etsy-Bestellungen

Auf einer offenen Etsy-Bestellkarte **Drucken** wählen. Bei einer Bestellposition wird direkt die Stückzahl bestätigt; bei mehreren Positionen die richtige Position öffnen. Damit wird die Menge atomar einer konkreten Etsy-Transaktion zugeordnet und unter **Im Druck** mitgezählt. Die Nachdruckempfehlung sinkt entsprechend, dein physischer Lagerbestand bleibt bis zum separaten **Fertig** unverändert. Über **Details** oder die Produktkarte lassen sich auftragsbezogene Drucke fertigmelden oder abbrechen.

Fertige Drucke gelangen ins Lager und werden beim Etsy-Versand automatisch einmalig abgezogen. Wird der Auftrag bereits während eines laufenden, zugeordneten Drucks als versendet erkannt, wird dieser Druck nicht nachträglich fälschlich eingebucht. Nicht zugeordnete Etsy-Varianten werden nicht automatisch geraten. Nach dem Update einmal den Bestellabgleich ausführen, damit ältere Bestellkarten die benötigten Positions-IDs erhalten. **Die App markiert nur den Druckstart und steuert keinen 3D-Drucker.**

Vorhandene Lagerzahlen, laufende Drucke, Bestellungen und Zugangsdaten bleiben bestehen; neue Auftragszuordnungen werden in einer zusätzlichen SQLite-Tabelle unter `/data` gespeichert.

## Neu in 0.11.6: API-Limit-Schutz

Der Abgleich von Bestellungen läuft weiterhin alle 15 Minuten. Der vollständige Listing-/Varianten-Import erfolgt nur noch einmal täglich. Falls Etsy mit **HTTP 429** die Nutzung begrenzt, respektiert das Tool den `Retry-After`-Wert und pausiert automatisch; Neustarts umgehen die Wartezeit nicht. Zeitstempel zeigen den Bestell- und Katalogabgleich getrennt. Lagerbestände bleiben unverändert. Nach einem abgewiesenen Abgleich kann die Freigabe abhängig von Etsys gleitendem 24-Stunden-Kontingent dauern.

## Neu in 0.11.5: Bestellungen und Branding

Die wischbare Bestellleiste oberhalb der Produktkarten zeigt offene, bezahlte Etsy-Bestellungen mit Artikeln, Varianten und Versandfrist. Sortiere nach **Versand zuerst** oder **Neueste zuerst**. Stornierte und versendete Bestellungen sind ausgeblendet; unbekannte Versandfristen werden entsprechend gekennzeichnet. Das 11-Zoll-Querformat ist für **1280 × 800 Pixel** optimiert. Das echte Print-&-Pulse-Logo und die Farben Salbeigrün, Gold und Creme sind integriert.

Die neue Ansicht verwendet wie bisher dieselbe SQLite-Datei unter `/data`. Deine Lagerbestände, laufenden Druckmengen und Etsy-Zugangsdaten bleiben bei der Aktualisierung erhalten. Sichere die Home-Assistant-App vor einem Update; App nicht deinstallieren. Der Etsy-Abgleich bleibt lesend und läuft alle 15 Minuten.

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

Die lokale SQLite-Datenbank unter `/data/production.sqlite3` enthält Zugangsdaten, Lagerbestand, Bestellpositionen und Änderungen. Seit v0.11.5 werden zusätzlich die Namen zu offenen Etsy-Bestellungen sowie die Artikel und Versandfristen für das lokale Bestellkarussell gespeichert. Versandadressen werden dafür nicht übernommen. Diese Bestelldaten bleiben auf Home Assistant und gelangen nicht ins GitHub-Repository. Vorherige Daten bleiben in alten Tabellen für einen möglichen Rollback erhalten. Eine vollständige Home-Assistant-App-Sicherung enthält die Daten; der frühere JSON-Export ist entfallen. Keine Zugangsdaten, Datenbanken oder echten Shopdaten gehören nach GitHub.

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
