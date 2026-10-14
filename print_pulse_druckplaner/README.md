# Print & Pulse Druckplaner

Lokale Etsy-Produktionszentrale in Home Assistant.

## Neu in 0.7.0

Produktion als Phasenübersicht, Kacheln oder Liste; Filter, Prioritätsempfehlung und Erkennung neuer Bestellungen. Eigenes Logo und Print-&-Pulse-Farben.

## Produkte und Druckdateien

Im Reiter **Produkte** erscheinen bereits bekannte Bestellprodukte. **Etsy-Katalog laden** ergänzt die aktiven Shop-Listings. **Neues Produkt** legt einen eigenen Eintrag an. Auf der Produktdetailseite kannst du Namen, Etsy-ID und Drucknotizen pflegen.

Speichere das Produkt zuerst. Anschließend kannst du je Drucker ein 3MF-Projekt bis 100 MB hochladen, herunterladen, ersetzen oder entfernen. Die Zuordnung erfolgt ausdrücklich pro Drucker; bei gleichem Produkt können H2D, P1S Old/New, Snapmaker U1, A1 mini und Prusa MK4 unterschiedliche Dateien erhalten. Der Druckplaner startet keine Drucker automatisch.

Dateien und Produktkatalog liegen in der lokalen App-Datenbank. Sie bleiben bei normalen App-Updates erhalten. Für vollständige Sicherungen einschließlich 3MF-Dateien die Home-Assistant-Sicherung dieser App verwenden. Die JSON-Sicherung sichert nur Produktionsstände und Zuordnungen.

## Produktionsphasen und Prioritäten

Die Phase lässt sich auf der Karte zwischen Geplant und Im Druck umstellen. **Gedruckt** verbucht genau ein Stück; **Mehrere Stück** verbucht einen Sammeldruck nach frühester Versandfrist. Korrekturen sind unter **Positionen** möglich. Fertige Gruppen erscheinen automatisch unter Gedruckt. Dies markiert keine Etsy-Bestellung als versendet.

Die Empfehlung richtet sich nach der frühesten bekannten Versandfrist, nicht nach Druckdauer oder tatsächlicher Druckerauslastung. Fehlende Termine bitte kontrollieren. „Heute bestellt“ zeigt offene Bestellungen mit Etsy-Bestelldatum am aktuellen Berliner Kalendertag; ein erster Import macht alte Bestellungen nicht zu neuen.

## Update

In Home Assistant auf **0.7.0** aktualisieren und die Weboberfläche neu laden. Die Datenbank wird automatisch erweitert; Etsy muss beim normalen Update nicht erneut verbunden werden.

Verbindung und Installation: siehe README im Repository-Stammverzeichnis.
