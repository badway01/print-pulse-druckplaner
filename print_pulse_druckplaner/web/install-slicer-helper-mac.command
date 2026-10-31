#!/bin/bash
# Print & Pulse: local macOS bridge for 3MF files downloaded from Home Assistant.
# Installs only inside ~/Applications, never exposes HA files to the network.
set -euo pipefail

APP_DIR="$HOME/Applications"
APP="$APP_DIR/PrintPulseSlicerBridge.app"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$APP_DIR"

cat > "$WORK/Bridge.applescript" <<'APPLESCRIPT'
on open location openedURL
    try
        set applicationFolder to POSIX path of (path to me)
        set scriptPath to applicationFolder & "Contents/Resources/open-slicer.sh"
        do shell script "/bin/bash " & quoted form of scriptPath & " " & quoted form of openedURL
    on error errorMessage
        display dialog "Print & Pulse: " & errorMessage buttons {"OK"} default button "OK" with icon caution
    end try
end open location
APPLESCRIPT

cat > "$WORK/open-slicer.sh" <<'OPENER'
#!/bin/bash
# Accept only known slicers and a 24-char file ID. No remote URLs or commands.
set -euo pipefail
URL="$1"
if [[ "$URL" =~ ^printpulse3mf://(bambu|snapmaker)/([a-f0-9]{24})/?$ ]]; then
    SLICER="${BASH_REMATCH[1]}"
    FILE_ID="${BASH_REMATCH[2]}"
else
    echo "Ungültiger Öffnen-Link."
    exit 1
fi
DOWNLOADS="$HOME/Downloads"
[ -d "$DOWNLOADS" ] || { echo "Ordner Downloads nicht gefunden."; exit 1; }
FILE=""
for ((attempt=0;attempt<160;attempt++)); do
    # The browser downloads under an exact ID-prefixed filename. Ignore
    # partially downloaded Safari files until the completed .3mf exists.
    for candidate in "$DOWNLOADS"/PP3MF-"$FILE_ID"-*.3mf; do
        if [ -f "$candidate" ] && [ -s "$candidate" ]; then
            FILE="$candidate"
            break
        fi
    done
    [ -n "$FILE" ] && break
    sleep 0.25
done
[ -n "$FILE" ] || {
    echo "3MF nicht in Downloads gefunden. Prüfe, ob Safari Dateien im Ordner Downloads speichert, oder öffne die Datei manuell."
    exit 1
}
if [ "$SLICER" = bambu ]; then
    /usr/bin/open -a "BambuStudio" "$FILE" ||
    /usr/bin/open -a "Bambu Studio" "$FILE" ||
    { echo "Bambu Studio wurde nicht gefunden. Öffne die Datei über den Finder."; exit 1; }
else
    /usr/bin/open -a "Snapmaker Orca" "$FILE" ||
    /usr/bin/open -a "Snapmaker_Orca" "$FILE" ||
    /usr/bin/open -a "Snapmaker OrcaSlicer" "$FILE" ||
    { echo "Snapmaker Orca wurde nicht gefunden. Öffne die Datei über den Finder."; exit 1; }
fi
OPENER

/usr/bin/osacompile -o "$WORK/PrintPulseSlicerBridge.app" "$WORK/Bridge.applescript"
INFO="$WORK/PrintPulseSlicerBridge.app/Contents/Info.plist"
/usr/bin/plutil -replace CFBundleIdentifier -string "de.printandpulse.slicerbridge" "$INFO"
/usr/bin/plutil -replace CFBundleURLTypes -json '[{"CFBundleURLName":"Print & Pulse Slicer","CFBundleURLSchemes":["printpulse3mf"]}]' "$INFO"
cp "$WORK/open-slicer.sh" "$WORK/PrintPulseSlicerBridge.app/Contents/Resources/open-slicer.sh"
chmod 755 "$WORK/PrintPulseSlicerBridge.app/Contents/Resources/open-slicer.sh"
if [ -d "$APP" ]; then
    mv "$APP" "$APP.backup-$(date +%Y%m%d%H%M%S)"
fi
mv "$WORK/PrintPulseSlicerBridge.app" "$APP"
/usr/bin/xattr -cr "$APP" 2>/dev/null || true
/usr/bin/codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true
REGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [ -x "$REGISTER" ]; then "$REGISTER" -f "$APP"; fi
printf '\nPrint & Pulse Slicer-Helfer ist installiert:\n%s\n\n' "$APP"
printf 'Jetzt im HA-Druckplaner eine Master-3MF-Datei auf "In Bambu Studio öffnen"\n'
printf 'oder "In Snapmaker Orca öffnen" anklicken. Safari darf die App öffnen.\n'
printf 'Wichtig: Downloads muss der Safari-Downloadordner sein.\n'
