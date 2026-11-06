# 0.13.50 · Snapmaker U1: vier Werkzeugköpfe statt AMS-Auswahl

- Master-3MF-Farben für Snapmaker U1 lassen sich jetzt den vier festen Köpfen T0, T1, T2 und T3 zuordnen; pro Kopf eine Filamentrolle.
- Die Bambu-AMS-Auswahl entfällt nur beim U1. H2D-Düsenzuordnung (links/rechts) und P1S-AMS-Profile bleiben wie gehabt.
- Bereits vorhandene U1-AMS-Altbelegungen werden unverbindlich auf die Köpfe vorgeschlagen und erst nach ausdrücklichem Speichern übernommen. Original-3MF-Dateien bleiben unberührt.
- Das oben rechts verrutschte Schließen-Symbol im Masterdatei-Dialog sitzt wieder innerhalb des Fensters.
- Browser- und Backend-Regressionstests für den U1 sind ergänzt.

# 0.13.49 · Druckfarm nur für vier Produktionsdrucker

- Die Produktionsauswertung umfasst ausschließlich H2D, P1S Old, P1S New und Snapmaker U1. A1 mini und Prusa MK4 werden aus den Druckfarm-Kennzahlen und Einzelkarten ausgeschlossen.
- Erfasste Druckzeit, Messabdeckung, 24/7-Auslastung und Kapazität werden konsequent aus denselben vier Geräten berechnet: 96 h für 24 Stunden, 672 h für 7 Tage und 2.880 h für 30 Tage.
- Vorhandene Zeitaufzeichnungen und manuelle Historien bleiben in der Datenbank gespeichert. Andere Druckerfunktionen, Aufträge und Produktdaten bleiben unverändert.

# 0.13.48 · Etsy-Bestandsalarm und schnellerer Abgleich

- Etsy-Listingstatus (aktiv / ausverkauft) und Etsy-Mengen werden nun mit jeder 15-Minuten-Bestellsynchronisation geprüft, statt nur bei der täglichen Katalogaktualisierung.
- Variantenbestände werden rollierend (12 Artikel je Lauf) sowie nach neu eingegangenen Verkäufen geprüft. „Bestellungen aktualisieren“ prüft alle bekannten Varianten sofort mit.
- Artikel mit 0 Stück werden unabhängig von verzögerten Variantendaten als ausverkauft erkannt. Die rote Warnung oben im Dashboard zeigt betroffene Produktnamen und Varianten automatisch ausgeklappt. Auch geringe Bestände bleiben sichtbar.
- Der Stand der Bestandsprüfung wird angezeigt; bei über 60 Minuten alten Etsy-Daten wird ausdrücklich vor veralteten Zahlen gewarnt.
- Physische Lagerbestände, Nachdruckaufträge, 3MF-Dateien und Kundenbestellungen bleiben von der Etsy-Bestandsprüfung unberührt. Etsy wird weiterhin nur gelesen.

# 0.13.47 · Produktkatalog nach MakerWorld-Prinzip

- Kompakte Produktkacheln mit umschaltbarer Listenansicht; Produktdetails zeigen großes Bild und zugeordnete 3MF-Druckdateien.
- Pro Datei: eingebettete 3MF-Vorschau (mit Produktfoto als Rückfall), Drucker, Druckzeit, Grammwerte und weitere Informationen per Info-Schaltfläche/Mouseover.
- Dropdown „3MF öffnen“ für Bambu Studio, OrcaSlicer, Snapmaker Orca und PrusaSlicer. Auf macOS aktualisierten Print-&-Pulse-Slicer-Helfer installieren; auf anderen Geräten wird die Originaldatei heruntergeladen.
- 3MF-Dateien können standardmäßig für alle Farbvarianten eines Produkts gespeichert werden. Bei der Variantenauswahl bleiben gemeinsame Dateien sichtbar; eine eigene 3MF je Farbe ist nicht mehr notwendig.
- Vorhandene Varianten, Bauteile, Zuordnungen, Druckprofile, Filamente und Kundenbestellungen bleiben unverändert. Die Original-3MF wird nicht automatisch umgefärbt.

# 0.13.46 · Druckfarm lädt wieder und Dashboard-Karten erhalten Styling

- Der HTTP-Server liefert jetzt `farm-ui.js`, `farm-ui.css` und `dashboard-order-cards.css` als zulässige statische Dateien aus. Vorher antwortete er für diese drei Dateien mit 404.
- Druckfarm-Ansicht lädt jetzt ihre Messwerte aus `/api/farm-stats`; 24 h, 7 Tage, 30 Tage und manuelle Drucktimer sind bedienbar, sofern die HA-Druckstatussensoren verfügbar sind.
- Die bisherige Home-Assistant-Datenerfassung bleibt unverändert. Weder Shelly-Stromdaten noch Bambu-Cloud-Kontodaten werden direkt abgefragt.
- Keine Änderung an Etsy-Aufträgen, Lager, Filamenten, Druckerzuordnungen oder 3MF-Dateien.

# 0.13.44 · Dashboard-Bestellungen eindeutig gestalten

- Bestellungen im Dashboard zeigen nur noch eine Artikelkachel je bestellter Position statt einer optisch doppelten Karte.
- Kundenname und Auftragslink erscheinen als schmale Kopfzeile ohne Produktwiederholung. Bestellnummer, Datum, Varianten, Bild, Status, Versandfrist, Positionen und Vergrößerung bleiben erhalten.
- Farb- und Variantenwünsche werden bei der Artikelanzeige ohne identische Dubletten dargestellt.
- Die Filament-Schnellbuchung mit GLD aus 0.13.43 bleibt unverändert.

# 0.13.43 · Filamentrollen direkt buchen und Dashboard-Bestellkarte vereinfachen

- Filament → Rollen → „Neue Rollen einbuchen“: nur Farbe, Anzahl und Einkaufspreis je Rolle. Direkt in den vorhandenen Bestand buchen.
- Schnellzugriff oben im Filamentlager; neue Farben weiterhin über den bestehenden Farbkatalog anlegen.
- Gewichteter gleitender Durchschnittspreis (GLD) je volle Rolle aus bisherigem Bestand und echtem neuem Einkaufspreis; Preis wird für vorhandene Druckkostenrechner übernommen.
- Alle Buchungen mit eindeutiger Kennung gegen Doppelerfassung geschützt und nachvollziehbar archiviert.
- Alter, komplizierter Import-/Bestell-/Wareneingangsbereich wird aus der Benutzeroberfläche entfernt, bestehende Buchungsdaten bleiben gespeichert.
- Dashboard: Der Bestellkopf wiederholt nicht länger den ersten bestellten Artikel; pro Kundenposition genau eine Produktkarte.
- HA-Webserver gibt die neue UI-Datei frei; keine neue Python-Startdatei erforderlich, bestehende Bestellungen, 3MF-Dateien und Filamente bleiben erhalten.

# 0.13.41 · Home-Assistant-Startreparatur

- Die neue Datei `farm_stats.py` wird in das Docker-Image des Add-ons kopiert. Ohne diese Datei konnte 0.13.40 beim Start einen ImportError auslösen.
- Vorhandene Bestellungen, 3MF-Dateien, Lagerbestände und Druckerzuordnungen bleiben unverändert.
- Der CI-Test prüft künftig, dass jedes zur Laufzeit importierte Modul im Add-on-Image enthalten ist.

# 0.13.40 · Druckfarm: 24/7-Auslastung einschließlich Nachtbetrieb

- Neuer HA-Reiter „Druckfarm“ mit 24-Stunden-, 7-Tage- und 30-Tage-Auswertung aller sechs vorhandenen Drucker.
- Unabhängige Hintergrundmessung etwa einmal pro Minute: H2D, P1S Old, P1S New und Snapmaker U1 über vorhandene Home-Assistant-Druckstatussensoren. Läuft auch ohne geöffnetes Handy oder Dashboard.
- Eigene manuelle Start-/Fertig-/Fehldruck-Erfassung für A1 mini und Prusa MK4; löst keine echte Druckersteuerung aus.
- Streng getrennte Kennzahlen für wirkliche Druckzeit, 24/7-Kapazität, erfasste Betriebszeit und Messlücken; fehlende Sensordaten werden niemals als Leerlauf ausgegeben.
- Druckfarm-Daten in eigenständigen SQLite-Tabellen, vorhandene Etsy-Aufträge, Bestände, Druckprofile und Master-3MF-Dateien bleiben unangetastet.
- Kaufhinweis für einen möglichen zweiten H2D erst bei ausreichend belastbaren Messwerten. Zuerst Daten über eine volle Woche sammeln.
- Tests für Leerlauf, Nachtbetrieb, Sensorausfall, Druckabschluss und manuelle Erfassung.

