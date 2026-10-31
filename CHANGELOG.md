## 0.13.13 (2026-10-31)

- Master-3MF-Filamentbelegung auf große Farbswatches, kompakte AMS-Plätze und durchsuchbare Farb-Kacheln umgestellt (interner Code, Farbe, Material und Hersteller-Code).
- Upload und nachfolgendes Aktualisieren der Dateiliste sind jetzt getrennte Schritte. Eine bereits gespeicherte 3MF-Datei wird bei einem Nachladefehler nicht mehr als fehlgeschlagener Upload gemeldet und bleibt im Dialog sichtbar.
- Eindeutige Statushinweise direkt im 3MF-Dialog; vorhandene Belegungen und alle Masterdatei-Versionen bleiben unverändert.
- Regressionstest für Farbwahl, Profil-Speichern und Nachladefehler nach erfolgreichem 3MF-Upload.

## 0.13.12 (2026-10-30)

- Filamentbestellungen werden jetzt standardmäßig manuell erfasst: kompakte Positionen statt Screenshot-Zwang. Foto-/Text-Import bleibt als optionale Schaltfläche erhalten.
- Direkte Suche in der eigenen Filamentbibliothek nach Farbe, Material, Bambu-Herstellercode und internem Farbcode. Ein Treffer übernimmt vorhandene Stammdaten, ohne sie zu überschreiben.
- Neue Farbe kann direkt innerhalb derselben Bestellung inklusive Material, Name, Hersteller-Code und optional internem Code/HEX angelegt werden. Farbe wird erst beim Speichern in der Filamentbibliothek erstellt; bestehende Filamente bleiben unverändert.
- Je Position nur Menge, Spule/Refill und gesamter Positionspreis im Vordergrund; Bestellnummer, Datum, Gesamtbetrag und optionale Rabatte/Guthaben getrennt. Eine Bestellung kann mehrere Positionen enthalten.
- Bestellung speichern und tatsächlichen Wareneingang buchen bleiben getrennte, ausdrücklich bestätigte Vorgänge. Mobile 2-Positionen-Regression prüft Bibliotheksauswahl, Neuanlage, Menge und unveränderten Lagerbestand.

## 0.13.11 (2026-10-30)

- Bambu-Bestellimport auf Home Assistant stabilisiert: Sehr lange, schmale iPhone-Screenshots werden zusätzlich in mehrere kürzere Bildabschnitte zerlegt und erneut per Tesseract gelesen. Das bessere Ergebnis wird verwendet.
- Schutz vor fehlinterpretierten Importen: Wenn ein langer Screenshot weiterhin nur eine Filamentposition ergibt, wird der Vorgang mit einem klaren Hinweis abgebrochen, statt die Gratis-PETG-Rolle als vollständige Bestellung anzubieten.
- Vollständigkeitsprüfung zählt erkannte Hersteller-Farbcodes über die gesamte Zahlungsübersicht; fehlende Positionen werden angezeigt und können nicht unbemerkt gespeichert werden.
- Bestehende Produktdaten und Etsy-Import bleiben unverändert. Der Lagerbestand wird erst nach bestätigtem Wareneingang erhöht.

## 0.13.10 (2026-10-30)

- Bambu-Bestelldetails-Screenshots werden anhand der Zahlungsdetails interpretiert: Material steht oft allein in einer Zeile, Farbname und Hersteller-Code in der nächsten und die Menge erst am Zeilenende. So werden alle 12 Farbpositionen und 17 Rollen der gezeigten Oktober-Bestellung erkannt, statt nur der Gratis-PETG-Rolle.
- Der oberhalb der Zahlungsdetails sichtbare Bestellfortschritt wird nicht doppelt eingelesen. Mengenrabatte werden nicht mit Positionspreisen verwechselt, und Gratisrollen behalten den Preis 0 €.
- Unvollständige Texterkennung wird anhand der sichtbaren Hersteller-Farbcodes erkannt, oben deutlich angezeigt und kann nicht versehentlich als vollständige Bestellung gespeichert werden.
- Etsy-Historie, 50-g-Bedarfsanalyse und Wareneingang bleiben unverändert.

## 0.13.9 (2026-10-30)

- Mobile Filamentprüfung überarbeitet: Statt vieler offener Blöcke erscheint nur die aktuell zu prüfende Position. Eine kompakte Liste zeigt alle Positionen, mit gezieltem Wechsel und Weiter-Button.
- Häufige Korrekturen sofort sichtbar; Hersteller, Material, interne Codes, HEX und sonstige Details in einem separaten aufklappbaren Bereich. Manuelle Bearbeitung und Mehrfachänderung bleiben.
- Fehlerhinweise erscheinen direkt oben in der Importmaske statt ganz unten. Über 12 MB große Bilddateien werden vor der Texterkennung lokal verkleinert; PDFs zeigen bei Überschreitung sofort eine klare Meldung.
- Einfügen von Text über die iOS-Zwischenablage löst den Import automatisch aus; der manuelle Text-Button bleibt als Alternative.
- Fix: Manuell bestätigte Änderungen an bestehenden Filamentstammdaten bleiben beim Wechsel zwischen Positionen erhalten. Die Etsy-Historie und die Filament-Bedarfsanalyse mit 50 g Standard bleiben unverändert.

## 0.13.8 (2026-10-30)

