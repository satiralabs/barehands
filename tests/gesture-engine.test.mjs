import assert from "node:assert/strict";
import {
  AdaptivePointFilter, BoardGestureRecognizer, ClapRecognizer,
  DEFAULT_PROFILE, DynamicPinchGate, ForcePullRecognizer, MultiCameraFusion,
  PoseSmoother, RotateSession, StableHandTracker, TemporalGate, TwoHandScale,
  classifyRuleBased, clawAimRay, extractHandFeatures, featureNames,
  deriveProfile, loadGestureProfile, replayBoardGestures, replayDataset
} from "../gesture-engine.mjs";

const hand = (x, label = "Left") => ({
  landmarks: Array.from({ length: 21 }, (_, index) => ({
    x: x + index * 0.001, y: 0.4 + index * 0.001, z: 0
  })),
  handedness: [{ categoryName: label }]
});

const tracker = new StableHandTracker({ graceMs: 180 });
const first = tracker.update([hand(0.2), hand(0.7, "Right")], 0);
const crossed = tracker.update([hand(0.68, "Right"), hand(0.22)], 33);
assert.equal(first[0].id, crossed.find(row => row.handedness === "Left").id);
assert.equal(first[1].id, crossed.find(row => row.handedness === "Right").id);

tracker.update([], 100);
assert.equal(tracker.activeIds().size, 2);
tracker.update([], 250);
assert.equal(tracker.activeIds().size, 0);

const reuseTracker = new StableHandTracker({ graceMs: 180 });
const original = reuseTracker.update([hand(0.1)], 10)[0];
const impossibleJump = reuseTracker.update([hand(0.55)], 110)[0];
assert.notEqual(original.id, impossibleJump.id);

const gate = new TemporalGate(60, 40);
assert.equal(gate.update(true, 10), false);
assert.equal(gate.update(true, 69), false);
assert.equal(gate.update(true, 70), true);
assert.equal(gate.update(false, 90), true);
assert.equal(gate.update(false, 130), false);

const filter = new AdaptivePointFilter(DEFAULT_PROFILE);
assert.deepEqual(filter.update(10, 20, 1), { x: 10, y: 20 });
const moved = filter.update(20, 30, 34);
assert(moved.x > 10 && moved.x < 20);

const sample = features => ({ label: "pinch", features });
const profile = deriveProfile([
  sample({ contrast: 0.4, backMean: 1.6, ratio: 0.2 }),
  { label: "fist", features: { contrast: 0.05, backMean: 1.0, ratio: 0.5 } },
  { label: "relaxed", features: { contrast: 0.08, backMean: 1.5, ratio: 0.8 } }
]);
assert(profile.pinchContrast > 0.08 && profile.pinchContrast < 0.4);

assert.throws(() => replayDataset({ schema: "wrong", frames: [] }));

// Test DynamicPinchGate
const pinchGate = new DynamicPinchGate(DEFAULT_PROFILE);
const p1 = pinchGate.update({ ratio: 0.8, x: 0.5, y: 0.5, nowMs: 0 });
assert.equal(p1.intentLocked, false);
// Rapid closing towards pinch
const p2 = pinchGate.update({ ratio: 0.35, x: 0.505, y: 0.502, nowMs: 100 });
assert.equal(p2.intentLocked, true);
assert.deepEqual(p2.outputPos, { x: 0.505, y: 0.502 });
// Small jitter during pinch is locked to anchor
const p3 = pinchGate.update({ ratio: 0.25, x: 0.508, y: 0.504, nowMs: 140 });
assert.equal(p3.intentLocked, true);
assert.deepEqual(p3.outputPos, { x: 0.505, y: 0.502 }); // Position locked to prevent click-drift

