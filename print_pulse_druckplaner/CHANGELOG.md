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