- Filament-Sammelimport: erkannte Bestellpositionen als kompakte Übersicht statt 14 einzeln geöffneter Prüfmasken. Unklare Farben, Preise und abweichende Stammdaten öffnen sich zur Kontrolle.
- Jede Position lässt sich weiterhin manuell bearbeiten, ergänzen, entfernen, aufteilen oder ausdrücklich als geprüft bestätigen. Mehrere markierte Positionen können Menge, Gramm, Verpackung oder Positionspreis gemeinsam ändern.
- Kopierten Bestelltext oder Screenshot direkt in die Importmaske einfügen; Screenshot/PDF/TXT-Upload bleibt verfügbar.
- Gesamtübernahme erst nach Prüfung offener Hinweise. Bestehender Wareneingang und Teilmengenbuchung bleiben unverändert; Filament-Bedarfsanalyse mit Etsy-Historie und 50 g Standard bleibt erhalten.

## 0.13.7 (2026-10-29)

- Neue Filamentbestellungen mit lokalem Screenshot-/PDF-/Textimport (Tesseract OCR und PDF-Text), unabhängig vom Händler; unbekannte Positionen müssen manuell geprüft werden.
- Editierbare Prüfmaske für alle Einzelpositionen: Hersteller, Material, Farbname, Farbcode, eigener Code, Gramm, Anzahl, Verpackung und tatsächlicher Gesamtpreis.
- Neue Filamente werden beim bestätigten Speichern ohne Bestand angelegt. Änderungen an bestehenden Stammdaten werden nur nach expliziter Auswahl übernommen und protokolliert.
- Bestellungen bleiben als bestellt sichtbar. Wareneingänge sind teilweise buchbar, transaktional und gegen doppelte oder veraltete Buchungen geschützt.
- Letzter bezahlter Filamentpreis wird beim Empfang automatisch aktualisiert. Kostenloses Filament bleibt bei 0,00 € in der Einkaufs-Historie, ohne den regulären letzten Kaufpreis auf null zu setzen.
- Bestellungen aus der bisherigen Einkaufsliste öffnen nun dieselbe Preisprüfung statt einer ungeprüften Bestandsbuchung.

## 0.13.6 (2026-10-29)

- Die automatische Bambu-Farberkennung überschreibt beim Speichern keine manuell gepflegten Hersteller-Farbnummern oder HEX-Werte mehr.
- Filament-Codes werden vor der Erfolgsmeldung gegen die Datenbankantwort geprüft.
- Regressionstests für Filament-Speichern und das erneute Öffnen des Editors.
- Filamentbedarf mit 50 g Standard und Etsy-Historie bleiben unverändert. Keine Bestandsänderung.

## 0.13.5 (2026-10-29)

- Filament-Einkaufsanalyse (50 g Standard) und Etsy-Historie: Startfehler nach Update auf 0.13.4 behoben.
- Fehlendes Python-Modul wird jetzt im Home-Assistant-Dockerimage mit ausgeliefert.
- Regressionstest prüft, dass für den Docker-Start alle benötigten Python-Module kopiert werden.
- Keine Änderungen an bestehenden Bestellungen, Lagerbeständen, Filamenten oder Einkaufspositionen.

## 0.13.4 (2026-10-29)

- Neuer Einkaufsassistent im Filament-Einkaufswagen: Zielmenge (z. B. 14 Spulen), 30/60/90-Tage-Bedarf und Begründung je Filament.
- 50 g pro verkauftem Stück als Standard, falls keine genaue Druckkalkulation vorliegt; Mehrfarb-Artikel verteilen diese 50 g auf die zugeordneten Materialien.
- Vorhandene Grammwerte aus dem Kostenrechner, Farbvarianten, Bauteilfarben und eindeutige Master-Filamentbelegungen werden ausgewertet.
- Historischer Etsy-Verkaufsimport ab Juli 2025 auf Knopfdruck; künftige Synchronisierungen schreiben zusätzlich einen dauerhaften, getrennten Verkaufsverlauf.
- Kein Schätzen unbekannter Farben. Unklare Positionen werden separat ausgewiesen. Einkaufswagen, Lager, Produktionsaufträge und alte Kosten bleiben unangetastet, bis Empfehlungen bestätigt werden.
- Preisübersicht verwendet weiterhin die im Filamentregister hinterlegten Preise; keine vorgetäuschten Live- oder Bambu-Mengenrabatte.

## 0.13.3 (2026-10-28)

- Fertige lokale Aufträge erscheinen automatisch als „Abholbereit“ und verlieren den roten Produktions-Countdown, auch wenn sie vor dem Update angelegt wurden.
- Druckkosten und optionale Etsy-Kalkulation bleiben verfügbar und unverändert.
- Neuer Übergabedialog: vom Kunden abgeholt, an Dritte mitgegeben (Name optional), persönlich ausgeliefert oder versendet.
- Mehrere abholbereite Aufträge desselben Kunden können gemeinsam und atomar übergeben werden; unfertige Aufträge bleiben aktiv.
- Übergabedatum, Art und Empfänger werden im lokalen Archiv gespeichert. A4-PDFs bleiben auch bei abgeschlossenen Aufträgen verfügbar.
- Versehentliche Übergaben lassen sich für neu dokumentierte Übergaben inklusive korrekter Lager-Rückbuchung rückgängig machen; ältere Abschlüsse bleiben unverändert.
- Etsy-Bestellungen, bereits gebuchte Bestände und direkte Verkäufe werden nicht umgestellt.

