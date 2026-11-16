#!/bin/sh
# Remove the per-user Barehands (new engine) install.
# Your board state and config inside the app folder are removed too;
# copy barehands.json and state/ out first if you want to keep them.
set -eu
"$HOME/.local/bin/barehands-new" --stop >/dev/null 2>&1 || true
rm -rf "$HOME/.local/share/barehands-new"
rm -f "$HOME/.local/bin/barehands-new"
rm -f "$HOME/.local/share/applications/barehands-new.desktop"
rm -f "$HOME/.local/share/icons/hicolor/512x512/apps/barehands-new.png"
rm -f "$HOME/.local/share/icons/hicolor/256x256/apps/barehands-new.png"
echo "Barehands (new engine) removed."