# 0.13.39 · Bauteile eindeutig nach Etsy-Variante zuordnen

- Bestellungen zeigen nur die Bauteile der gekauften Etsy-Variante, nicht alle Farbkarten desselben Produkts.
- Bestehende gleichnamige Farbkarten (weiß, beige, schwarz, gold) werden ausschließlich bei eindeutiger Zuordnung automatisch der passenden Etsy-Variante zugeteilt.
- Im Bauteileditor kann die Variante manuell gewählt werden; gemeinsame Bauteile bleiben weiterhin möglich.
- „Alle Varianten“ im 3MF-Bearbeitungsdialog ist nicht mehr als bearbeitbares Ziel verfügbar. Historische Standarddateien bleiben vorhanden und in der Übersicht lesbar.
- Falsche Varianten können nicht über die Bauteil-API als Druck oder Fertigmeldung gebucht werden. Vorhandene Auftragsbuchungen werden geschont.
- Keine Löschung bestehender Etsy-Bestellungen, Druckdateien, Lagerbestände oder Filamentdaten.

# 0.13.38 · Zuverlässige Farbchips und Farbmuster

- Bei allen Master-Farbpunkten stehen interne Nummer und echter Farbname; auch für H2D links/rechts und beim Editieren.
- Manuell gespeicherte AMS-Belegung hat Vorrang vor Originalfarben der 3MF. Die Originalfarben bleiben separat aufklappbar, ohne scheinbare neue Zuordnungen.
- Bei falschem Farb-HEX kann das Farbmuster direkt in der Auswahl korrigiert werden; Bestand und andere Spulendaten bleiben geschützt.
- AMS-Vorschau aktualisiert sich sofort bei Änderungen, ohne den offenen Editor oder andere Formulare zu schließen.
- Bestell-/Bauteilkarten lesen bevorzugt die bewusst gespeicherten Profilfarben. Keine Migration; Originaldateien unangetastet.

# 0.13.37 · Kompakte Filamente mit H2D-Düsenanzeige

- Farben direkt bei den Master-3MF-Farbpunkten ändern, hinzufügen und löschen, ohne zweite große Belegungskarte.
- AMS, AMS HT und externe Spulen in H2D auf linke/rechte Düse legen; dauerhaft im bestehenden Profil speichern.
- Kein Eingriff in Original-3MF oder gespeicherte Grammwerte und Druckkosten.

# 0.13.36 · Deutliche Kundenvarianten in der Bestellung

- Bestellpositionen zeigen Farbeigenschaften und weitere Kundenwünsche einzeln mit deutlichen Beschriftungen und Werten.
- Einzelbestellungen nutzen die volle Breite; Kundenauftrag und 3MF-Karten sind durch eigene Bereiche optisch getrennt.
- 3MF-Bauteilnamen bleiben als Druckvorlagen erkennbar, damit Katalogbezeichnungen nicht mit der bestellten Farbe verwechselt werden.
- Keine Änderungen an Bestelldaten, Versanddatum, Lager, Druckstatus oder Slicer-Verknüpfungen.

# 0.13.35 · Kompakte Produkt- und Bestellkarten

- Produktkatalog mit Modellfoto, aufklappbaren Varianten und Masterdateien je Drucker beziehungsweise Bauteil.
- Jede Datei zeigt nur Druckzeit, Materialverbrauch, kalkulierte Druckkosten und die hinterlegten Farben; Druckstatistiken und Prozente entfallen aus der Karte.
- Festfarben oder Wunschfarben werden dauerhaft je Master hinterlegt. Grammwerte und Druckzeit werden direkt im vorhandenen Mastereditor gepflegt, Filamentpreise aus der Bibliothek berechnet.
- Drei Slicer-Aktionen pro Datei für Bambu Studio, Orca und Snapmaker Orca; auf Geräten ohne Mac-Helfer wird die 3MF zur Verwendung im Slicer heruntergeladen.
- Bestellkarten enthalten Produktfoto, Modellname und Variante; große Ansicht zeigt Masterdatei, passende Farben, Kosten und Slicer-Zugriff auch je Bauteil.
- Bestehende Versandtermine, Ampeln, Countdown, Kundeninformationen, Status, Produktions- und Lagerbuchungen sowie lokale Auftragshistorie bleiben unverändert.

# 0.13.34 · 3MF-Filamentfarben ohne Prozentwerte

- Prozentangaben neben Filamentnamen in Master-3MF und Bestellübersichten entfernt, da der Anteil nicht laufend protokolliert wird.
- Filamentname, Farbpunkt, optional hinterlegte Grammwerte und bisherige Kostenberechnung bleiben erhalten.
- Bestehende Bestellungen, Druckprofile und 3MF-Dateien werden nicht verändert.

# 0.13.33 · Helle 3MF-Infokarten in Druckprojekten und Bestellungen

- Jede gespeicherte Master-3MF zeigt direkt Druckzeit, erfasste Druckanzahl, letzten protokollierten Druck, Grammverbrauch und aktuelle kalkulierte Druckkosten.
- Helle, mobiloptimierte Filamentübersicht mit Farbpunkten und tatsächlichen Prozentanteilen, sofern Verbrauchsdaten vorhanden sind.
- Der vorhandene Kostenrechner behält seine Etsy-Gebühren, Preisstufen und die gespeicherten Druckerkosten unverändert bei.
- Bambu- und Orca-3MF-Projekte werden beim ersten Abruf auf sichere Slicer-Metadaten geprüft; bestehende Originaldateien werden nicht verändert.
- Verbrauch und Druckzeit können je Datei ergänzt werden. Kalkulation nutzt hinterlegte Rollenpreise und die Strom-/Maschineneinstellungen des Kostenrechners; bei fehlenden Daten werden keine Preise erfunden.
- Gleiche Infokarten bei bereits bestehenden Etsy- und lokalen Bestellpositionen sowie Bauteilen dank Live-Verknüpfung.
- Auf dem Mac stehen „In Bambu Studio öffnen“ und „In Orca öffnen“ zur Verfügung. Der bestehende lokale Öffnen-Helfer unterstützt auch OrcaSlicer.
- Druckzähler wird bewusst nur über „Druck protokollieren“ erhöht. Daten von Lager, Bestellungen, 3MF und Druckprofilen bleiben erhalten.

# 0.13.32 · Filament-Einkaufsdaten & interne Codes

- Import / manuelle Bestellung: bereits gespeicherte interne Farbcodes können direkt ausgewählt und der zugehörigen Stammdatenfarbe zugeordnet werden; keine doppelte Vergabe.
- Kundenbeispiel Kastanienrot 10205, PLA Basic Refill: Bambu-Bestelltext ohne Händlerüberschrift wird erkannt, 9,00 € nach 7,99 € Produkt-Rabatt als tatsächlicher Gesamtpreis übernommen.
- Vor dem Speichern: Warnung bei unbekanntem Händler oder fehlenden Einkaufspreisen und verständliche Hinweise bei Farbcodekonflikten statt vermeidbaren HTTP-400-Fehlern.
- Falls „Speichern + erhalten“ nach erfolgreichem Speichern beim Wareneingang scheitert, verhindert die Oberfläche einen unbemerkten zweiten Bestellversuch.
- Bereits gebuchte Positionen mit unbekanntem Preis können fehlende Kosten und Händlerdaten ergänzen: vorhandene Lagerbestände bleiben unverändert, Wareneingänge werden nicht erneut gebucht, Kostenbuchungen centgenau nachgetragen.
- „Preis offen“ nur bei tatsächlich fehlenden Kosten: wenn der optionale Rechnungs-Gesamtbetrag leer ist, berechnet das System ihn aus den bereits bekannten Positionspreisen; bestehende Einträge werden korrekt dargestellt.
- Regressionstests für Refill-Import Kastanienrot (10205), Kostenkorrektur bei Teillieferungen und Schutz gegen doppelte interne Nummern.

# 0.13.31 · Lokale Bestellungen mit Versanddienstleister und Sendungsnummer

