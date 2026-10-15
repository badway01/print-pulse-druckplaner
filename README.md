# Print & Pulse – Druckplanung (Home Assistant App)

## Neu in 0.10.0 (in Entwicklung)

Das Dashboard zeigt nur vier zentrale Kennzahlen und einen Überblick über anstehende Drucke und Drucker. Die bekannten Produktkarten mit großen Stückzahl-Badges bleiben unter **Produktion**. Unter **Bestellungen** erscheint eine übersichtliche, nach Versandfrist sortierte Etsy-artige Liste; die Produktionsstände werden unverändert aus den bestehenden Daten verwendet. Unter **Drucker** zeigen sechs Geräte Status, Fortschritt, Restzeit und Jobname aus Home Assistant, sofern entsprechende Sensoren vorhanden sind. Die Werte können pro Drucker über **Sensoren zuordnen** eingestellt werden.

Home-Assistant-API: App benötigt ab dieser Version `homeassistant_api: true`; der Supervisor-Token wird nur serverseitig verwendet, nie an den Browser weitergegeben. Der neue Druckerstatus ist reine Überwachung und startet oder stoppt keinen Druck. Ohne Sensorwerte zeigt die Oberfläche „Sensor zuordnen“ oder „Nicht verfügbar“, keine erfundenen Werte. Die Zuordnung bleibt bei Updates in SQLite erhalten und gehört zur Home-Assistant-App-Sicherung, nicht zum JSON-Produktionsbackup.

## Neu in 0.9.0

Die Hauptseite zeigt gebündelte, reduzierte Produktkarten mit einer dezenten Versand-Ampel. Klicke auf „Bestellungen öffnen“, um Varianten, Kunden, Versandtermine, Etsy-Versandkosten und ggf. Versand-Upgrades einzusehen. Für jeden Auftrag lässt sich der tatsächliche Versanddienstleister von Hand speichern. Alle Angaben bleiben in Home Assistant, nicht im öffentlichen Repository oder JSON-Export.

## Neu in 0.8.0

Größere, gleichmäßig aufgebaute Kacheln; neue Bestellungen per Klick ansehen; letzter erfolgreicher Abgleich mit Datum und Uhrzeit direkt oben.

### Nächsten Druck planen

Unter **Produkte → Produkt öffnen** für jeden verwendeten Drucker **Stück pro Platte**, **Minuten pro Platte** und **Slicer** eintragen und **Druckprofil speichern**. Ohne Profil wird zunächst ein Stück vorgeschlagen. 0 Minuten bedeutet unbekannte Dauer.

Die Produktion zeigt bis zu drei Vorschläge nach frühester offener Versandfrist. Farben werden pro Variante gebündelt, fertige und reservierte Mengen abgezogen. **Vorschlag übernehmen** reserviert eine Platte auf dem angezeigten Drucker. Bereits reservierte Varianten werden vorerst nicht erneut vorgeschlagen. **Gedruckt** beziehungsweise **Mehrere Stück** verbucht fertige Mengen; **Freigeben** hebt die Reservierung ohne Fertigmeldung auf. Eine Reservierung startet keinen Drucker. Die Phase „Im Druck“ bleibt manuell; Live-Druckerzustände werden nicht abgerufen.

Diese Planung verwendet lokale Regeln, keinen externen KI-Dienst. Dateien, Farbzuordnung und Kapazitäten vor dem Druck im Slicer prüfen.

### Datei im Slicer öffnen

**Für [Slicer] laden** lädt die passende 3MF herunter. Anschließend im ausgewählten Slicer öffnen, auf dem Mac beispielsweise über **Öffnen mit**. Das ist noch kein automatischer Direktstart: Die geschützte Home-Assistant-Sitzung lässt sich nicht an eine native App weiterreichen. Eine lokale Brücke ist in dieser Version nicht enthalten.

Profile und Reservierungen bleiben beim Update erhalten und sind in einer vollständigen Home-Assistant-App-Sicherung enthalten. Der bisherige JSON-Export enthält sie nicht.


Öffentlicher **Quellcode** für eine lokal betriebene Home-Assistant-App.

