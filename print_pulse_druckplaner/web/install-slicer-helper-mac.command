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
# The host hint comes from the HA page's hostname, never user-supplied script.
# Only simple local DNS names/IPs are accepted and used as a Samba host.
BASE_URL="${URL%%\?*}"
SERVER_HINT=""
if [[ "$URL" == *"?server="* ]]; then
    SERVER_HINT="${URL#*\?server=}"
    if [[ ! "$SERVER_HINT" =~ ^[A-Za-z0-9.-]+$ ]]; then
        SERVER_HINT=""
    fi
fi
if [[ "$BASE_URL" =~ ^printpulse3mf://(bambu|snapmaker)/([a-f0-9]{24})/?$ ]]; then
    SLICER="${BASH_REMATCH[1]}"
    FILE_ID="${BASH_REMATCH[2]}"
else
    echo "Ungültiger Öffnen-Link."
    exit 1
fi
# Preferred workflow: open the *original* immutable 3MF straight from the
# Home Assistant /share network volume. Only an ID-matching master is opened.
find_network_master() {
    local volume root candidate
    for volume in /Volumes/*; do
        [ -d "$volume" ] || continue
        root="$volume/print-pulse/masterdateien"
        [ -d "$root" ] || continue
        for candidate in "$root"/*/*/"$FILE_ID"-*.3mf; do
            if [ -f "$candidate" ] && [ -s "$candidate" ]; then
                printf '%s' "$candidate"
                return 0
            fi
        done
    done
    return 1
}
FILE="$(find_network_master || true)"
if [ -z "$FILE" ] && [ -n "$SERVER_HINT" ]; then
    # macOS Keychain may remember SMB credentials after the first connection.
    # On a first connection Finder may request Samba username/password.
    /usr/bin/osascript -e 'mount volume "smb://'"$SERVER_HINT"'/share"' >/dev/null 2>&1 || true
    FILE="$(find_network_master || true)"
fi
if [ -z "$FILE" ]; 
then
# Safari can save to custom folders or iCloud Drive. Search a restricted
# set of expected locations, then offer an explicit Finder picker instead of
# failing with an opaque missing-file error.
DOWNLOADS="$HOME/Downloads"
SAFARI_DOWNLOADS="$(/usr/bin/defaults read com.apple.Safari DownloadsPath 2>/dev/null || true)"
if [[ "$SAFARI_DOWNLOADS" == "~/"* ]]; then
    SAFARI_DOWNLOADS="$HOME/${SAFARI_DOWNLOADS#\~/}"
fi
SEARCH_DIRS=(
    "$DOWNLOADS"
    "$SAFARI_DOWNLOADS"
    "$HOME/Library/Mobile Documents/com~apple~CloudDocs/Downloads"
)
FILE=""
for ((attempt=0;attempt<60;attempt++)); do
    for directory in "${SEARCH_DIRS[@]}"; do
        [ -d "$directory" ] || continue
        for candidate in "$directory"/PP3MF-"$FILE_ID"-*.3mf; do
            if [ -f "$candidate" ] && [ -s "$candidate" ]; then
                FILE="$candidate"
                break 2
            fi
        done
    done
    [ -n "$FILE" ] && break
    sleep 0.25
done

if [ -z "$FILE" ]; then
    # No network master was available and no completed download was found.
    # Fall back to a deliberate user-selected file, never guess another order.
    # Only an explicitly chosen local file is opened; never pick an arbitrary
    # 3MF from another order based on recency or a similar product name.
    FILE="$(/usr/bin/osascript -e 'POSIX path of (choose file with prompt "Print & Pulse: 3MF-Datei auswählen. Falls sie nicht heruntergeladen wurde, zuerst in Home Assistant auf Herunterladen klicken.")' 2>/dev/null || true)"
    if [[ ! -f "$FILE" || "$FILE" != *.[3][mM][fF] ]]; then
        echo "Keine gültige 3MF ausgewählt. Bitte in Home Assistant auf Herunterladen klicken und die Datei anschließend auswählen."
        exit 1
    fi
fi
fi
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
printf 'Direktzugriff: Samba Share unter macOS via Finder verbinden (smb://Home-Assistant-IP/share).\n'
printf 'Danach oeffnen die Buttons gespeicherte Masterdateien ohne erneuten Download.\n'
