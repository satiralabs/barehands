#!/usr/bin/env python3
"""Select a user-split image sample from the HaGRID 30k sample zip.

Image paths carry no user ids, but ann_train_val/<class>.json carries a
user_id per image. This script intersects the annotations with the images
actually present in the sample zip, picks disjoint train/test user sets
(test = top users by class coverage, train = the next users), and writes
a manifest of images to extract plus a user list file.

usage: extract_user_sample.py ZIP ANN_DIR OUT_MANIFEST OUT_USERS
       [--test-users N] [--train-users N] [--per-class N]
"""
import argparse
import json
import zipfile
from collections import defaultdict
from pathlib import Path

LABEL_MAP = {"ok": "pinch", "palm": "open", "stop": "open", "fist": "fist",
             "one": "point", "peace": "victory", "peace_inverted": "victory",
             "two_up": "victory", "two_up_inverted": "victory", "rock": "rock",
             "little_finger": "littleFinger", "call": "call",
             "like": "thumbsUp", "dislike": "thumbsDown"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("zip")
    ap.add_argument("ann_dir")
    ap.add_argument("out_manifest")
    ap.add_argument("out_users")
    ap.add_argument("--test-users", type=int, default=8)
    ap.add_argument("--train-users", type=int, default=12)
    ap.add_argument("--per-class", type=int, default=5)
    args = ap.parse_args()

    z = zipfile.ZipFile(args.zip)
    imgs = defaultdict(set)
    for n in z.namelist():
        if n.endswith(".jpg"):
            parts = n.split("/")
            imgs[parts[2].removeprefix("train_val_")].add(parts[3][:-4])

    # user -> class -> [image ids]
    per_user = defaultdict(lambda: defaultdict(list))
    for cls in LABEL_MAP:
        p = Path(args.ann_dir) / f"{cls}.json"
        if not p.exists():
            print(f"  {cls}: no annotation file, skipped")
            continue
        ann = json.loads(p.read_text(encoding="utf-8"))
        for imgid, a in ann.items():
            if imgid not in imgs.get(cls, ()):
                continue
            if a.get("labels") != [cls]:
                continue
            uid = a.get("user_id")
            if not uid:
                continue
            per_user[uid][cls].append(imgid)

    # Rank users by (classes covered desc, total images desc).
    ranked = sorted(per_user.items(),
                    key=lambda kv: (-len(kv[1]), -sum(len(v) for v in kv[1].values())))
    test_users = [u for u, _ in ranked[:args.test_users]]
    train_users = [u for u, _ in ranked[args.test_users:args.test_users + args.train_users]]
    print(f"test users: {len(test_users)} (classes covered: "
          f"{[len(per_user[u]) for u in test_users]})")
    print(f"train users: {len(train_users)} (classes covered: "
          f"{[len(per_user[u]) for u in train_users]})")

    manifest = []
    for split, users in (("test", test_users), ("train", train_users)):
        for uid in users:
            for cls in sorted(per_user[uid]):
                for imgid in sorted(per_user[uid][cls])[:args.per_class]:
                    manifest.append({
                        "split": split, "user_id": uid, "class": cls,
                        "label": LABEL_MAP[cls],
                        "zip_path": f"hagrid-sample-30k-384p/hagrid_30k/"
                                    f"train_val_{cls}/{imgid}.jpg",
                    })
    Path(args.out_manifest).write_text(json.dumps(manifest, indent=1) + "\n",
                                       encoding="utf-8")
    Path(args.out_users).write_text(json.dumps(
        {"test": test_users, "train": train_users}, indent=1) + "\n",
        encoding="utf-8")
    from collections import Counter
    print(f"manifest: {len(manifest)} images "
          f"({Counter(m['split'] for m in manifest)})")
    print(f"per-label: {Counter(m['label'] for m in manifest)}")
    print(f"wrote {args.out_manifest} and {args.out_users}")


if __name__ == "__main__":
    main()
