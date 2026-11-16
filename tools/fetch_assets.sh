#!/usr/bin/env bash
# Fetch every internet asset this project uses locally (models +
# datasets). Idempotent; ~1.2 GB total, almost all of it the optional
# HaGRID image sample. Set SKIP_IMAGES=1 to skip that zip.
# Licenses and provenance: see DATA-SOURCES.md at the repo root.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/models data/raw

dl() {  # dl URL DEST
  if [ -s "$2" ]; then echo "have $2"; else
    echo "fetching $2"; curl -sL -C - -o "$2" "$1"; fi
}

MP="https://storage.googleapis.com/mediapipe-models"
dl "$MP/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task" \
   data/models/gesture_recognizer.task
dl "$MP/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task" \
   data/models/hand_landmarker.task

HF="https://huggingface.co/datasets/GestureDetectionConnoisseurs/preprocessed_hand_skeletons/resolve/main"
dl "$HF/sample_export-hagrid-export_100_images.csv" \
   data/raw/connoisseurs_hagrid_100.csv
dl "$HF/sample_export-hagrid-export_500_images.csv" \
   data/raw/connoisseurs_hagrid_500.csv

if [ "${SKIP_IMAGES:-0}" != "1" ]; then
  dl "https://huggingface.co/datasets/cj-mills/hagrid-sample-30k-384p/resolve/main/hagrid-sample-30k-384p.zip" \
     data/raw/hagrid-sample-30k-384p.zip
fi

echo "done. Build the landmark datasets with:"
echo "  python3 tools/convert_hagrid_csv.py data/raw/connoisseurs_hagrid_500.csv data/hagrid_500.json"
echo "  node tools/extract_features.mjs data/hagrid_500.json"
