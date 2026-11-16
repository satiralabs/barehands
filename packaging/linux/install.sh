#!/bin/sh
# Barehands (new engine) - per-user install for any Linux.
# Installs into ~/.local (no root needed):
#   app payload + runtime  ~/.local/share/barehands-new
#   launcher               ~/.local/bin/barehands-new
#   app-grid entry         ~/.local/share/applications/barehands-new.desktop
#   icon                   ~/.local/share/icons/hicolor/<size>/apps/
# Run from the folder this script was unpacked into.
set -eu
SRC="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$HOME/.local/share/barehands-new"

mkdir -p "$APP_DIR" "$HOME/.local/bin" \
  "$HOME/.local/share/applications" \
  "$HOME/.local/share/icons/hicolor/512x512/apps" \
  "$HOME/.local/share/icons/hicolor/256x256/apps"

# Keep an existing config and board state on reinstall.
tmp_keep="$(mktemp -d)"
[ -f "$APP_DIR/barehands.json" ] && cp "$APP_DIR/barehands.json" "$tmp_keep/"
[ -d "$APP_DIR/state" ] && cp -a "$APP_DIR/state" "$tmp_keep/"
cp -a "$SRC/barehands-new/." "$APP_DIR/"
[ -f "$tmp_keep/barehands.json" ] && cp "$tmp_keep/barehands.json" "$APP_DIR/"
[ -d "$tmp_keep/state" ] && cp -a "$tmp_keep/state/." "$APP_DIR/state/" 2>/dev/null || true
rm -rf "$tmp_keep"

install -m755 "$SRC/barehands-new/packaging/linux/barehands-new" "$HOME/.local/bin/barehands-new"
install -m644 "$SRC/barehands-new/packaging/linux/barehands-new.desktop" \
  "$HOME/.local/share/applications/barehands-new.desktop"
install -m644 "$SRC/barehands-new/packaging/icon-512.png" \
  "$HOME/.local/share/icons/hicolor/512x512/apps/barehands-new.png"
install -m644 "$SRC/barehands-new/packaging/icon-256.png" \
  "$HOME/.local/share/icons/hicolor/256x256/apps/barehands-new.png"
command -v update-desktop-database >/dev/null 2>&1 && \
  update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true

echo "Installed. Launch 'Barehands (New Engine)' from your app grid,"
echo "or run: barehands-new"
echo "(If the command is not found, add ~/.local/bin to your PATH.)"