// Test MultiCameraFusion
const fusion = new MultiCameraFusion();
const realisticHand = (x, label = "Right") => ({
  landmarks: Array.from({ length: 21 }, (_, index) => ({
    x: x + index * 0.01, y: 0.4 + index * 0.01, z: 0
  })),
  handedness: [{ categoryName: label }]
});
const cam1Hand = realisticHand(0.3, "Right");
const cam2Hand = realisticHand(0.32, "Right");
const fused = fusion.fuse([
  { cameraId: "cam0", detections: [cam1Hand] },
  { cameraId: "cam1", detections: [cam2Hand] }
]);
assert.equal(fused.length, 1);
assert.equal(fused[0].sourceCameraCount, 2);
assert.equal(fused[0].handedness, "Right");

// ---------------------------------------------------------------------
// Board gestures (Progression 1) - laws lifted from stage.html
// ---------------------------------------------------------------------
const feed = (rec, frames) => frames.flatMap(f => rec.update(f));
const frame = (x, y, pinched, nowMs, extra = {}) =>
  ({ x, y, pinched, nowMs, holding: false, scrubAvailable: false,
     muted: false, ...extra });
const types = evts => evts.map(e => e.type);

// Profile additions are present and sanitized
assert.equal(DEFAULT_PROFILE.tapMaxMs, 300);
assert.equal(DEFAULT_PROFILE.pullStrainMs, 2000);
const clampedProfile = loadGestureProfile({ getItem: () =>
  JSON.stringify({ version: 1, tapMaxMs: 99999 }) });
assert.equal(clampedProfile.tapMaxMs, 800);

// TAP: quick, near-still release fires; moved / long / muted do not
{
  const rec = new BoardGestureRecognizer(DEFAULT_PROFILE);
  const evts = feed(rec, [
    frame(0.5, 0.5, false, 0), frame(0.5, 0.5, false, 33),
    frame(0.5, 0.5, true, 66), frame(0.5, 0.5, true, 99),
    frame(0.5, 0.5, true, 132), frame(0.5, 0.5, false, 165)
  ]);
  assert(types(evts).includes("pinchstart"));
  assert(types(evts).includes("tap"));
}
{
  const rec = new BoardGestureRecognizer(DEFAULT_PROFILE);
  const evts = feed(rec, [
    frame(0.5, 0.5, false, 0), frame(0.5, 0.5, true, 33),
    frame(0.56, 0.5, true, 66), frame(0.56, 0.5, false, 99)
  ]);
  assert(!types(evts).includes("tap"));   // travelled too far
}
{
  const rec = new BoardGestureRecognizer(DEFAULT_PROFILE);
  const frames = [frame(0.5, 0.5, false, 0), frame(0.5, 0.5, true, 33)];
  for (let t = 66; t <= 495; t += 33) frames.push(frame(0.5, 0.5, true, t));
  frames.push(frame(0.5, 0.5, false, 528));
  assert(!types(feed(rec, frames)).includes("tap"));   // held too long
}
{
  const rec = new BoardGestureRecognizer(DEFAULT_PROFILE);
  const evts = feed(rec, [
    frame(0.5, 0.5, false, 0), frame(0.5, 0.5, true, 33),
    frame(0.5, 0.5, false, 66, { muted: true })
  ]);
  assert(!types(evts).includes("tap"));   // probation kill mutes the tap
}

// DRAG + gentle placement: drag lifecycle, no throw
{
  const rec = new BoardGestureRecognizer(DEFAULT_PROFILE);
  const frames = [frame(0.4, 0.5, false, 0, { holding: true }),
                  frame(0.4, 0.5, true, 33, { holding: true })];
  for (let k = 1; k <= 10; k++)
    frames.push(frame(0.4 + k * 0.01, 0.5, true, 33 + k * 33,
      { holding: true }));
  for (let k = 0; k < 10; k++)   // parked before release: follow-through dies
    frames.push(frame(0.5, 0.5, true, 400 + k * 33, { holding: true }));
  frames.push(frame(0.5, 0.5, false, 760, { holding: true }));
  const evts = feed(rec, frames);
  assert(types(evts).includes("dragstart"));
  assert(types(evts).includes("drag"));
  assert(types(evts).includes("dragend"));
  assert(!types(evts).includes("throw"));
}