## 0.13.2 (2026-10-28)

- Bauteile und Änderungen der Vorproduktion erscheinen dynamisch auch bei schon vorhandenen offenen Bestellungen.
- Der Positionsdialog erlaubt getrennte Mengen, Druckstart und direkte Fertigmeldung pro Bauteil mit Rückgängig.
- Vollständige Produkte werden erst nach Bereitstellung aller Bauteile als fertig bestätigt.
- Direkt auftragsbezogene Drucke verändern keine freien Lagerbestände; Nachdruck- und Bestellstatus folgen den tatsächlichen Restmengen.
- Regressionstests für nachträgliche Bauteile, Teilfertigstellung und Storno.

# 0.13.1 · Druckdauer wie Bambu und optionale Etsy-Kalkulation

- Druckdauer direkt in Stunden und Minuten eingeben; serverseitig werden weiterhin Minuten gespeichert.
- Standardmäßig nur Druckkosten je Stück (Material, Strom, optionale Maschinenkosten). Kein Verkaufspreis erforderlich.
- Etsy-Berechnung über eigenes Kästchen aktivierbar; berücksichtigt Verkauf, Arbeitszeit, Versand je Bestellung, Stück je Bestellung und Etsy-Gebühren.
- Ausgangswerte Deutschland: 6,5 % Transaktion, 4 % + 0,30 EUR Zahlungsbearbeitung, 0,20 USD Listing, 15 % bzw. 12 % Offsite Ads nur bei zugeschriebenen Verkäufen.
- Gebühren-online-Aktualisierung prüft Etsy-Hilfeseiten und den EZB-USD-Kurs; bei nicht eindeutig verifizierbaren Angaben bleiben frühere Gebühren bestehen.
- Bereits gespeicherte Kalkulationen und geprüfte Druckerfreigaben bleiben erhalten; keine Änderungen an Bestell- oder Lagerbuchungen.
- Transparenter Hinweis auf nicht pauschal enthaltene Etsy-Ads-Klickkosten, Etsy Plus und eventuell anfallende USt. auf Verkäufergebühren.

# 0.13.0 · Vernetzter Rechner und geprüfte Drucker

- Neuer Reiter „Rechner“: Kostenkalkulation je Etsy-Produkt, Variante und Drucker, inklusive Mehrfarbenverbrauch, Strom, Maschine, Arbeitszeit, Verpackung, Versand, Plattformgebühren, Gewinn und Marge.
- Filamentfarben, interne Nummern und gespeicherte aktuelle Filamentpreise aus der vorhandenen Lagerverwaltung übernehmen; optionale Vorschlagsbelegung aus Master-3MF-Profilen.
- Druckerfreigabe getrennt für H2D, P1S Old, P1S New, Snapmaker U1, A1 mini und Prusa MK4. Freigabe ausschließlich nach tatsächlich gutem Testdruck; Status und Qualitätsnotiz speichern.
- Produktkatalog, Produktkarten und Auftragskarten zeigen Kalkulationszugang bzw. Druckerfreigaben.
- Prioritäten zeigen freigegebene Drucker und bekannte freie Maschinen; pro Drucker filterbar. Fehlende Druckerfreigaben bleiben sichtbar. Kundenliefertermine bleiben vor Lagerauffüllung; keine automatische Fernsteuerung.
- Investitionsrechner für Anschaffung, Zusatzkosten, zusätzliche verkaufte Stück und daraus abgeleitete Amortisation; speicherbare Szenarien.
- Historische Kostenschnappschüsse je gespeicherter Kalkulation, additive separate SQLite-Tabellen ohne Änderungen an Bestellungen oder Lagerbuchungen.
- Regressionstests für Preisänderungen, Varianten, Druckerfreigaben, Unvollständigkeit und Investitionen.

## 0.12.14 · Druckempfehlungen ausblenden und nachrücken lassen

- Kleiner Papierkorb neben „Druck vorbereiten“ bzw. „Bauteil öffnen“ bei Empfehlungen für Lagerauffüllung und Vorproduktion.
- Entfernte Vorschläge werden serverseitig gespeichert, auch nach Neuladen oder beim Wechsel zwischen Tablet, Mac und iPhone ausgeblendet und durch den nächsten passenden Vorschlag ersetzt.
- „Ausgeblendete Empfehlungen“ erlaubt das gezielte Wiederherstellen. Tatsächliche Kundenaufträge bleiben sichtbar und können nicht versehentlich entfernt werden.
- Keine Löschung von Etsy-Artikeln, Lagerbeständen oder Buchungen. Neue Regressionstests prüfen Speichern, wiederholtes Ausblenden und Wiederherstellen.

## 0.12.13 · Fertigmeldung je Bestellposition rückgängig machen

