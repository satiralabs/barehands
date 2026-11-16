#!/usr/bin/env bash
# Build every platform installer for Barehands (new engine) into dist/.
# Run from anywhere:  bash packaging/build_installers.sh
# Outputs:
#   dist/barehands-new-<ver>-linux.tar.gz    (with install.sh)
#   dist/barehands-new-<ver>-windows.zip     (with install.ps1)
#   dist/barehands-new-<ver>-macos.zip       (BarehandsNew.app)
#   dist/arch/PKGBUILD + the linux tarball   (makepkg source)
#   dist/sha256sums.txt
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VER="$(cat "$ROOT/packaging/VERSION")"
BUILD="$ROOT/build"
DIST="$ROOT/dist"
rm -rf "$BUILD"
mkdir -p "$BUILD" "$DIST/arch"

# --- stage the payload (one identical payload for every platform) ---
PAYLOAD="$BUILD/barehands-new"
mkdir -p "$PAYLOAD"
rsync -a "$ROOT/" "$PAYLOAD/" \
  --exclude ".git" --exclude "build" --exclude "dist" \
  --exclude ".venv" --exclude "__pycache__" \
  --exclude "data/raw" \
  --exclude "data/hagrid_500.json" \
  --exclude "data/hagrid_mapped_train.json" \
  --exclude "data/hagrid_mapped_test.json" \
  --exclude "barehands.json" --exclude "server.log"
echo "$VER" > "$PAYLOAD/VERSION"
# Normalize permissions: the payload must be readable by whoever
# installs it, and the shell launchers executable.
chmod -R a+rX "$PAYLOAD"
find "$PAYLOAD" -name "*.sh" -exec chmod 755 {} +
chmod 755 "$PAYLOAD/packaging/linux/barehands-new" \
          "$PAYLOAD/packaging/macos/BarehandsNew"

# --- Linux ---
LIN="$BUILD/linux"
mkdir -p "$LIN"
cp -r "$PAYLOAD" "$LIN/barehands-new"
cp "$ROOT/packaging/linux/install.sh" "$ROOT/packaging/linux/uninstall.sh" "$LIN/"
chmod +x "$LIN/install.sh" "$LIN/uninstall.sh" "$LIN/barehands-new/packaging/linux/barehands-new"
tar -czf "$DIST/barehands-new-$VER-linux.tar.gz" -C "$LIN" .

# --- Windows ---
WIN="$BUILD/windows"
mkdir -p "$WIN"
cp -r "$PAYLOAD" "$WIN/barehands-new"
cp "$ROOT/packaging/windows/install.ps1" "$ROOT/packaging/windows/uninstall.ps1" \
   "$ROOT/packaging/README-WINDOWS.txt" "$WIN/"
( cd "$WIN" && zip -qr "$DIST/barehands-new-$VER-windows.zip" . )

# --- macOS ---
MAC="$BUILD/macos"
APP="$MAC/BarehandsNew.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$ROOT/packaging/macos/Info.plist" "$APP/Contents/Info.plist"
cp "$ROOT/packaging/macos/BarehandsNew" "$APP/Contents/MacOS/BarehandsNew"
chmod +x "$APP/Contents/MacOS/BarehandsNew"
cp "$ROOT/packaging/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
cp -r "$PAYLOAD" "$APP/Contents/Resources/app"
cp "$ROOT/packaging/README-MAC.txt" "$MAC/"
( cd "$MAC" && zip -qry "$DIST/barehands-new-$VER-macos.zip" . )

# --- Arch ---
cp "$ROOT/packaging/arch/PKGBUILD" "$DIST/arch/PKGBUILD"
cp "$DIST/barehands-new-$VER-linux.tar.gz" "$DIST/arch/"

( cd "$DIST" && sha256sum barehands-new-$VER-*.tar.gz barehands-new-$VER-*.zip > sha256sums.txt )
echo "built in $DIST:"
ls -lh "$DIST" | awk '{print "  " $5 "  " $9}'