// THROW: fast release with follow-through fires with the peak velocity
{
  const rec = new BoardGestureRecognizer(DEFAULT_PROFILE);
  const frames = [frame(0.3, 0.5, false, 0, { holding: true }),
                  frame(0.3, 0.5, false, 33, { holding: true }),
                  frame(0.3, 0.5, true, 66, { holding: true })];
  for (let k = 1; k <= 5; k++)
    frames.push(frame(0.3 + k * 0.06, 0.5, true, 66 + k * 33,
      { holding: true }));
  frames.push(frame(0.66, 0.5, false, 264, { holding: true }));
  const evts = feed(rec, frames);
  const thr = evts.find(e => e.type === "throw");
  assert(thr && thr.vx > 0 && thr.peak > DEFAULT_PROFILE.throwViewportPerSec);
}
// THROW guards: sub-120ms grip and post-stretch releases never fling
{
  const rec = new BoardGestureRecognizer(DEFAULT_PROFILE);
  const evts = feed(rec, [
    frame(0.3, 0.5, false, 0, { holding: true }),
    frame(0.3, 0.5, true, 33, { holding: true }),
    frame(0.42, 0.5, true, 66, { holding: true }),
    frame(0.54, 0.5, false, 99, { holding: true })
  ]);
  assert(!types(evts).includes("throw"));
}
{
  const rec = new BoardGestureRecognizer(DEFAULT_PROFILE);
  const frames = [frame(0.3, 0.5, false, 0, { holding: true }),
                  frame(0.3, 0.5, true, 33, { holding: true })];
  for (let k = 1; k <= 5; k++)
    frames.push(frame(0.3 + k * 0.06, 0.5, true, 33 + k * 33,
      { holding: true }));
  rec.noteStretch(200);
  frames.push(frame(0.66, 0.5, false, 231, { holding: true }));
  assert(!types(feed(rec, frames)).includes("throw"));
}

// GHOST: a pinch born at wave speed cannot grab, then self-heals
{
  const rec = new BoardGestureRecognizer(DEFAULT_PROFILE);
  const frames = [];
  for (let k = 0; k <= 3; k++)
    frames.push(frame(0.2 + k * 0.05, 0.5, false, k * 33));
  frames.push(frame(0.4, 0.5, true, 132));
  for (let t = 165; t <= 792; t += 33)
    frames.push(frame(0.4, 0.5, true, t));
  frames.push(frame(0.4, 0.5, false, 825));
  const evts = feed(rec, frames);
  assert(types(evts).includes("ghostpinch"));
  const start = evts.find(e => e.type === "pinchstart");
  assert(start && start.recovered === true);
}

// HOLD: ~1s roughly still promotes; drift re-anchors the timer
{
  const rec = new BoardGestureRecognizer(DEFAULT_PROFILE);
  const frames = [frame(0.5, 0.5, false, 0, { holding: true }),
                  frame(0.5, 0.5, true, 33, { holding: true })];
  for (let t = 66; t <= 1200; t += 33)
    frames.push(frame(0.5, 0.5, true, t, { holding: true }));
  const evts = feed(rec, frames);
  assert.equal(evts.filter(e => e.type === "hold").length, 1);
  assert(types(evts).includes("holdprogress"));
}
{
  const rec = new BoardGestureRecognizer(DEFAULT_PROFILE);
  const frames = [frame(0.5, 0.5, false, 0, { holding: true }),
                  frame(0.5, 0.5, true, 33, { holding: true })];
  for (let t = 66; t <= 528; t += 33)
    frames.push(frame(0.5, 0.5, true, t, { holding: true }));
  frames.push(frame(0.56, 0.5, true, 561, { holding: true }));  // drift
  for (let t = 594; t <= 1100; t += 33)
    frames.push(frame(0.56, 0.5, true, t, { holding: true }));
  assert(!types(feed(rec, frames)).includes("hold"));
}

