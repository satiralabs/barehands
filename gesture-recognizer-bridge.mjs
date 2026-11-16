// Optional bridge to Google's MediaPipe Gesture Recognizer — a
// pretrained model (7 static gestures + handedness) that runs fully
// on-device via Tasks Vision WASM. It is a SHADOW layer: it never
// drives the board. Its job is to cross-check the engine's rule poses
// live, so disagreements can be logged and the rules (or a future
// trained model) improved with real evidence.
//
// Setup (all local, nothing phones home at runtime):
//   1. Download the model once:
//        tools/fetch_assets.sh        (or fetch_assets.ps1 on Windows)
//      -> data/models/gesture_recognizer.task  (~8 MB, Apache-2.0)
//   2. Serve the project with server.py as usual and open the board
//      or Lab with ?shadow=1 — or call createShadowRecognizer()
//      from your own page code.
//
// The Tasks Vision library itself is loaded from the same CDN the
// board already uses for the HandLandmarker; to run with no network
// at all, vendor vision_bundle.mjs next to this file and pass
// visionUrl accordingly.

export const MODEL_GESTURE_TO_POSE = Object.freeze({
  Open_Palm: "open",
  Closed_Fist: "fist",
  Thumb_Up: "thumbsUp",
  Thumb_Down: "thumbsDown",
  Victory: "victory",
  Pointing_Up: "point",
  ILoveYou: "rock",
  None: null
});

const DEFAULT_VISION_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
const DEFAULT_WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

// Create a shadow recognizer. Returns null (with a console warning)
// when the model file is missing or Tasks Vision fails to load —
// the board must never break because the shadow layer is absent.
// onResult({pose, gesture, score, handedness, disagreements}) fires
// per recognized frame; disagreements lists engine pose names the
// rules did NOT raise while the model did (and vice versa is left
// to the caller, who owns the rule output).
export async function createShadowRecognizer({
  modelUrl = "data/models/gesture_recognizer.task",
  visionUrl = DEFAULT_VISION_URL,
  wasmRoot = DEFAULT_WASM_ROOT,
  minScore = 0.5,
  onResult = null
} = {}) {
  let GestureRecognizer, FilesetResolver;
  try {
    ({ GestureRecognizer, FilesetResolver } = await import(visionUrl));
    const fileset = await FilesetResolver.forVisionTasks(wasmRoot);
    const recognizer = await GestureRecognizer.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: modelUrl },
      runningMode: "VIDEO",
      numHands: 2
    });
    return {
      // video: the HTMLVideoElement; nowMs: performance.now() clock.
      // rulePoses: the engine's classifyRuleBased output for the
      // primary hand this frame (optional).
      recognize(video, nowMs, rulePoses = null) {
        const result = recognizer.recognizeForVideo(video, nowMs);
        const top = result?.gestures?.[0]?.[0];
        if (!top || top.score < minScore) return null;
        const pose = MODEL_GESTURE_TO_POSE[top.categoryName] ?? null;
        const handedness = result?.handedness?.[0]?.[0]?.categoryName ?? null;
        let disagreements = null;
        if (pose && rulePoses) {
          disagreements = rulePoses[pose] ? [] : [pose];
        }
        const out = { pose, gesture: top.categoryName,
          score: top.score, handedness, disagreements };
        if (onResult) onResult(out);
        return out;
      },
      close() { recognizer.close(); }
    };
  } catch (error) {
    console.warn("shadow gesture recognizer unavailable:", error);
    return null;
  }
}