- Dezenter Button „↶ Fertig rückgängig“ im Positionsdialog, inklusive Stückzahlkorrektur für Teilmengen.
- Normaler Auftragsdruck: atomare Rücknahme von fertigen Kundenstücken und dem zugehörigen gezählten Fertigwarenbestand; kein erneuter Druckauftrag und keine Doppeleinlagerung.
- Bauteilaufträge: Fertigmenge zurücksetzen und zuvor verbrauchte, dem Auftrag zugeordnete Bauteile wieder für den Auftrag freigeben, ohne freien Bestand künstlich zu erhöhen.
- Lokale Sonderanfertigungen: Fertigmenge wieder auf offen setzen, ohne Fertigwarenbestand anzufassen.
- Schutz vor doppeltem Rückgängig, ungültigen Mengen, versendeten Aufträgen und negativen Beständen; Regressionstests für alle drei Produktionsarten.

# 0.12.9 · Dashboard und alle Navigationsreiter in einer Zeile

- „Aufträge & Druckplan“ heißt jetzt „Dashboard“; die sechs Reiter heißen Dashboard, Bestellungen, Lagerbestand, Produktkatalog, Filament und Drucker.
- Alle sechs Navigationsreiter bleiben am Tablet, auf dem Mac und auf dem Handy in einer einzigen Zeile. Falls die Displaybreite nicht reicht (etwa am iPhone oder im Split View), kann die Leiste seitlich gewischt werden statt in eine zweite Reihe umzubrechen.
- Versionierter CSS-Aufruf vermeidet ein altes, zwischengespeichertes Layout nach dem Update.
- Browser-Regressionstest überprüft sechs lesbare Reiter in einer Zeile; die bestehenden Lager- und Bestellfunktionen bleiben unverändert.

# 0.12.8 · Bestellungen & Lagerbestand als eigene Bereiche

- Navigation: „Aufträge & Druckplan“ statt „Produktion“, dazu eigene Reiter „Bestellungen“ und „Lagerbestand“.
- Alle aktuell offenen Etsy- und lokalen Aufträge auf einer Seite mit Suche, Versand-/Neueste-Sortierung, Fertig-Filter und wahlweise Listen- oder Kachelansicht. Ein Klick öffnet die bestehende große Auftragsansicht; die kompakten Karten im Druckplan bleiben.
- Lageransicht zeigt tatsächliche fertige Artikel mit Produktbild, Farben, Varianten, Bestand und frei verfügbarer Menge sowie gemeinsame Vorratsbauteile. Suche, Filter, kompakte Kacheln oder Listen.
- „+1“ für eingetroffene Rückläufer nutzt dieselbe sichere Bestandsbuchung; Etsy-Angebotsmengen werden nicht verändert. Fertig einem Auftrag zugewiesene Stücke werden nicht erneut im freien Regal gezeigt.
- Beim Anlegen/Bearbeiten eines Bauteils kann optional eine Farbe gespeichert werden. Technische Setgrößen- und Etsy-Eigenschaftsfelder sind unter „Weitere Einstellungen“ eingeklappt; vorhandene Einstellungen bleiben erhalten.
- Neue Regressionstests für Lager-/Auftragsansichten und optionale Bauteilfarbe. Bestehende Backend-Auftrags- und Etsy-Synchronisierung unverändert.

# 0.12.7 · Aufträge in großer, responsiver Werkstattansicht

- Die kleinen Bestellkarten bleiben erhalten. Neues Vergrößern-Symbol oben auf der Karte und der bisherige Details-Button öffnen dieselbe Großansicht.
- Große, responsive Dialogdarstellung mit fixierter Kopfzeile, größerem Produktfoto, Varianten und vier Kennzahlen für Positionen, Menge und Fertigstellung.
- Einzelpositionen nutzen auf großen Geräten zwei Informationsspalten; mehrere Artikel erscheinen nebeneinander, auf dem iPhone untereinander.
- Vorhandene Lager- und Druckbuchungen, lokale Bestelldetails und PDF-Downloads unverändert. Schließen über X, Escape und Hintergrund bleibt erhalten.
- UI-Tests für Öffnen, Mehrfachpositionen und Mobilansicht.

# 0.12.6 · Dialoge per Hintergrundklick schließen

- Alle Dialogfenster schließen sich jetzt auch durch Klick oder Fingertipp auf den abgedunkelten Bereich außerhalb des Fensters; das X und Escape funktionieren weiterhin.
- Berührungen innerhalb eines Fensters und Ziehen/Scrollen von innen nach außen schließen nichts versehentlich.
- Geänderte, noch nicht gespeicherte Formularfelder werden vor dem Verwerfen bestätigt. Während laufender Speichervorgänge wird das Schließen verhindert.
- Keine Änderung an Aufträgen, Etsy, Lagerbeständen oder Druckbuchungen. Browser-Regressionstest auf Desktop und Tablet ergänzt.

# 0.12.5 · Kundenauftrag A4-PDF und automatische Sammelausgabe

- PDF-Button auf jeder lokalen Auftragskarte sowie in ihren Bestelldetails.
- Erzeugt ein eigenständiges, mehrseitiges A4-PDF mit Print-&-Pulse-Layout, Auftragstiteln, individuellen Terminen, Stückzahlen, Varianten, Wunschfarben und Personalisierungen.
- Automatische Bündelung **aller offenen lokalen Aufträge desselben Kundennamens**; Etsy, andere Kunden und abgeschlossene Aufträge werden ausgeschlossen. Groß-/Kleinschreibung und Leerzeichen werden bei der Zuordnung normalisiert; gleichnamige Kunden werden bis zu einer späteren Kunden-ID-Erweiterung als identisch behandelt.
- Keine internen Notizen oder Preise; Auftragsübersicht, keine Rechnung. Kunden-PDF wird nicht auf der SD-Karte gespeichert, sondern nur bei Abruf erstellt und direkt heruntergeladen.
- Getestet: Bündelung, Fremdkunden- und Abschluss-Ausschluss, A4-PDF, lange Sondertexte und PDF-Download aus der Bedienoberfläche.