// SCRUB: empty pinch engages after deliberate travel, mirrored delta
{
  const rec = new BoardGestureRecognizer(DEFAULT_PROFILE);
  const evts = feed(rec, [
    frame(0.5, 0.5, false, 0),
    frame(0.5, 0.5, true, 33, { scrubAvailable: true }),
    frame(0.53, 0.5, true, 66, { scrubAvailable: true }),
    frame(0.64, 0.5, true, 99, { scrubAvailable: true }),
    frame(0.64, 0.5, false, 132, { scrubAvailable: true })
  ]);
  assert(types(evts).includes("scrubstart"));
  assert(types(evts).includes("scrubend"));
  const scrub = evts.filter(e => e.type === "scrub").pop();
  assert(Math.abs(scrub.delta - (-(0.64 - 0.53) / 0.28)) < 1e-9);
}

// SCALE: two-hand stretch is scale-only, clamped, with a carry midpoint
{
  const scale = new TwoHandScale(DEFAULT_PROFILE);
  scale.start({ x: 0.4, y: 0.5 }, { x: 0.6, y: 0.5 }, 1);
  const out = scale.update({ x: 0.3, y: 0.5 }, { x: 0.7, y: 0.5 });
  assert(Math.abs(out.scale - 2) < 1e-9);
  assert.deepEqual(out.mid, { x: 0.5, y: 0.5 });
  const huge = scale.update({ x: 0, y: 0.5 }, { x: 1, y: 0.5 });
  assert(Math.abs(huge.scale - 5) < 1e-9);
  const tiny = scale.update({ x: 0.49, y: 0.5 }, { x: 0.51, y: 0.5 });
  assert.equal(tiny.scale, DEFAULT_PROFILE.scaleMin);
}

// ROTATE: the hold latch turns hand travel into clamped yaw/pitch
{
  const rot = new RotateSession(DEFAULT_PROFILE);
  rot.start(0.5, 0.5, { rx: 0, ry: 0 });
  const mid = rot.update(0.55, 0.55);
  assert(Math.abs(mid.ry - 0.6) < 1e-9 && Math.abs(mid.rx - 0.6) < 1e-9);
  const max = rot.update(0.9, 0.5);
  assert.equal(max.ry, DEFAULT_PROFILE.rotateClampRad);
}

// CLAP: the prayer law - apart, then palms together, fingers up, open
const clapHand = (wx, overrides = {}) => ({
  wrist: { x: wx, y: 0.5 }, mcp: { x: wx, y: 0.35 },
  handUp: 1, softOpen: true, lastSoftT: 0, pinched: false,
  lastPinchT: -10000, ...overrides   // long ago: the 800ms blackout is real
});
{
  const rec = new ClapRecognizer(DEFAULT_PROFILE);
  assert.deepEqual(rec.update(
    [clapHand(0.30, { lastSoftT: 0 }), clapHand(0.52, { lastSoftT: 0 })], 0), []);
  const fired = rec.update(
    [clapHand(0.44, { lastSoftT: 100 }), clapHand(0.50, { lastSoftT: 100 })],
    100);
  assert.equal(fired.length, 1);
  assert.equal(fired[0].type, "clap");
}
{
  const rec = new ClapRecognizer(DEFAULT_PROFILE);   // recent pinch kills it
  rec.update([clapHand(0.30), clapHand(0.52)], 0);
  const out = rec.update(
    [clapHand(0.44, { lastPinchT: 50 }), clapHand(0.50)], 100);
  assert.deepEqual(out, []);
}
{
  const rec = new ClapRecognizer(DEFAULT_PROFILE);   // fingers not up
  rec.update([clapHand(0.30), clapHand(0.52)], 0);
  const out = rec.update(
    [clapHand(0.44, { handUp: 0.2 }), clapHand(0.50, { handUp: 0.2 })], 100);
  assert.deepEqual(out, []);
}
{
  const rec = new ClapRecognizer(DEFAULT_PROFILE);   // the vanish read
  rec.update([clapHand(0.30, { lastSoftT: 0 }), clapHand(0.52, { lastSoftT: 0 })], 0);
  rec.update([clapHand(0.40, { lastSoftT: 100 }), clapHand(0.54, { lastSoftT: 100 })], 100);
  const out = rec.update([], 200);
  assert.equal(out.length, 1);
}

