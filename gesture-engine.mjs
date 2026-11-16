const PROFILE_KEY = "barehands.gesture-profile.v1";

export const DEFAULT_PROFILE = Object.freeze({
  version: 1,
  name: "Default",
  minQuality: 0.58,
  dropoutGraceMs: 180,
  pinchIntentMs: 55,
  pinchReleaseMs: 0,
  fastPinchReleaseMs: 70,
  pinchProbationMs: 135,
  pinchContrast: 0.18,
  pinchBackFloor: 1.30,
  pinchProfileAspect: 2.0,
  pinchProfileThumb: 0.95,
  pinchGapFrontal: 0.32,
  pinchGapProfile: 0.38,
  pinchReleaseGap: 0.55,
  pinchFastReleaseGap: 0.70,
  clawArmMs: 465,
  clawMouthEnter: 0.80,
  clawMouthHold: 0.68,
  clawIndexEnter: 0.60,
  clawMiddleEnter: 0.35,
  clawRingEnter: 0.55,
  clawMeanEnter: 0.30,
  clawPinkyEnter: 0.10,
  clapHandUp: 0.85,
  clapApart: 0.18,
  clapWristClose: 0.11,
  clapKnuckleClose: 0.09,
  pointerMinCutoff: 1.2,
  pointerBeta: 0.018,
  pointerDerivativeCutoff: 1.0,
  fastMotionViewportPerSec: 0.42,
  ghostBirthViewportPerSec: 0.47,
  ghostRecoveryViewportPerSec: 0.26,
  throwViewportPerSec: 0.68,
  tapTravelViewport: 0.024,
  pinchClosingVelocityThresh: 0.45,
  intentLockDurationMs: 140,
  intentLockDeadzone: 0.028,
  multiCamMinQuality: 0.50,
  // Board gestures (Progression 1) — values lifted from stage.html's
  // field-tuned laws; see the recognizers at the bottom of this file.
  tapMaxMs: 300,
  minGripMs: 120,
  throwWindowMs: 220,
  throwFollowThrough: 0.40,
  stretchSuppressMs: 700,
  holdMs: 1000,
  holdDriftViewport: 0.045,
  clapCooldownMs: 1500,
  clapPinchBlackoutMs: 800,
  clapOpenGraceMs: 250,
  clapApartWindowMs: 800,
  pullStrainMs: 2000,
  pullRampMs: 4000,
  pullSnapRatio: 0.34,
  pullSnapSoftRatio: 0.48,
  pullSnapDrop: 0.22,
  pullSnapWindowMs: 280,
  pullLostMs: 300,
  pullOpenFlashMs: 900,
  pullMinDistViewport: 0.13,
  pullConeRatio: 0.25,
  scrubEngageViewport: 0.025,
  scrubRangeViewport: 0.28,
  scrubMirror: -1,
  scaleMin: 0.12,
  scaleMax: 12,
  rotateRadPerViewport: 12,
  rotateClampRad: 1.2,
  // Static pose set fitted on HaGRID stills (3,188 hands, 2026-11-16;
  // see DATA-SOURCES.md). A finger counts as extended when its arch
  // (tip distance / knuckle distance from the wrist) clears extArch:
  // folded-finger medians ~0.8, extended ~1.9 on real photos.
  extArch: 1.30,
  thumbExtArch: 1.50,         // thumb arch separates weakly: higher bar
  thumbHeightMin: 0.55        // |thumbHeight| for thumbs up/down
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const dist3 = (a, b) => Math.hypot(
  a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));

function sanitizeProfile(profile) {
  const clean = { ...DEFAULT_PROFILE, version: 1 };
  for (const [key, fallback] of Object.entries(DEFAULT_PROFILE)) {
    if (typeof fallback !== "number") continue;
    const value = Number(profile?.[key]);
    clean[key] = Number.isFinite(value) ? value : fallback;
  }
  clean.name = typeof profile?.name === "string"
    ? profile.name.slice(0, 80) : DEFAULT_PROFILE.name;
  clean.minQuality = clamp(clean.minQuality, 0.3, 0.95);
  clean.dropoutGraceMs = clamp(clean.dropoutGraceMs, 50, 500);
  clean.pinchIntentMs = clamp(clean.pinchIntentMs, 0, 300);
  clean.pinchReleaseMs = clamp(clean.pinchReleaseMs, 0, 200);
  clean.fastPinchReleaseMs = clamp(clean.fastPinchReleaseMs, 0, 250);
  clean.pinchProbationMs = clamp(clean.pinchProbationMs, 50, 500);
  clean.pinchContrast = clamp(clean.pinchContrast, 0.08, 0.40);
  clean.pinchBackFloor = clamp(clean.pinchBackFloor, 1.05, 1.65);
  clean.pinchGapFrontal = clamp(clean.pinchGapFrontal, 0.18, 0.38);
  clean.pinchGapProfile = clamp(clean.pinchGapProfile, 0.22, 0.45);
  clean.clawArmMs = clamp(clean.clawArmMs, 200, 1200);
  clean.clawMouthEnter = clamp(clean.clawMouthEnter, 0.60, 1.10);
  clean.clawMouthHold = clamp(
    clean.clawMouthHold, 0.45, clean.clawMouthEnter - 0.03);
  clean.clapHandUp = clamp(clean.clapHandUp, 0.55, 1.3);
  clean.pointerMinCutoff = clamp(clean.pointerMinCutoff, 0.1, 10);
  clean.pointerBeta = clamp(clean.pointerBeta, 0, 0.2);
  clean.pointerDerivativeCutoff = clamp(
    clean.pointerDerivativeCutoff, 0.1, 10);
  clean.tapMaxMs = clamp(clean.tapMaxMs, 100, 800);
  clean.minGripMs = clamp(clean.minGripMs, 0, 400);
  clean.throwWindowMs = clamp(clean.throwWindowMs, 80, 500);
  clean.throwFollowThrough = clamp(clean.throwFollowThrough, 0.1, 0.9);
  clean.holdMs = clamp(clean.holdMs, 250, 3000);
  clean.holdDriftViewport = clamp(clean.holdDriftViewport, 0.01, 0.15);
  clean.clapCooldownMs = clamp(clean.clapCooldownMs, 0, 10000);
  clean.pullStrainMs = clamp(clean.pullStrainMs, 0, 6000);
  clean.pullRampMs = clamp(clean.pullRampMs, 500, 10000);
  clean.pullSnapRatio = clamp(clean.pullSnapRatio, 0.1, 0.6);
  clean.pullSnapSoftRatio = clamp(
    clean.pullSnapSoftRatio, clean.pullSnapRatio, 0.8);
  clean.pullConeRatio = clamp(clean.pullConeRatio, 0.05, 1);
  clean.scrubRangeViewport = clamp(clean.scrubRangeViewport, 0.05, 1);
  clean.scaleMin = clamp(clean.scaleMin, 0.02, 1);
  clean.scaleMax = clamp(clean.scaleMax, 1, 40);
  clean.rotateRadPerViewport = clamp(clean.rotateRadPerViewport, 1, 40);
  clean.rotateClampRad = clamp(clean.rotateClampRad, 0.2, 3.2);
  clean.extArch = clamp(clean.extArch, 1.0, 1.9);
  clean.thumbExtArch = clamp(clean.thumbExtArch, 1.1, 2.2);
  clean.thumbHeightMin = clamp(clean.thumbHeightMin, 0.1, 1.5);
  clean.scrubMirror = clean.scrubMirror < 0 ? -1 : 1;
  return clean;
}

export function loadGestureProfile(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage.getItem(PROFILE_KEY) || "null");
    return saved && saved.version === 1
      ? sanitizeProfile(saved)
      : { ...DEFAULT_PROFILE };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveGestureProfile(profile, storage = globalThis.localStorage) {
  const clean = sanitizeProfile(profile);
  storage.setItem(PROFILE_KEY, JSON.stringify(clean));
  return clean;
}

export function resetGestureProfile(storage = globalThis.localStorage) {
  storage.removeItem(PROFILE_KEY);
  return { ...DEFAULT_PROFILE };
}

class LowPassFilter {
  constructor() {
    this.value = 0;
    this.ready = false;
  }

  filter(value, alpha) {
    if (!this.ready) {
      this.value = value;
      this.ready = true;
    } else {
      this.value = alpha * value + (1 - alpha) * this.value;
    }
    return this.value;
  }
}

class OneEuroAxis {
  constructor(minCutoff, beta, derivativeCutoff) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.derivativeCutoff = derivativeCutoff;
    this.value = new LowPassFilter();
    this.derivative = new LowPassFilter();
    this.lastRaw = 0;
    this.lastTime = 0;
  }

  alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(raw, nowMs) {
    if (!this.lastTime) {
      this.lastRaw = raw;
      this.lastTime = nowMs;
      return this.value.filter(raw, 1);
    }
    const dt = clamp((nowMs - this.lastTime) / 1000, 1 / 240, 0.1);
    const derivative = (raw - this.lastRaw) / dt;
    const smoothDerivative = this.derivative.filter(
      derivative, this.alpha(this.derivativeCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(smoothDerivative);
    this.lastRaw = raw;
    this.lastTime = nowMs;
    return this.value.filter(raw, this.alpha(cutoff, dt));
  }
}

export class AdaptivePointFilter {
  constructor(profile = DEFAULT_PROFILE) {
    this.x = new OneEuroAxis(
      profile.pointerMinCutoff, profile.pointerBeta,
      profile.pointerDerivativeCutoff);
    this.y = new OneEuroAxis(
      profile.pointerMinCutoff, profile.pointerBeta,
      profile.pointerDerivativeCutoff);
  }

  update(x, y, nowMs) {
    return { x: this.x.filter(x, nowMs), y: this.y.filter(y, nowMs) };
  }
}

export class TemporalGate {
  constructor(enterMs, exitMs = 0) {
    this.enterMs = enterMs;
    this.exitMs = exitMs;
    this.active = false;
    this.trueSince = 0;
    this.falseSince = 0;
  }

  update(value, nowMs) {
    if (value) {
      this.falseSince = 0;
      if (!this.trueSince) this.trueSince = nowMs;
      if (!this.active && nowMs - this.trueSince >= this.enterMs)
        this.active = true;
    } else {
      this.trueSince = 0;
      if (!this.falseSince) this.falseSince = nowMs;
      if (this.active && nowMs - this.falseSince >= this.exitMs)
        this.active = false;
    }
    return this.active;
  }
}

function handednessName(entry) {
  const category = Array.isArray(entry) ? entry[0] : entry;
  return category?.categoryName || category?.displayName || "Unknown";
}

export class StableHandTracker {
  constructor({ graceMs = DEFAULT_PROFILE.dropoutGraceMs } = {}) {
    this.graceMs = graceMs;
    this.nextId = 1;
    this.tracks = new Map();
  }

  update(detections, nowMs) {
    const unmatched = new Set(this.tracks.keys());
    const result = [];
    const ordered = [...detections].sort((a, b) =>
      (handednessName(a.handedness) > handednessName(b.handedness) ? 1 : -1));

    for (const detection of ordered) {
      const wrist = detection.landmarks[0];
      const hand = handednessName(detection.handedness);
      let bestId = null;
      let bestCost = Infinity;
      for (const id of unmatched) {
        const track = this.tracks.get(id);
        const handPenalty = track.handedness !== "Unknown" &&
          hand !== "Unknown" && track.handedness !== hand ? 0.35 : 0;
        const elapsed = Math.max(1, nowMs - track.lastSeen);
        const predicted = {
          x: track.wrist.x + track.velocity.x * elapsed,
          y: track.wrist.y + track.velocity.y * elapsed
        };
        const cost = dist2(wrist, predicted) + handPenalty;
        const travelBudget = Math.min(0.20, 0.07 + elapsed * 0.0007);
        if (cost < bestCost && cost < travelBudget) {
          bestCost = cost;
          bestId = id;
        }
      }

      if (bestId == null) bestId = this.nextId++;
      const previous = this.tracks.get(bestId);
      const elapsed = previous ? Math.max(1, nowMs - previous.lastSeen) : 1;
      const velocity = previous
        ? {
            x: (wrist.x - previous.wrist.x) / elapsed,
            y: (wrist.y - previous.wrist.y) / elapsed
          }
        : { x: 0, y: 0 };
      this.tracks.set(bestId, {
        id: bestId,
        wrist: { x: wrist.x, y: wrist.y },
        velocity,
        handedness: hand,
        lastSeen: nowMs,
        landmarks: detection.landmarks
      });
      unmatched.delete(bestId);
      result.push({ ...detection, id: bestId, handedness: hand });
    }

    for (const [id, track] of this.tracks)
      if (nowMs - track.lastSeen > this.graceMs) this.tracks.delete(id);
    return result;
  }

  activeIds() {
    return new Set(this.tracks.keys());
  }
}

const fingerArch = (landmarks, tip, mcp) => {
  const wrist = landmarks[0];
  const base = dist2(landmarks[mcp], wrist);
  return base > 0 ? dist2(landmarks[tip], wrist) / base : 9;
};

const segment = (landmarks, a, b) => {
  const length = dist3(landmarks[a], landmarks[b]) || 1;
  return {
    x: (landmarks[b].x - landmarks[a].x) / length,
    y: (landmarks[b].y - landmarks[a].y) / length,
    z: ((landmarks[b].z || 0) - (landmarks[a].z || 0)) / length
  };
};

const fingerCurl = (landmarks, mcp, pip, dip, tip) => {
  const proximal = segment(landmarks, mcp, pip);
  const distal = segment(landmarks, dip, tip);
  return proximal.x * distal.x + proximal.y * distal.y +
    proximal.z * distal.z;
};

export function assessLandmarkQuality(landmarks, previous = null) {
  if (!Array.isArray(landmarks) || landmarks.length !== 21) return 0;
  if (landmarks.some(point =>
    !Number.isFinite(point.x) || !Number.isFinite(point.y))) return 0;
  const span = dist2(landmarks[0], landmarks[9]);
  const palmWidth = dist2(landmarks[5], landmarks[17]);
  if (span < 0.015 || palmWidth < 0.01) return 0;
  const aspect = span / palmWidth;
  let score = 1;
  if (aspect < 0.65 || aspect > 6) score -= 0.55;
  const outside = landmarks.filter(point =>
    point.x < -0.08 || point.x > 1.08 || point.y < -0.08 || point.y > 1.08).length;
  score -= outside * 0.025;
  if (previous) {
    const meanJump = landmarks.reduce((sum, point, i) =>
      sum + dist3(point, previous[i]), 0) / landmarks.length;
    if (meanJump > 0.15) score -= Math.min(0.4, (meanJump - 0.15) * 2);
  }
  return clamp(score, 0, 1);
}

export function extractHandFeatures(landmarks, previous = null) {
  // Shape thresholds in stage.html were fitted in image-space. Keep the
  // shared feature math in that same space; curls alone use z because their
  // angular fold test was explicitly fitted in 3D.
  const span = dist2(landmarks[0], landmarks[9]) || 1;
  const palmWidth = dist2(landmarks[5], landmarks[17]) || 1;
  const f8 = fingerArch(landmarks, 8, 5);
  const f12 = fingerArch(landmarks, 12, 9);
  const f16 = fingerArch(landmarks, 16, 13);
  const f20 = fingerArch(landmarks, 20, 17);
  const backMean = (f12 + f16 + f20) / 3;
  const tipGap = (a, b) => dist2(landmarks[a], landmarks[b]);
  return {
    ratio: dist2(landmarks[4], landmarks[8]) / span,
    f8, f12, f16, f20,
    backMean,
    contrast: backMean - f8,
    thumbOffset: dist2(landmarks[4], landmarks[13]) / span,
    aspect: span / palmWidth,
    c8: fingerCurl(landmarks, 5, 6, 7, 8),
    c12: fingerCurl(landmarks, 9, 10, 11, 12),
    c16: fingerCurl(landmarks, 13, 14, 15, 16),
    c20: fingerCurl(landmarks, 17, 18, 19, 20),
    spread: (tipGap(8, 12) + tipGap(12, 16) + tipGap(16, 20)) /
      (3 * span),
    handUp: (landmarks[0].y - landmarks[9].y) / span,
    quality: assessLandmarkQuality(landmarks, previous),
    // Added for the HaGRID-fitted pose set (appended, so existing
    // feature vectors keep their order): thumb arch (tip 4 vs MCP 2,
    // the same construction as the other fingers) and thumb-tip
    // height above the wrist, in span units (image space: positive
    // means the tip sits higher than the wrist).
    f4: fingerArch(landmarks, 4, 2),
    thumbHeight: (landmarks[0].y - landmarks[4].y) / span
  };
}

export function classifyRuleBased(features, profile = DEFAULT_PROFILE) {
  const frontalPinch =
    features.contrast > profile.pinchContrast &&
    features.backMean > profile.pinchBackFloor;
  const profilePinch =
    features.aspect < profile.pinchProfileAspect &&
    features.thumbOffset > profile.pinchProfileThumb;
  const pinchCeiling = features.aspect < profile.pinchProfileAspect
    ? profile.pinchGapProfile : profile.pinchGapFrontal;
  const pinch = features.quality >= profile.minQuality &&
    features.ratio < pinchCeiling && (frontalPinch || profilePinch);
  const clawMean = (features.c8 + features.c12 + features.c16) / 3;
  const claw = features.quality >= profile.minQuality &&
    features.ratio > profile.clawMouthEnter &&
    features.ratio < 1.45 &&
    features.c8 < profile.clawIndexEnter &&
    features.c12 < profile.clawMiddleEnter &&
    features.c16 < profile.clawRingEnter &&
    clawMean < profile.clawMeanEnter &&
    features.c20 > profile.clawPinkyEnter &&
    features.aspect > 1.05;
  const open = features.ratio > 0.7 &&
    [features.f8, features.f12, features.f16, features.f20]
      .filter(value => value > 1.35).length >= 3;
  // Static poses from per-finger extension (arch over the profile bar),
  // fitted on HaGRID stills — see extArch in DEFAULT_PROFILE. Poses are
  // independent booleans like pinch/claw/open; combinations are the
  // caller's business. Older feature sets without f4/thumbHeight
  // simply yield no thumb poses.
  const ext = {
    index: features.f8 > profile.extArch,
    middle: features.f12 > profile.extArch,
    ring: features.f16 > profile.extArch,
    pinky: features.f20 > profile.extArch,
    thumb: (features.f4 ?? 0) > profile.thumbExtArch
  };
  const fingersFolded = !ext.index && !ext.middle && !ext.ring && !ext.pinky;
  const thumbHeight = features.thumbHeight ?? 0;
  const poses = {
    fist: fingersFolded && !ext.thumb,
    point: ext.index && !ext.middle && !ext.ring && !ext.pinky,
    victory: ext.index && ext.middle && !ext.ring && !ext.pinky,
    rock: ext.index && !ext.middle && !ext.ring && ext.pinky,
    littleFinger: !ext.index && !ext.middle && !ext.ring && ext.pinky,
    call: ext.thumb && ext.pinky && !ext.index && !ext.middle && !ext.ring,
    thumbsUp: fingersFolded && ext.thumb &&
      thumbHeight > profile.thumbHeightMin,
    thumbsDown: fingersFolded && ext.thumb &&
      thumbHeight < -profile.thumbHeightMin,
    fingerCount: [ext.index, ext.middle, ext.ring, ext.pinky, ext.thumb]
      .filter(Boolean).length
  };
  return { pinch, claw, open, ...poses };
}

const numericFeatureNames = Object.freeze([
  "ratio", "f8", "f12", "f16", "f20", "backMean", "contrast",
  "thumbOffset", "aspect", "c8", "c12", "c16", "c20", "spread",
  "handUp", "quality", "f4", "thumbHeight"
]);

export function featureVector(features) {
  return numericFeatureNames.map(name => Number(features[name]) || 0);
}

export function featureNames() {
  return [...numericFeatureNames];
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.round((sorted.length - 1) * fraction)];
}

function canyonThreshold(positive, negative, direction, fallback) {
  if (!positive.length || !negative.length) return fallback;
  const positiveEdge = percentile(positive, direction === "high" ? 0.10 : 0.90);
  const negativeEdge = percentile(negative, direction === "high" ? 0.90 : 0.10);
  const separated = direction === "high"
    ? positiveEdge > negativeEdge : positiveEdge < negativeEdge;
  return separated ? (positiveEdge + negativeEdge) / 2 : fallback;
}

export function deriveProfile(samples, base = DEFAULT_PROFILE) {
  const byLabel = label => samples
    .filter(sample => sample.label === label && sample.features)
    .map(sample => sample.features);
  const pinch = byLabel("pinch");
  const fistAndRelaxed = [...byLabel("fist"), ...byLabel("relaxed")];
  const claw = byLabel("claw");
  const clawImpostors = [...byLabel("relaxed"), ...byLabel("point")];
  return {
    ...base,
    version: 1,
    name: `Calibrated ${new Date().toLocaleDateString()}`,
    pinchContrast: canyonThreshold(
      pinch.map(v => v.contrast), fistAndRelaxed.map(v => v.contrast),
      "high", base.pinchContrast),
    pinchBackFloor: canyonThreshold(
      pinch.map(v => v.backMean), byLabel("fist").map(v => v.backMean),
      "high", base.pinchBackFloor),
    pinchGapFrontal: canyonThreshold(
      pinch.map(v => v.ratio), fistAndRelaxed.map(v => v.ratio),
      "low", base.pinchGapFrontal),
    clawMouthEnter: canyonThreshold(
      claw.map(v => v.ratio), clawImpostors.map(v => v.ratio),
      "high", base.clawMouthEnter),
    clawMiddleEnter: canyonThreshold(
      claw.map(v => v.c12), clawImpostors.map(v => v.c12),
      "low", base.clawMiddleEnter),
    clawMeanEnter: canyonThreshold(
      claw.map(v => (v.c8 + v.c12 + v.c16) / 3),
      clawImpostors.map(v => (v.c8 + v.c12 + v.c16) / 3),
      "low", base.clawMeanEnter)
  };
}

export class LandmarkRecorder {
  constructor() {
    this.frames = [];
    this.startedAt = 0;
  }

  start(nowMs = performance.now()) {
    this.frames = [];
    this.startedAt = nowMs;
  }

  add({ label, landmarks, handedness = "Unknown", nowMs = performance.now() }) {
    if (!this.startedAt) this.start(nowMs);
    this.frames.push({
      t: Math.round(nowMs - this.startedAt),
      label,
      handedness,
      landmarks: landmarks.map(point => ({
        x: point.x, y: point.y, z: point.z || 0
      })),
      features: extractHandFeatures(landmarks)
    });
  }

  export(metadata = {}) {
    return {
      schema: "barehands-landmarks/v1",
      createdAt: new Date().toISOString(),
      featureNames: featureNames(),
      metadata,
      frames: this.frames
    };
  }
}

export function replayDataset(dataset, profile = DEFAULT_PROFILE) {
  if (dataset?.schema !== "barehands-landmarks/v1" ||
      !Array.isArray(dataset.frames))
    throw new Error("Not a barehands landmark dataset");
  const totals = {};
  for (const frame of dataset.frames) {
    const features = frame.features || extractHandFeatures(frame.landmarks);
    const predicted = classifyRuleBased(features, profile);
    const expected = frame.label;
    if (!totals[expected])
      totals[expected] = { frames: 0, matched: 0, pinch: 0, claw: 0, open: 0 };
    const row = totals[expected];
    row.frames++;
    if (predicted[expected] === true ||
        (!["pinch", "claw", "open"].includes(expected) &&
         !predicted.pinch && !predicted.claw && !predicted.open)) row.matched++;
    if (predicted.pinch) row.pinch++;
    if (predicted.claw) row.claw++;
    if (predicted.open) row.open++;
  }
  return totals;
}

export class DynamicPinchGate {
  constructor(profile = DEFAULT_PROFILE) {
    this.profile = profile;
    this.ratioHistory = [];
    this.isPinched = false;
    this.intentLocked = false;
    this.lockStartedT = 0;
    this.lockedAnchor = null;
  }

  update({ ratio, x, y, nowMs = performance.now() }) {
    this.ratioHistory.push({ t: nowMs, ratio });
    while (this.ratioHistory.length && nowMs - this.ratioHistory[0].t > 300) {
      this.ratioHistory.shift();
    }

    let closingRate = 0;
    if (this.ratioHistory.length >= 2) {
      const oldest = this.ratioHistory[0];
      const dt = Math.max(0.001, (nowMs - oldest.t) / 1000);
      closingRate = (ratio - oldest.ratio) / dt;
    }

    const isClosingFast = closingRate < -this.profile.pinchClosingVelocityThresh;

    if (!this.isPinched && isClosingFast && ratio < 0.45) {
      if (!this.intentLocked) {
        this.intentLocked = true;
        this.lockStartedT = nowMs;
        this.lockedAnchor = { x, y };
      }
    }

    if (this.intentLocked) {
      const travel = this.lockedAnchor ? dist2({ x, y }, this.lockedAnchor) : 0;
      if (nowMs - this.lockStartedT > this.profile.intentLockDurationMs ||
          travel > this.profile.intentLockDeadzone) {
        this.intentLocked = false;
      }
    }

    const outputPos = (this.intentLocked && this.lockedAnchor) ? this.lockedAnchor : { x, y };

    return {
      outputPos,
      closingRate,
      intentLocked: this.intentLocked,
      isClosingFast
    };
  }
}

export class MultiCameraFusion {
  constructor({ minQuality = DEFAULT_PROFILE.multiCamMinQuality } = {}) {
    this.minQuality = minQuality;
    this.cameraOffsets = new Map();
  }

  setCameraOffset(cameraId, offset = { dx: 0, dy: 0, dz: 0 }) {
    this.cameraOffsets.set(cameraId, offset);
  }

  fuse(cameraFrames) {
    const candidates = [];
    for (const frame of cameraFrames) {
      const offset = this.cameraOffsets.get(frame.cameraId) || { dx: 0, dy: 0, dz: 0 };
      for (const det of (frame.detections || [])) {
        const quality = assessLandmarkQuality(det.landmarks);
        if (quality < this.minQuality) continue;
        const hand = handednessName(det.handedness);
        candidates.push({
          cameraId: frame.cameraId,
          handedness: hand,
          landmarks: det.landmarks.map(p => ({
            x: p.x + offset.dx,
            y: p.y + offset.dy,
            z: (p.z || 0) + offset.dz
          })),
          quality
        });
      }
    }

    if (!candidates.length) return [];

    const byHand = new Map();
    for (const cand of candidates) {
      const list = byHand.get(cand.handedness) || [];
      list.push(cand);
      byHand.set(cand.handedness, list);
    }

    const fusedHands = [];
    for (const [handedness, views] of byHand) {
      if (views.length === 1) {
        fusedHands.push({
          handedness,
          landmarks: views[0].landmarks,
          quality: views[0].quality,
          sourceCameraCount: 1
        });
        continue;
      }

      const totalWeight = views.reduce((sum, v) => sum + v.quality, 0);
      const fusedLandmarks = [];
      for (let i = 0; i < 21; i++) {
        let fx = 0, fy = 0, fz = 0;
        for (const v of views) {
          const pt = v.landmarks[i];
          fx += pt.x * v.quality;
          fy += pt.y * v.quality;
          fz += (pt.z || 0) * v.quality;
        }
        fusedLandmarks.push({
          x: fx / totalWeight,
          y: fy / totalWeight,
          z: fz / totalWeight
        });
      }

      fusedHands.push({
        handedness,
        landmarks: fusedLandmarks,
        quality: Math.min(1.0, (totalWeight / views.length) + 0.15),
        sourceCameraCount: views.length
      });
    }

    return fusedHands;
  }
}

// ---------------------------------------------------------------------------
// Board gestures (Progression 1, 2026-11-16)
//
// The board's gesture laws used to live only inside stage.html, interleaved
// with DOM, audio and item management — unreusable and untestable. They are
// now owned here as pure recognizers: no DOM, no globals, coordinates in
// viewport-normalized units (x, y in 0..1), time in milliseconds. Pinch
// *detection* stays where it was (classifyRuleBased + DynamicPinchGate +
// the board's EMA/probation); these classes consume the resulting
// `pinched` boolean and own everything above it:
//
//   BoardGestureRecognizer  one hand: tap, drag, throw, hold, scrub, ghost
//   TwoHandScale            two pinches on one item: scale only (the board
//                           ruling — twist-roll is dead, rotation is the
//                           one-hand hold latch below)
//   RotateSession           post-hold-latch rotation deltas
//   ClapRecognizer          the deliberate prayer clap (pair level)
//   ForcePullRecognizer     the claw: arm → aim → strain → snap (per hand)
//   clawAimRay              the claw mouth's normal — the aim direction
//   replayBoardGestures     run a recorded dataset through the recognizer
//
// Every threshold comes from DEFAULT_PROFILE so the Gesture Lab can
// calibrate board gestures exactly like it calibrates pinch today.
// ---------------------------------------------------------------------------

const speedOf = (history) => {
  if (history.length < 2) return 0;
  const a = history[0], b = history[history.length - 1];
  const dt = (b.t - a.t) / 1000;
  return dt > 0 ? Math.hypot(b.x - a.x, b.y - a.y) / dt : 0;
};

export class BoardGestureRecognizer {
  constructor(profile = DEFAULT_PROFILE, { handId = 0 } = {}) {
    this.profile = profile;
    this.handId = handId;
    this.history = [];          // {x, y, t} — the throw window
    this.pinched = false;
    this.ghost = false;
    this.pinchT = 0;
    this.startX = 0; this.startY = 0;
    this.holding = false;
    this.lastStretchT = -Infinity;
    this.holdAnchor = null;     // {x, y, t, fired}
    this.scrub = null;          // {sx, live}
  }

  /** Tell the recognizer a two-hand stretch just ended (throw suppressor). */
  noteStretch(nowMs) { this.lastStretchT = nowMs; }

  _peakVelocity(nowMs) {
    // stage.html v3.6: PEAK velocity across the last ~throwWindowMs,
    // sampled in 2-frame steps, plus the final instant's velocity —
    // a real throw carries its speed INTO the release.
    const h = this.history;
    const tEnd = h.length ? h[h.length - 1].t : nowMs;
    let vx = 0, vy = 0, peak = 0;
    for (let k = 0; k + 1 < h.length; k++) {
      const a = h[k], b = h[Math.min(k + 2, h.length - 1)];
      if (a.t < tEnd - this.profile.throwWindowMs || b.t <= a.t) continue;
      const dt = (b.t - a.t) / 1000;
      const sx = (b.x - a.x) / dt, sy = (b.y - a.y) / dt;
      const s = Math.hypot(sx, sy);
      if (s > peak) { peak = s; vx = sx; vy = sy; }
    }
    const la = h[Math.max(0, h.length - 3)], lb = h[h.length - 1];
    const ldt = la && lb ? (lb.t - la.t) / 1000 : 0;
    const last = ldt > 0
      ? Math.hypot(lb.x - la.x, lb.y - la.y) / ldt : 0;
    return { vx, vy, peak, last };
  }

  /**
   * Feed one frame for this hand. frame = {
   *   x, y, pinched, nowMs,
   *   holding        caller has an item grabbed by this hand
   *   scrubAvailable an explodable model exists and the pinch is empty
   *   muted          probation/garbage kill — taps are suppressed
   * }
   * Returns an array of event objects (possibly empty).
   */
  update(frame) {
    const p = this.profile;
    const { x, y, nowMs } = frame;
    const pinched = !!frame.pinched;
    const events = [];
    const emit = (type, extra = {}) =>
      events.push({ type, handId: this.handId, t: nowMs, x, y, ...extra });

    this.history.push({ x, y, t: nowMs });
    while (this.history.length &&
           nowMs - this.history[0].t > Math.max(400, p.throwWindowMs + 80))
      this.history.shift();
    const speed = speedOf(this.history);

    if (pinched && !this.pinched) {
      // Pinch born — the ghost gate (stage v19.2): a pinch born at wave
      // speed is motion blur, not intent. It cannot grab; it self-heals
      // when the hand settles (below).
      this.pinchT = nowMs;
      this.startX = x; this.startY = y;
      this.holding = !!frame.holding;
      this.ghost = speed > p.ghostBirthViewportPerSec;
      this.holdAnchor = { x, y, t: nowMs, fired: false };
      // stage.html anchors the scrub on the first pinched frame
      this.scrub = (!this.holding && frame.scrubAvailable)
        ? { sx: x, live: false } : null;
      if (!this.ghost) {
        emit("pinchstart");
        if (this.holding) emit("dragstart");
      } else {
        emit("ghostpinch");
      }
    } else if (pinched && this.ghost) {
      if (speed < p.ghostRecoveryViewportPerSec) {
        this.ghost = false;
        this.holding = !!frame.holding;
        this.pinchT = nowMs; this.startX = x; this.startY = y;
        this.holdAnchor = { x, y, t: nowMs, fired: false };
        emit("pinchstart", { recovered: true });
        if (this.holding) emit("dragstart", { recovered: true });
      }
    } else if (pinched) {
      if (frame.holding) this.holding = true;
      if (this.holding) {
        emit("drag", { dx: x - this.startX, dy: y - this.startY });
        // Hold-to-promote (stage: ~1s roughly still; drift re-anchors
        // the timer instead of punishing).
        const a = this.holdAnchor;
        if (a) {
          if (Math.hypot(x - a.x, y - a.y) > p.holdDriftViewport) {
            a.x = x; a.y = y; a.t = nowMs; a.fired = false;
          } else {
            const progress = Math.min((nowMs - a.t) / p.holdMs, 1);
            emit("holdprogress", { progress });
            if (progress >= 1 && !a.fired) {
              a.fired = true;
              emit("hold");
            }
          }
        }
      } else if (frame.scrubAvailable) {
        // Explode scrub (stage): an EMPTY pinch dragged sideways;
        // deliberate travel must accrue before it engages.
        if (!this.scrub) this.scrub = { sx: x, live: false };
        const dx = x - this.scrub.sx;
        if (!this.scrub.live && Math.abs(dx) > p.scrubEngageViewport) {
          this.scrub.live = true;
          this.scrub.sx = x;
          emit("scrubstart");
        }
        if (this.scrub.live) {
          emit("scrub", {
            delta: p.scrubMirror * (x - this.scrub.sx) / p.scrubRangeViewport
          });
        }
      }
    }

    if (!pinched && this.pinched) {
      const gripMs = nowMs - this.pinchT;
      const travel = Math.hypot(x - this.startX, y - this.startY);
      const wasGhost = this.ghost;
      if (!wasGhost) {
        // The tap (stage GESTURE v3): quick, near-still release.
        if (!frame.muted && gripMs <= p.tapMaxMs &&
            travel <= p.tapTravelViewport) {
          emit("tap", { durationMs: gripMs, travel });
        }
        // The throw (stage v3.6/v3.9): peak velocity over the window,
        // follow-through into the release, a real grip, and never
        // straight after a two-hand stretch.
        let thrown = null;
        if (this.holding && gripMs >= p.minGripMs &&
            nowMs - this.lastStretchT > p.stretchSuppressMs) {
          const v = this._peakVelocity(nowMs);
          if (v.peak > p.throwViewportPerSec &&
              v.last > v.peak * p.throwFollowThrough) {
            thrown = { vx: v.vx, vy: v.vy, peak: v.peak };
          }
        }
        if (this.scrub && this.scrub.live) emit("scrubend");
        if (this.holding) emit("dragend", { durationMs: gripMs, travel });
        if (thrown) emit("throw", thrown);
        emit("pinchend", { durationMs: gripMs, travel });
      }
      this.pinched = false;
      this.ghost = false;
      this.holding = false;
      this.holdAnchor = null;
      this.scrub = null;
      return events;
    }

    this.pinched = pinched;
    return events;
  }
}

export class TwoHandScale {
  constructor(profile = DEFAULT_PROFILE) {
    this.profile = profile;
    this.active = false;
    this.d0 = 0; this.s0 = 1;
  }

  start(a, b, scale0 = 1) {
    this.d0 = Math.hypot(a.x - b.x, a.y - b.y);
    this.s0 = scale0;
    this.active = this.d0 > 0;
    return this.active;
  }

  update(a, b) {
    if (!this.active) return null;
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const scale = clamp(this.s0 * (d / this.d0),
      this.profile.scaleMin, this.profile.scaleMax);
    return { scale, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  }

  end() { this.active = false; }
}

export class RotateSession {
  constructor(profile = DEFAULT_PROFILE) {
    this.profile = profile;
    this.active = false;
    this.grabX = 0; this.grabY = 0;
    this.rot0x = 0; this.rot0y = 0;
    this.clampYaw = true;
  }

  start(x, y, { rx = 0, ry = 0, clampYaw = true } = {}) {
    this.grabX = x; this.grabY = y;
    this.rot0x = rx; this.rot0y = ry;
    this.clampYaw = clampYaw;
    this.active = true;
  }

  update(x, y) {
    if (!this.active) return null;
    const k = this.profile.rotateRadPerViewport;
    const c = this.profile.rotateClampRad;
    let ry = this.rot0y + (x - this.grabX) * k;
    if (this.clampYaw) ry = clamp(ry, -c, c);
    const rx = clamp(this.rot0x + (y - this.grabY) * k, -c, c);
    return { rx, ry };
  }

  end() { this.active = false; }
}

export class ClapRecognizer {
  constructor(profile = DEFAULT_PROFILE) {
    this.profile = profile;
    this.hist = [];             // {t, w (wrist dist), q (qualified)}
    this.lastFireT = -Infinity;
  }

  /**
   * hands: 0..2 of { wrist:{x,y}, mcp:{x,y}, handUp, softOpen,
   *                  pinched, lastPinchT } — distances normalized by
   * viewport width, as in stage.html. opts: { anyHolding }.
   * Returns [{type:"clap"}] or [].
   */
  update(hands, nowMs, { anyHolding = false } = {}) {
    const p = this.profile;
    const cool = nowMs - this.lastFireT > p.clapCooldownMs;
    const fire = () => {
      this.lastFireT = nowMs;
      this.hist.length = 0;
      return [{ type: "clap", t: nowMs }];
    };
    if (hands.length === 2) {
      const [A, B] = hands;
      const recentPinch = A.pinched || B.pinched ||
        nowMs - Math.max(A.lastPinchT || 0, B.lastPinchT || 0) <
          p.clapPinchBlackoutMs;
      if (anyHolding || recentPinch) { this.hist.length = 0; return []; }
      const wristD = dist2(A.wrist, B.wrist);
      const mcpD = dist2(A.mcp, B.mcp);
      const bothOpen =
        (A.softOpen || nowMs - (A.lastSoftT || 0) < p.clapOpenGraceMs) &&
        (B.softOpen || nowMs - (B.lastSoftT || 0) < p.clapOpenGraceMs);
      const bothUp = A.handUp > p.clapHandUp && B.handUp > p.clapHandUp;
      this.hist.push({ t: nowMs, w: wristD, q: bothOpen && bothUp ? 1 : 0 });
      while (this.hist.length && nowMs - this.hist[0].t > 900)
        this.hist.shift();
      const wasApart = this.hist.some(s =>
        nowMs - s.t <= p.clapApartWindowMs && s.w > p.clapApart);
      if (wristD < p.clapWristClose && mcpD < p.clapKnuckleClose &&
          bothUp && bothOpen && wasApart && cool) return fire();
      return [];
    }
    if (this.hist.length) {
      // Palms merged into one detection at contact — honored only if
      // the approach was qualified and closing when tracking died.
      const last = this.hist[this.hist.length - 1];
      const apart = this.hist.some(s =>
        last.t - s.t <= p.clapApartWindowMs && s.w > p.clapApart);
      const ok = nowMs - last.t < 200 && last.q &&
        last.w < 0.16 && apart && cool;
      this.hist.length = 0;
      if (ok) return fire();
    }
    return [];
  }
}

/** The claw's aim: the mouth's normal, signed away from the palm. */
export function clawAimRay(thumbTip, indexTip, palmCenter, cursor) {
  let dx = -(indexTip.y - thumbTip.y);
  let dy = indexTip.x - thumbTip.x;
  if (dx * (cursor.x - palmCenter.x) + dy * (cursor.y - palmCenter.y) < 0) {
    dx = -dx; dy = -dy;
  }
  const len = Math.hypot(dx, dy) || 1;
  return {
    origin: { x: (thumbTip.x + indexTip.x) / 2,
              y: (thumbTip.y + indexTip.y) / 2 },
    dir: { x: dx / len, y: dy / len }
  };
}

export class ForcePullRecognizer {
  constructor(profile = DEFAULT_PROFILE, { handId = 0 } = {}) {
    this.profile = profile;
    this.handId = handId;
    this.phase = 0;             // 0 idle, 1 aiming
    this.poseMs = 0;
    this.lastT = null;
    this.warned = false;
    this.lostT = 0;
    this.targetId = null;
    this.litT = 0;
    this.readyFired = false;
    this.ratioHist = [];        // {t, ratio} — the plunge window
  }

  /**
   * frame = { claw, ratio, nowMs, lastOpenT, holding, overTarget,
   *           targets: [{id, x, y}], origin: {x, y}, dir: {x, y} }
   * Returns { events, phase, targetId, strain }.
   */
  update(frame) {
    const p = this.profile;
    const { nowMs, ratio } = frame;
    const events = [];
    const emit = (type, extra = {}) =>
      events.push({ type, handId: this.handId, t: nowMs, ...extra });
    const dt = this.lastT == null ? 0 : nowMs - this.lastT;
    this.lastT = nowMs;

    this.ratioHist.push({ t: nowMs, ratio });
    while (this.ratioHist.length &&
           nowMs - this.ratioHist[0].t > 400) this.ratioHist.shift();
    let peak = 0;
    for (const r of this.ratioHist)
      if (nowMs - r.t <= p.pullSnapWindowMs && r.ratio > peak)
        peak = r.ratio;
    // The plunge (stage v6.5): deep-absolute OR fast collapse.
    const snap = ratio < p.pullSnapRatio ||
      (ratio < p.pullSnapSoftRatio && peak - ratio > p.pullSnapDrop);

    // Pose streak with decay — a one-frame hiccup must not zero it.
    this.poseMs = frame.claw
      ? Math.min(1200, this.poseMs + dt)
      : Math.max(0, this.poseMs - dt * 5);
    if (this.poseMs === 0) this.warned = false;

    const unlight = () => { this.targetId = null; this.readyFired = false; };

    if (this.phase === 0) {
      const freshOpen = nowMs - (frame.lastOpenT || 0) < p.pullOpenFlashMs;
      if (!frame.holding && this.poseMs >= p.clawArmMs &&
          !frame.overTarget && freshOpen) {
        this.phase = 1;
        this.lostT = 0;
        unlight();
        emit("pullarm");
      } else if (this.poseMs >= p.clawArmMs + 180 && !this.warned &&
                 !frame.holding && !freshOpen) {
        this.warned = true;
        emit("pullwarn");       // drift-in arch: flash OPEN first
      }
    } else {
      if (frame.claw) this.lostT = 0;
      else if (!this.lostT) this.lostT = nowMs;
      if (frame.holding ||
          (this.lostT && !snap && nowMs - this.lostT > p.pullLostMs)) {
        unlight();
        this.phase = 0;
        emit("pullcancel");
      } else if (snap && this.targetId != null) {
        const targetId = this.targetId;
        const strained = nowMs - this.litT >= p.pullStrainMs;
        unlight();
        this.phase = 0;
        emit(strained ? "pull" : "pullmisfire", { targetId });
      } else if (frame.claw && frame.origin && frame.dir) {
        // Aim: the narrow cone off the mouth's normal.
        let best = null, bestScore = Infinity;
        for (const t of frame.targets || []) {
          const vx = t.x - frame.origin.x, vy = t.y - frame.origin.y;
          if (Math.hypot(vx, vy) < p.pullMinDistViewport) continue;
          const proj = vx * frame.dir.x + vy * frame.dir.y;
          if (proj <= 0) continue;
          const perp = Math.abs(vx * frame.dir.y - vy * frame.dir.x);
          if (perp > proj * p.pullConeRatio) continue;
          if (perp < bestScore) { bestScore = perp; best = t; }
        }
        if (best && best.id !== this.targetId) {
          this.targetId = best.id;
          this.litT = nowMs;
          this.readyFired = false;
          emit("pulltarget", { targetId: best.id });
        } else if (!best && this.targetId != null) {
          unlight();
          emit("pulltargetlost");
        }
        if (this.targetId != null && !this.readyFired &&
            nowMs - this.litT >= p.pullStrainMs) {
          this.readyFired = true;
          emit("pullready", { targetId: this.targetId });
        }
      }
    }

    return {
      events,
      phase: this.phase,
      targetId: this.targetId,
      strain: this.targetId != null
        ? Math.min(1, (nowMs - this.litT) / p.pullRampMs) : 0
    };
  }
}

/**
 * Replay a recorded landmark dataset through the board recognizer.
 * Pinch state is re-derived with classifyRuleBased + release hysteresis
 * (the live board's EMA/probation layers are not replayed — documented
 * approximation). holding/scrub are board state, so replay exercises
 * pinch/tap/drag/hold timing only.
 */
export function replayBoardGestures(dataset, profile = DEFAULT_PROFILE) {
  if (dataset?.schema !== "barehands-landmarks/v1" ||
      !Array.isArray(dataset.frames))
    throw new Error("Not a barehands landmark dataset");
  const byHand = new Map();
  for (const frame of dataset.frames) {
    const key = frame.handedness || "Unknown";
    if (!byHand.has(key))
      byHand.set(key, { rec: new BoardGestureRecognizer(profile),
                        pinched: false });
    const state = byHand.get(key);
    const features = frame.features ||
      extractHandFeatures(frame.landmarks);
    if (!state.pinched && classifyRuleBased(features, profile).pinch)
      state.pinched = true;
    else if (state.pinched && features.ratio >= profile.pinchReleaseGap)
      state.pinched = false;
    const tip = frame.landmarks[8], thumb = frame.landmarks[4];
    const events = state.rec.update({
      x: (tip.x + thumb.x) / 2, y: (tip.y + thumb.y) / 2,
      pinched: state.pinched, nowMs: frame.t || 0,
      holding: false, scrubAvailable: false, muted: false
    });
    state.events = (state.events || []).concat(events);
  }
  const counts = {};
  const events = [];
  for (const state of byHand.values()) {
    for (const e of state.events || []) {
      counts[e.type] = (counts[e.type] || 0) + 1;
      events.push(e);
    }
  }
  return { counts, events };
}

