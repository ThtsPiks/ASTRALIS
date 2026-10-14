#!/usr/bin/env bash
# Builds a standalone native macOS app; all output stays under dist/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/dist/macos/ASTRALIS.app"
ARCH="$(uname -m)"
TARGET="${ASTRALIS_SWIFT_TARGET:-${ARCH}-apple-macos12.0}"
SDK="$(xcrun --sdk macosx --show-sdk-path)"
mkdir -p "$ROOT/dist/swift-cache" "$APP/Contents/MacOS" "$APP/Contents/Resources"
# Replace only the generated web bundle, so removed source assets cannot linger.
if [[ -d "$APP/Contents/Resources/www" ]]; then
  rm -rf "$APP/Contents/Resources/www"
fi
node "$ROOT/scripts/stage-web.mjs" "$APP/Contents/Resources/www"
cp "$ROOT/native/Info.plist" "$APP/Contents/Info.plist"
cp "$ROOT/native/icons/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
printf 'APPL????' > "$APP/Contents/PkgInfo"
xcrun swiftc -O -sdk "$SDK" -target "$TARGET" \
  -module-cache-path "$ROOT/dist/swift-cache" \
  -framework Cocoa -framework WebKit \
  -o "$APP/Contents/MacOS/ASTRALIS" "$ROOT/native/App.swift"
codesign --force --deep --sign - "$APP"
echo "Built $APP ($TARGET)"
