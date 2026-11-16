// Fill a barehands landmark dataset's frames with engine features.
// usage: node tools/extract_features.mjs DATASET.json [OUT.json]
// Uses the real engine code — features are never re-implemented.
import { readFileSync, writeFileSync } from "node:fs";
import { extractHandFeatures, featureNames } from "../gesture-engine.mjs";

const [input, output] = process.argv.slice(2);
if (!input) {
  console.error("usage: node tools/extract_features.mjs DATASET.json [OUT.json]");
  process.exit(1);
}
const dataset = JSON.parse(readFileSync(input, "utf8"));
if (dataset?.schema !== "barehands-landmarks/v1")
  throw new Error("Not a barehands landmark dataset");
for (const frame of dataset.frames)
  frame.features = extractHandFeatures(frame.landmarks);
dataset.featureNames = featureNames();
writeFileSync(output || input, JSON.stringify(dataset));
console.log(`features written for ${dataset.frames.length} frames`);
