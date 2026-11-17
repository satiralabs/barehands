// camera-pipeline.mjs - local-first MediaPipe loading and low-quality camera
// adaptation, shared by stage.html and gesture-lab.html.
//
// OFFLINE MODELS: Tasks Vision 0.10.14 is vendored under
// ./vendor/tasks-vision/ (vision_bundle.mjs + wasm/) and the hand landmarker
// model lives at ./data/models/hand_landmarker.task. Both pages load the
// local copies first; the CDN (jsdelivr / storage.googleapis.com) is only a
// fallback if a local load throws, so the board works with no internet once
// installed. The exact version is pinned in TASKS_VISION_VERSION below.
//
// LOW-QUALITY CAMERA MODE: cheap or old cameras get four adaptations,
// all driven by the LOWQ constants in this file (no magic numbers in the
// pages):
//   1. getUserMedia constraint ladder - 1280x720, then 640x480, then
//      320x240, then any camera; steps down on OverconstrainedError /
//      NotReadableError, stops at once on permission denial.
//   2. Adaptive detection confidence - steps 0.7 -> 0.5 -> 0.35 when no
//      hand is found for a while or landmark quality stays low; steps
//      back up when quality recovers. Floor is 0.35.
//   3. Low-light handling - frame brightness is sampled from a small
//      canvas; when dark the UI shows a hint and detection runs on a
//      brightness/contrast-boosted canvas, falling back to the raw video
//      if the boosted path throws.
//   4. Frame-rate adaptation - below 18 fps the pipeline processes every
//      2nd, then every 3rd frame so the UI stays responsive.
//   5. ROI re-acquisition - when a hand was recently tracked then lost,
//      detection runs on a crop around the last hand box on alternate
//      frames, so the hand is picked up again faster.
// The pipeline is dormant on a good camera: same resolution, same 0.7
// confidence, every frame, raw video. Nothing about the board changes
// until the camera actually struggles.
//
// This module touches no DOM at import time, so the pure helpers
// (buildLadder, meanLuma, mapCropLandmarks) and the pipeline class are
// unit-tested in node in tests/camera-pipeline.test.mjs with injected
// fakes for mediaDevices, canvases, and the landmarker.

export const TASKS_VISION_VERSION = "0.10.14";

export const LOCAL_BUNDLE_URL = "./vendor/tasks-vision/vision_bundle.mjs";
export const CDN_BUNDLE_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
export const LOCAL_WASM_URL = "./vendor/tasks-vision/wasm";
export const CDN_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
export const LOCAL_MODEL_URL = "./data/models/hand_landmarker.task";
export const CDN_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// LOWQ - every low-quality-camera threshold in one place. Change a
// number here and both pages follow; do not scatter these through the
// pages.
export const LOWQ = Object.freeze({
  // getUserMedia ladder, widest first; null means "any camera, no size ask".
  // buildLadder() prepends the page's requested resolution and dedupes.
  ladder: Object.freeze([[1280, 720], [640, 480], [320, 240], null]),
  confStart: 0.7,
  confSteps: Object.freeze([0.7, 0.5, 0.35]),
  confFloor: 0.35,
  noHandFramesToStepDown: 45, // ~1.5 s with no hand at 30 fps
  lowQualityFramesToStepDown: 90, // ~3 s of low landmark quality
  lowQualityThreshold: 0.45, // extractHandFeatures quality below this counts as low
  recoverQuality: 0.7, // quality at/above this counts as recovered
  recoverFrames: 30, // consecutive good frames before stepping confidence back up
  brightnessSampleEveryMs: 500,
  lowLightLuma: 48, // mean luma (0-255) below this counts as low light
  boostBrightness: 1.35,
  boostContrast: 1.25,
  boostMaxWidth: 640, // boosted canvas is capped here; MediaPipe downscales anyway
  fpsLowThreshold: 18, // below this fps, start skipping frames
  fpsRecoverThreshold: 26, // above this fps, stop skipping
  fpsLowFrames: 60, // consecutive slow frames before adding a skip level
  frameSkipMax: 3, // process every 3rd frame at most
  roiPad: 0.25, // crop padding as a fraction of the last hand box size
  roiLostFrames: 5, // start cropping only after this many lost frames
  roiMaxLostFrames: 45, // stop cropping after this many (hand is really gone)
  sampleWidth: 64, // brightness sample canvas size
  sampleHeight: 36,
});

