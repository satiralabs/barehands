// Evaluate the engine's static pose rules against a labelled landmark
// dataset (barehands-landmarks/v1). Features are recomputed from the
// raw landmarks with the current engine code, so new features are
// always present; frames without landmarks fall back to stored ones.
// Prints, from one command: the extArch sweep, the shipped profile
// (baseline), and the depth-gate candidate profile (before/after),
// plus fingerCount accuracy for both.
// usage: node tools/evaluate_poses.mjs DATASET.json
import { readFileSync } from "node:fs";
import {
  classifyRuleBased, DEFAULT_PROFILE, extractHandFeatures
} from "../gesture-engine.mjs";

const input = process.argv[2];
if (!input) {
  console.error("usage: node tools/evaluate_poses.mjs DATASET.json");
  process.exit(1);
}
const ds = JSON.parse(readFileSync(input, "utf8"));
const frames = ds.frames
  .map(f => ({
    label: f.label,
    features: f.landmarks ? extractHandFeatures(f.landmarks) : f.features
  }))
  .filter(f => f.features);

// pose -> HaGRID classes that should fire it. The *_inverted classes
// are the same finger shapes with the palm facing away, so they count
// as positives for shape poses. HaGRID "point" is deliberately NOT the
// point positive: its photos extend the middle/ring fingers too - the
// clean index-only class is "one". HaGRID "mute" (finger to the lips)
// is finger-identical to point and shows up in its false fires; a pose
// layer cannot separate them, only board context could.
const POSES = {
  fist: ["fist"],
  point: ["one"],
  victory: ["peace", "peace_inverted", "two_up", "two_up_inverted"],
  three: ["three"],
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

// Depth-gate candidate: the best values from a threshold sweep on this
// same dataset (fist mean z-curl floor -0.2, rock pinky z-curl ceiling
// 0.2, call thumb z-curl ceiling 0.2). The shipped profile leaves
// these gates open (sentinels -99 / 99) because the sweep gains tie
// recall and shave at most 0.07pp of false-fire - within noise, and
// fitted on the eval set itself. Flip the shipped defaults only after
// a held-out-user validation confirms the gain.
const CANDIDATE_PROFILE = {
  ...DEFAULT_PROFILE,
  fistZcMeanMin: -0.2,
  rockZc20Max: 0.2,
  callZc4Max: 0.2
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

function f1(s) {
  const precision = s.tp / Math.max(1, s.tp + s.fp);
  const recall = s.tp / Math.max(1, s.pos);
  return precision + recall ? 2 * precision * recall / (precision + recall) : 0;
}

function printTable(title, result) {
  console.log(`\n${title}`);
  for (const [pose, s] of Object.entries(result.stats)) {
    const recall = s.tp / Math.max(1, s.pos);
    const fpRate = s.fp / Math.max(1, s.neg);
    console.log(`  ${pose.padEnd(13)} recall ${(100 * recall).toFixed(0).padStart(3)}%` +
      `  false-fire ${(100 * fpRate).toFixed(1)}% on ${s.neg} other frames`);
  }
  console.log(`  fingerCount exact on count classes: ${(100 * result.countAcc).toFixed(0)}%`);
}

console.log(`dataset: ${input} (${frames.length} frames)`);
console.log("\nextArch sweep (mean pose F1):");
let best = null;
for (const extArch of [1.2, 1.25, 1.3, 1.35, 1.4, 1.45]) {
  const result = evaluate({ ...DEFAULT_PROFILE, extArch });
  const mean = Object.values(result.stats)
    .map(f1).reduce((a, b) => a + b, 0) / Object.keys(POSES).length;
  console.log(`  extArch ${extArch.toFixed(2)}  mean F1 ${mean.toFixed(3)}`);
  if (!best || mean > best.mean) best = { extArch, mean };
}
console.log(`best extArch: ${best.extArch} (profile default: ${DEFAULT_PROFILE.extArch})`);

const baseline = evaluate(DEFAULT_PROFILE);
printTable("Pose results at the shipped profile (baseline):", baseline);

const candidate = evaluate(CANDIDATE_PROFILE);
printTable("Pose results with the depth-gate candidate " +
  "(fistZcMeanMin -0.2, rockZc20Max 0.2, callZc4Max 0.2):", candidate);

console.log("\nDepth-gate candidate vs shipped (recall pp / false-fire pp):");
for (const pose of Object.keys(POSES)) {
  const b = baseline.stats[pose], c = candidate.stats[pose];
  const dRecall = 100 * (c.tp / Math.max(1, c.pos) - b.tp / Math.max(1, b.pos));
  const dFf = 100 * (c.fp / Math.max(1, c.neg) - b.fp / Math.max(1, b.neg));
  console.log(`  ${pose.padEnd(13)} recall ${dRecall >= 0 ? "+" : ""}${dRecall.toFixed(1)}` +
    `  false-fire ${dFf >= 0 ? "+" : ""}${dFf.toFixed(2)}`);
}
const meanF1 = r => Object.values(r.stats).map(f1)
  .reduce((a, b) => a + b, 0) / Object.keys(POSES).length;
console.log(`  mean F1 shipped ${meanF1(baseline).toFixed(3)}` +
  `  candidate ${meanF1(candidate).toFixed(3)}` +
  `  fingerCount shipped ${(100 * baseline.countAcc).toFixed(1)}%` +
  `  candidate ${(100 * candidate.countAcc).toFixed(1)}%`);
console.log("  Depth gates are OFF in the shipped profile: the candidate " +
  "gains are within noise (see DEFAULT_PROFILE).");
