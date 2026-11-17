// Evaluate candidate HaGRID classes NOT yet mapped to engine poses.
// For every class in a labelled landmark dataset, tabulate what the
// current rule classifier fires as, plus the fingerCount distribution,
// so a new pose can be judged on separation margin, not on a hunch.
// usage: node tools/evaluate_candidates.mjs DATASET.json
import { readFileSync } from "node:fs";
import { classifyRuleBased, DEFAULT_PROFILE } from "../gesture-engine.mjs";

const input = process.argv[2];
if (!input) {
  console.error("usage: node tools/evaluate_candidates.mjs DATASET.json");
  process.exit(1);
}
const ds = JSON.parse(readFileSync(input, "utf8"));
const frames = ds.frames.filter(f => f.features);
const POSES = ["pinch", "claw", "open", "fist", "point", "victory",
  "rock", "littleFinger", "call", "thumbsUp", "thumbsDown"];

const byClass = new Map();
for (const f of frames) {
  if (!byClass.has(f.label)) byClass.set(f.label, []);
  byClass.get(f.label).push(f);
}

console.log(`dataset: ${input} (${frames.length} frames, ${byClass.size} classes)\n`);
for (const label of [...byClass.keys()].sort()) {
  const rows = byClass.get(label);
  const poseHits = Object.fromEntries(POSES.map(p => [p, 0]));
  const counts = {};
  let none = 0;
  for (const f of rows) {
    const r = classifyRuleBased(f.features, DEFAULT_PROFILE);
    const fired = POSES.filter(p => r[p]);
    if (!fired.length) none++;
    for (const p of fired) poseHits[p]++;
    counts[r.fingerCount] = (counts[r.fingerCount] || 0) + 1;
  }
  const n = rows.length;
  const top = Object.entries(poseHits)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([p, v]) => `${p} ${((100 * v) / n).toFixed(0)}%`)
    .join(", ") || "none";
  const countStr = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([c, v]) => `${c}:${((100 * v) / n).toFixed(0)}%`)
    .join(" ");
  console.log(`${label.padEnd(16)} n=${String(n).padStart(4)}  ` +
    `fires: ${top}  | none ${((100 * none) / n).toFixed(0)}%  | ` +
    `fingerCount ${countStr}`);
}