- Bei fertiggestellten lokalen Versandaufträgen kann vor „Versand bestätigen“ ein Versanddienstleister (Hermes, DHL, Deutsche Post, DPD, GLS, UPS, FedEx oder eigener Dienstleister) ausgewählt und optional die Sendungsnummer eingetragen werden.
- Versanddienstleister, Sendungsnummer und Zeitpunkt bleiben direkt in der lokalen Auftragshistorie sichtbar. Die Sendungsnummer lässt sich kopieren.
- Historie auch im Reiter „Bestellungen“ aufrufen, lokal nach Kundenname, Auftragsnummer, Versanddienstleister oder Sendungsnummer suchen, nach Status filtern und ältere Aufträge nachladen.
- Gemeinsamer Versand mehrerer Aufträge desselben Kunden wird nicht mehr automatisch vorausgewählt. Nur aktiv hinzugefügte Aufträge erhalten dieselben Sendungsdaten.
- Rückgängig gemachter Versand stellt die Buchung wieder her und löscht die gespeicherten Versanddaten. Abholung, Direktverkauf, alte Aufträge, Etsy und Lagerbuchungen bleiben kompatibel.

# 0.13.30 · Filament-Wareneingang mit Mengenprüfung

- Wareneingang zeigt je Position und Bestellung die bestellte, bereits erhaltene und noch offene Rollenanzahl getrennt an.
- Falsch erfasste Bestellmengen vor dem ersten Wareneingang direkt korrigierbar, zum Beispiel Jade-Weiß 10100 von 1 auf 3 Rollen bei 31,78 € Gesamtpreis. Keine automatische Einlagerung.
- Nach bereits erfolgter Buchung wird die nachträgliche Mengenänderung gesperrt, damit Lager- und Einkaufswerte erhalten bleiben.
- Rollenanzahl und Positionssumme aktualisieren sich in der manuellen Bestellmaske sofort; gespeicherte Bestellkarten zeigen die Mengen je Farbe.
- Regressionstests für Teillieferungen 2 + 1, Doppelbuchungsschutz, exakte Preisaufteilung und Löschen mit Bestandsrücknahme.

# 0.13.29 · Filamentimport: Echtzeitprüfung und Auswahlhilfen

- Gültige Pflichtfelder werden beim Tippen direkt freigegeben.
- Hersteller- und Materialvorschläge aus dem Katalog.
- Einheitliche Schreibweise bei Bambu Lab und anderen bekannten Herstellern.
- Keine Änderungen an bestehenden Lagerbeständen oder Bestellungen.

# 0.13.28 · Zwei hochwertige A4-Ausdrucke für lokale Bestellungen

- Der bisherige direkte PDF-Link wird durch eine verständliche Auswahl ersetzt: interner Werkstattauftrag oder Kundenbeileger. Bestehende und abgeschlossene lokale Bestellungen sind weiterhin nutzbar.
- Beide A4-Dokumente verwenden das bereits integrierte originale Print & Pulse Logo und ein sauberes, druckfreundliches Layout.
- Werkstattauftrag mit Kunde, Auftragsdaten, Ausführung, Fälligkeitsdatum, internen Notizen, Druck-/Qualitäts-/Verpackungscheckliste und Schreibplatz.
- Kundenbeileger mit Bestellübersicht, Wunschfarben, Varianten, Personalisierung und Dankestext – bewusst ohne Preise, interne Notizen oder Werkstattdaten.
- Authentifizierter PDF-Abruf innerhalb der aktiven Home-Assistant-Sitzung; nur echte PDF-Dateien werden gespeichert. Bei HTTP 401/403 erscheint eine verständliche Fehlermeldung statt eines fehlerhaften Downloads.
- PDF-Vorlagen bleiben vollständig lokal, erzeugen keine Lagerbewegungen und verändern keine Bestellungen.

# 0.13.27 · Filamentbestellungen verständlich prüfen und sicher löschen

- Importprüfung benennt jedes fehlende Pflichtfeld einzeln rot und öffnet Hersteller/Material automatisch, wenn dort etwas fehlt.
- Schaltfläche „Position bestätigen & weiter“ erklärt die Prüfung; erst „Speichern“ legt eine Bestellung an.
- Jede Position zeigt den Preis je Rolle an, auch während der Eingabe; bei nicht teilbaren Centbeträgen mit exakter Aufteilung (z. B. 31,78 € / 3 → 2 × 10,59 € und 1 × 10,60 €).
- Papierkorb an jeder gespeicherten Einkaufskarte und „Bestellung löschen“ im Wareneingang, jeweils mit Sicherheitsabfrage.
- Gelöschte, noch nicht erhaltene Bestellungen verändern weder Lagerbestand noch Filamentpreise.
- Bereits eingebuchte Rollen werden nur bei ausreichendem Lagerbestand transaktional zurückgebucht. Der bisherige Preis wird aus verbleibenden Einkäufen oder einer erfassten Ursprungspreisbasis rekonstruiert. Manuelle spätere Preisänderungen bleiben erhalten.
- Alle Bestellungen, Filamentstammdaten, vorhandenen Lagerdaten, Etsy-Aufträge und Druckaufträge bleiben von der Migration unberührt.

# 0.13.26 · Lokale Aufträge auf dem iPhone zuverlässig anlegen

- Produktvorschläge im mobilen Suchfeld lassen sich jetzt per Fingertipp übernehmen, auch wenn Safari beim Antippen die Tastatur ausblendet.
- Vorschläge stehen mobil direkt unter der Suche, haben größere Tippflächen und schließen nicht vorzeitig.
- Der Speichern-Bereich bleibt beim Scrollen besser erreichbar; unvollständige Positionen werden gezielt benannt.
- Zwei Positionen inklusive Varianten- und Farbauswahl werden mit einem zusätzlichen iPhone-WebKit-Test geprüft. Bestehende Aufträge und Lagerdaten bleiben unverändert.

# 0.13.25 · 3MF direkt vom Mac über Home Assistant sichern

- Einfacher neuer Hauptweg für Masterdateien: 3MF im macOS-Finder in `smb://HA-ADRESSE/share/print-pulse/3mf-eingang` kopieren, danach im Produktkatalog auswählen und übernehmen. Keine 3MF-Binärübertragung mehr durch den Home-Assistant-Ingress-Proxy.
- Netzwerkordner anzeigen/kopieren, Dateiliste aktualisieren, Dateiname und Größe auswählen, direkt für das aktuell gewählte Produkt/Variante/Drucker sichern.
- Datei bleibt unverändert im Eingangsordner, wird als eigenständige, geprüfte Masterversion abgelegt und erscheint sofort in der Druck- und Bestellansicht. Bereits gespeicherte 3MF-Dateien, Druckprofile, Bestellungen und Lagerbestände bleiben erhalten.
- Server übernimmt nur reguläre 3MF-Dateien aus dem fest hinterlegten Eingangsordner (maximal 100 MB), prüft ZIP-CRC und lehnt Verknüpfungen, Pfadmanipulation und unvollständige Dateien ab.
- Bisheriger Browser-Upload bleibt als Alternative bestehen.

# 0.13.24 · Master-3MF deutlich schneller hochladen

- Ingress-Streaming nutzt 2-MB-Dateiteile statt 128 KB: eine 6,7-MB-Datei benötigt nur noch vier statt rund 53 Teilübertragungen.
- Bei 413-Proxy-Fehlern oder Zeitüberschreitungen wird die Teilgröße weiterhin automatisch reduziert; abgebrochene Übertragungen bleiben fortsetzbar.
- Die Fortschrittsanzeige reagiert während des Transfers auf tatsächlich gesendete Bytes; die endgültige Speicherung wird weiterhin erst nach Serverbestätigung und Archivprüfung gemeldet.
- Lagerbestände, Bestellungen, Filamentzuordnungen und bestehende Master-3MF-Dateien bleiben unverändert.

# 0.13.23 · 3MF-Upload ohne Hänger bei 0 Prozent

- Home Assistant Ingress-Streaming aktiviert, damit POST-Dateiteile ohne vollständiges Proxy-Buffering an das Add-on weitergeleitet werden.
- Dateiteile auf 128 KB verkleinert. Jede Anfrage und die Upload-Vorbereitung erhalten verbindliche Zeitlimits; stockende Übertragungen werden kleiner erneut versucht.
- Fortschrittsanzeige mit nachvollziehbaren Statusmeldungen. Bei dauerhaftem Proxy-Fehler wird der Speichern-Button wieder freigegeben und die bereits übertragenen Teile bleiben zum Fortsetzen erhalten.
- Vorhandene Master-3MF-Dateien, Druckprofile, Produktionsaufträge und Lagerbestände bleiben unverändert.

