# 0.11.29 · Filament-Gesamtwert und Zahlentastaturen

- Im Filamentlager zeigt „Meine Farben“ den Wert der erfassten vollen Spulen: Anzahl × hinterlegter Spulenpreis.
- Spulen ohne Preis werden separat angezeigt, damit eine unvollständige Gesamtsumme nicht als vollständiger Lagerwert erscheint.
- Die Einkaufsliste fließt nicht in den Lagerwert ein; ihre bestehende Kostensumme bleibt erhalten.
- Im Filamentformular öffnen Mobilgeräte die Zifferntastatur für volle Spulen und die Dezimaltastatur für den Preis.
- Kein Datenbankeingriff: Filamentfarben, Bestände, Preise, Druckaufträge, Etsy-Daten und Master-3MF-Dateien bleiben unverändert.

# 0.11.28 · Lagerbestand ohne Foto-Overlay

- Großes Lager-Overlay entfernt: Produktfotos bleiben auf Tablet und iPhone sichtbar.
- Oben rechts nur noch ein kleiner antippbarer Lager-Button (mindestens 44 Pixel).
- Unter dem Bild steht eine kompakte, für offene Aufträge relevante Bestandszeile: echte Lagerwerte, nicht Etsy-Mengen oder Nachdruckbedarf.
- Vollständige Lagerübersicht erst nach Antippen: alle Varianten in einer scrollbar begrenzten Liste, nach Auftragsbezug priorisiert.
- „Noch zählen“ und erfasster Nullbestand sind ausdrücklich verschieden. Geöffneter Zustand bleibt beim automatischen Aktualisieren erhalten.
- Keine Datenbankänderung; vorhandene Lagerbestände, Etsy-Zugänge, 3MF-Dateien und Druckaufträge bleiben unverändert.

# 0.11.27 · Lagerbestand direkt auf Produktfotos

- Oben links bleibt die Etsy-Menge unverändert sichtbar; oben rechts erscheint ein dezentes Feld **Im Lager** mit den tatsächlich gezählten Beständen je Variante.
- Der Bildhinweis zeigt bis zu drei Varianten; bei zahlreichen Varianten erscheinen bevorzugt vorhandene Bestände und ein kompakter „+ weitere Varianten“-Hinweis.
- Noch nicht gezählte Varianten erhalten **Noch zählen** statt einer irreführenden Null. Erfasste Nullbestände werden korrekt als **0 ×** angezeigt.
- Grundlage ist ausschließlich der lokale, tatsächlich erfasste Lagerbestand (`on_hand`), nicht der Etsy-Katalogbestand, laufende Drucke oder die Nachdruckmenge.
- Aktualisierung unmittelbar nach Lageränderungen oder dem Fertigmelden von Drucken. Die bisherigen ausführlichen Varianten- und Nachdruckbereiche bleiben erhalten.
- Mobil- und Dark-Mode-Darstellung sowie Browser-Tests für die überlagerungsfreie Positionierung und Live-Aktualisierung.

# 0.11.26 · Etsy-Bestandswarnung nach Prozent statt fixer Stückzahl

- Warnbanner bewertet den *Etsy*-Katalogbestand ab einer einstellbaren Restquote (Standard 25 %), aufgerundet auf die nächste ganze Stückzahl und inklusive der errechneten Grenze.
- Beispiele: Etsy-Ausgangsmenge 5 → Warnung bei höchstens 2 Stück; 8 → 2 Stück; 10 → 3 Stück; 25 → 7 Stück.
- Die Etsy-Ausgangs-/Referenzmenge wird für jedes Listing und jede Etsy-Variante separat als bisher höchste erfolgreich beobachtete Etsy-Menge lokal und updatefest gespeichert. Sie sinkt bei Verkäufen nicht mit. Steigt eine Etsy-Menge durch Nachfüllen über die bisherige Referenz, erhöht sich die Referenz automatisch.
- Auf bestehenden Installationen wird die Referenz beim ersten Start aus dem **bereits gespeicherten Etsy-Katalogbestand** übernommen. Früher eingestellte Ausgangsmengen, die Etsy inzwischen reduziert hat, können nicht automatisch zurückgerechnet werden.
- Details der Warnung nennen Etsy-Restbestand, Referenzmenge und berechnete Warnschwelle. Die Prozentgrenze lässt sich unter Einstellungen anpassen.
- Der physische Lagerbestand (gezählte Bestände, im Druck, Reservierungen) hat keinerlei Einfluss auf die Etsy-Verfügbarkeitswarnung.
- Der letzte Etsy-Bestellungs- und Katalogabgleich mit Datum/Uhrzeit bleibt angezeigt. Etsy-Katalogbestände werden weiterhin regulär täglich abgerufen, um Etsy-API-Limits einzuhalten.

# 0.11.25 · Print-&-Pulse-Logo ohne hellen Hintergrundkasten

