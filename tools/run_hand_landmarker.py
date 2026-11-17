#!/usr/bin/env python3
"""Run the local MediaPipe hand_landmarker.task over a manifest of
HaGRID sample images and write a barehands-landmarks/v1 dataset.

Landmarks come from the model itself (no HaGRID annotations are used for
landmarks), so this measures the real on-device pipeline: image in,
landmarks out. When several hands are found, the largest-area hand is
kept (the labelled leading hand is normally the closest/largest).

usage: run_hand_landmarker.py MANIFEST.zip ZIP MODEL.task OUT.json
       [--extract-dir DIR] [--min-confidence 0.5]
"""
import argparse
import json
import zipfile
from pathlib import Path

import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision


def largest_hand(result):
    best, best_area = None, -1.0
    for hand in result.hand_landmarks:
        xs = [p.x for p in hand]
        ys = [p.y for p in hand]
        area = (max(xs) - min(xs)) * (max(ys) - min(ys))
        if area > best_area:
            best, best_area = hand, area
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("manifest")
    ap.add_argument("zip")
    ap.add_argument("model")
    ap.add_argument("out")
    ap.add_argument("--extract-dir", default="/tmp/hagrid_user_images")
    ap.add_argument("--min-confidence", type=float, default=0.5)
    args = ap.parse_args()

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    extract_dir = Path(args.extract_dir)
    extract_dir.mkdir(parents=True, exist_ok=True)

    options = vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=args.model),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=2,
        min_hand_detection_confidence=args.min_confidence,
    )
    landmarker = vision.HandLandmarker.create_from_options(options)

    frames, no_hand, multi_hand = [], 0, 0
    z = zipfile.ZipFile(args.zip)
    for i, item in enumerate(manifest):
        target = extract_dir / f"{item['split']}_{item['user_id'][:8]}_" \
                               f"{item['class']}_{i}.jpg"
        if not target.exists():
            target.write_bytes(z.read(item["zip_path"]))
        image = mp.Image.create_from_file(str(target))
        result = landmarker.detect(image)
        if not result.hand_landmarks:
            no_hand += 1
            continue
        if len(result.hand_landmarks) > 1:
            multi_hand += 1
        hand = largest_hand(result)
        frames.append({
            "t": i,
            "label": item["class"],
            "userId": item["user_id"],
            "split": item["split"],
            "landmarks": [{"x": p.x, "y": p.y, "z": p.z} for p in hand],
        })
        if (i + 1) % 200 == 0:
            print(f"  {i + 1}/{len(manifest)} images, {len(frames)} hands kept")
    out = {
        "schema": "barehands-landmarks/v1",
        "createdAt": "HaGRID 30k sample, local hand_landmarker, user split",
        "featureNames": [],
        "metadata": {
            "source": "HaGRID 30k sample (CC BY-SA 4.0), landmarks from "
                      "local MediaPipe hand_landmarker.task",
            "split": "by user: 8 held-out users vs 12 train users, "
                     "disjoint by user_id hash",
            "images": len(manifest),
            "noHandDetected": no_hand,
            "multiHandImages": multi_hand,
        },
        "frames": frames,
    }
    Path(args.out).write_text(json.dumps(out), encoding="utf-8")
    print(f"images: {len(manifest)}  hands kept: {len(frames)}  "
          f"no hand: {no_hand}  multi-hand: {multi_hand}")
    print(f"detection rate: {100 * len(frames) / len(manifest):.1f}%")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
