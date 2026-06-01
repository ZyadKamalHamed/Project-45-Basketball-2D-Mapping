# DEFENSE_NOTES.md

Reference document for the UTS DLCNN A3 oral defense. Maps every piece of supporting
code back to the three deliverable notebooks, flags the small amount of novel code
with reasoning, and lists likely examiner questions with concise answers.

---

## 1. Architecture in one paragraph

The submission is **three notebooks** (the ML deliverable) plus a thin presentation
stack that lets a grader interact with the work without re-running the notebooks:

```
Uploaded video ─► scripts/analyze.py  (bridge orchestrator)
                       │
                       ├── pipeline/player_detection.py  ← Player-Detection-and-Tracking-v2.ipynb
                       ├── pipeline/court_mapping.py     ← CVM_notebook.ipynb
                       ├── pipeline/team_classification  ← Player-Detection-v2 (team-clustering section)
                       ├── pipeline/shot_detection.py    ← Shot-Detection-and-Tracking.ipynb
                       └── pipeline/geometry.py          ← NBA-rules court math (no notebook)
                       │
                       ▼
                  results.json (VideoAnalysis schema)
                       │
                       ▼
                  GUI (Next.js dashboard) — pure presentation
```

The bridge does not contain ML logic. It loads the trained weights produced by the
notebooks, walks an uploaded video, calls each pipeline module per frame, then writes
a JSON payload the GUI consumes.

---

## 2. Module → notebook map

| Pipeline module | Source notebook | Specific cells | What it does |
|---|---|---|---|
| `pipeline/player_detection.py` | `Player-Detection-and-Tracking-v2.ipynb` | Cell 5 (class IDs), Cell 17 (model load), Cell 44 (BoT-SORT tracking) | Loads Abdo's 6-class YOLO weights and runs `model.track(persist=True, tracker="botsort.yaml")` per frame. Exposes class-ID constants (`CLASS_BALL=0, CLASS_BALL_IN_BASKET=1, …`). |
| `pipeline/court_mapping.py` | `CVM_notebook.ipynb` | Cell 13 (single-frame keypoint inference), Cell 14 (`ViewTransformer` from visible landmarks), Cell 15 (full-video player→court projection) | Loads the CVM pose model, finds the 33 court vertices on each frame, masks to high-confidence vertices, fits a homography via `ViewTransformer` (which wraps `cv2.findHomography`), projects player anchors into court coords in NBA feet. |
| `pipeline/team_classification.py` | `Player-Detection-and-Tracking-v2.ipynb` | Cell 42 (`Team Assignment (Jersey Colour Clustering)`) | Uses `sports.common.team.TeamClassifier` (SigLIP embeddings → KMeans k=2) to cluster player jersey crops into the two on-court teams. Adds a brightness-anchored cluster label so team_0 is always the darker cluster on a given clip (see §3, novelty #1). Adds a `predict_at_release_frame` helper used for per-shot shooter re-classification (see §3, novelty #2). |
| `pipeline/shot_detection.py` | `Shot-Detection-and-Tracking.ipynb` | Whole notebook (cells 5, 12, 14, 16, 18, 20, 22) | Direct Python port of Ilias's notebook. Builds smoothed ball + rim trajectories with MAD outlier rejection and Savitzky–Golay smoothing, detects shot candidates by ball approaching the rim with a plausible upward-then-downward arc, classifies make / miss / unknown using the `ball-in-basket` class + a geometric hoop-plane crossing test, assigns the most likely shooter from nearby player detections. The only deviation is the aggregate scoring inside `_assign_likely_shooter` (see §3, novelty #3). |
| `pipeline/geometry.py` | *(no notebook — standard NBA court rules)* | n/a | Pure geometry: `is_three_pointer`, `nearest_basket`, `is_on_court`. Uses published NBA arc distances (23.75 ft above the break, 22 ft in the corners). |

---

## 3. Novel code register (the small non-notebook bits)

Everything in this section is **defensible deterministic logic** — no learned model
inside, just rules or a small algorithmic refinement of a notebook approach. Each item
is short enough to explain in two sentences.

### Novelty #1 — `team_classification.fit_anchored` (brightness anchor)

**What:** After `TeamClassifier.fit(crops)`, we compute the mean grayscale brightness
of each cluster's training crops. If cluster 0 ended up brighter than cluster 1, we
swap labels everywhere downstream so the *darker* cluster is always team_0.

**Why:** KMeans assigns cluster IDs randomly per run. Without the anchor, "team_0"
could be the Celtics one upload and the Knicks the next. The anchor makes the
mapping deterministic per clip and uses no ML — just OpenCV `cvtColor` + mean.

### Novelty #2 — `team_classification.predict_at_release_frame`

**What:** A helper that re-classifies the shooter's team directly from a crop of
the shooter's bounding box at the exact shot release frame.

**Why:** BoT-SORT occasionally swaps track IDs when players cluster around the rim.
The per-track cached team can therefore point at a track that *used to be* the
opposing team. Re-reading the jersey at the moment of release bypasses that error.

### Novelty #3 — Aggregate scoring in `_assign_likely_shooter`

**What:** Instead of picking the single (frame, player) pair with lowest
`distance + temporal_penalty`, we group detections by `tracker_id` over the lookback
window and score each track by `min_distance + 0.3 * mean_distance`. Player with the
lowest score wins.

**Why:** At the exact release moment the shooter has extended the ball *away* from
their torso, so a contesting defender can briefly be closer than the shooter. The
shooter is the player who got close to the ball *and stayed close* through the
holding phase — aggregating over the window finds that player. Falls back to the
notebook's per-frame logic when no track meets the observation threshold (short
clips, heavy occlusion).