- Der ursprüngliche Schriftzug, die grüne Pulslinie und das goldene Herz bleiben erhalten. Eine Alpha-Maske in der SVG-Datei entfernt nun den eingebetteten hellen Fotohintergrund direkt im Logo.
- Der Dashboard-Kopfbereich erhält eine dezente salbeigrüne Tönung (Hellmodus); das transparente Logo fügt sich ohne sichtbares Rechteck ein.
- Auch der Dunkelmodus nutzt die transparente Logo-Datei statt unzureichender Mischmodi, mit besserer Lesbarkeit.
- Ein Browser-Test prüft die tatsächlich gerenderten Alphawerte an den Logo-Ecken und stellt sicher, dass die Schrift erhalten bleibt.
- Etsy, Lagerbestand, Druckprofile, Drucker und 3MF-Dateien bleiben unverändert.

# 0.11.24 · Mobilnavigation und klare Status-Texte

- Produktionsbereich: „PRODUKTION · LIVE“ statt „WERKSTATT · LIVE AUS HOME ASSISTANT“.
- Etsy-Bestellungen: „ETSY · DEIN SHOP“ statt „ETSY · LIVE NACH ABGLEICH“. **Wichtig:** Datum und Uhrzeit der letzten Etsy-Bestellungs- und Katalogaktualisierung bleiben unverändert sichtbar, einschließlich der Abgleichintervalle.
- Auf dem iPhone und anderen kleinen Displays stehen Produktion, Produktkatalog & 3MF, Filament & Einkauf und Drucker in einer einzigen horizontal wischbaren Leiste, ohne Seitenumbruch; der aktive Reiter wird automatisch ins Sichtfeld gebracht.
- Das originale Print-&-Pulse-Logo bleibt unverändert; der eingebettete helle Bildhintergrund fügt sich über eine CSS-Mischung in den hellen beziehungsweise dunklen Header ein.
- Browser-Regressionstests kontrollieren Überschriften, Etsy-Aktualisierungsanzeige, das helle/dunkle Logo und mobile Reiter ohne horizontales Scrollen der gesamten Seite.
- Keine Änderung an Etsy-Synchronisation, Lagerbeständen, Druckersteuerung oder gespeicherten Master-3MF-Dateien.

# 0.11.23 · Theme-Switch, Tag/Nacht-Automatik und klarere Oberfläche

- Im Header ersetzt ein kompakter Dreifach-Switch die alte, falsche Anzeige „LAGER v0.1“: Sonne (Hell), Halbmond (Dunkel), Auto.
- Auto nutzt den Home-Assistant-Sonnenstand `sun.sun` für Sonnenaufgang und Sonnenuntergang, bei fehlenden HA-Daten die Geräteeinstellung. Regelmäßige Aktualisierung und sofortige Prüfung beim Wiederöffnen der App.
- Gewählter Modus bleibt auf dem jeweiligen Gerät gespeichert. Alle Ansichten einschließlich Filamentlager, Drucker, Warnungen und Dialoge erhalten ein angepasstes dunkles Design.
- Heller Modus mit weißerem Hintergrund und dezent kräftigeren Kartenrahmen; auch iPhone- und Tablet-Layouts berücksichtigt.
- Die echte installierte Version und eine aufklappbare Änderungshistorie stehen jetzt unter Einstellungen → Version & Änderungen.
- Die neue Funktion liest HA-Zustände ausschließlich serverseitig und ändert keine Drucker, Etsy-Daten, Lagerbestände oder Master-3MF-Dateien.

# 0.11.22 · HTTP 500 beim Abruf von 3MF-Druckprofilen beheben

- Ursache im Home-Assistant-Protokoll: bereits vorhandene SQLite-Tabelle `print_profiles` ohne Spalte `listing_id` (`sqlite3.OperationalError`).
- 3MF-Filamentbelegungen nutzen ab jetzt die eigene Tabelle `pp_master_filament_profiles`, um Namenskollisionen mit älteren Datenbankstrukturen zu vermeiden.
- Voll kompatible, bereits gespeicherte Profilzuordnungen werden beim Start ausschließlich kopiert (`INSERT OR IGNORE`); alte Tabellen und deren Inhalte bleiben unverändert.
- Unbekannte ältere `print_profiles`-Strukturen werden weder gelöscht noch umgebaut. Die 3MF-Übersicht kann trotzdem leer starten und neue Profile speichern.
- Regressionstest reproduziert das gemeldete Schema-Problem und prüft Erhaltung der bestehenden Tabellen sowie idempotente Migration.
- Etsy-Aufträge, Lagerbestand, Filamente, Druckerzuordnungen und gespeicherte Master-3MF-Dateien bleiben unverändert.

# 0.11.21 · Druck-Fertigmeldung auf Handy und Tablet absichern

