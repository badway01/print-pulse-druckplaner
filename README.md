# Print & Pulse – Druckplanung (Home Assistant App)

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
