import assert from "node:assert/strict";
import {
  LOWQ, LowQualityPipeline, buildLadder, mapCropLandmarks, meanLuma,
  openCameraWithLadder,
} from "../vendor/camera-pipeline.mjs";

// ---- pure helpers ----

assert.deepEqual(buildLadder(1920, 1080), [
  [1920, 1080], [1280, 720], [640, 480], [320, 240], null,
]);
assert.deepEqual(buildLadder(1280, 720), [
  [1280, 720], [640, 480], [320, 240], null,
]);
assert.deepEqual(buildLadder(640, 480), [[640, 480], [320, 240], null]);

// White pixel = 255, black = 0, mid grey = 128.
assert.equal(meanLuma(new Uint8ClampedArray([255, 255, 255, 255])), 255);
assert.equal(meanLuma(new Uint8ClampedArray([0, 0, 0, 255])), 0);
assert.ok(Math.abs(meanLuma(new Uint8ClampedArray([128, 128, 128, 255])) - 128) < 0.001);
assert.equal(
  meanLuma(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255])), 127.5);

const mapped = mapCropLandmarks(
  [{ x: 0.5, y: 0.5, z: 0.1 }],
  { x: 0.2, y: 0.1, w: 0.4, h: 0.6 });
assert.equal(mapped[0].x, 0.4);
assert.equal(mapped[0].y, 0.4);
assert.equal(mapped[0].z, 0.1);

// ---- ladder: steps down on OverconstrainedError, stops on denial ----

const overconstrained = () => {
  const error = new Error("overconstrained");
  error.name = "OverconstrainedError";
  throw error;
};
const denied = () => {
  const error = new Error("denied");
  error.name = "NotAllowedError";
  throw error;
};
const fakeTrack = (w, h) => ({ getSettings: () => ({ width: w, height: h }) });

{
  let calls = 0;
  const mediaDevices = {
    async getUserMedia(constraints) {
      calls++;
      if (calls <= 1) overconstrained();
      return { getVideoTracks: () => [fakeTrack(640, 480)] };
    },
  };
  const opened = await openCameraWithLadder("cam-1", 1280, 720, { mediaDevices });
  assert.equal(calls, 2);
  assert.equal(opened.width, 640);
  assert.equal(opened.height, 480);
  assert.equal(opened.rung, "640x480");
}
{
  let calls = 0;
  const mediaDevices = {
    async getUserMedia() {
      calls++;
      denied();
    },
  };
  await assert.rejects(
    openCameraWithLadder(null, 1280, 720, { mediaDevices }),
    (error) => error.name === "NotAllowedError");
  assert.equal(calls, 1, "permission denial must not burn ladder rungs");
}
{
  // Final rung drops the device pin and the size ask.
  let lastConstraints = null;
  const mediaDevices = {
    async getUserMedia(constraints) {
      lastConstraints = constraints;
      if (constraints.video !== true) overconstrained();
      return { getVideoTracks: () => [fakeTrack(320, 240)] };
    },
  };
  const opened = await openCameraWithLadder("cam-9", 1280, 720, { mediaDevices });
  assert.equal(lastConstraints.video, true);
  assert.equal(opened.rung, "any");
}

// ---- pipeline: confidence steps down after no-hand frames, recovers ----

const fakeCanvas = () => {
  const calls = { drawImage: 0, getImageData: 0 };
  const ctx = {
    calls,
    filter: "none",
    drawImage() { calls.drawImage++; },
    getImageData() {
      calls.getImageData++;
      // Bright scene (luma 200), so low-light never triggers here.
      return { data: new Uint8ClampedArray([200, 200, 200, 255]) };
    },
  };
  return {
    width: 0, height: 0, ctx,
    getContext() { return ctx; },
  };
};
const fakeVideo = { videoWidth: 1280, videoHeight: 720, currentTime: 0 };
const noHandLandmarker = {
  setOptionsCalls: [],
  setOptions(options) { this.setOptionsCalls.push(options); },
  detectForVideo() { return { landmarks: [], handednesses: [] }; },
};