# 0.12.4 · Bessere Produktfilter und farbgleiche Nachdruck-Post-its

- Gut erkennbare Produktfilter-Tabs mit Live-Zählern und klar markiertem aktiven Filter.
- Kompaktes Post-it oben rechts am Produktkartenrand mit ausschließlich der Anzahl nachzudruckender Stücke; verschwindet bei null.
- Exakt derselbe Farbakzent wie die jeweilige Karte, **ohne eigene Mengen-Schwellen** oder unabhängige Farben. Auch Bauteilprodukte und Dunkelmodus berücksichtigt.
- Post-it verdeckt weder Produktfotos noch den Lagerbutton; bestehende Druck-/Lagerbuchungen und Etsy-Bestände bleiben unverändert.

# 0.12.3 · Dashboard-Kopf wie Vorlage & lokaler Etsy-Sync-Fix

- Neue kompakte Titelzeile mit genau zwei klaren, klickbaren Kennzahlen: **Nachdrucken** und **Versand kritisch**. „Produkte“ und „Im Druck“ entfallen aus dem Kopfbereich. Der Etsy-Abgleichszeitpunkt und Aktualisieren bleiben sichtbar.
- Hinweise als aufgeräumter, standardmäßig geöffneter Bereich. Kräftigere vierteilige Navigation mit Icons und erhaltener Einkaufslisten-Anzahl. Live-Druckerstatus direkt nach der Navigation, vor den Auftragskarten, mit flachen kompakten Kacheln.
- Responsive Ausführung für 11-Zoll-Tablet, Mac-Split-View, Mobilgerät sowie helle und dunkle Darstellung. Produktion und Auftragslogik darunter bleiben unverändert.
- Etsy-Sync fordert keine manuellen LOK-Belegnummern mehr über die Etsy-API an; gezielter Regressionstest verhindert den HTTP-400-Fall aus der Dashboard-Warnung.
- Browser-Regressionstests für Anordnung und interaktive Kennzahlen.

# 0.12.2 · Ladefeedback, Preis-Tastatur und automatische Filament-Einkaufsliste

- Filament- und Einkaufsbuchungen zeigen einen sichtbaren Spinner, eine passende Statusmeldung und eine Zeitbegrenzung mit sicherem Lesen des aktuellen Stands statt einem erneuten Schreibversuch.
- Preis pro Spule: fortlaufende Ziffern werden als Cent interpretiert und automatisch in Euro mit Dezimalkomma dargestellt (1990 → 19,90).
- Bei der letzten vollen Spule auf null (Öffnen einer Rolle oder manuelle Bestandskorrektur) genau 1 Rolle auf die Einkaufsliste, sofern dort noch keine Menge steht. Bestehende Wunschmengen, Preise und Spulenbestände nicht überschreiben.
- Zusätzliche Backend- und Browser-Regressionstests für Einzelbuchung, Warteanzeige, Cent-Eingabe und Bestandserhalt.

# 0.12.1 · Filament-Farbtöne über interne Untercodes

- Interne Filamentcodes mit einem Untercode (z. B. 2, 2.1, 2.2, 2.10) als Text speichern; bei deutscher Kommaeingabe 2,10 den Code 2.10 speichern, ohne Nullen zu verlieren.
- Untercodes bei numerischer Filamentsortierung hierarchisch und nicht als Dezimalzahlen behandeln: 2 → 2.1 → 2.2 → 2.10 → 3.
- Dezimaltastatur am iPhone/Tablet und klarer Eingabehinweis. Bestehende Codes, Spulenbestände, Einkaufslisten und Profile werden nicht verändert.
- Neue Python- und Browser-Tests für Code-Erhalt, Kommaeingabe und Sortierung.

# 0.12.0 · Lokale Bestellungen und Sofortverkauf

- Lokale Aufträge mit Kundenbezeichnung, Abholung/Versand und Pflicht-Endtermin anlegen. Produktsuche schlägt während des Tippens vorhandene Etsy-Katalogartikel vor; mehrere Positionen mit jeweils eigener echter Variante, Stückzahl, Wunschfarbe, Gravur und Hinweisen möglich.
- Standardvarianten werden über die bestehende sichere Auftragsdruck- und Lagerlogik abgewickelt. Gravuren und abweichende Wunschfarben erhalten einen eigenen Produktionsstatus, der keine unpassende Variante abbucht. Dringlichkeit folgt demselben Endterminprinzip wie Etsy-Aufträge.
- Direktverkauf bucht nach Prüfung freier Bestände sofort ab. Abschluss prüft Vollständigkeit und verhindert doppelte Abbuchungen; Stornierung gibt bestehende Reservierungen frei. Bearbeitbare Termine und Kundendaten, dauerhafte Historie.
- Separate updatefeste SQLite-Tabellen, von Etsy-Sync unabhängig. Bestehende Etsy-Aufträge, Bestände, Filamente und Master-3MF-Dateien unverändert; Regressionstests für Varianten, personalisierte Aufträge, Sync, Abschluss und Sofortverkauf.

