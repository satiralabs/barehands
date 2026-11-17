#!/usr/bin/env python3
"""Map a landmark dataset with a per-frame user split onto engine pose
labels and write train/test files that stay split BY USER.

Frames carry a "split" field ("train"/"test") and a "userId"; the split
is trusted, not re-drawn, so no user can leak across the boundary.
Only classes whose finger configuration honestly matches an engine
label are mapped; ambiguous classes are left out rather than taught
wrong (same map as build_training_set.py).

usage: build_user_split.py INPUT.json OUT_PREFIX
       -> OUT_PREFIX_train.json / OUT_PREFIX_test.json
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

LABEL_MAP = {
    "ok": "pinch",
    "palm": "open",
    "stop": "open",
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
        raise SystemExit("usage: build_user_split.py INPUT.json OUT_PREFIX")
    source, prefix = Path(sys.argv[1]), sys.argv[2]
    dataset = json.loads(source.read_text(encoding="utf-8"))
    by_split = defaultdict(list)
    dropped = 0
    for frame in dataset["frames"]:
        label = LABEL_MAP.get(frame.get("label"))
        if not label or not frame.get("features"):
            dropped += 1
            continue
        by_split[frame.get("split")].append({**frame, "label": label})
    for split in ("train", "test"):
        rows = by_split[split]
        users = sorted({f.get("userId", "") for f in rows})
        print(f"  {split}: {len(rows)} frames from {len(users)} users")
        out = {
            "schema": "barehands-landmarks/v1",
            "createdAt": "HaGRID 30k sample, local hand_landmarker, user split",
            "featureNames": dataset.get("featureNames", []),
            "metadata": {
                "source": dataset.get("metadata", {}).get("source", ""),
                "split": f"by user ({split}), disjoint user_id hashes",
                "users": users,
            },
            "frames": rows,
        }
        target = Path(f"{prefix}_{split}.json")
        target.write_text(json.dumps(out), encoding="utf-8")
        print(f"wrote {target}: {len(rows)} frames")
    if dropped:
        print(f"dropped {dropped} unmapped or featureless frames")


if __name__ == "__main__":
    main()
