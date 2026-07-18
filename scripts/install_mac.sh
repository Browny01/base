#!/usr/bin/env bash
#
# Build the native macOS Bridge app in Release and install it permanently into
# /Applications (launchable from Spotlight, Launchpad, and the Dock).
#
# Run this once to install. After that, the app keeps itself up to date via
# Sparkle — you only need to re-run this if you ever want to reinstall from
# source. Future native changes ship through `scripts/release_mac.sh`.
#
# Usage:  ./scripts/install_mac.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAC_DIR="$REPO_ROOT/macos"
DD="$MAC_DIR/.build/dd"
APP_NAME="Bridge.app"
DEST="/Applications/$APP_NAME"

command -v xcodegen >/dev/null || { echo "❌ xcodegen not found — run: brew install xcodegen"; exit 1; }

echo "▸ Generating Xcode project…"
( cd "$MAC_DIR" && xcodegen generate >/dev/null )

echo "▸ Building Bridge (Release)…"
xcodebuild -project "$MAC_DIR/Bridge.xcodeproj" -scheme Bridge \
  -configuration Release -derivedDataPath "$DD" \
  -destination 'platform=macOS' build >/dev/null

BUILT="$DD/Build/Products/Release/$APP_NAME"
[ -d "$BUILT" ] || { echo "❌ build product not found at $BUILT"; exit 1; }

# Quit any running copy so we can replace it cleanly.
osascript -e 'tell application "Bridge" to quit' >/dev/null 2>&1 || true
sleep 1

echo "▸ Installing to ${DEST}…"
rm -rf "$DEST"
cp -R "$BUILT" "$DEST"
# Ad-hoc-signed local build: clear the quarantine flag so it opens without a warning.
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true

echo "▸ Launching…"
open "$DEST"

VERSION=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$DEST/Contents/Info.plist" 2>/dev/null || echo "?")
echo "✅ Installed Bridge $VERSION to /Applications. It will check for updates automatically."