// ---- offline model loading (local first, CDN fallback) ----

// Dynamic import so the local bundle is tried before the CDN. A static
// import would pin the CDN at parse time.
export async function loadTasksVision(importFn = (url) => import(url)) {
  try {
    return await importFn(LOCAL_BUNDLE_URL);
  } catch (localError) {
    console.warn("Local Tasks Vision bundle failed, falling back to CDN:", localError);
    return await importFn(CDN_BUNDLE_URL);
  }
}

export async function createVision(ns) {
  try {
    return await ns.FilesetResolver.forVisionTasks(LOCAL_WASM_URL);
  } catch (localError) {
    console.warn("Local wasm failed, falling back to CDN:", localError);
    return await ns.FilesetResolver.forVisionTasks(CDN_WASM_URL);
  }
}

export async function createHandLandmarker(ns, vision, options = {}) {
  const base = {
    numHands: 2,
    runningMode: "VIDEO",
    minHandDetectionConfidence: LOWQ.confStart,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    delegate: "GPU",
    ...options,
  };
  try {
    return await ns.HandLandmarker.createFromOptions(vision, {
      ...base,
      baseOptions: { modelAssetPath: LOCAL_MODEL_URL, delegate: base.delegate },
    });
  } catch (localError) {
    console.warn("Local hand model failed, falling back to CDN model:", localError);
    return await ns.HandLandmarker.createFromOptions(vision, {
      ...base,
      baseOptions: { modelAssetPath: CDN_MODEL_URL, delegate: base.delegate },
    });
  }
}

// ---- getUserMedia constraint ladder ----

// Rungs are [width, height] pairs plus a final null rung (any camera).
// The page's requested resolution goes first; only rungs no larger than
// the request follow (a ladder never steps up), duplicates are dropped.
export function buildLadder(width, height) {
  const area = width * height;
  const rungs = [];
  const seen = new Set();
  for (const rung of [[width, height], ...LOWQ.ladder]) {
    if (rung && rung[0] * rung[1] > area) continue;
    const key = rung ? `${rung[0]}x${rung[1]}` : "any";
    if (seen.has(key)) continue;
    seen.add(key);
    rungs.push(rung);
  }
  return rungs;
}

const LADDER_STOP_ERRORS = new Set(["NotAllowedError", "SecurityError", "NotFoundError"]);

export async function openCameraWithLadder(deviceId, width, height, deps = {}) {
  const mediaDevices = deps.mediaDevices ||
    (typeof navigator !== "undefined" ? navigator.mediaDevices : null);
  if (!mediaDevices || !mediaDevices.getUserMedia) {
    throw new Error("Camera not available in this browser");
  }
  let lastError = null;
  for (const rung of buildLadder(width, height)) {
    let video;
    if (rung) {
      video = { width: { ideal: rung[0] }, height: { ideal: rung[1] } };
      if (deviceId) video.deviceId = { exact: deviceId };
    } else {
      // Last rung: any camera, no size ask, no device pin. A cheap camera
      // that lies about its capabilities can still open this way.
      video = true;
    }
    try {
      const stream = await mediaDevices.getUserMedia({ video, audio: false });
      const track = stream.getVideoTracks()[0];
      const settings = track ? track.getSettings() : {};
      return {
        stream,
        width: settings.width || (rung ? rung[0] : 0),
        height: settings.height || (rung ? rung[1] : 0),
        rung: rung ? `${rung[0]}x${rung[1]}` : "any",
      };
    } catch (error) {
      lastError = error;
      // Permission denied or no camera at all: stepping down cannot help.
      if (LADDER_STOP_ERRORS.has(error && error.name)) throw error;
      // OverconstrainedError / NotReadableError / anything else: try smaller.
    }
  }
  throw lastError || new Error("Camera could not be opened at any resolution");
}