- Bei bisher nicht erfasstem Lagerbestand erscheint im Fertigmelden-Dialog direkt ein Pflichtfeld für den bisherigen fertigen Bestand (0 ist erlaubt). Der neue Druck wird in derselben Datenbanktransaktion hinzugebucht; kein still deaktivierter Bestätigen-Button mehr.
- Während des Speicherns zeigt der Button „Wird gespeichert …“; der Dialog bleibt bei Fehlern offen und die eingegebene Menge bleibt erhalten.
- Schließen-X in Dialogen mindestens 48 × 48 Pixel groß und besser per Touch bedienbar.
- Regressionstests für den ersten Auftragsdruck, den allgemeinen Fertig-Workflow und die Dialogbedienung.
- Keine Änderung an Etsy-Daten, Druckerzuordnungen, 3MF-Dateien oder bestehenden Lagerbeständen.

# 0.11.20 · P1S New aus deutscher Bambu-Integration lesen

- Bambu Lab ist für P1S New bereits aktiv: die Druckerzuordnung erkennt deshalb nun echte deutsch benannte HA-Entitäten (`druckstatus`, `druckfortschritt`, `verbleibende_zeit`, `gcode_dateiname`, Temperatur, Schichten, AMS).
- Erst wenn ein echter Druckstatus-Sensor in Home Assistant vorhanden ist, wird die passende P1S-New-Zuordnung gespeichert. Kein Ersatz durch Shelly-Leistung, IP-Adresse oder Geräte-Seriennummer.
- Deutsche Zustandswerte `Fertig`, `Druckt`, `Bereit`, `Leerlauf`, `Pausiert` und `Nicht verbunden` werden korrekt interpretiert; „Unbekannt“ gilt bei Dateinamen als fehlender Wert.
- Verfügbare alternative Entitätspräfixe werden anhand echter Druckstatus-Sensoren erkannt; P1S Old/New bleiben getrennt.
- Regressionstest mit dem realen P1S-New-Gerätezustand: 100 % fertig, 0 h Restzeit, 24 °C Heizbett, 28 °C Düse.
- Sonstige Funktionen (Etsy, Lager, 3MF, H2D, Snapmaker, großer Fertig-Button) unverändert.

# 0.11.19 · Bestätigte Druckersensoren und fehlertolerante Druckprofile

- Aus den tatsächlichen Home-Assistant-Entitäten vom 22.10.2026 sind H2D, P1S Old und Snapmaker U1 direkt zugeordnet; keine manuelle Sensor-Eingabe nötig. Bambu-Statusdaten und Snapmaker-Temperaturen/Schichten werden nur bei vorhandenen HA-Entitäten verwendet.
- P1S New bleibt im Monitor, erscheint vorerst als nicht eingerichtet: die übermittelten P1S-New-Entitäten stammen von der Shelly-Strommessung und enthalten **keinen echten Druckstatus**. Keine Rückschlüsse aus Watt oder Ampere auf Druckfortschritt.
- A1 mini **nur aus beiden Monitoransichten** (Dashboard und Drucker-Reiter) entfernt. Er bleibt für gespeicherte 3MF-Druckprofile verfügbar; keine Profile oder Filamente löschen.
- Robustere Lesefunktion für Druckprofile: altes Filamentdatenbank-Schema oder beschädigte `sources_json`-Einträge führen nicht mehr zum globalen HTTP-500-Fehler. Beschädigte Zuordnungen werden in der Anzeige übersprungen und unverändert in SQLite gelassen.
- H2D-Verbleibende-Zeit in **Stunden**, Snapmaker U1 in **Sekunden** interpretieren. Druckstatus `offline` wird als Offline angezeigt.
- Neue Regressionstests für drei bestätigte HA-Geräte, Shelly-only P1S New, vier Tachos und nicht-destruktive Masterprofil-Fehlertoleranz.

# 0.11.18 · Drucker automatisch erkennen, „Fertig“ größer

- Erkennt Bambu H2D, A1 mini und Snapmaker U1 anhand echter Druckstatus-Entitäten aus Home Assistant und speichert eindeutige Verknüpfungen updatefest.
- Die P1S Old/New werden nicht per Reihenfolge oder angenommener Seriennummer verwechselt: eindeutig benannte Geräte werden automatisch zugeordnet, sonst nur einmal per Auswahlmenü.
- Sensoren eines Druckers werden anhand desselben Entitätsnamens-Präfixes gruppiert (Druckstatus, Fortschritt, Restzeit, Datei, Temperatur); AMS-, Strom- und Raumhilfssensoren sind kein Druckstatus-Ersatz.
- Einrichtungsdialog mit übersichtlicher Geräteauswahl und verständlicher Meldung bei fehlender Druckerintegration; einzelne HA-IDs nur noch im eingeklappten Expertenbereich.
- Größerer grüner „Fertig“-Button bei laufenden Auftrags- und Varianten-Drucken, touchfreundlich für das Werkstatt-Tablet.
- Automatische Tests für eindeutige H2D/U1-Erkennung, zwei identische P1S, falsche AMS-Treffer und den neuen Dialog.
- Keine automatische Druckersteuerung; vorhandene Lager-, Etsy- und 3MF-Daten bleiben unverändert.

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