# 0.11.49 · Bauteilvorrat direkt und ohne Komplett-Neuladen ändern

- Schnelle, bestätigte Bauteilbuchungen mit kompakter Serverantwort statt vollem Etsy-, Auftrags- und Produktstatus.
- Direkte Bestandsfelder öffnen ohne Neuberechnung aller Produktkarten; nach Buchungen werden betroffene Karten, Druckprioritäten und relevante Auftragsdetails aktualisiert.
- Keine Änderung am dauerhaften SQLite-Bestand, Sicherheits-/Audit-Triggern, Etsy-Import und Masterdateien; zusätzliche Regressionstests.

# 0.11.44 · Etsy-Aufträge: Farben und Druckaufgaben sofort sehen

- Bestell-Details beginnen jetzt mit einer gut lesbaren Produktionsübersicht statt mit langen Artikeltiteln und kleinen Variantenzeilen.
- Farbe und Setgröße sind deutlich hervorgehoben. Für jedes tatsächlich eingerichtete Bauteil wird die nächste Lager- oder Druckaufgabe angezeigt.
- Vorproduktions-Bauteile zeigen Namen, optionale Farbwerte, benötigte Menge und Status deutlich größer. Vorhandene Buchungen bleiben unverändert.
- Platzsparende Hinweise und responsives Layout für Wandtablet, Mac Split View und iPhone.

# 0.11.43 · Beschleunigte Lagerbuchungen

- Beim Ändern des Bestands bleiben die übrigen Produktkarten bedienbar. Laufende Buchungen erhalten eine kleine Statusmeldung statt die gesamte Oberfläche auszugrauen.
- Unveränderte Daten lösen keine erneute Darstellung aus. Änderungen werden nur einmal neu dargestellt.
- Schnellere Verarbeitung sehr großer Variantenlisten sowie optimierte serverseitige Zuordnung von Etsy-Transaktionen.
- Hintergrundaktualisierung alle 15 Sekunden, bei Wechsel zurück in den Tab zusätzlich sofort. Der Etsy-Abgleich bleibt unabhängig davon alle 15 Minuten.
- Schutz vor veralteten Hintergrundantworten nach einer neuen Lagerbuchung.
- Keine Bestandsdaten oder 3MF-Dateien geändert.

# 0.11.42 · Sicherheitsupdate für Buchungen und vollständige Sicherungen

- Korrektur des fehlenden `assembled`-Datenfelds beim Etsy-Versand: fertig montierte Artikel werden nicht doppelt abgebucht.
- Transaktionales Buchungsprotokoll für Fertigwaren-, Bauteil- und Auftragsbuchungen, erreichbar unter Einstellungen.
- Verifizierter ZIP-Export aus SQLite-Datenbank und Master-3MF-Dateien mit Prüfsummen, Integritätskontrolle und Wiederherstellungsprobe außerhalb des Produktivbetriebs.
- Keine automatischen Restore-Aktionen, keine Rücksetzung gespeicherter Lagerdaten.
- Zusätzliche Regressionstests für Versand, Journal und vollständige Sicherung.

# 0.11.41 · Priorisierte Druckliste direkt in der Produktion

- „Als Nächstes drucken“ zwischen Etsy-Bestellungen und Produktkarten mit den drei wichtigsten Druckempfehlungen und aufklappbarem Rest.
- Reihenfolge: offene Kundenaufträge, gezielte Bauteil-Vorproduktion, sinnvoller Fertigwaren-Nachdruck. Direkter Sprung zur passenden Bestellung, Bauteilverwaltung oder Druckvariante.
- Bestehende Fertigwaren, laufende Druckaufträge und separat markierte Vorratsbauteile im Druck werden abgezogen, um Doppelempfehlungen zu vermeiden.
- Pro Vorratsbauteil optionales Auffüllziel sowie „Im Druck“, „Fertig“ und „Abbruch“, ohne Etsy-Varianten- oder Produktlager zu vermischen.
- Optimierte Darstellung für Mac Split View und Tablet; andere Bereiche unverändert.

# 0.11.40 · Vorproduktion direkt auf der Produktkarte

- Für Produkte mit aktiviertem Schalter „Vorproduktion verwenden“ werden statt der langen Etsy-Farbvariantenliste die gemeinsamen Bauteile und deren tatsächliche Lagerbestände angezeigt. Variable Teile erscheinen als „Nach Auftrag“.
- Bauteile und Vorrat sind direkt über die Produktionskarte bearbeitbar. Klassische Fertigvarianten bleiben nur auf Wunsch aufklappbar und vollständig erhalten.
- Nachdruckzahlen, Druckfilter und „Im Druck“ berücksichtigen bei Bauteilprodukten offene Bauteildrucke statt irreführender fehlender Fertigvariantenbestände.
- Unveränderte Darstellung für Produkte ohne aktivierte Vorproduktion.

# 0.11.39 · Fehlerkorrektur: Vorproduktions-Schalter fehlt

- Home Assistant liefert `components-ui.js` jetzt korrekt als JavaScript aus. Die neue Vorproduktion war in 0.11.38 eingebaut, aber durch die fehlende Freigabe der Skriptdatei in der Oberfläche nicht sichtbar.
- Alle aktiven Produkte bekommen den standardmäßig ausgeschalteten Schalter „Vorproduktion verwenden“ im Produktkatalog. Vorhandene Lager- und Etsy-Daten bleiben erhalten.