# 0.13.22 · Große Master-3MF-Dateien zuverlässig speichern

- Upload von 3MF-Projekten bis 100 MB über kleine 512-KB-Teilstücke: kein 20-MB-Einzelupload mehr durch den Home-Assistant-Ingress-Proxy.
- Fortschrittsanzeige, automatische Wiederholung fehlgeschlagener Dateiteile und kleinere Teilstücke bei HTTP 413. Unterbrochene Übertragungen können mit derselben Dateiauswahl fortgesetzt werden.
- Upload-Teilstücke bleiben bis zur Bestätigung getrennt von Masterdateien; prüft Archiv-CRC und vollständige Übertragung, bevor eine neue, unveränderliche 3MF-Version gespeichert wird.
- Bestehende Masterdateien, Farbprofile, Druckerfreigaben, Bestellungen, Bauteile und Lagerdaten bleiben unangetastet.

# 0.13.21 · 3D-Druck-Kostenrechner nach Chargen- und Verkaufskosten

- Aufgeräumte responsive Print-&-Pulse-Oberfläche mit Live-Ergebnis, Preisstufen und ausklappbaren Kostenangaben.
- Druckkosten pro kompletter Charge und pro Stück, getrennt von verkauften Stückzahlen und Zahl der Bestellungen. Mehrfarbige Drucke und Suchfeld mit numerischer Lagerfarbensortierung.
- Hinterlegte Druckerstrom-/Anschaffungs-/Wartungswerte, Fehldruckreserve, konfigurierbarer Strom- und Arbeitsstundensatz sowie optionale Fixkostenumlage.
- Etsy-Gebühren inklusive Offsite Ads, Versandkosten, Rabatten, Listinggebühr USD/EUR und einstellbarer USt. auf Verkäufergebühren; Direktverkauf ohne Plattformgebühren.
- Preisempfehlungen mit Break-even/20/40/60 % Umsatzmargen inklusive aller Gebühren und optionaler ,90-/ ,99-Rundung.
- Rechner speichern ohne Druckerfreigaben zu verändern. Historische Kalkulationen bleiben erhalten; Katalogvormerkung ohne Etsy-Preisänderung.

# 0.13.20 · Master-3MF gezielt löschen

- Papierkorb neben jeder hinterlegten Master-3MF mit Dateiname in der Löschbestätigung.
- Entfernt gezielt die gespeicherte Datei und ihre Bauteil-/Bestellzuordnungen. Andere Dateien, Filamentprofile, Bestellungen und Lagerbestände bleiben erhalten.
- Filament-Bedarfsanalyse mit 50 g Standard und Etsy-Historie bleiben unverändert.
- Dateiliste und Anzahl aktualisieren sich direkt; fehlgeschlagene Löschvorgänge werden angezeigt.

# 0.13.19 · Safari 3MF Upload gegen Proxy- und Dateinamenfehler absichern

- Die bisherige 3MF-Upload-URL mit Dateinamen und anderen Parametern wird durch einen POST auf den festen Endpunkt ohne Querystring ersetzt. Produkt, Variante, Drucker und Originaldateiname werden getrennt in ASCII-sicheren HTTP-Headern übergeben.
- Umlaute und Sonderzeichen wie in „My_Acorn_beide_größen.3mf“ können übertragen und als Originaldateiname gespeichert werden; ältere Clients mit Query-Parametern bleiben kompatibel.
- Safari-Fehlermeldung „The string did not match the expected pattern“ wird bei HTML- oder leeren Proxy-Antworten durch HTTP-Status und aussagekräftige Fehlermeldung ersetzt. Ein Upload wird nur nach expliziter JSON-Bestätigung als erfolgreich markiert.
- Tests für deutschen Dateinamen, Browser-Upload ohne Querystring und HTTP-502-Ingress-Antwort.
- Masterdateien, Filamentprofile, Produktions-/Lagerbuchungen, Etsy-Historie und Bedarfsanalyse mit 50 g Standard bleiben unverändert.

# 0.13.18 · 3MF-Direktzugriff für alle vorhandenen Bestellungen

- Auch einfache Bestellpositionen ohne einzeln erfasste Bauteile zeigen das gespeicherte Master-3MF-Projekt direkt im Dialog (Dashboard und Bestellungen).
- Die 3MF-Zuordnung wird beim Öffnen der Bestellung aus dem aktuellen Produktkatalog geladen. Ältere Bestellungen brauchen weder Bearbeitung noch erneutes Anlegen.
- Bei genau einem passenden Druckprojekt (auch mehreren Revisionen mit gleichem Namen) erscheint der Slicer-Button automatisch. Bei mehreren unterschiedlichen Projekten kann eine Datei als Standard für die Produktvariante dauerhaft gespeichert werden.
- Der bestehende Mac-SMB-Helfer öffnet die Originaldatei ohne neue Installation; auf anderen Geräten bleibt der Download.
- Der Klick auf „Im Slicer öffnen“ ist unabhängig von der Produktionsbuchung. Etsy-Historie, Druckstatus und Filament-Bedarfsanalyse mit 50 g Standard bleiben unverändert.

# 0.13.17 · 3MF-Direktstart in der Bestellposition je Bauteil

- Im Bestellungs-Detaildialog erhält jedes separat druckbare Bauteil eine direkte 3MF-Aktion: „In Bambu Studio öffnen“ bzw. „In Snapmaker Orca öffnen“.
- Eindeutige Dateinamen wie Schale.3mf und Halter.3mf werden automatisch dem entsprechenden Bauteil zugeordnet. Bei mehreren möglichen Projekten gibt es eine explizite, dauerhaft speicherbare 3MF-Zuordnung.
- Die Zuordnung ist pro Bauteil, Variante und Drucker gespeichert, auf passende Dateien desselben Etsy-Produkts begrenzt und wird auch in bestehenden und späteren Bestellungen angezeigt.
- Öffnen startet ausschließlich den lokalen Slicer; bestehende Buttons „Drucken“, „Fertig“ und der Lagerbestand bleiben unabhängig und unverändert.
- Etsy-Historie und Filament-Bedarfsanalyse mit 50 g Standard bleiben unverändert.

# 0.13.16 · Master-3MF-Projekte übersichtlich anzeigen und direkt vom Netzwerk öffnen

- Master-3MF-Dateien als übersichtliche Projektkarten mit gut lesbarem Dateinamen, Drucker, Datum, Dateigröße und klar getrennten Bambu-/Snapmaker-Aktionen.
- Filamentbelegung, neue Uploads und Einrichtungsdetails sind aufklappbar. Bestehende 3MF-Dateien erscheinen zuerst und sind auch mobil gut bedienbar.
- Neuer Mac-Helfer öffnet bevorzugt die unveränderte Original-3MF aus der Home-Assistant-Samba-Freigabe unter /share/print-pulse/masterdateien. Die eindeutige Datei-ID identifiziert exakt die richtige Projektversion.
- Falls nötig, kann der Mac die lokale SMB-Freigabe einmalig verbinden. Ist sie nicht erreichbar, bleibt die lokale Dateiauswahl als Notlösung. Ein Browser-Download wird beim Öffnen nicht mehr automatisch ausgelöst.
- Bereits gespeicherte Masterdateien, Druckprofile, Filamentdaten sowie Etsy-Historie und Filament-Bedarfsanalyse mit 50 g Standard bleiben unverändert.

# 0.13.15 · Mac-Slicer: Downloadpfad erkennen und Datei auswählen

- Safari kann 3MF-Downloads anders benennen, blockieren oder in einem abweichenden Ordner speichern. Der lokale Helfer sucht jetzt auch im konfigurierten Safari-Ordner und in iCloud-Downloads.
- Falls keine eindeutige 3MF-Datei gefunden wird, öffnet sich eine native Dateiauswahl. Es wird keine zufällig ähnliche Datei ungefragt geladen.
- Der normale Download bleibt erhalten; neue Hilfe erklärt die sichere zweistufige Ausweichlösung.
- Für den verbesserten Mac-Helfer ist die einmalige Neuinstallation nötig. Bestehende Masterdateien werden nicht verändert.
- Etsy-Historie und Filament-Bedarfsanalyse mit 50 g Standard bleiben unverändert.