// FORCE PULL: arm needs the open flash; snap after the strain = pull
const pullFrames = (rec, { snapAt, lastOpenT = 0 }) => {
  const all = [];
  const target = [{ id: "t1", x: 0.8, y: 0.52 }];
  for (let t = 0; t <= snapAt; t += 100) {
    const snapFrame = t === snapAt;
    const out = rec.update({
      claw: !snapFrame, ratio: snapFrame ? 0.3 : 0.9, nowMs: t,
      lastOpenT, holding: false, overTarget: false,
      targets: target, origin: { x: 0.5, y: 0.5 }, dir: { x: 1, y: 0 }
    });
    all.push(...out.events);
  }
  return all;
};
{
  const rec = new ForcePullRecognizer(DEFAULT_PROFILE);
  const evts = pullFrames(rec, { snapAt: 2700 });
  const tt = types(evts);
  assert(tt.includes("pullarm"));
  assert(tt.includes("pulltarget"));
  assert(tt.includes("pullready"));
  const pull = evts.find(e => e.type === "pull");
  assert(pull && pull.targetId === "t1");
}
{
  const rec = new ForcePullRecognizer(DEFAULT_PROFILE);   // early snap
  const evts = pullFrames(rec, { snapAt: 1000 });
  assert(types(evts).includes("pullmisfire"));
  assert(!types(evts).includes("pull"));
}
{
  const rec = new ForcePullRecognizer(DEFAULT_PROFILE);   // no open flash
  const evts = pullFrames(rec, { snapAt: 1500, lastOpenT: -5000 });
  assert(!types(evts).includes("pullarm"));
  assert(types(evts).includes("pullwarn"));
}
// Aim ray: perpendicular to the thumb–index line, away from the palm
{
  const ray = clawAimRay(
    { x: 0.4, y: 0.6 }, { x: 0.6, y: 0.6 },
    { x: 0.5, y: 0.75 }, { x: 0.5, y: 0.6 });
  assert(Math.abs(ray.dir.x) < 1e-9 && ray.dir.y === -1);
}

// REPLAY: a recorded tap is recovered from a landmark dataset
{
  const lm = () => Array.from({ length: 21 },
    () => ({ x: 0.5, y: 0.5, z: 0 }));
  const pinchF = { ratio: 0.2, contrast: 0.4, backMean: 1.6, f8: 1.2,
    f12: 1.6, f16: 1.6, f20: 1.6, thumbOffset: 0.5, aspect: 3,
    c8: 0, c12: 0, c16: 0, c20: 0, spread: 0.3, handUp: 0, quality: 0.9 };
  const openF = { ...pinchF, ratio: 0.9, contrast: 0 };
  const dataset = { schema: "barehands-landmarks/v1", frames: [
    { t: 0, label: "relaxed", handedness: "Right",
      landmarks: lm(), features: openF },
    { t: 33, label: "pinch", handedness: "Right",
      landmarks: lm(), features: pinchF },
    { t: 66, label: "pinch", handedness: "Right",
      landmarks: lm(), features: pinchF },
    { t: 99, label: "relaxed", handedness: "Right",
      landmarks: lm(), features: openF }
  ] };
  const { counts } = replayBoardGestures(dataset, DEFAULT_PROFILE);
  assert.equal(counts.tap, 1);
  assert.throws(() => replayBoardGestures({ schema: "wrong", frames: [] }));
}

