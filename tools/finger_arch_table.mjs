// Per-finger arch medians and above-threshold rates per HaGRID class,
// to judge whether a candidate pose separates from existing poses on
// the features the engine already computes. Thresholds are the shipped
// profile values: extArch 1.30 for fingers, thumbExtArch 1.50 for thumb.
// usage: node tools/finger_arch_table.mjs DATASET.json [class ...]
import { readFileSync } from "node:fs";
import { DEFAULT_PROFILE } from "../gesture-engine.mjs";

const [input, ...wanted] = process.argv.slice(2);
if (!input) {
  console.error("usage: node tools/finger_arch_table.mjs DATASET.json [class ...]");
  process.exit(1);
}
const ds = JSON.parse(readFileSync(input, "utf8"));
const frames = ds.frames.filter(f => f.features);
const FINGERS = [["thumb", "f4", DEFAULT_PROFILE.thumbExtArch],
  ["index", "f8", DEFAULT_PROFILE.extArch],
  ["middle", "f12", DEFAULT_PROFILE.extArch],
  ["ring", "f16", DEFAULT_PROFILE.extArch],
  ["pinky", "f20", DEFAULT_PROFILE.extArch]];

const median = a => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const classes = wanted.length
  ? wanted
  : [...new Set(frames.map(f => f.label))].sort();
console.log("class            n     thumb  index middle  ring pinky   (median arch / % above threshold)");
for (const label of classes) {
  const rows = frames.filter(f => f.label === label);
  if (!rows.length) { console.log(`${label.padEnd(16)} n=0`); continue; }
  const cells = FINGERS.map(([name, key, thr]) => {
    const vals = rows.map(f => f.features[key]);
    const pct = 100 * vals.filter(v => v > thr).length / vals.length;
    return `${median(vals).toFixed(2)}/${pct.toFixed(0)}%`;
  });
  console.log(`${label.padEnd(16)} ${String(rows.length).padStart(4)}  ${cells.join("  ")}`);
}
console.log("\nthresholds: thumb > 1.50 extended, fingers > 1.30 extended");
