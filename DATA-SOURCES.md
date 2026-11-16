# Local data & model sources (nothing here is committed to git)

Everything under `data/` was downloaded on 2026-11-16 for local
development and evaluation. Re-fetch with `tools/fetch_assets.sh`.

## Models — `data/models/`

| File | Source | License | Notes |
| --- | --- | --- | --- |
| `gesture_recognizer.task` (8.0 MB) | Google MediaPipe model zoo (`storage.googleapis.com/mediapipe-models`) | Apache-2.0 | Pretrained 7-gesture classifier; used only via `gesture-recognizer-bridge.mjs` in shadow mode |
| `hand_landmarker.task` (7.5 MB) | Google MediaPipe model zoo | Apache-2.0 | Full hand landmarker bundle; spare for offline experiments |

## Datasets — `data/raw/`, `data/*.json`

| File | Source | License | Notes |
| --- | --- | --- | --- |
| `raw/connoisseurs_hagrid_100.csv` (21 MB) | HF `GestureDetectionConnoisseurs/preprocessed_hand_skeletons` | HaGRID terms: CC BY-SA 4.0 | MediaPipe skeletons pre-extracted from HaGRID images; 3,400 rows (100/class × 34) |
| `raw/connoisseurs_hagrid_500.csv` (102 MB) | same | CC BY-SA 4.0 | 17,000 rows; converted to `hagrid_500.json` (15,855 usable) |
| `raw/hagrid-sample-30k-384p.zip` (~1 GB) | HF `cj-mills/hagrid-sample-30k-384p` | CC BY-SA 4.0 (stated on the dataset card) | HaGRID sample images, 384p; for spot-checking models on real photos |
| `raw/zycckz_gesture_data.parquet` (4.1 MB) | HF `ZycckZ/HandGesture_LandmarkCoordinates_Skeleton` | not stated on card — local use only, do not redistribute | Not used: pyarrow/numpy conflict on this machine; the HaGRID skeletons supersede it |
| `hagrid_100.json`, `hagrid_500.json` | converted by `tools/convert_hagrid_csv.py` + `tools/extract_features.mjs` | CC BY-SA 4.0 | barehands-landmarks/v1, first hand per image, engine features filled |
| `hagrid_mapped_train.json`, `hagrid_mapped_test.json` | `tools/build_training_set.py` | CC BY-SA 4.0 | Engine-label mapping, stratified 80/20 split **by sample** (the export has no user ids) |
| `model_hagrid.json` | `tools/train_gesture_classifier.py` | — | Trained on the train split; `productionReady` stays **false** until validated on held-out *users* |
| `evaluation_report.json` | `tools/evaluate_classifier.py` | — | Held-out sample-split metrics |

## Code references (not vendored)

- **fingerpose** (github.com/andypotato/fingerpose, MIT) — its
  per-finger curl/direction gesture descriptions informed the shape
  of the pose set; no code copied.
- **HaGRID / HaGRIDv2** (github.com/hukenovs/hagrid) — the dataset
  paper's class list defines the 34 ground-truth classes used here.

## Verification of the Google model (2026-11-16)

`tools/test_google_model.py` ran `gesture_recognizer.task` locally
(venv mediapipe 1.2.3; on this VM the C bindings need GL libraries —
extracted from Ubuntu glvnd .debs into /tmp and used via
`LD_LIBRARY_PATH`, no system install) against 30 HaGRID photos per
class: Open_Palm 97% (palm), Closed_Fist 85%, Thumb_Down 88%,
Victory 87%, Thumb_Up 81%, Pointing_Up 79%, stop→Open_Palm 76%,
ILoveYou 4% — Google's ILoveYou includes the thumb, HaGRID's rock
does not; a definition difference, not a model failure. The model
also found no hand at all in 27/240 photos.

## Checked but not used

- `Vincent-luo/hagrid-mediapipe-hands` and `MakiPan/Hagrid-mediapipe-hand-enc`
  on HF: full-HaGRID parquet shards with embedded images (~110 GB /
  ~104 GB total) — far too heavy for this machine's workflow.
- SHREC/DHG dataset site (telecom-lille.fr): unreachable from here.
- Kaggle-hosted sets (ASL Alphabet etc.): require an account; skipped
  on principle — everything above is account-free.