// ---------------------------------------------------------------------
// Static poses (HaGRID-fitted) - synthetic features at the fitted
// medians; dataset-level accuracy lives in tools/evaluate_poses.mjs
// ---------------------------------------------------------------------
{
  const base = { ratio: 1.2, f8: 0.8, f12: 0.8, f16: 0.8, f20: 0.8,
    f4: 1.2, backMean: 0.8, contrast: 0, thumbOffset: 0.5, aspect: 3,
    c8: 0, c12: 0, c16: 0, c20: 0, spread: 0.3, handUp: 1,
    quality: 0.9, thumbHeight: 0 };
  const pose = over => classifyRuleBased({ ...base, ...over },
    DEFAULT_PROFILE);
  assert.equal(DEFAULT_PROFILE.extArch, 1.3);
  const fist = pose({});
  assert(fist.fist && fist.fingerCount === 0 && !fist.thumbsUp);
  const point = pose({ f8: 1.9 });
  assert(point.point && point.fingerCount === 1 && !point.victory);
  const victory = pose({ f8: 1.9, f12: 1.95 });
  assert(victory.victory && victory.fingerCount === 2);
  const rock = pose({ f8: 1.9, f20: 1.85 });
  assert(rock.rock && rock.fingerCount === 2 && !rock.victory);
  const little = pose({ f20: 1.85 });
  assert(little.littleFinger && little.fingerCount === 1);
  const call = pose({ f20: 1.95, f4: 1.7 });
  assert(call.call && !call.littleFinger);  // thumb condition separates call from littleFinger
  const up = pose({ f4: 1.7, thumbHeight: 1.05 });
  assert(up.thumbsUp && !up.fist && !up.thumbsDown);
  const down = pose({ f4: 1.75, thumbHeight: -1.05 });
  assert(down.thumbsDown && !down.thumbsUp);
  const three = pose({ f8: 1.9, f12: 1.95, f16: 1.9 });
  assert(three.three && three.fingerCount === 3 && !three.victory && !three.point);
  const five = pose({ f8: 1.9, f12: 1.95, f16: 1.9, f20: 1.85, f4: 1.7 });
  assert.equal(five.fingerCount, 5);
  // Features from before f4/thumbHeight existed: no thumb poses, no crash
  const legacy = { ...base }; delete legacy.f4; delete legacy.thumbHeight;
  const old = classifyRuleBased(legacy, DEFAULT_PROFILE);
  assert(!old.thumbsUp && !old.thumbsDown && old.fist);
}

