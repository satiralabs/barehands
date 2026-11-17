# Measurement report: user-split validation and new poses

Stream: measurement only. Copy: `~/workspace/barehands-ws/ml` at d6571c6 (v1.1.0).
Engine, stage and Lab untouched. Nothing pushed.

## 1. User-split validation

### Do the image paths contain user IDs?
No. Paths are `hagrid_30k/train_val_<class>/<uuid>.jpg` (31,833 images, 18 classes).
But the annotation files in the same zip, `ann_train_val/<class>.json`, carry a
`user_id` (64-hex hash) per image, plus labels and leading hand. So user-split
validation was possible through the annotations, not through the paths.

### Method
- Intersected the 13 mapped-class annotations with the images present in the
  sample zip (single-label entries only). 5,799 distinct users; 167 cover 10+
  classes.
- Picked test users = top 8 by class coverage, train users = next 12. All 20
  cover all 13 mapped classes. Cap 5 images per (user, class).
- Manifest: 801 images (test 353, train 448). Ran the LOCAL
  `hand_landmarker.task` (mediapipe 1.2.3, venv python, CPU) on every image;
  largest-area hand kept. Landmarks converted to engine features with the real
  engine code (`tools/extract_features.mjs`), labels mapped with
  `tools/build_user_split.py`.
- Retrained with `tools/train_gesture_classifier.py` on the 12 train users,
  evaluated with `tools/evaluate_classifier.py` on the 8 held-out users.

### Landmarker detection (the honest pipeline number)
- 618 of 801 images yielded a hand: **77.2%**. 183 no-hand, 5 multi-hand.
- Per class: call 81-90%, palm 74-84%, stop 80-83%, ok 81-86%, worst
  one/test 52.4%, fist/test 60.0%. Accuracy below is conditional on detection.
- Train set: 359 frames / 12 users. Test set: 259 frames / 8 users. User sets
  verified disjoint. `little_finger` has NO images in the 30k sample at all
  (no annotation file, no images), so it could not be validated here.

### Results: retrained classifier on held-out users (259 frames)
Top-1 accuracy **94.2%** (244/259).

| label | support | precision | recall |
|---|---|---|---|
| call | 27 | 1.000 | 0.889 |
| fist | 18 | 0.895 | 0.944 |
| open | 47 | 0.958 | 0.979 |
| pinch | 25 | 1.000 | 1.000 |
| point | 11 | 0.625 | 0.909 |
| rock | 20 | 1.000 | 0.800 |
| thumbsDown | 17 | 0.889 | 0.941 |
| thumbsUp | 20 | 1.000 | 0.950 |
| victory | 74 | 0.986 | 0.946 |

Worst confusions: rock -> point 4, victory -> fist 2. `claw` and
`littleFinger` skipped by the trainer (<20 positives; littleFinger absent).

### Cross-checks
- OLD sample-split model (`data/model_hagrid.json`, trained on the skeleton
  export) scored on the same held-out users: **94.6%** top-1.
- NEW user-split model scored on the OLD sample-split test (1,287 frames):
  **82.7%**, driven by littleFinger (83 frames, zero trained positives, all
  predicted rock/fist/call). Point precision 0.547, rock precision 0.570 on
  that set: the rock/point confusion is the persistent weak spot.
- Rule poses on held-out users (`tools/evaluate_poses.mjs`, 259 frames):
  fist 72% recall / 1.7% false-fire, point 100% / 2.8%, victory 91% / 0.0%,
  rock 80% / 0.8%, call 89% / 0.4%, thumbsUp 85% / 2.1%, thumbsDown 76% /
  0.0%, fingerCount exact 81%. Comparable to hagrid_500 (15,855 frames):
  fist 74/3.4, point 89/11.2, victory 88/7.3, rock 87/0.4, call 77/0.5,
  thumbsUp 83/1.2, thumbsDown 80/0.2, fingerCount 71%.
- extArch sweep on held-out users: best 1.45 (mean F1 0.744) vs shipped 1.30
  (0.737). Difference is noise on 259 frames; no profile change recommended.

### Verdict: productionReady stays FALSE
The user-split number (94.2%) is ABOVE the old sample-split number (89.3%),
so the old number was not flattered by user leakage; the skeleton-export test
set was simply harder. But productionReady cannot change yet:
- Only 8 held-out users and 259 frames (95% CI roughly 91-97%).
- littleFinger and claw have no held-out-user evidence at all.
- Detection is 77.2%: a quarter of photos yield no landmarks, and accuracy
  above is conditional on detection.
- Point precision 0.625 (rock fires as point) is a real failure mode.
- Test users are HaGRID contributors in similar photo conditions, not live
  webcam frames (lighting, distance, motion blur untested).

## 2. More poses (hagrid_500.json, 15,855 frames)

Tool: `tools/evaluate_candidates.mjs` (what the current rules fire as, per
class) plus `tools/finger_arch_table.mjs` (per-finger arch medians and
above-threshold rates). Thresholds: fingers > 1.30 extended, thumb > 1.50.