### Novelty #4 — Team voting window per track (`TRACK_TEAM_LOCK_AFTER`)

**What:** Each new BoT-SORT track gets predicted 5 times before its team is locked
in. The locked value is the mode of those 5 predictions.

**Why:** Single-frame predictions can be noisy (mid-jump, partial occlusion, motion
blur). Voting over a small window lets bad single crops get out-voted while keeping
the cost low (5 inferences per track, not per frame).

### Novelty #5 — `pipeline/geometry.is_three_pointer`

**What:** Returns True for a court coord (x, y) when the distance to the nearest
basket is at least 23.75 ft, or at least 22 ft when the point is within 3 ft of a
sideline (corner zone).

**Why:** NBA arc rules. The corner three is shorter because the sideline truncates
the arc. This is deterministic court geometry, not learned — defended by referencing
the NBA rulebook.

### Novelty #6 — `scripts/analyze.py` (the orchestrator itself)

**What:** Argument parsing, weight existence check (with structured error JSON), the
per-frame loop that calls the pipeline modules in order, ffmpeg re-encode of the
annotated video, and the final JSON marshalling.

**Why:** Notebooks can't run inside the Next.js GUI; they're meant for SageMaker
iteration. The bridge is the minimum glue needed to invoke the same code path on an
uploaded MP4. No algorithmic logic — the file is ~450 lines and roughly half is
JSON-shape boilerplate.

---

## 4. GUI scope statement

The Next.js dashboard in `GUI/` is a **presentation layer**. It reads the
`VideoAnalysis` JSON that the bridge writes and renders:

- The uploaded video (with team-coloured detection boxes overlaid by the bridge).
- A top-down court image with O / X markers for makes / missed shots.
- Two team stat cards (FG%, 3P%, 2P%, points).
- A shot log table.

The only computation the GUI itself does:

- `GUI/src/lib/stats-utils.ts` — aggregates shots per team into FG% / 3P% / 2P%
  and computes a "POINTS" total as `2 × 2pt_makes + 3 × 3pt_makes`. Plain
  arithmetic, no ML.
- `GUI/src/components/dashboard/CourtMap.tsx` — filters shots by chip selections
  (team / type), scales court-coordinate (x, y) into the rendered court image pixel
  space. Pixel constants (scale=20 px/ft, padding=50 px) match the defaults of
  `sports.basketball.draw_court` so the overlay aligns with the PNG.

Nothing in the GUI re-runs the model. Nothing decides who scored. Everything
visible on screen comes from the JSON the bridge wrote.

---

## 5. Anticipated examiner questions

**Q: Why BoT-SORT instead of ByteTrack?**
BoT-SORT augments ByteTrack with a Re-ID branch (appearance features) that helps
maintain track IDs across occlusions. Basketball has constant occlusion, so the
extra branch is worth it. ByteTrack would have spawned more new IDs per game.