# 0.13.14 · Master-3MF direkt im Slicer öffnen

- Auf dem Mac pro Masterdatei „In Bambu Studio öffnen“ und „In Snapmaker Orca öffnen“.
- Einmalig installierbarer lokaler Mac-Helfer. Der Safari-Download bleibt durch die HA-Anmeldung geschützt; keine neue öffentliche Dateischnittstelle.
- 3MF-Dateien erhalten beim Slicer-Download einen eindeutigen Dateinamen. Die vorhandenen Download- und Speicherfunktionen bleiben erhalten.
- Etsy-Historie und Filament-Bedarfsanalyse mit 50 g Standard bleiben unverändert.

# 0.13.13 · Master-3MF: Farben visuell belegen und Speichermeldung korrigieren

- AMS-Plätze mit gut sichtbaren Farbfeldern, kurzen Farbnamen und internen Nummern statt endloser Filament-Dropdowns.
- Suche nach Farbe, Material, internem Code oder Hersteller-Farbcode; direkte Zuordnung per Farbkachel auch mobil.
- 3MF-Upload bestätigt das erfolgreiche Ablegen separat. Ein später fehlgeschlagenes Nachladen der Dateiliste wird nicht mehr fälschlich als Upload-Fehler ausgegeben.
- Direkt im Dialog wird angezeigt, ob Filamentbelegung oder 3MF-Datei gespeichert wurde. Bestehende Profile, Masterdateien und Druckerzuordnungen bleiben erhalten.

- Die Etsy-Historie und die Filament-Bedarfsanalyse mit 50 g Standard bleiben unverändert.

# 0.13.12 · Filamentbestellung ohne Screenshot

- Neuer Standard: Filamentbestellung direkt manuell eintragen. Bestehende Farben per Suche nach Bambu-Code, internem Code, Material oder Farbe übernehmen.
- Neue Farbe direkt beim Erfassen in die Bibliothek aufnehmen. Dabei werden die Angaben erst beim Speichern angelegt und vorhandene Stammdaten nicht ohne Rückfrage verändert.
- Einfache Positionen: Menge, Spule/Refill und Preis; zusätzliche Daten nur bei Neuanlage. Mehrere Positionen als eine Bestellung speichern.
- Foto-/Textimport bleibt optional. Wareneingang nur nach ausdrücklicher Buchung.
- Die Etsy-Historie und die Filament-Bedarfsanalyse mit 50 g Standard bleiben unverändert.

# 0.13.11 · Lange Bambu-Screenshots zuverlässiger importieren

- OCR liest lange Screenshots in mehreren kürzeren Abschnitten und wählt das vollständigere Ergebnis.
- Eine einzelne erkannte Filamentrolle aus einem langen Screenshot gilt nicht mehr als vollständige Bestellung. Stattdessen erscheint eine verständliche Fehlermeldung.
- Fehlende erkannte Hersteller-Farbcodes werden für die Vollständigkeitsprüfung berücksichtigt.
- Keine automatische Lagerbuchung. Vorhandene Filamente, Etsy-Historie und die Bedarfsanalyse (50 g Standard) bleiben erhalten.

# 0.13.10 · Bambu-Bestelldetails vollständig erkennen

- Bambu-Shop-Bestelldetails aus langen iPhone-Screenshots werden als Zahlungsübersicht statt als E-Mail-Format erkannt. Material, Farbcode, Spulenmenge und Positionspreis können dabei auf getrennten Zeilen stehen.
- Doppelte Artikel aus dem Fortschrittsbereich werden ignoriert; Mengenrabatte und Gratisrollen bleiben korrekt.
- Bei fehlenden Produktzeilen wird deutlich vor dem Speichern gewarnt und eine unvollständige Übernahme blockiert.
- Etsy-Historie, Filament-Bedarfsanalyse mit 50 g Standard und getrennte Wareneingangsbuchung sind unverändert.

# 0.13.9 · Filamentimport fürs iPhone: eine Position nach der anderen

- Mobil werden nicht länger mehrere Positionen gleichzeitig aufgeklappt. Ein Bearbeitungsbereich, kompakte Liste und „Geprüft · nächste Position“ sorgen für deutlich weniger Scrollen.
- Erweiterte Stammdaten nur bei Bedarf aufklappen; manueller Import, Nachbearbeitung, Mehrfachauswahl und getrennte Wareneingangsbuchung bleiben.
- Importfehler erscheinen direkt unter der Dialogüberschrift. Zu große Fotos werden vor dem Upload automatisch verkleinert, PDFs über 12 MB sofort gemeldet; Bestelltext aus der Zwischenablage wird direkt eingelesen.
- Beim Wechsel zwischen Positionen bleiben bestätigte Katalogänderungen erhalten.
- Die Etsy-Historie und die Filament-Bedarfsanalyse mit 50 g Standard bleiben unverändert.

# 0.13.8 · Filament-Sammelimport mit manueller Bearbeitung

- Kompakte Bestellliste mit automatischer Erkennung und direkter Anzeige, wie viele Positionen zugeordnet, neu oder noch zu prüfen sind.
- Nur unklare Positionen automatisch geöffnet. Jede Farbe, Menge, Verpackung, jeder Herstellercode und Preis bleibt jederzeit manuell änderbar.
- Kopierten Bestelltext oder Screenshot direkt einfügen, Dateien weiterhin hochladen, Positionen auswählen und gemeinsam bearbeiten; nach bestätigter Prüfung alle gesammelt übernehmen.
- Wareneingang und Teilbuchungen bleiben getrennt. Etsy-Historie und Filament-Bedarfsanalyse (50 g Standard) bleiben erhalten.

# 0.13.7 · Filamentbestellungen und sicherer Wareneingang

- Filamentbestellungen mit Bild-/PDF-/Textimport, vollständiger Positionskorrektur und neuem Bestellarchiv.
- Wareneingang mit Teillieferungen, idempotenten Buchungen, Preis- und Kataloghistorie; Geschenkrollen verändern den letzten bezahlten Preis nicht.
- Lokale Texterkennung via Tesseract (de/en), PDF mit pdftotext; unklare Einträge bleiben prüfpflichtig.
- Bestehende Etsy-Historie und Filament-Bedarfsanalyse mit dem 50 g Standard bleiben erhalten; Kauf- und Lagervorgänge sind davon getrennt.

# 0.13.6 · Bambu-Hersteller-Farbnummer sicher speichern

- Manuell eingetragene Bambu-Farbnummern und HEX-Werte werden beim Speichern nicht mehr von der automatischen Farbzuordnung überschrieben.
- Die Erfolgsmeldung setzt einen Abgleich der Hersteller- und internen Farbcodes mit der Datenbankantwort voraus.
- Filament-Einkaufsanalyse (50 g Standard) und Etsy-Historie bleiben unverändert.
- Bestehende Bestände und Einkaufspositionen werden nicht verändert.

# 0.13.5 · Filament-Einkauf und Etsy-Historie: HA-Startreparatur

- Die neue Bedarfsanalyse mit 50 g Standard verwendet wieder alle erforderlichen Python-Module im Docker-Image.
- Der Startfehler nach 0.13.4 ist behoben, Bestands- und Einkaufsdaten werden nicht geändert.
- Dockerfile-Regressionstest verhindert das versehentliche Auslassen neuer Module.

# 0.13.4 · Filamentbedarf und Einkauf optimieren

- Neue Bedarfsanalyse im Filament-Einkaufswagen, mit 14 Spulen und 60 Tagen voreingestellt.
- 50 g pro Artikel als pauschale Standardschätzung, vorhandene echte Profil-Grammwerte gehen vor.
- Farbzuordnung anhand eindeutiger Etsy-Varianten, Bauteile, Master-3MF-Filamentzuordnung und Kostenprofile.
- Rückwirkende Etsy-Historie ab Juli 2025 separat importierbar. 30- und 90-Tage-Verbrauch begründen die Prognose.
- Keine ungeprüfte Lageränderung; Empfehlungen müssen explizit zur Einkaufsliste übernommen werden.
- Preise sind die bereits gepflegten Filamentpreise, keine Live-Bambu-Preise.

# 0.13.3 · Lokale Bestellungen mit Übergabestatus