- Keine eingebauten Etsy-Listing-IDs, Bestellnummern oder Shop-Konfiguration.
- OAuth-Schlüssel, Etsy-Bestellungen und der Produktionsstand werden nur zur Laufzeit unter `/data/` auf der Home-Assistant-Installation gespeichert.
- Der öffentliche Code darf **keine** Datenbank, keine Backups, keine Log-Dateien und keine Echtdaten enthalten.
- Updates werden nach Einrichtung dieses Repositorys in Home Assistant über die App-Verwaltung verteilt.
- App verwendet Home Assistant Ingress, keinen eigenen veröffentlichten Port.

## Sicherheit & Betrieb

Etsy-API-Zugangsdaten nur in der lokalen App-Oberfläche eintragen. Das Repository wird nicht mit Live-Zugangsdaten befüllt. Die private Datenbank ist Bestandteil von Home-Assistant-Backups und muss entsprechend geschützt werden. Vor produktivem Einsatz echte Versandfristen mit Etsy abgleichen.

## Migration von der lokalen App

Der Wechsel von `local_apps` zu einer App aus einem GitHub-Repository kann eine **separate Installation** mit eigener `/data`-Datenbank erzeugen. Die lokale App deshalb **nicht deinstallieren**.

1. In der alten App eine **Sicherung** exportieren und zusätzlich ein Home-Assistant-Backup erstellen.
2. Die neue App aus dem Repository installieren (nicht gleich die alte entfernen).
3. Etsy in der neuen App separat autorisieren und erfolgreich synchronisieren.
4. In der neuen App **Wiederherstellen** aufrufen und die lokale JSON-Sicherung importieren.
5. Bestellzahlen, Termine, Mengen und manuelle Produktnamen **gegen Etsy und die alte App prüfen**.
6. Erst nach erfolgreicher Prüfung die alte lokale App stoppen.

**Die Produktionsdaten-Sicherung enthält bewusst keine Etsy-Schlüssel oder OAuth-Tokens.**

Die neue App ist noch nicht live getestet; bis zum Abschluss der Migration bleibt die Etsy-Bestellübersicht die maßgebliche Produktionsreferenz.

## Hinweise vor einer Veröffentlichung

- Dieses Repository muss **neu** angelegt werden: niemals ältere ZIP-Archive, private Backups oder ein bestehendes Git-Repository mit fremder Historie hochladen.
- Die Betreiberin bzw. der Betreiber eines öffentlichen GitHub-Repositories ist als GitHub-Account sichtbar. Die Inhalte dieser App stellen jedoch keine Etsy-Zugangsdaten bereit.
- Die frühere manuelle OAuth-Rückleitung über eine normale Shop-Startseite ist nicht ideal; vor erneuter Autorisierung sollte eine eigene HTTPS-Callback-Seite ohne Drittanbieter-Skripte verwendet werden.
- Die statischen Sicherheitsprüfungen und synthetischen Tests ersetzen weder einen unabhängigen Security-Audit noch einen Live-Test der Etsy-API oder der Home-Assistant-Update-Migration.

## Anzeige v0.6

Drei Druckkarten auf großen Bildschirmen, zwei auf Tablets und eine auf dem Smartphone. Die kleine Vorschau rechts oben stammt aus dem ersten Etsy-Listingbild; der serverseitig zwischengespeicherte Bildlink wird nur vom offiziellen `etsystatic.com`-CDN akzeptiert. Bei fehlendem Bild erscheint ein Platzhalter.


### Direkt verbuchen (v0.6)
Auf der Produktkarte verbucht „🖨 Gedruckt“ (bzw. „+1 gedruckt“) genau ein fertig gedrucktes Stück. Bei Sammeldrucken können mehrere Stück über „Mehrere Stück …“ eingetragen werden. Eine versehentliche Buchung lässt sich unter „Positionen“ korrigieren.

## Version 0.7.0

Produktionslinie, Kachel-/Listenansicht, Filter, neue Bestellungen, eigener Produktkatalog und 3MF-Projekte je Drucker. Details: [Changelog](CHANGELOG.md) und [Bedienung](print_pulse_druckplaner/README.md).

Der Katalog kann aus aktiven Etsy-Listings ergänzt werden. Der Import verwendet den offiziellen lesenden Endpoint `GET /v3/application/shops/{shop_id}/listings/active`; bestehende Produktnamen, Notizen und Dateien werden dabei nicht überschrieben.

**Sicherung:** 3MF-Dateien sind lokal in der App-Datenbank gespeichert. Eine Home-Assistant-App-Sicherung enthält die vollständigen Daten. Der bisherige JSON-Export ist ausschließlich für Produktionsstände gedacht.