# 0.11.38 · Bauteile und Vorproduktion für jedes Produkt

- Jedes aktive Etsy-Produkt besitzt im Produktkatalog den zunächst ausgeschalteten Schalter „Vorproduktion verwenden“. Erst nach Aktivierung werden Bauteile und Bauteilbestände sichtbar.
- Standardbauteile haben einen gemeinsamen, von Etsy-Varianten unabhängigen Vorrat. Andere Bauteile können erst nach Bestellung gedruckt und über eine Etsy-Eigenschaft, etwa „Buchfarbe“, benannt werden.
- Optionale Setgrößen-Zuordnung berücksichtigt z. B. „Setgröße: 3er-Set“, ohne alle Etsy-Farbkombinationen als eigene Lagerartikel anzulegen. Unbekannte Eigenschaften blockieren die Zuordnung statt zu raten.
- Bestellung: Vorratsbauteile reservieren, variable Teile drucken/fertigmelden und nach Montage den kompletten Artikel als fertig bestätigen. Vorproduzierte und fertig montierte Einheiten werden nicht doppelt im Fertigwarenlager gezählt.
- Bereits bestehende Lager-, Druck-, Etsy- und 3MF-Einträge bleiben unangetastet. Alle Bauteildaten liegen updatefest in SQLite; die Nutzung ist optional und standardmäßig deaktiviert.

# 0.11.37 · Einfachere Etsy-Auftragsaktionen mit verbindlicher Lagerzuordnung

- Bestellkarten zeigen die nächste sinnvolle Aktion: „X × Aus Lager“, „X × Drucken“ oder „✓ X × Fertig“. Bei mehreren gleichzeitig offenen Positionen bleibt die eindeutige Positionsauswahl in „Details“.
- Bestätigungsfenster entfallen für eindeutige Aus-Lager- und Druckstart-Buchungen. Ein einzelner erfolgreicher Auftragsdruck lässt sich direkt fertigmelden; bei mehreren oder unbekanntem Anfangsbestand bleibt die Mengenkontrolle erhalten.
- Teilbestellungen bieten in den Details automatisch die passende Aufteilung aus vorhandenen und noch zu druckenden Stückzahlen.
- Bereits fertig gedruckte, einem offenen Etsy-Auftrag zugeordnete Stücke sind gegen eine zweite Lagerzuordnung gesperrt. Die Prüfung und Bestandsabbuchung erfolgen atomar in SQLite, mit Revisionsschutz gegen parallele Klicks.
- Die Etsy-Versandabbuchung, Rückbuchung „Zurück ins Lager“, Status-Lesezeichen und vorhandene Lagerdaten bleiben erhalten; Etsy selbst wird nicht verändert.

# 0.11.36 · Einheitliche Filament-Buttons in Split View und auf dem Tablet

- „Shop“, „Auf Liste“, „Rollen“ und „Bearbeiten“ verwenden nun vier feste Button-Positionen in genau dieser Reihenfolge.
- Ohne Einkaufslink wird der Shop-Platz freigehalten, damit alle übrigen Buttons von Zeile zu Zeile exakt ausgerichtet bleiben.
- Das responsive Layout richtet sich nach der tatsächlichen verfügbaren Breite im Home-Assistant-Fenster, nicht nur nach der Bildschirmgröße (Mac Split View, Dashboard-Seitenleiste, Tablet).
- In breiten und mittleren Ansichten bleiben alle vier Buttons in einer Reihe; in sehr schmalen Ansichten werden sie kontrolliert in zwei gleichmäßige Reihen aufgeteilt.
- Kleine Änderungen an Abständen und Button-Größen verhindern das unerwartete Umbrechen von „Bearbeiten“.
- Die Einkaufsliste nutzt weiterhin ihren eigenen Bedienbereich. Bestände, Preise und Filamentdaten bleiben unverändert.
- Browser-Regressionstests prüfen gleiche Button-Positionen und Kartenhöhen bei acht Panelbreiten, mit und ohne Einkaufslink.

# 0.11.35 · Volle und angebrochene Filamentrollen ohne Wiegen

- Das Filamentlager unterscheidet jetzt volle und angebrochene Spulen pro Hersteller/Farbe/Material – ausschließlich als Stückzahlen, ohne Grammangaben oder Nachwiegen.
- Der kompakte „Rollen“-Button öffnet eine einfache Verwaltung: „Eine Rolle öffnen“ verschiebt genau 1 volle Spule zu den angebrochenen; „Eine Rolle leer“ entfernt eine angebrochene Spule. Beide Änderungen werden sofort und atomar gespeichert.
- Beim ersten Abgleich lassen sich volle und angebrochene Stückzahlen im bestehenden Bearbeitungsformular auch manuell eingeben.
- Die Filament-Gesamtwertanzeige enthält weiterhin nur volle Spulen mit bekanntem Preis. Angebrochene Spulen werden separat gezählt und bewusst nicht monetär geschätzt.
- Einkaufsliste, Preise, Hersteller/Farbvorschläge und Bestandssortierung bleiben unverändert. Bereits gespeicherte Spulen erhalten beim Update automatisch den Startwert 0 angebrochen; wiederholte Migration verändert keine Mengen.
- Tests decken Umwandlung, Leerbuchung, Grenzfälle, Datenerhalt, Tablet-Dialog und Wertanzeige ab.