// ---- pure helpers (node-testable) ----

// Mean luma of an ImageData-style RGBA array (0-255).
export function meanLuma(rgba) {
  if (!rgba || rgba.length < 4) return 255;
  let total = 0;
  const pixels = Math.floor(rgba.length / 4);
  for (let i = 0; i < pixels; i++) {
    const o = i * 4;
    total += 0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2];
  }
  return total / pixels;
}

// Map landmarks detected inside a crop back to full-frame coordinates.
// crop is { x, y, w, h } in normalized full-frame units (0-1); the
// landmarks arrive normalized to the crop, so this is a plain rescale.
export function mapCropLandmarks(landmarks, crop) {
  return landmarks.map((p) => ({
    x: crop.x + p.x * crop.w,
    y: crop.y + p.y * crop.h,
    z: p.z || 0,
  }));
}

function bboxOf(landmarks) {
  let xMin = 1, yMin = 1, xMax = 0, yMax = 0;
  for (const p of landmarks) {
    if (p.x < xMin) xMin = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.x > xMax) xMax = p.x;
    if (p.y > yMax) yMax = p.y;
  }
  return { xMin, yMin, xMax, yMax };
}

function defaultCreateCanvas() {
  if (typeof document === "undefined") return null;
  return document.createElement("canvas");
}

// ---- adaptive detection pipeline ----

