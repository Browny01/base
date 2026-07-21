#!/usr/bin/env bash
#
# Cut a new macOS Bridge release and publish it so installed apps auto-update.
#
# What it does:
#   1. Bumps the app version, builds Release, zips the .app.
#   2. Signs the zip with the Sparkle EdDSA private key (in your login keychain).
#   3. Generates/updates appcast.xml (the update feed Sparkle reads).
#   4. Uploads the zip + appcast.xml to a versioned GitHub Release in the PUBLIC
#      repo `bridge-mac-releases` and marks that release as latest.
#
# Installed copies check that feed and prompt to update. Run this whenever shared
# native SwiftUI code, BridgeApp.swift, or native configuration changes.
#
# Usage:  ./scripts/release_mac.sh <version> [release notes]
#   e.g.  ./scripts/release_mac.sh 0.2.0 "Adds a native menu-bar shortcut"
set -euo pipefail

VERSION="${1:-}"
NOTES="${2:-Bridge $VERSION}"
[ -n "$VERSION" ] || { echo "Usage: $0 <version> [release notes]   e.g. $0 0.2.0 \"…\""; exit 1; }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAC_DIR="$REPO_ROOT/macos"
DD="$MAC_DIR/.build/dd"
STAGE="$MAC_DIR/.build/release"      # holds the zip(s) + appcast.xml
RELEASES_REPO="Browny01/bridge-mac-releases"
TAG="v$VERSION"
DL_PREFIX="https://github.com/$RELEASES_REPO/releases/latest/download/"

command -v xcodegen >/dev/null || { echo "❌ brew install xcodegen"; exit 1; }
command -v gh >/dev/null || { echo "❌ gh CLI not found"; exit 1; }

# CFBundleVersion must be monotonically increasing. Worktrees can have a shorter
# first-parent history than the previously published build, so never rely on the
# commit count alone.
COMMIT_BUILD="$(git -C "$REPO_ROOT" rev-list --count HEAD)"
CURRENT_BUILD="$(/usr/bin/awk -F'"' '/CURRENT_PROJECT_VERSION:/ { print $2; exit }' "$MAC_DIR/project.yml")"
if [ "$COMMIT_BUILD" -gt "$CURRENT_BUILD" ]; then
  BUILD="$COMMIT_BUILD"
else
  BUILD="$((CURRENT_BUILD + 1))"
fi

echo "▸ Bumping to $VERSION (build $BUILD)…"
/usr/bin/sed -i '' -E "s/MARKETING_VERSION: .*/MARKETING_VERSION: \"$VERSION\"/" "$MAC_DIR/project.yml"
/usr/bin/sed -i '' -E "s/CURRENT_PROJECT_VERSION: .*/CURRENT_PROJECT_VERSION: \"$BUILD\"/" "$MAC_DIR/project.yml"

echo "▸ Generating project + building Release…"
( cd "$MAC_DIR" && xcodegen generate >/dev/null )
xcodebuild -project "$MAC_DIR/Bridge.xcodeproj" -scheme Bridge \
  -configuration Release -derivedDataPath "$DD" \
  -destination 'platform=macOS' build >/dev/null

APP="$DD/Build/Products/Release/Bridge.app"
[ -d "$APP" ] || { echo "❌ build product missing"; exit 1; }

# Locate Sparkle's CLI tools (shipped inside the resolved SPM artifact).
SPARKLE_BIN="$(find "$DD/SourcePackages/artifacts" -type d -path '*sparkle/Sparkle/bin' 2>/dev/null | head -1)"
[ -x "$SPARKLE_BIN/generate_appcast" ] || { echo "❌ Sparkle tools not found under $DD"; exit 1; }

echo "▸ Packaging + signing…"
rm -rf "$STAGE"; mkdir -p "$STAGE"
ZIP="$STAGE/Bridge-$VERSION.zip"
/usr/bin/ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"

# Release notes as HTML alongside the zip → Sparkle shows them in the update dialog.
printf '<h2>Bridge %s</h2>\n<p>%s</p>\n' "$VERSION" "$NOTES" > "$STAGE/Bridge-$VERSION.html"

# Read the EdDSA key through the security CLI so headless release runs do not
# stall waiting for Sparkle's binary to receive Keychain UI approval.
/usr/bin/security find-generic-password \
  -a ed25519 -s "https://sparkle-project.org" -w \
  | "$SPARKLE_BIN/generate_appcast" "$STAGE" \
      --ed-key-file - --download-url-prefix "$DL_PREFIX" >/dev/null
[ -f "$STAGE/appcast.xml" ] || { echo "❌ appcast.xml not generated"; exit 1; }

echo "▸ Publishing to $RELEASES_REPO ($TAG)…"
if gh release view "$TAG" --repo "$RELEASES_REPO" >/dev/null 2>&1; then
  gh release upload "$TAG" "$ZIP" "$STAGE/appcast.xml" --repo "$RELEASES_REPO" --clobber
  gh release edit "$TAG" --repo "$RELEASES_REPO" --title "Bridge $VERSION" --notes "$NOTES" --latest
else
  gh release create "$TAG" "$ZIP" "$STAGE/appcast.xml" \
    --repo "$RELEASES_REPO" --title "Bridge $VERSION" --notes "$NOTES" --latest
fi

echo "✅ Published Bridge $VERSION. Installed apps will offer the update within a day (or via Check for Updates…)."
echo "   Commit the version bump in macos/project.yml so it stays in sync."
