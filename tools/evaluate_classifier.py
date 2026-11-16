#!/usr/bin/env python3
"""Evaluate a trained barehands landmark classifier on a held-out
dataset: per-label precision/recall at 0.5 and top-1 accuracy
(argmax over the one-vs-rest classifiers).

usage: evaluate_classifier.py MODEL.json TEST.json [REPORT.json]
"""
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path


def sigmoid(value):
    value = max(-30.0, min(30.0, value))
    return 1.0 / (1.0 + __import__("math").exp(-value))


def main():
    if len(sys.argv) not in (3, 4):
        raise SystemExit(
            "usage: evaluate_classifier.py MODEL.json TEST.json [REPORT.json]")
    model = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    dataset = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    names = model["featureNames"]
    means, stds = model["normalization"]["mean"], model["normalization"]["std"]
    classifiers = model["classifiers"]

    def scores(frame):
        x = [(float(frame["features"].get(name, 0)) - means[i]) / stds[i]
             for i, name in enumerate(names)]
        return {label: sigmoid(c["bias"] + sum(
            w * v for w, v in zip(c["weights"], x)))
            for label, c in classifiers.items()}

    per_label = defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0, "support": 0})
    confusion = Counter()
    correct = 0
    total = 0
    for frame in dataset["frames"]:
        if not frame.get("features"):
            continue
        truth = frame["label"]
        got = scores(frame)
        predicted = max(got, key=got.get)
        total += 1
        confusion[(truth, predicted)] += 1
        if predicted == truth:
            correct += 1
        for label in classifiers:
            fired = got[label] >= 0.5
            if truth == label:
                per_label[label]["support"] += 1
                if fired:
                    per_label[label]["tp"] += 1
                else:
                    per_label[label]["fn"] += 1
            elif fired:
                per_label[label]["fp"] += 1

    report = {"frames": total, "top1Accuracy": correct / max(1, total),
              "labels": {}, "worstConfusions": []}
    print(f"frames: {total}   top-1 accuracy: {report['top1Accuracy']:.3f}")
    for label in sorted(per_label):
        s = per_label[label]
        precision = s["tp"] / max(1, s["tp"] + s["fp"])
        recall = s["tp"] / max(1, s["support"])
        report["labels"][label] = {
            "support": s["support"], "precision": round(precision, 3),
            "recall": round(recall, 3)}
        print(f"  {label:12} support {s['support']:5}  "
              f"precision {precision:.3f}  recall {recall:.3f}")
    worst = [(f"{t} -> {p}", n) for (t, p), n in confusion.most_common()
             if t != p][:8]
    report["worstConfusions"] = [{"pair": k, "count": n} for k, n in worst]
    print("worst confusions:")
    for pair, n in worst:
        print(f"  {pair}: {n}")
    if len(sys.argv) == 4:
        Path(sys.argv[3]).write_text(
            json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {sys.argv[3]}")


if __name__ == "__main__":
    main()
