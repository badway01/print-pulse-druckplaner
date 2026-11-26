# iPhone-Widget

1. Add-on 0.14.0 installieren. Unter HA Entwicklerwerkzeuge → Zustände sensor.print_pulse_strom_widget prüfen.
2. Scriptable installieren und neues Skript erstellen. Inhalt von Print-Pulse-Strom.js einfügen.
3. In HA Profil → Sicherheit → langlebigen Zugriffstoken erstellen, möglichst über ein separates Nicht-Admin-Konto. Token niemals teilen; nur in Scriptable eingeben. HTTPS oder vertrauenswürdiges privates Netz/VPN verwenden.
4. Skript starten, HA-Basisadresse inkl. Port und Token eingeben. Für unterwegs die über Tailscale erreichbare HA-Adresse verwenden.
5. Auf dem iPhone Homescreen ein mittleres Scriptable-Widget hinzufügen, bearbeiten und das Skript wählen.
6. iOS bestimmt den Refresh. Stand und Messabdeckung beachten. Das Widget ist keine Live-Sicherheitsüberwachung. Die Anzeige öffnet beim Tippen HA.