// ---------------------------------------------------------------------
// Pose smoother - temporal voting + hysteresis + dwell
// ---------------------------------------------------------------------
{
  // Profile additions are present and sanitized
  assert.equal(DEFAULT_PROFILE.poseSmoothWindow, 7);
  assert.equal(DEFAULT_PROFILE.poseSmoothVotes, 4);
  assert.equal(DEFAULT_PROFILE.poseSmoothHoldMs, 300);
  const clamped = loadGestureProfile({ getItem: () => JSON.stringify({
    version: 1, poseSmoothWindow: 99, poseSmoothVotes: 99,
    poseSmoothHoldMs: 5000, fistZcMeanMin: 5 }) });
  assert.equal(clamped.poseSmoothWindow, 15);
  assert.equal(clamped.poseSmoothVotes, 15);   // capped at the window
  assert.equal(clamped.poseSmoothHoldMs, 1000);
  assert.equal(clamped.fistZcMeanMin, 1);

  // FLICKER: alternating poses every frame never flip the report
  const flick = new PoseSmoother(DEFAULT_PROFILE);
  let last = null;
  for (let k = 0; k < 20; k++) {
    const out = flick.update(k % 2 === 0 ? "fist" : "point", k * 33);
    if (out.pose) {
      assert.equal(out.pose, "fist");
      last = out.pose;
    }
  }
  assert.equal(last, "fist");

  // HOLD TIME: a dominant challenger waits out the incumbent's dwell
  const hold = new PoseSmoother(DEFAULT_PROFILE);
  let out;
  for (let k = 0; k < 4; k++) out = hold.update("fist", k * 33);
  assert.equal(out.pose, "fist");              // reported at t=99
  for (let k = 0; k < 5; k++) out = hold.update("point", 132 + k * 33);
  assert.equal(out.pose, "fist");              // dominant at t=264, dwell not done
  for (let k = 5; k < 11; k++) out = hold.update("point", 132 + k * 33);
  assert.equal(out.pose, "point");             // dwell done at t=429

  // HYSTERESIS: a challenger that only ties the incumbent never wins,
  // even with the dwell long past - it must beat it by 2 votes
  const hyst = new PoseSmoother(DEFAULT_PROFILE);
  for (let k = 0; k < 10; k++) out = hyst.update("fist", k * 33);
  assert.equal(out.pose, "fist");
  for (let k = 0; k < 4; k++) out = hyst.update("point", 330 + k * 33);
  assert.equal(out.pose, "fist");              // 4 point vs 3 fist: margin 1
  for (let k = 4; k < 7; k++) out = hyst.update("point", 330 + k * 33);
  assert.equal(out.pose, "point");             // window now all point

  // RESET on hand loss: the next pose reports fresh, no stale incumbent
  const rst = new PoseSmoother(DEFAULT_PROFILE);
  for (let k = 0; k < 4; k++) out = rst.update("fist", k * 33);
  assert.equal(out.pose, "fist");
  rst.reset();
  out = rst.update("point", 500);
  assert.equal(out.pose, null);                // needs its votes first
  for (let k = 1; k < 4; k++) out = rst.update("point", 500 + k * 33);
  assert.equal(out.pose, "point");

  // A full window of nulls clears a stale report
  const nul = new PoseSmoother(DEFAULT_PROFILE);
  for (let k = 0; k < 4; k++) out = nul.update("fist", k * 33);
  assert.equal(out.pose, "fist");
  for (let k = 0; k < 7; k++) out = nul.update(null, 132 + k * 33);
  assert.equal(out.pose, null);
}

// ---------------------------------------------------------------------
// Occlusion hold - jumped + degraded landmarks are held, not emitted
// ---------------------------------------------------------------------
const realHand = (dx = 0) => {
  const pts = [
    [0.50, 0.75], [0.42, 0.68], [0.40, 0.62], [0.38, 0.57], [0.36, 0.52],
    [0.46, 0.60], [0.45, 0.52], [0.44, 0.45], [0.43, 0.38],
    [0.50, 0.59], [0.50, 0.51], [0.50, 0.44], [0.50, 0.37],
    [0.54, 0.60], [0.55, 0.52], [0.56, 0.45], [0.57, 0.38],
    [0.58, 0.62], [0.59, 0.56], [0.60, 0.51], [0.61, 0.46]
  ];
  return {
    landmarks: pts.map(([x, y]) => ({ x: x + dx, y, z: 0 })),
    handedness: [{ categoryName: "Right" }]
  };
};
// The occluded read: the hand squeezes sideways (palm collapses, so
// quality falls 1.0 -> 0.45) and jumps ~0.1 in x - a teleport with a
// degraded skeleton, not a real move.
const squeezedHand = () => ({
  landmarks: realHand().landmarks.map(p => ({
    x: 0.60 + (p.x - 0.55) * 0.1, y: p.y, z: 0
  })),
  handedness: [{ categoryName: "Right" }]
});
{
  const occ = new StableHandTracker({ graceMs: 180 });
  const c1 = occ.update([realHand()], 0)[0];
  assert.equal(c1.held, false);
  const c2 = occ.update([realHand()], 100)[0];
  assert.equal(c2.id, c1.id);
  assert.equal(c2.held, false);
  const o1 = occ.update([squeezedHand()], 200)[0];
  assert.equal(o1.id, c1.id);
  assert.equal(o1.held, true);
  assert.equal(o1.occluded, true);
  assert.deepEqual(o1.landmarks, c2.landmarks);   // last good re-emitted
  const o2 = occ.update([squeezedHand()], 300)[0];
  assert.equal(o2.held, true);                    // still inside the hold
  const back = occ.update([realHand()], 400)[0];
  assert.equal(back.id, c1.id);
  assert.equal(back.held, false);
  assert.deepEqual(back.landmarks, realHand().landmarks);
}
{
  // The hold is bounded: past occlusionHoldMs the new frame is accepted
  const occ = new StableHandTracker({ graceMs: 180 });
  occ.update([realHand()], 0);
  occ.update([realHand()], 100);
  assert.equal(occ.update([squeezedHand()], 200)[0].held, true);
  assert.equal(occ.update([squeezedHand()], 400)[0].held, true);
  const late = occ.update([squeezedHand()], 800)[0];
  assert.equal(late.held, false);
  assert.notDeepEqual(late.landmarks, realHand().landmarks);
}
{
  // A fast REAL move (big jump, quality intact) is never held
  const occ = new StableHandTracker({ graceMs: 180 });
  const c1 = occ.update([realHand()], 0)[0];
  const moved = occ.update([realHand(0.08)], 100)[0];
  assert.equal(moved.id, c1.id);
  assert.equal(moved.held, false);
  assert.equal(moved.landmarks[0].x, 0.58);
}