{
  const pipe = new LowQualityPipeline(noHandLandmarker, {
    createCanvas: fakeCanvas,
  });
  assert.equal(pipe.conf, 0.7);
  for (let i = 0; i < LOWQ.noHandFramesToStepDown; i++) {
    pipe.detect(fakeVideo, 1000 + i * 33);
  }
  assert.equal(pipe.conf, 0.5, "confidence steps down after no-hand frames");
  assert.deepEqual(noHandLandmarker.setOptionsCalls.at(-1),
    { minHandDetectionConfidence: 0.5 });
  assert.equal(pipe.status().mode, "adapted");
  // Another full stretch steps down to the floor, then stops.
  for (let i = 0; i < LOWQ.noHandFramesToStepDown * 2; i++) {
    pipe.detect(fakeVideo, 5000 + i * 33);
  }
  assert.equal(pipe.conf, LOWQ.confFloor);
  // Good quality for the recovery window steps it back up one level.
  pipe.detect(fakeVideo, 9000); // keep the pipeline ticking
  for (let i = 0; i < LOWQ.recoverFrames; i++) pipe.noteQuality(0.85);
  assert.equal(pipe.conf, 0.5);
}

// ---- pipeline: fps drop adds frame skipping, recovery removes it ----

{
  const pipe = new LowQualityPipeline(noHandLandmarker, {
    createCanvas: fakeCanvas,
  });
  let skipped = 0;
  let now = 1000;
  // 10 fps for long enough to earn skip levels.
  for (let i = 0; i < LOWQ.fpsLowFrames * 2 + 10; i++) {
    now += 100; // 10 fps
    const out = pipe.detect(fakeVideo, now);
    if (out.skipped) skipped++;
  }
  assert.ok(pipe.skip > 1, `expected frame skipping, got skip=${pipe.skip}`);
  assert.ok(skipped > 0, "some frames should have been skipped");
  // Back to 60 fps: skipping unwinds.
  for (let i = 0; i < 200; i++) {
    now += 16;
    pipe.detect(fakeVideo, now);
  }
  assert.equal(pipe.skip, 1);
}

// ---- pipeline: ROI crop is tried after a hand is lost, landmarks remap ----

{
  const hand = Array.from({ length: 21 }, (_, i) => ({
    x: 0.4 + i * 0.005, y: 0.4 + i * 0.005, z: 0,
  }));
  let detectCalls = 0;
  let sawCanvasSource = false;
  const landmarker = {
    setOptions() {},
    detectForVideo(source) {
      detectCalls++;
      // First call sees the hand; later calls only see it on the crop.
      if (detectCalls === 1) return { landmarks: [hand], handednesses: [{}] };
      if (source !== fakeVideo) {
        sawCanvasSource = true;
        // Landmarks inside the crop, centered.
        return {
          landmarks: [hand.map((p) => ({ x: 0.5, y: 0.5, z: 0 }))],
          handednesses: [{}],
        };
      }
      return { landmarks: [], handednesses: [] };
    },
  };
  const pipe = new LowQualityPipeline(landmarker, { createCanvas: fakeCanvas });
  pipe.detect(fakeVideo, 1000);
  assert.ok(pipe.lastBbox, "last hand box is remembered");
  // Lose the hand for the ROI threshold, on alternate frames.
  for (let i = 0; i < LOWQ.roiLostFrames + 2; i++) {
    pipe.detect(fakeVideo, 2000 + i * 33);
  }
  assert.ok(sawCanvasSource, "ROI crop was attempted after the hand was lost");
  assert.ok(pipe.hands === 1, "hand re-acquired through the crop");
  assert.equal(pipe.status().mode, "re-acquire");
}

// ---- pipeline: disabled mode is a plain pass-through ----

{
  const pipe = new LowQualityPipeline(noHandLandmarker, {
    createCanvas: fakeCanvas,
    enabled: false,
  });
  for (let i = 0; i < LOWQ.noHandFramesToStepDown * 2; i++) {
    pipe.detect(fakeVideo, 1000 + i * 33);
  }
  assert.equal(pipe.conf, 0.7);
  assert.equal(pipe.skip, 1);
  assert.equal(pipe.status().mode, "off");
}

console.log("camera pipeline tests passed");