// Wraps one HandLandmarker. detect(video, now) returns:
//   { skipped: true } when a frame is skipped for fps, or
//   { skipped: false, landmarks, handedness, source } where source is
//   "video", "boost" (low-light canvas) or "roi" (re-acquisition crop).
// Call noteQuality(q) after the page computes extractHandFeatures
// quality so the confidence ladder can react to landmark quality too.
export class LowQualityPipeline {
  constructor(landmarker, options = {}) {
    this.landmarker = landmarker;
    this.enabled = options.enabled !== false;
    this.createCanvas = options.createCanvas || defaultCreateCanvas;
    this.confLevel = 0;
    this.conf = LOWQ.confSteps[0];
    this.skip = 1;
    this.frameCount = 0;
    this.noHandFrames = 0;
    this.lowQualityFrames = 0;
    this.recoverFrames = 0;
    this.lowFpsFrames = 0;
    this.lastDetectNow = 0;
    this.fpsEmaMs = 0;
    this.fps = 0;
    this.lowLight = false;
    this.lastBrightnessSample = 0;
    this.lastBbox = null;
    this.lastCrop = null;
    this.usingRoi = false;
    this.usingBoost = false;
    this.lastQuality = null;
    this.hands = 0;
    this.lastResolution = "";
    this.mode = "normal";
    this.sampleCanvas = null;
    this.boostCanvas = null;
    this.roiCanvas = null;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      // Back to the plain path: full confidence, every frame, raw video.
      this.confLevel = 0;
      this.conf = LOWQ.confSteps[0];
      this.skip = 1;
      this.lowLight = false;
      this.usingRoi = false;
      this.usingBoost = false;
      this.noHandFrames = 0;
      this.lowQualityFrames = 0;
      this.recoverFrames = 0;
      this.applyConfidence();
    }
    this.updateMode();
  }

  reset() {
    this.setEnabled(this.enabled);
    this.lastBbox = null;
    this.lastQuality = null;
    this.hands = 0;
    this.fps = 0;
    this.fpsEmaMs = 0;
    this.frameCount = 0;
  }

  applyConfidence() {
    try {
      if (typeof this.landmarker.setOptions === "function") {
        this.landmarker.setOptions({ minHandDetectionConfidence: this.conf });
      }
    } catch (error) {
      console.warn("Could not change detection confidence:", error);
    }
  }

  stepConfidenceDown() {
    if (this.confLevel >= LOWQ.confSteps.length - 1) return;
    this.confLevel++;
    this.conf = LOWQ.confSteps[this.confLevel];
    this.noHandFrames = 0;
    this.applyConfidence();
  }

  stepConfidenceUp() {
    if (this.confLevel <= 0) return;
    this.confLevel--;
    this.conf = LOWQ.confSteps[this.confLevel];
    this.applyConfidence();
  }

  // Called by the page with the landmark quality of the best hand this
  // frame (extractHandFeatures quality, 0-1), or null when no hand.
  noteQuality(quality) {
    if (quality == null) return;
    this.lastQuality = quality;
    if (!this.enabled) return;
    if (quality < LOWQ.lowQualityThreshold) {
      this.recoverFrames = 0;
      if (++this.lowQualityFrames >= LOWQ.lowQualityFramesToStepDown) {
        this.stepConfidenceDown();
        this.lowQualityFrames = 0;
      }
    } else if (quality >= LOWQ.recoverQuality) {
      this.lowQualityFrames = 0;
      if (++this.recoverFrames >= LOWQ.recoverFrames) {
        this.stepConfidenceUp();
        this.recoverFrames = 0;
      }
    } else {
      this.lowQualityFrames = 0;
      this.recoverFrames = 0;
    }
  }

  sampleBrightness(video) {
    this.lastBrightnessSample = performance.now();
    try {
      if (!this.sampleCanvas) {
        this.sampleCanvas = this.createCanvas();
        if (!this.sampleCanvas) return;
      }
      const canvas = this.sampleCanvas;
      canvas.width = LOWQ.sampleWidth;
      canvas.height = LOWQ.sampleHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, LOWQ.sampleWidth, LOWQ.sampleHeight);
      const data = ctx.getImageData(0, 0, LOWQ.sampleWidth, LOWQ.sampleHeight).data;
      this.lowLight = meanLuma(data) < LOWQ.lowLightLuma;
    } catch (error) {
      // Sampling is advisory; a failure just leaves the last reading.
      console.warn("Brightness sampling failed:", error);
    }
  }

  boostedCanvas(video) {
    try {
      const vw = video.videoWidth || 0;
      const vh = video.videoHeight || 0;
      if (!vw || !vh) return null;
      if (!this.boostCanvas) {
        this.boostCanvas = this.createCanvas();
        if (!this.boostCanvas) return null;
      }
      const scale = Math.min(1, LOWQ.boostMaxWidth / vw);
      const canvas = this.boostCanvas;
      canvas.width = Math.max(2, Math.round(vw * scale));
      canvas.height = Math.max(2, Math.round(vh * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.filter = `brightness(${LOWQ.boostBrightness}) contrast(${LOWQ.boostContrast})`;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.filter = "none";
      return canvas;
    } catch (error) {
      console.warn("Boosted canvas failed:", error);
      return null;
    }
  }

  roiCanvasFor(video) {
    try {
      const vw = video.videoWidth || 0;
      const vh = video.videoHeight || 0;
      if (!vw || !vh || !this.lastBbox) return null;
      const b = this.lastBbox;
      const padX = (b.xMax - b.xMin) * LOWQ.roiPad;
      const padY = (b.yMax - b.yMin) * LOWQ.roiPad;
      const crop = {
        x: Math.max(0, b.xMin - padX),
        y: Math.max(0, b.yMin - padY),
        w: Math.min(1, b.xMax + padX) - Math.max(0, b.xMin - padX),
        h: Math.min(1, b.yMax + padY) - Math.max(0, b.yMin - padY),
      };
      if (crop.w <= 0.05 || crop.h <= 0.05) return null;
      if (!this.roiCanvas) {
        this.roiCanvas = this.createCanvas();
        if (!this.roiCanvas) return null;
      }
      const canvas = this.roiCanvas;
      canvas.width = Math.max(2, Math.round(crop.w * vw));
      canvas.height = Math.max(2, Math.round(crop.h * vh));
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(
        video,
        crop.x * vw, crop.y * vh, crop.w * vw, crop.h * vh,
        0, 0, canvas.width, canvas.height
      );
      this.lastCrop = crop;
      return canvas;
    } catch (error) {
      console.warn("ROI crop failed:", error);
      return null;
    }
  }

  updateMode() {
    if (!this.enabled) this.mode = "off";
    else if (this.usingRoi) this.mode = "re-acquire";
    else if (this.lowLight) this.mode = "low light";
    else if (this.confLevel > 0) this.mode = "adapted";
    else if (this.skip > 1) this.mode = "reduced fps";
    else this.mode = "normal";
  }

  // One glanceable snapshot for the status line. Resolution is the video
  // element's decoded size, fps is an EMA of detect() call intervals.
  status() {
    return {
      resolution: this.lastResolution || "-",
      fps: this.fps ? Math.round(this.fps) : 0,
      quality: this.lastQuality == null ? null : Math.round(this.lastQuality * 100) / 100,
      mode: this.mode,
      conf: this.conf,
      skip: this.skip,
      lowLight: this.lowLight,
      roi: this.usingRoi,
      hands: this.hands,
    };
  }

  detect(video, now) {
    if (video.videoWidth && video.videoHeight) {
      this.lastResolution = `${video.videoWidth}x${video.videoHeight}`;
    }
    if (this.lastDetectNow && now > this.lastDetectNow) {
      const dt = now - this.lastDetectNow;
      if (dt > 0 && dt < 1000) {
        this.fpsEmaMs = this.fpsEmaMs ? this.fpsEmaMs * 0.9 + dt * 0.1 : dt;
        this.fps = 1000 / this.fpsEmaMs;
      }
    }
    this.lastDetectNow = now;
    this.frameCount++;

    if (this.enabled) {
      // Frame-rate adaptation: sustained slow fps adds a skip level.
      if (this.fps > 0 && this.fps < LOWQ.fpsLowThreshold) {
        if (++this.lowFpsFrames >= LOWQ.fpsLowFrames && this.skip < LOWQ.frameSkipMax) {
          this.skip++;
          this.lowFpsFrames = 0;
        }
      } else if (this.fps > LOWQ.fpsRecoverThreshold) {
        this.lowFpsFrames = 0;
        if (this.skip > 1) this.skip--;
      }
      if (this.skip > 1 && this.frameCount % this.skip !== 0) {
        return { skipped: true, landmarks: [], handedness: [], source: "skip" };
      }
      if (now - this.lastBrightnessSample >= LOWQ.brightnessSampleEveryMs) {
        this.sampleBrightness(video);
      }
    }

    // Choose the detection source. ROI runs on alternate frames while a
    // hand is lost, so a hand that moved out of the crop is still found
    // on the full frame the next time round.
    let source = video;
    let sourceKind = "video";
    const wantRoi = this.enabled && this.lastBbox &&
      this.noHandFrames >= LOWQ.roiLostFrames &&
      this.noHandFrames <= LOWQ.roiMaxLostFrames &&
      this.frameCount % 2 === 0;
    if (wantRoi) {
      const cropCanvas = this.roiCanvasFor(video);
      if (cropCanvas) {
        source = cropCanvas;
        sourceKind = "roi";
      }
    } else if (this.enabled && this.lowLight) {
      const boosted = this.boostedCanvas(video);
      if (boosted) {
        source = boosted;
        sourceKind = "boost";
      }
    }

    let result;
    try {
      result = this.landmarker.detectForVideo(source, now);
    } catch (error) {
      if (sourceKind !== "video") {
        // The pre-processed path must never break the normal path.
        result = this.landmarker.detectForVideo(video, now);
        sourceKind = "video";
      } else {
        throw error;
      }
    }

    let landmarks = result.landmarks || [];
    let handedness = result.handednesses || [];
    if (sourceKind === "roi" && landmarks.length && this.lastCrop) {
      landmarks = landmarks.map((hand) =>
        mapCropLandmarks(hand, this.lastCrop));
    }

    this.hands = landmarks.length;
    this.usingRoi = sourceKind === "roi" && landmarks.length > 0;
    this.usingBoost = sourceKind === "boost";
    if (landmarks.length) {
      this.noHandFrames = 0;
      this.lastBbox = bboxOf(landmarks[0]);
    } else {
      this.noHandFrames++;
      if (this.enabled && this.noHandFrames >= LOWQ.noHandFramesToStepDown) {
        this.stepConfidenceDown();
      }
    }
    this.updateMode();
    return { skipped: false, landmarks, handedness, source: sourceKind };
  }
}