// ---------------------------------------------------------------------
// Depth features - z-curl and palm depth, appended order-preserving
// ---------------------------------------------------------------------
{
  assert.deepEqual(featureNames().slice(-6),
    ["zc8", "zc12", "zc16", "zc20", "zc4", "palmDepth"]);
  assert.equal(featureNames().indexOf("thumbHeight"), 17);

  // z-curl is tip z minus pip z in span units (span here is 0.16)
  const lm = realHand().landmarks;
  lm[8].z = -0.16; lm[6].z = 0;                  // index tip toward camera
  lm[0].z = 0.08; lm[5].z = -0.08;               // palm tilted in depth
  const f = extractHandFeatures(lm);
  assert(Math.abs(f.zc8 - (-1)) < 1e-9);
  assert.equal(f.zc12, 0);
  assert(Math.abs(f.palmDepth - 1) < 1e-9);

  // Depth gates: off by default, enforced when a profile enables them
  const base = { ratio: 1.2, f8: 0.8, f12: 0.8, f16: 0.8, f20: 0.8,
    f4: 1.2, backMean: 0.8, contrast: 0, thumbOffset: 0.5, aspect: 3,
    c8: 0, c12: 0, c16: 0, c20: 0, spread: 0.3, handUp: 1,
    quality: 0.9, thumbHeight: 0 };
  const gated = { ...DEFAULT_PROFILE, fistZcMeanMin: 0.2 };
  assert.equal(classifyRuleBased(base, gated).fist, false);  // zc 0 < 0.2
  const withZ = { ...base, zc8: 0.3, zc12: 0.3, zc16: 0.3, zc20: 0.3 };
  assert.equal(classifyRuleBased(withZ, gated).fist, true);
  const rockBase = { ...base, f8: 1.9, f20: 1.85 };
  const rockGated = { ...DEFAULT_PROFILE, rockZc20Max: 0 };
  assert.equal(
    classifyRuleBased({ ...rockBase, zc20: 0.1 }, rockGated).rock, false);
  assert.equal(
    classifyRuleBased({ ...rockBase, zc20: -0.1 }, rockGated).rock, true);
  // Shipped defaults leave the gates open even for extreme z values
  const extreme = { ...base, zc8: 5, zc12: 5, zc16: 5, zc20: 5, zc4: -5 };
  assert.equal(classifyRuleBased(extreme, DEFAULT_PROFILE).fist, true);
}

console.log("gesture engine tests passed");