**Q: What's inside `TeamClassifier`?**
It's from `sports.common.team` (Roboflow's `sports` library). It runs each crop
through a frozen SigLIP vision encoder to get a 768-dim embedding, then KMeans
with k=2 over those embeddings. Returns 0 or 1 per crop. Unsupervised — works on
any two-team game without labels, but the 0/1 assignment is random, which is why
we add the brightness anchor (§3 novelty #1).

**Q: How does the court mapping work?**
The CVM pose model detects up to 33 known points on the court (corners, key
boundaries, free-throw lines, three-point intersections). For any frame with ≥4
of those points above the confidence threshold, we have ≥4 correspondences between
image-space (where the points are in the frame) and court-space (where they are in
NBA feet). `cv2.findHomography` (wrapped by `sports.common.view.ViewTransformer`)
solves for the 3×3 homography matrix that maps one to the other. Any player anchor
(bottom-center of their box) can then be transformed into court coords using that
matrix.

**Q: Why `conf=0.25` / `iou=0.5` / `imgsz=960` for the player detector?**
These match the values inside `Player-Detection-and-Tracking-v2.ipynb` (Abdo's
notebook cells 5 and 44). They're the values training was validated against. We
don't override them in the bridge.

**Q: Why `CVM_CONF=0.3` / `CVM_ANCHOR_CONF=0.5` for the court keypoints?**
`CVM_CONF` is the model-level confidence (whether to emit the keypoints at all).
`CVM_ANCHOR_CONF` is the per-vertex confidence — only vertices the model is 50%+
sure about get used in the homography. Values mirror CVM_notebook cell 13. A
homography fit from low-confidence anchors wobbles violently between frames.

**Q: How do you handle a corner three vs an above-the-break three?**
NBA rule: the corner three line is 22 ft from the basket (because the sideline
truncates the arc there). Above the break, the arc is 23.75 ft. `is_three_pointer`
checks whether the point is within ~3 ft of a sideline (corner zone) and uses the
22 ft threshold there; otherwise 23.75 ft. See `pipeline/geometry.py`.

**Q: How is "make" vs "miss" decided?**
Two complementary tests (`pipeline/shot_detection.py`, ported from
Shot-Detection-and-Tracking cell 18):
- If the player detector fires the `ball-in-basket` class (class 1) inside the rim
  bounding region within a window around the rim-approach frame, it's a make.
- Otherwise: solve for whether the smoothed ball trajectory descended through the
  rim's image-space y-plane while inside the rim's x-extent. If yes, make.
- If neither test triggers and the ball clearly moved away from the rim afterward,
  it's a miss. Otherwise it's classified `unknown` and the bridge drops it.

**Q: How is the shooter assigned?**
For each player track seen in the 18-frame lookback before release, we collect
`(frame, distance-to-ball, bbox)` tuples. Players needing ≥6 observations in the
window (filters defender flashes). For each surviving track we compute
`min_distance + 0.3 * mean_distance` and pick the lowest score. Falls back to the
notebook's per-frame heuristic when no track meets the threshold.

**Q: How do you handle teams flipping (team_0 vs team_1) between runs?**
Brightness anchoring (§3 novelty #1). After fitting we examine each cluster's mean
grayscale brightness; the darker cluster always becomes team_0. So the same clip
processed multiple times always reports the same team assignments.

**Q: What if the shooter is mis-identified?**
The team-attribution chain is shooter-selection → look up team → emit. We re-read
the shooter's jersey at the release frame regardless of the cached track team, so
even if BoT-SORT shuffled IDs mid-play, the team comes from the actual visible
jersey at the moment of release. If shooter selection itself is wrong (defender
picked, see §3 novelty #3), that's a known limitation; the aggregate window-based
scoring reduces but doesn't eliminate it.

**Q: Why three separate notebooks?**
Each team member owned one slice of the pipeline:
- Zyad — CVM (court vision mapping).
- Abdo — player detection + team clustering.
- Ilias — shot detection.

Splitting cleanly lets each member iterate without merge conflicts and lets the
oral defense map each person to specific cells.

**Q: Why a Next.js GUI rather than another notebook?**
Notebooks aren't a good way to demo interactive uploads to a grader. A web
dashboard is. The grader can drag in any clip and see the bridge run end-to-end.
All the modelling work is still in the notebooks; the GUI just reads the JSON the
bridge writes.

**Q: What's `pipeline/__init__.py` doing?**
It re-exports the five pipeline modules so the bridge can `from pipeline import
court_mapping, …` cleanly. No logic.
