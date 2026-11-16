#!/usr/bin/env python3
"""Spot-check Google's pretrained Gesture Recognizer (the .task model
in data/models/) against real HaGRID photos, fully locally.

Run with the project venv (mediapipe is not a system package here):
    .venv/bin/python tools/test_google_model.py [IMAGES_DIR] [PER_CLASS]

Expects IMAGES_DIR/<hagrid_class>/*.jpg (see the extraction command in
DATA-SOURCES.md / the project notes). Prints per-class agreement with
the gesture the model *should* name for that HaGRID class.
"""
import sys
from pathlib import Path

import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "data" / "models" / "gesture_recognizer.task"

# HaGRID class -> category the Google model should produce
EXPECTED = {
    "palm": "Open_Palm",
    "stop": "Open_Palm",
    "fist": "Closed_Fist",
    "like": "Thumb_Up",
    "dislike": "Thumb_Down",
    "peace": "Victory",
    "one": "Pointing_Up",
    "rock": "ILoveYou",
}


def main():
    images_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else \
        Path("/tmp/hagrid_sample")
    per_class = int(sys.argv[2]) if len(sys.argv) > 2 else 30
    options = vision.GestureRecognizerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(MODEL)),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=1)
    total_hit, total = 0, 0
    with vision.GestureRecognizer.create_from_options(options) as rec:
        for hagrid_class, expected in EXPECTED.items():
            folder = images_dir / hagrid_class
            images = sorted(folder.glob("*.jpg"))[:per_class]
            hits, seen, no_hand, scores = 0, 0, 0, []
            for path in images:
                image = mp.Image.create_from_file(str(path))
                result = rec.recognize(image)
                if not result.gestures:
                    no_hand += 1
                    continue
                top = result.gestures[0][0]
                seen += 1
                scores.append(top.score)
                if top.category_name == expected:
                    hits += 1
            total_hit += hits
            total += seen
            mean = sum(scores) / len(scores) if scores else 0
            print(f"  {hagrid_class:9} -> {expected:12} "
                  f"{hits}/{seen} correct, {no_hand} no-hand, "
                  f"mean top score {mean:.2f}")
    print(f"overall: {total_hit}/{total} = "
          f"{total_hit / max(1, total):.2f} on detected hands")


if __name__ == "__main__":
    main()
