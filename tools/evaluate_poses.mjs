// Evaluate the engine's static pose rules against a labelled landmark
// dataset (barehands-landmarks/v1 with features filled). Prints recall
// on each pose's HaGRID class and false-fire rate on all other classes,
// plus a threshold sweep for extArch.
// usage: node tools/evaluate_poses.mjs DATASET.json
import { readFileSync } from "node:fs";
import { classifyRuleBased, DEFAULT_PROFILE } from "../gesture-engine.mjs";

const input = process.argv[2];
if (!input) {
  console.error("usage: node tools/evaluate_poses.mjs DATASET.json");
  process.exit(1);
}
const ds = JSON.parse(readFileSync(input, "utf8"));
const frames = ds.frames.filter(f => f.features);

// pose -> HaGRID classes that should fire it. The *_inverted classes
// are the same finger shapes with the palm facing away, so they count
// as positives for shape poses. HaGRID "point" is deliberately NOT the
// point positive: its photos extend the middle/ring fingers too — the
// clean index-only class is "one". HaGRID "mute" (finger to the lips)
// is finger-identical to point and shows up in its false fires; a pose
// layer cannot separate them, only board context could.
const POSES = {
  fist: ["fist"],
  point: ["one"],
  victory: ["peace", "peace_inverted", "two_up", "two_up_inverted"],
  rock: ["rock"],
  littleFinger: ["little_finger"],
  call: ["call"],
  thumbsUp: ["like"],
  thumbsDown: ["dislike"]
};
const COUNT_CLASSES = {
  fist: 0, one: 1, little_finger: 1, peace: 2, two_up: 2,
  three: 3, four: 4, palm: 5
};

function evaluate(profile) {
  const stats = {};
  for (const pose of Object.keys(POSES)) stats[pose] = { tp: 0, pos: 0, fp: 0, neg: 0 };
  let countRight = 0, countTotal = 0;
  for (const f of frames) {
    const r = classifyRuleBased(f.features, profile);
    for (const [pose, classes] of Object.entries(POSES)) {
      if (classes.includes(f.label)) {
        stats[pose].pos++;
        if (r[pose]) stats[pose].tp++;
      } else {
        stats[pose].neg++;
        if (r[pose]) stats[pose].fp++;
      }
    }
    if (f.label in COUNT_CLASSES) {
      countTotal++;
      if (r.fingerCount === COUNT_CLASSES[f.label]) countRight++;
    }
  }
  return { stats, countAcc: countTotal ? countRight / countTotal : 0 };
}

console.log(`dataset: ${input} (${frames.length} frames)`);
console.log("\nextArch sweep (mean pose F1):");
let best = null;
for (const extArch of [1.2, 1.25, 1.3, 1.35, 1.4, 1.45]) {
  const { stats } = evaluate({ ...DEFAULT_PROFILE, extArch });
  const f1s = Object.values(stats).map(s => {
    const precision = s.tp / Math.max(1, s.tp + s.fp);
    const recall = s.tp / Math.max(1, s.pos);
    return precision + recall ? 2 * precision * recall / (precision + recall) : 0;
  });
  const mean = f1s.reduce((a, b) => a + b, 0) / f1s.length;
  console.log(`  extArch ${extArch.toFixed(2)}  mean F1 ${mean.toFixed(3)}`);
  if (!best || mean > best.mean) best = { extArch, mean };
}
console.log(`best extArch: ${best.extArch} (profile default: ${DEFAULT_PROFILE.extArch})`);

const { stats, countAcc } = evaluate(DEFAULT_PROFILE);
console.log("\nPose results at the shipped profile:");
for (const [pose, s] of Object.entries(stats)) {
  const recall = s.tp / Math.max(1, s.pos);
  const fpRate = s.fp / Math.max(1, s.neg);
  console.log(`  ${pose.padEnd(13)} recall ${(100 * recall).toFixed(0).padStart(3)}%` +
    `  false-fire ${(100 * fpRate).toFixed(1)}% on ${s.neg} other frames`);
}
console.log(`  fingerCount exact on count classes: ${(100 * countAcc).toFixed(0)}%`);
