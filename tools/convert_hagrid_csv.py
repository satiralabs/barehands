#!/usr/bin/env python3
"""Convert a HaGRID skeleton CSV export (category,skeleton_json) into the
barehands landmark dataset format (barehands-landmarks/v1).

Source exports: GestureDetectionConnoisseurs/preprocessed_hand_skeletons
on Hugging Face — MediaPipe skeletons pre-extracted from HaGRID images
(HaGRID itself is CC BY-SA 4.0; see DATA-SOURCES.md). Local use only.

usage: convert_hagrid_csv.py INPUT.csv OUTPUT.json
Only the first detected hand per row is kept (the board tracks hands
one at a time; multi-hand rows keep their dominant first detection).
"""
import csv
import json
import sys
from pathlib import Path

csv.field_size_limit(10**9)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: convert_hagrid_csv.py INPUT.csv OUTPUT.json")
    source, target = map(Path, sys.argv[1:])
    frames = []
    skipped = 0
    with source.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            skeleton = json.loads(row["skeleton_json"])
            hands = skeleton.get("hand_landmarks") or []
            if not hands or len(hands[0]) != 21:
                skipped += 1
                continue
            handedness = "Unknown"
            try:
                handedness = (skeleton["handedness"][0][0]
                              ["category_name"])
            except (KeyError, IndexError, TypeError):
                pass
            frames.append({
                "t": 0,
                "label": row["category"],
                "handedness": handedness,
                "landmarks": [
                    {"x": p["x"], "y": p["y"], "z": p.get("z", 0)}
                    for p in hands[0]
                ],
            })
    dataset = {
        "schema": "barehands-landmarks/v1",
        "createdAt": "converted from HaGRID skeleton export",
        "featureNames": [],
        "metadata": {
            "source": "HaGRID via GestureDetectionConnoisseurs "
                      "preprocessed_hand_skeletons (HF)",
            "license": "CC BY-SA 4.0 (HaGRID)",
            "note": "First hand only per image; no per-user ids in the "
                    "export, so splits are by sample, not by user.",
            "skippedRows": skipped,
        },
        "frames": frames,
    }
    target.write_text(json.dumps(dataset), encoding="utf-8")
    print(f"wrote {target}: {len(frames)} frames, {skipped} skipped")


if __name__ == "__main__":
    main()