# 0.11.34 · Dezentes Fertig-Lesezeichen ohne größere Bestellkarten

- Statt des großen grünen Balkens zeigt eine vollständig bediente Etsy-Bestellung jetzt ein kleines, leicht angewinkeltes, hellgrünes Papier-Lesezeichen „✓ FERTIG“ an der rechten oberen Kartenecke.
- Das Lesezeichen ist rein informativ, kein Button. Es ragt knapp über den Kartenrand und verdeckt weder Bilder noch Bestellpositionen.
- Fertige, teilweise fertige und offene Bestellkarten behalten dieselbe Höhe. Auch die verkürzte Teilfertig-Anzeige „1/2 fertig“ liegt außerhalb des Inhalts.
- Die ausführliche Fertigmeldung in den Bestelldetails bleibt erhalten; Lagerzuordnung, Druckbuchungen und Etsy-Abgleich werden nicht verändert.
- Browserprüfung für die korrekte Position, Nicht-Klickbarkeit, unveränderte Bildposition und identische Kartenhöhen ergänzt.

# 0.11.33 · Fertige Lagerware direkt einer Etsy-Bestellung zuordnen

- Hat eine passende Etsy-Bestellvariante fertigen Lagerbestand, heißt die Hauptaktion auf der Bestellung „Aus Lager“ statt „Drucken“.
- Nach Bestätigung der Menge wird die fertige Ware der exakten Etsy-Bestellposition zugeordnet und sofort aus dem Lagerbestand ausgebucht. Die grüne Fertig-Markierung berücksichtigt sowohl abgeschlossene Auftragsdrucke als auch aus dem Lager zugeordnete Stücke.
- Mehrere Bestellpositionen können einzeln über „Details“ aus Lager zugeordnet werden; nur vollständig bediente Bestellungen erhalten den großen Fertig-Haken.
- Irrtümlich zugeordnete Stücke lassen sich bei noch offenen Bestellungen über „Zurück ins Lager“ wieder freigeben.
- Bei einer späteren Etsy-Versandmeldung werden bereits zugeordnete Lagerstücke nicht erneut abgezogen. Laufende Drucke und bereits gedruckte Stücke bleiben sauber getrennt.
- Alte Bestands-, Filament-, Etsy- und Masterdatei-Daten bleiben erhalten. Sichere, wiederholbare Migration eines zusätzlichen Zuordnungsfeldes; Validierung gegen Überbuchung und parallele Bestandsänderungen.
- Erweiterte Backend- und Browsertests für Lagerzuordnung, Rückbuchung, Teilmengen, Mischaufträge und Versandabgleich.

# 0.11.32 · Sichtbare Druckfertig-Markierung je Etsy-Bestellung

- Jede offene Etsy-Bestellkarte erhält nach vollständigem Fertigmelden aller bestellten Positionen einen gut sichtbaren grünen Balken „✓ DRUCK FERTIG“ und einen grünen Kartenrand.
- Bei nur teilweise fertiggemeldeten Drucken steht stattdessen „X von Y Stück fertig“. Das bloße Starten eines Drucks reicht nicht für den Fertig-Haken.
- Der Haken wird nur angezeigt, wenn alle Positionen eindeutig zugeordnet und vollständig fertiggebucht sind; nicht zuordenbare Varianten bleiben offen.
- Auch in den Bestelldetails ist der Status sichtbar. Die Versanddringlichkeit bleibt unabhängig erhalten.
- Der Status wird aus dem vorhandenen Auftragsdruckprotokoll berechnet: keine zusätzliche Datenbank, keine manuelle Pflege, keine Änderungen an Etsy.
- Browserprüfungen für vollständige, teilweise, noch druckende und nicht zugeordnete Aufträge sowie die vorhandene Lagerbuchung ergänzt.

# 0.11.31 · Shop-Button und Filamentsortierung

- Bei „Meine Farben“ wird der Shop-Link links vor „Auf Liste“ und „Bearbeiten“ angezeigt.
- Auf der Einkaufsliste steht „Shop“ bei vorhandenem Link ebenfalls an erster Stelle.
- Sortierung der Filamente nach vorrätigen Spulen: Standard, meiste zuerst oder wenigste zuerst.
- Die Sortierung gilt nur für „Meine Farben“, funktioniert zusammen mit der Suche und bleibt auf dem Gerät gespeichert.
- Rein visuelle Änderung: Filamentbestände, Preise und Einkaufslisten-Einträge bleiben unangetastet.

# 0.11.30 · Auftragsfertigung und Bestellübersicht

- Bei „Auf Bestellung“ entfallen störende „Noch zählen“-Hinweise in der Hauptkarte und Lager-Variantenübersicht.
- Vorhandene fertige Stücke werden weiterhin angezeigt und können jederzeit manuell eingetragen werden; die Auftrags- und Etsy-Buchungslogik bleibt unverändert.
- „Aktuelle Bestellungen“ wird als gesamte Karte mit grünem Rahmen, klarerem Hintergrund und dezenter Schattenwirkung hervorgehoben, auch im Dunkelmodus.
- Zusätzliche UI-Prüfungen sichern diese Darstellung ab.

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