- Fertige lokale Aufträge erscheinen automatisch als „Abholbereit“ und verlieren den roten Produktions-Countdown, auch wenn sie vor dem Update angelegt wurden.
- Druckkosten und optionale Etsy-Kalkulation bleiben verfügbar und unverändert.
- Neuer Übergabedialog: vom Kunden abgeholt, an Dritte mitgegeben (Name optional), persönlich ausgeliefert oder versendet.
- Mehrere abholbereite Aufträge desselben Kunden können gemeinsam und atomar übergeben werden; unfertige Aufträge bleiben aktiv.
- Übergabedatum, Art und Empfänger werden im lokalen Archiv gespeichert. A4-PDFs bleiben auch bei abgeschlossenen Aufträgen verfügbar.
- Versehentliche Übergaben lassen sich für neu dokumentierte Übergaben inklusive korrekter Lager-Rückbuchung rückgängig machen; ältere Abschlüsse bleiben unverändert.
- Etsy-Bestellungen, bereits gebuchte Bestände und direkte Verkäufe werden nicht umgestellt.

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

# 0.12.9 · Einzeilige Navigation und Dashboard

- Dashboard statt „Aufträge & Druckplan“.
- Einheitliche Reiter: Dashboard, Bestellungen, Lagerbestand, Produktkatalog, Filament, Drucker.
- Alle sechs Reiter in einer Zeile; auf kleinen Bildschirmen seitlich wischbar statt zweizeilig.
- CSS-Cache-Busting und Browser-Test für die Navigation. Keine Änderung an Lager- und Auftragsdaten.

# 0.12.8 · Eigene Bereiche für Bestellungen und Regalbestand

- Umbenennung „Produktion“ → „Aufträge & Druckplan“ und neue Reiter „Bestellungen“ sowie „Lagerbestand“.
- Bestellungen in Listen- oder Kachelansicht mit mehr Informationen, Suche, Statusfilter und Sortierung. Die bisherige große Bestellansicht und der kompakte Dashboard-Überblick bleiben erhalten.
- Lagerbestand mit Produktbildern, Farb-/Variantenzeilen, verfügbarem Bestand und Bauteilen. Bearbeiten oder über +1 Rückläufer einlagern, ohne Etsy zu verändern.
- Für Bauteile optionales, updatefest gespeichertes Farbfeld und übersichtliches Hauptformular mit eingeklappten erweiterten Feldern.
- Tests für neue Ansichten und Farbfeld ergänzt.

# 0.12.7 · Auftrags-Großansicht

- Neue Vergrößern-Taste auf jeder kompakten Bestellkarte, bestehender Details-Button öffnet identisches Fenster.
- Breites, responsives Bestellfenster mit Mengenüberblick, größerem Produktbild und sichtbaren Produktionsaktionen.
- Mehrere Positionen werden auf breiten Geräten in zwei Spalten, auf Mobilgeräten untereinander dargestellt.
- Bestehende Etsy-, Lager- und Auftragslogik unverändert.

# 0.12.6 · Komfortables Schließen aller Dialoge

- Klick oder Tippen neben Dialogen schließt diese; X und Escape nutzen dieselbe Sicherheitsprüfung.
- Geänderte Formularinhalte werden vor dem Verwerfen abgefragt; laufende Speicheraktionen bleiben geschützt.
- Innenklick und Drag-Start im Dialog lösen kein Schließen aus; keine Änderungen an Lager- oder Bestelldaten.

# 0.12.5 · A4-Kundenaufträge als PDF

- Lokale Bestellkarten und Details: „Auftrag A4 · PDF“ als Download-Button.
- Bündelt alle offenen lokalen Aufträge zum selben Kundennamen, mit individuellen Auftragsnummern und Terminen sowie allen Positionen.
- A4-Dokument mit Kopfzeile, sauber umgebrochenen Details und Seitenzahlen. Interne Notizen, Etsy-Aufträge und abgeschlossene Aufträge bleiben draußen.
- Keine Rechnung: Verkaufspreise werden im lokalen Auftrag noch nicht gespeichert.
- PDF nur während des Downloads im Speicher erstellt; kein dauerhaftes Ablegen von Kundendaten.

# 0.12.4 · Nachdruck-Post-its & Produktfilter

- Produktkarten tragen ein kleines, nicht klickbares Post-it mit gesamter offener Nachdruckmenge.
- Die Post-it-Farbe passt sich automatisch an die **vorhandene Karten-Akzentfarbe** an; keine zusätzliche Ampellogik und keine Anzeige bei null.
- Bauteilprodukte zeigen ihren echten Nachdruckbedarf. Produktfilter sind kontrastreicher und erhalten Live-Zähler.
- Keine Änderung an Etsy-API, physischen Lagerständen, Filamentverwaltung oder Druckbuchungslogik.

# 0.12.3 · Dashboard umgestaltet und lokaler Etsy-Abgleich korrigiert

- Hero-Kennzahlen reduzieren auf „Nachdrucken“ und „Versand kritisch“; direkte Navigation zu den betreffenden Produktions- und Bestellansichten.
- Hinweise übersichtlicher; prominentere vier Bereiche mit Icons; Druckerstatus gleich darunter, vor den aktuellen Bestellungen.
- Responsive Darstellung für Tablet, Mac-Split und Handy ohne Verlust der bisherigen Druckerinformationen.
- Lokalaufträge `LOK-…` nicht mehr als Etsy-Receipts abrufen; dadurch keine HTTP-400-Abfrage für lokale Bestellnummern.

# 0.12.2 · Filament-Einkaufsliste automatisieren

- Einkaufsliste und Spulenverwaltung zeigen während eines laufenden Vorgangs Ladeanimation und Status; zeitlich begrenzte Anfragen lösen graue, lange Wartezustände und prüfen anschließend den Bestand.
- Preiseingabe: ohne Kommatippen fortlaufend Cent eingeben. Beispiel: 1990 zeigt 19,90 €.
- Letzte volle Spule angebrochen oder bisher positive volle Stückzahl auf null korrigiert: einmal eine Rolle auf die Einkaufsliste setzen, wenn nicht bereits vorgemerkt.
- Keine automatischen Bestellungen, keine Verdoppelung vorhandener Einkaufsmengen; Lager, Codes und Druckprofile bleiben geschützt.

# 0.12.1 · Interne Filamentcodes 2.1, 2.2, 2.10

- Hauptfarbe und Farbton über Punkt nummerieren (z. B. 2 für Weiß, 2.1 und 2.2 für Weißtöne, 2.10 für den zehnten Farbton).
- Eindeutige Textkennungen und numerische Sortierung der Untercodes, ohne Dezimalzahlen zu verwenden.
- Kommaeingaben über die deutsche Smartphone-Tastatur werden mit Punkt gespeichert; Bestände, Preise, Einkaufsliste und Druckprofile bleiben erhalten.

# 0.12.0 · Lokale Aufträge mit Varianten und Personalisierung

- **+ Lokale Bestellung** führt Produkt-Vorschläge beim Tippen und die tatsächlich gespeicherten Varianten direkt aus dem Katalog zusammen. Verschiedene Größen/Farben können als mehrere Auftragspositionen angelegt werden.
- Pro Position Stückzahl, Wunschfarbe, Gravur/Personalisierung und Hinweis. Kundendaten, Abholung/Versand, Datum und Auftragsnotiz für den gesamten Auftrag.
- Offene lokale und Etsy-Aufträge erscheinen in denselben Dringlichkeits- und Produktionsansichten; Sonderfertigungen werden ohne automatisches falsches Lagerbuchen separat geführt.
- Fertigmeldung, Übergabe, Stornierung, Sofortverkauf mit Transaktionsschutz, Endterminänderung und dauerhafter lokaler Historie.
- Updatefeste separate Datensätze, ohne Änderungen an Etsy-Zugang oder Master-3MF-Dateien.

# 0.11.49 · Bauteilvorrat direkt und schneller bearbeiten

