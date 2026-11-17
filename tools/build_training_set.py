#!/usr/bin/env python3
"""Map a HaGRID landmark dataset onto engine pose labels and split it
into train/test files (stratified by label, seeded - reproducible).

The split is by SAMPLE, not by user: the HaGRID skeleton export carries
no per-user ids, so held-out accuracy here is an upper bound on
held-out-user accuracy. The model stays productionReady: false.

usage: build_training_set.py INPUT.json OUT_PREFIX
       -> OUT_PREFIX_train.json / OUT_PREFIX_test.json
"""
import json
import random
import sys
from collections import defaultdict
from pathlib import Path

# HaGRID class -> engine label. Only classes whose finger configuration
# honestly matches an engine label are mapped; ambiguous classes
# (grip, grabbing, mute, take_picture, the three* variants...) are
# left out rather than taught wrong.
LABEL_MAP = {
    "ok": "pinch",
    "palm": "open",
    "stop": "open",
    "stop_inverted": "open",
    "three": "three",
    "fist": "fist",
    "one": "point",
    "peace": "victory",
    "peace_inverted": "victory",
    "two_up": "victory",
    "two_up_inverted": "victory",
    "rock": "rock",
    "little_finger": "littleFinger",
    "call": "call",
    "like": "thumbsUp",
    "dislike": "thumbsDown",
}


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: build_training_set.py INPUT.json OUT_PREFIX")
    source, prefix = Path(sys.argv[1]), sys.argv[2]
    dataset = json.loads(source.read_text(encoding="utf-8"))
    by_label = defaultdict(list)
    for frame in dataset["frames"]:
        label = LABEL_MAP.get(frame.get("label"))
        if label and frame.get("features"):
            by_label[label].append({**frame, "label": label})
    rng = random.Random(42)
    train_frames, test_frames = [], []
    for label, rows in sorted(by_label.items()):
        rng.shuffle(rows)
        cut = int(len(rows) * 0.8)
        train_frames.extend(rows[:cut])
        test_frames.extend(rows[cut:])
        print(f"  {label:12} total {len(rows):5}  train {cut:5}  "
              f"test {len(rows) - cut:5}")
    rng.shuffle(train_frames)
    rng.shuffle(test_frames)
    for name, frames in (("train", train_frames), ("test", test_frames)):
        out = {
            "schema": "barehands-landmarks/v1",
            "createdAt": f"HaGRID mapped split ({name})",
            "featureNames": dataset.get("featureNames", []),
            "metadata": {
                "source": "HaGRID (CC BY-SA 4.0) skeleton export, "
                          "labels mapped to engine poses",
                "split": "stratified by label, 80/20, seed 42, "
                         "by sample (no user ids in export)",
            },
            "frames": frames,
        }
        target = Path(f"{prefix}_{name}.json")
        target.write_text(json.dumps(out), encoding="utf-8")
        print(f"wrote {target}: {len(frames)} frames")


if __name__ == "__main__":
    main()