### Safe to add
1. **three** (canonical class `three` only). Rule: index+middle+ring
   extended, pinky folded, thumb ignored. Recall **85.7%** on `three`
   (n=460); false-fire peace 1.1%, two_up 0.9%, two_up_inverted 2.5%, rock
   0.6%, one 0.2%. Adding a thumb-folded condition drops recall to 47.4%,
   so the rule must NOT include the thumb. Do NOT map `three2` (fires
   victory 92%), `three3` (index+middle+pinky, fires open 90%) or `three_gun`
   (fires victory 86%): they are different finger patterns that collide with
   victory.
2. **stop_inverted -> open**. Fires open **92%** already (n=458); all four
   fingers ~100% extended, same shape as `stop`. Extend the open mapping.

### Marginal
3. **four**. Rule: 4 fingers extended + thumb folded. At f4 <= 1.50 recall
   79.7% but false-fire stop 29.3%, stop_inverted 52.4% (unacceptable). At
   strict f4 <= 1.25 recall 52.9%, false-fire stop 1.8%, stop_inverted 7.4%,
   palm 0.0%. Add only with the strict cut, or hold for a better thumb
   feature. Note: `four` currently fires open 94%.

### Do NOT add
- `point` (HaGRID class): NOT index-only. Index extended only 60%,
  middle/ring/pinky 72-75%. Fires open 45%, nothing 29%. `one` stays the
  point class.
- `mute`: fires point 59% (middle extended 26% vs 10% for `one`: too close
  to separate).
- `thumb_index`, `thumb_index2`, `take_picture`: fire point 88-98%;
  finger-identical to point plus thumb.
- `xsign`: fires fist 81%; finger-identical to fist.
- `middle_finger`: no clean pattern; fires pinch 34%, nothing 51%.
- `grip` (nothing 67%), `grabbing` (open 65%, mixed counts),
  `hand_heart`/`hand_heart2` (two-hand; nothing ~50%), `holy`/`timeout`
  (open-shaped, two-hand/prayer), `no_gesture` (not a pose; fires open 69%,
  an open false-fire source).

### Rule gap found (measurement only, not fixed here)
The `littleFinger` rule is `!index && !middle && !ring && pinky` with NO
thumb condition, so it fires on **80% of `call` frames** (call is
thumb+pinky). On held-out users its false-fire rate was 9.7%, driven by
call. Follow-up: add a thumb-folded condition to the littleFinger rule.

## 3. Commands (all run in this copy)

```
python3 tools/extract_user_sample.py data/raw/hagrid-sample-30k-384p.zip \
  /tmp/hagrid_ann/hagrid-sample-30k-384p/ann_train_val \
  data/user_sample_manifest.json data/user_sample_users.json \
  --test-users 8 --train-users 12 --per-class 5
LD_LIBRARY_PATH=~/workspace/barehands-ws/egl-libs \
  ~/workspace/barehands-p1/.venv/bin/python tools/run_hand_landmarker.py \
  data/user_sample_manifest.json data/raw/hagrid-sample-30k-384p.zip \
  data/models/hand_landmarker.task data/hagrid_user_sample.json
node tools/extract_features.mjs data/hagrid_user_sample.json
python3 tools/build_user_split.py data/hagrid_user_sample.json data/hagrid_usersplit
python3 tools/train_gesture_classifier.py data/hagrid_usersplit_train.json data/model_usersplit.json
python3 tools/evaluate_classifier.py data/model_usersplit.json data/hagrid_usersplit_test.json data/evaluation_usersplit.json
node tools/evaluate_candidates.mjs data/hagrid_500.json
node tools/finger_arch_table.mjs data/hagrid_500.json four stop palm stop_inverted three three2 three3 three_gun peace two_up rock one point mute
```

Environment note: this VM's /tmp was wiped between sessions, so the glvnd
EGL/GLESv2 libs the venv mediapipe needs were re-created from the Ubuntu
libegl1/libgles2/libglvnd0 1.7.0 debs at `~/workspace/barehands-ws/egl-libs/`
(persistent, outside this repo copy). Use that LD_LIBRARY_PATH for any
mediapipe rerun. The sample annotations were re-extracted to /tmp from the
zip; the manifest and user lists are committed under data/.

## 4. Files
- `tools/extract_user_sample.py`, `tools/run_hand_landmarker.py`,
  `tools/build_user_split.py`, `tools/evaluate_candidates.mjs`,
  `tools/finger_arch_table.mjs` (new)
- `data/hagrid_user_sample.json` (618 frames with userIds),
  `data/hagrid_usersplit_train.json` (359), `data/hagrid_usersplit_test.json`
  (259), `data/hagrid_usersplit_test_hagridlabels.json` (259, HaGRID labels
  for the rule evaluator), `data/model_usersplit.json`,
  `data/evaluation_usersplit.json`, `data/user_sample_manifest.json`,
  `data/user_sample_users.json`
- `REPORT.md` (this file)

## 5. Open items
- littleFinger: no HaGRID sample images exist for it; needs Lab recordings
  with userIds (or the full HaGRID set) before any held-out-user claim.
- claw: no HaGRID class maps to it; same gap.
- Detection rate 77.2% on still photos: measure it on live webcam frames
  before trusting the pipeline end to end.
- The littleFinger/call rule overlap and the rock/point confusion need a
  fix pass in the engine (another stream; not done here).