- Plus/Minus, direkte Mengeneingabe, Sammeländerungen sowie Start/Fertig/Abbruch von Vorratsdruckmengen erhalten nach der bestehenden transaktionalen SQLite-Buchung nur noch die bestätigten geänderten Bauteile. Die teure vollständige Etsy-/Produktübersicht wird für diese Aktionen nicht mehr pro Klick neu berechnet.
- Nur die betroffene Produktionskarte und relevante Auftragshinweise/Druckprioritäten werden unmittelbar aktualisiert; die übrigen Produktkarten, der Katalog und Eingabefelder bleiben unberührt. Das Mengenfeld öffnet ohne Gesamt-Render.
- Bereits laufende Hintergrundabfragen können einen neuen Lagerwert nicht überschreiben. Sammelbuchungen und konkurrierende Änderungen behalten ihre atomaren Prüfungen. Buchungsverlauf, Etsy-Aufträge, Fertigwaren, Druckprofile, Master-3MF und gesicherte Bestände bleiben erhalten.
- HTTP-Regressionstest für den schlanken Buchungsweg, Bestandsbestätigung, veraltete Eingaben und Audit-Protokoll ergänzt.

# 0.11.47 · Bauteilvorrat direkt auf der Produktionskarte ändern

- Jede Vorratsposition auf einer Vorproduktionskarte hat jetzt kleine **− / Menge / +**-Bedienelemente. Plus und Minus buchen jeweils genau ein Teil atomar in derselben lokalen Bauteildatenbank wie die ausführliche Bearbeitung.
- Antippen der angezeigten Menge öffnet direkt in der Kartenzeile ein numerisches Eingabefeld. Enter oder das grüne Häkchen speichert; beim Verlassen des Zahlenfeldes wird die Änderung ebenfalls übernommen.
- Im Fenster **Bauteile / Vorrat bearbeiten** gibt es jetzt den Button **Alle geänderten Bestände speichern**. Mehrere Zahlen können damit in einer einzigen atomaren Buchung gespeichert werden; vorher mussten sie einzeln bestätigt werden.
- Absolutbuchungen verhindern das unbemerkte Überschreiben zwischenzeitlich veränderter Bestände; Plus/Minus ist gegen negative Lagerbestände abgesichert.
- Die Produktionskarte liest nach jeder Bestandsbuchung unmittelbar dieselben gespeicherten Mengen. Etsy-Angebotsmengen, fertige Produktvarianten, Bauteildefinitionen, laufende Aufträge und Master-3MF-Dateien werden nicht zurückgesetzt.
- Synthetische Funktionstests und Browsertests für direkte Mengenänderung, gespeicherte Werte und gemeinsame Bestandsquelle ergänzt.

# 0.11.46 · Vorproduktions-Schalter bleibt bei der Katalogsuche sichtbar

- Behoben: Beim Tippen in die Suche des Produktkatalogs wurden die Bauteil-/Vorproduktions-Schalter ausgeblendet; beim Löschen des Suchbegriffs blieben sie bis zum Tabwechsel verschwunden.
- Ursache: Die Suche hatte beim Laden die ursprüngliche Katalog-Renderfunktion gespeichert, bevor die Vorproduktions-Erweiterung diese ersetzte. Der Such-Listener ruft jetzt immer die aktuell gültige Darstellung auf.
- Regressionstest ergänzt: Suche nach einem Artikel, Suche löschen, erneut suchen – der Schalter bleibt in jeder Ansicht vorhanden.
- Keine Änderung an Lagerbeständen, Etsy-Synchronisation, Vorproduktions-Einstellungen, Bauteilen oder 3MF-Dateien.

# 0.11.45 · Etsy-Produktimport über Einstellungen

- **Einstellungen → Etsy-Produktimport**: neue aktive Etsy-Listings stehen als Vorschläge mit Titel und ID bereit. Einzelimport oder Sammelimport (maximal 20 pro Vorgang), ohne zusätzliche Dashboard-Karten.
- **Neue Etsy-Artikel suchen** fragt die aktiven Shop-Listings direkt bei Etsy ab. Ein täglicher Katalogabgleich erkennt ebenfalls unbekannte Etsy-IDs und legt sie in der Importliste ab.
- Bestehende Produkte werden anhand der Etsy-Listing-ID beim Katalogabgleich weiterhin aktualisiert; neue Produkte erscheinen erst nach bewusst bestätigtem Import in Produktion und Produktkatalog. Bereits importierte IDs werden nicht doppelt angelegt.
- Ein Import muss gültige Varianten bei Etsy erhalten; sonst bleiben die Vorschläge erhalten. Vorhandene Lagerbestände, Bauteile, Etsy-Auftragsbuchungen und Master-3MF-Dateien werden nicht zurückgesetzt.
- Die Produktsuche kann bekannte, auf Etsy aktive Produkte nach einem veralteten lokalen Status wieder sichtbar machen. API-Limits und laufende Synchronisationen bleiben geschützt.

# 0.11.44 · Produktionsübersicht mit sichtbaren Farben

- Etsy-Bestelldetails zeigen direkt den bestellten Artikel, die gewählten Ausführungen und Farbwerte in gut lesbaren Feldern.
- Pro Auftragsposition wird der nächste konkrete Arbeitsschritt hervorgehoben: Drucken, aus Bauteillager zuordnen, laufender Druck, fehlender Vorrat oder Montage.
- Vorproduktions-Bauteile haben größere Namen, farblich klar getrennte Status und weiterhin dieselben Buchungsaktionen.
- Buchungshinweise sind einklappbar. Die Dialogansicht passt sich Wandtablet, Desktop, Split View und Handy an.
- Keine Änderung an Etsy-Daten, vorhandenen Bauteilen, Lagerbeständen oder Buchungslogik.

# 0.11.43 · Schnelle Lagerbearbeitung ohne graue Karten

- Bei Bestandsänderungen werden nicht mehr sämtliche Produktkarten und Bedienelemente deaktiviert. Eine dezente Meldung „Änderung wird gespeichert …“ zeigt die laufende Buchung an; Doppelbuchungen bleiben blockiert.
- Nach einer erfolgreichen Buchung aktualisiert sich die Oberfläche einmal statt zweimal.
- Unveränderte Serverantworten verursachen keinen neuen Kartenaufbau. Identische HTML-Karten werden gar nicht erneut verarbeitet.
- Der DOM-Abgleich großer Variantenlisten verwendet jetzt eine lineare Zuordnung statt wiederholter quadratischer Suchen.
- Die reine Hintergrundanzeige aktualisiert sich alle 15 statt alle 5 Sekunden. Während Bearbeitungsdialogen und bei ausgeblendeter App wird keine neue Gesamtansicht gezeichnet. Beim Zurückwechseln wird aktualisiert.
- Noch laufende alte Hintergrundanfragen überschreiben keine neueren Lagerbuchungen mehr.
- Der Server fasst Etsy-Aufträge und Druckjobs für den Status einmalig je Artikel/Variante zusammen, statt wiederholt vollständige Listen zu durchsuchen.
- Bestehende Lager-, Bauteil-, Etsy- und Master-3MF-Daten bleiben unverändert erhalten.

# 0.11.42 · Punkt 3: Buchungssicherheit, Verlauf und verifizierte Datensicherung

- Etsy-Versandabgleich korrigiert: Der SELECT der Auftragsdruck-Buchung berücksichtigt jetzt auch `assembled`. Dadurch werden bereits montierte Kundenaufträge nicht erneut vom Fertigwarenbestand abgebucht und der Abgleich bricht nicht mehr wegen eines fehlenden Feldes ab.
- Änderungen an Fertigwarenbestand, Bauteilvorrat, laufenden Druckmengen, Auftragsteilen, Montage sowie Etsy-Auftragsstatus werden ab diesem Update direkt innerhalb derselben SQLite-Transaktion in `pp_audit` erfasst; zurückgerollte Buchungen hinterlassen keinen falschen Verlauf.
- Im Menü **Einstellungen → Buchungsverlauf & Datensicherung** stehen die neuesten 80 Buchungen mit Vorher-/Nachherwerten und eine Schaltfläche **Sicherung als ZIP herunterladen** zur Verfügung.
- Die ZIP enthält eine konsistente SQLite-Sicherung per Backup-API, die registrierten und zusätzlichen Master-3MF-Dateien, eine Prüfsummenliste und ein Manifest. Bei fehlenden registrierten 3MF-Dateien bricht der Download ab statt eine unvollständige Sicherung auszugeben.
- Vor dem Download werden alle Dateiprüfsummen geprüft, die Datenbankintegrität kontrolliert und die komplette Sicherung probeweise in ein separates temporäres Verzeichnis wiederhergestellt. Es gibt bewusst **keine** automatische Rücksicherung in die laufende Datenbank.
- Archiv und Datenbank enthalten Etsy-Zugangs-/Refresh-Daten: heruntergeladene ZIP vertraulich aufbewahren. Keine Änderungen an vorhandenen Beständen oder 3MF-Dateien; die SQLite-Migration ist wiederholbar.
- Regressionstests für idempotente Etsy-Versandabbuchungen, Journal/Rollback, Sicherung/Wiederherstellung, fehlende 3MF-Dateien und die geschützte HTTP-Ausgabe ergänzt.

# 0.11.41 · Dein nächster Druck – priorisierte Produktionsübersicht

- Auf der Produktionsseite steht unter den aktuellen Etsy-Bestellungen und vor den Produktkarten eine kompakte Liste „Als Nächstes drucken“.
- Sortierung: (1) offene und noch nicht produzierte Etsy-Auftragsmengen nach Versandtermin, (2) Vorratsbauteile mit freiwillig hinterlegtem Auffüllziel, (3) Fertigwarenvarianten mit belegten Verkäufen der letzten 30 Tage und echtem Nachdruckbedarf.
- Bis zu drei Vorschläge sofort sichtbar; „Alle Vorschläge anzeigen“ klappt den Rest aus. Je Eintrag führt eine Schaltfläche direkt zur richtigen Bestellung, Bauteilverwaltung oder zur Druckvorbereitung der passenden Variante. Kein Drucker wird ferngestartet.
- Bereits vorhandene Fertigware und als „Im Druck“ gemeldete Auftrags-, Varianten- und Vorratsbauteildrucke werden berücksichtigt, um Doppelvorschläge zu verhindern. Nicht gezählte klassische Lagerbestände werden zur Prüfung statt als sichere Druckempfehlung angezeigt.
- Gemeinsame Vorratsbauteile erhalten ein optionales Auffüllziel (0 = keine automatische Auffüllempfehlung) und getrennte Aktionen „+ Im Druck“, „Fertig“ und „Abbruch“. Fertigmelden erhöht erst dann ihren physischen Bauteilbestand.
- Kundenbezogene fehlende Bauteile haben Vorrang vor Lageraufbau; Mengen anderer Etsy-Varianten werden nicht als freie Bestände oder Auftragsdrucke interpretiert.
- Darstellung responsiv für Home Assistant, den Mac im Split View und das 11-Zoll-Wandtablet. Keine zusätzliche Hauptnavigation, keine Änderungen an Etsy-Artikeln und keine Rücksetzung bestehender Lagerdaten.

# 0.11.40 · Bauteilvorrat direkt auf Produktionskarten

- Wenn „Vorproduktion verwenden“ eingeschaltet ist, zeigt die Produktionskarte die tatsächlich gespeicherten Bauteile samt gemeinsamem Vorrat (z. B. „Geist Weiß – 8 × im Vorrat“) und variablen Bauteilen („Buch – Nach Auftrag“).
- Die große Etsy-Variantenliste, „Noch zählen“, variantenspezifische Nachdruckhinweise und der allgemeine „In Druck“-Knopf verschwinden aus der normalen Kartenansicht dieses Produkts. Stattdessen öffnet ein großer Button direkt „Bauteile / Vorrat bearbeiten“.
- Bereits gepflegte Fertigvarianten bleiben unter „Fertige Varianten (optional)“ erreichbar; nichts wird gelöscht oder zurückgesetzt. Ohne Vorproduktionsschalter bleibt die bisherige Produktkarte unverändert.
- Produktionskennzahlen und Filter ignorieren die irreführenden Variantennachdrucke aktivierter Bauteilartikel und beziehen echten Bauteildruck für Etsy-Bestellungen ein. Etsy-Verfügbarkeitswarnungen bleiben bestehen.
- Die vollständigen Produktfotos bleiben frei von zusätzlichen Lager-Overlays. Responsive für Home Assistant, Mac Split View und 11-Zoll-Tablet.

# 0.11.39 · Vorproduktions-Schalter im Produktkatalog sichtbar

- Der Home-Assistant-Webserver erlaubt jetzt auch die neue Datei `components-ui.js`. In 0.11.38 wurde sie zwar ausgeliefert, aber mit HTTP 404 blockiert. Deshalb fehlten die Vorproduktions-Schalter im Produktkatalog.
- Jeder aktive Etsy-Artikel zeigt nach dem Update den zunächst ausgeschalteten Schalter „Vorproduktion verwenden“ und nach Aktivierung „Bauteile verwalten“.
- Keine Änderung an bereits gespeicherten Lagermengen, Bauteilen, Bestellungen, Druckprofilen oder 3MF-Dateien.

# 0.11.38 · Vorproduktion und gemeinsame Bauteile pro Etsy-Produkt

- Im Produktkatalog hat jedes aktive Etsy-Produkt einen eigenen, zunächst ausgeschalteten Schalter „Vorproduktion verwenden“. Ein aktivierter Artikel bietet „Bauteile verwalten“.
- Standardbauteile können gemeinsam über alle Varianten bevorratet werden; variable Bauteile werden auf Wunsch anhand einer Etsy-Variation erst bei Bestellung gedruckt.
- Die Bauteilmenge je Verkaufseinheit und eine optionale Setgrößen-Eigenschaft lassen sich je Bauteil hinterlegen.
- Im Etsy-Auftrag werden Vorratsbauteile zugeordnet, Farbteile gedruckt und der fertige Zusammenbau bestätigt, ohne den allgemeinen Fertigwarenbestand doppelt zu verändern.
- SQLite-Bestände bleiben nach Updates erhalten. Der klassische Ablauf bleibt bei ausgeschaltetem Schalter unverändert.

# 0.11.37 · Schnellaktionen und geschützte Bestellungen

- Direkte Schnellaktionen für Drucken, Aus Lager und Fertig ohne unnötige Mengendialoge; fertig zugeordnete Auftragsdrucke werden vor Zweitzuordnung geschützt.

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

# 0.11.27 · Lagerbestand auf der Produktkarte

- Etsy-Menge bleibt auf dem Produktbild links oben.
- Rechts oben jetzt die **gezählten Lagerbestände** der Varianten, maximal drei kompakte Zeilen mit „+ weitere“ bei langen Listen.
- Nicht erfasste Bestände heißen „Noch zählen“; kein Vermischen mit Nachdruckbedarf.
- Sofortige Aktualisierung nach Lagerbuchungen und Fertigmeldung, lesbar auf dem iPhone und im Dunkelmodus.

# 0.11.26 · Etsy-Verfügbarkeit prozentual überwachen

- 25 % der höchsten gemerkten Etsy-Artikelmenge, aufgerundet, statt fixer Stückzahl; je Listing und Variante separat.
- Mengen bleiben bei Verkäufen als Vergleichswert erhalten und steigen bei höherem Etsy-Bestand automatisch.
- Einstellbarer Prozentsatz und verständliche Mengenanzeige in der Warnung.
- Keine Verknüpfung mit dem lokalen Lagerbestand, keine Veränderungen an Etsy selbst.

# 0.11.25 · Logo direkt ins Dashboard eingebettet

- Ursprüngliches Print-&-Pulse-Logo erhält einen transparenten Bildhintergrund ohne weißen Kasten.
- Heller Kopfbereich leicht salbeigrün, Logo passt sich im hellen und dunklen Modus an.
- Browser-Test prüft echte Pixeltransparenz und Erhalt der Logoelemente.

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

# 0.11.22 · Alte Druckprofil-Tabelle blockiert Masteransicht nicht mehr

- Schließt den Fehler `no such column: listing_id` beim Laden der 3MF-/Filamentprofile.
- Eigene Datenbanktabelle für Master-Filamentbelegungen; ältere inkompatible Tabellen bleiben unberührt.
- Bereits kompatible Profile werden ohne Löschung oder Überschreiben übernommen.
- Zusätzliche Datenbank-Migrationstests.

# 0.11.21 · Auftragsdruck per Touch zuverlässig fertigmelden

- Bei noch nicht erfasstem Bestand bisherigen Lagerbestand direkt im Dialog eingeben, danach Fertigmeldung atomar buchen.
- Kein scheinbar reaktionsloser Bestätigen-Button; Speichern und Fehlermeldungen deutlicher.
- Größeres X für das Schließen auf iPhone und Wandtablet.
- Bestehende Lagerbestände bleiben unangetastet.

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
