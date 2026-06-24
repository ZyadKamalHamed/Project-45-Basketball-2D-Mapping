"""
Team classification — pipeline module.

Wraps the unsupervised jersey-cluster TeamClassifier used in both Abdo's
`Player-Detection-and-Tracking-v2.ipynb` (cell 42 — the "Team Assignment" section)
and Zyad's `CVM_notebook.ipynb` (the team-classifier section). Same library, same
fit-stride pattern, same `predict()` semantics.

Two helpers built on top of that for the bridge:
    - `fit_anchored`: stabilises the random KMeans cluster labels so `team_0` is
      always the darker-jersey cluster on a given clip. Without this, "team 0" might
      be the Celtics one run and the Knicks the next.
    - `predict_at_release_frame`: re-classifies a shooter directly from their crop at
      the shot release moment, used by the bridge to override the cached per-track team
      vote (BoT-SORT track ID swaps would otherwise mis-attribute the shot).
"""

from __future__ import annotations

# Imports for typing, image handling, arrays, the device check, and the team classifier.
from dataclasses import dataclass
from typing import Any, Sequence

import cv2
import numpy as np
import supervision as sv
import torch  # type: ignore[import-not-found]
import umap  # type: ignore[import-not-found]
from sklearn.cluster import KMeans
from sports.common.team import TeamClassifier  # type: ignore[import-not-found]


# Crop tightening factor — must match the notebook (factor=0.4 in v2 cell 42). This
# trims the bounding box inward so the crop is mostly torso + jersey, not background.
JERSEY_CROP_FACTOR = 0.4


# Wraps a fitted classifier so the darker-jersey cluster is always team 0.
@dataclass(frozen=True)
class AnchoredTeamClassifier:
    """Wraps a fitted TeamClassifier with a deterministic cluster→team mapping.

    The KMeans inside TeamClassifier picks cluster IDs randomly per run. After fitting
    we look at each cluster's mean jersey brightness across the fitting crops, then
    fix the mapping so the *darker* cluster is always reported as ``0`` and the
    *brighter* cluster as ``1``. This makes team labels stable across runs of the
    same clip without needing user input or roster colour matching.
    """

    classifier: TeamClassifier
    swap: bool  # True → swap raw 0↔1 to enforce darker=0

    # Map a raw cluster id to the anchored team id, flipping it when needed.
    def _anchor(self, raw: int) -> int:
        return (1 - raw) if self.swap else raw

    # Predict an anchored team id for each jersey crop.
    def predict(self, crops: Sequence[np.ndarray]) -> list[int]:
        """Predict an anchored team id (0 or 1) for each crop."""
        if not crops:
            return []
        raw = self.classifier.predict(list(crops))
        return [self._anchor(int(t)) for t in raw]


# Average grayscale brightness across a list of jersey crops.
def _mean_brightness(crops: Sequence[np.ndarray]) -> float:
    """Mean grayscale brightness across a list of BGR crops (0..255)."""
    if not crops:
        return 0.0
    means = [float(cv2.cvtColor(c, cv2.COLOR_BGR2GRAY).mean()) for c in crops]
    return sum(means) / len(means)


# Fit the classifier and decide the brightness-based cluster mapping.
def fit_anchored(crops: Sequence[np.ndarray], device: str | None = None) -> AnchoredTeamClassifier:
    """Fit a TeamClassifier and anchor cluster labels by jersey brightness.

    Mirrors Player-Detection-v2 cell 42's fit step (``team_classifier.fit(crops)``),
    then adds the anchoring layer.
    """
    if not crops:
        raise ValueError("fit_anchored requires at least one crop")
    # Pick a device and fit the underlying TeamClassifier on the crops.
    dev = device or ("cuda" if torch.cuda.is_available() else "cpu")
    clf = TeamClassifier(device=dev)
    # Seed the dimensionality reducer and clusterer so the same clip produces the same two
    # clusters and the same darker/brighter anchor on every run. The stock TeamClassifier
    # leaves UMAP and KMeans unseeded, so otherwise the whole clip's team labels can invert
    # (team_0 ↔ team_1) from one run to the next on identical input.
    clf.reducer = umap.UMAP(n_components=3, random_state=42)
    clf.cluster_model = KMeans(n_clusters=2, random_state=42, n_init=10)
    clf.fit(list(crops))

    # Look at which cluster the fit crops landed in, group them, and compute mean
    # brightness per cluster. Whichever cluster is brighter gets flipped to ID 1.
    raw_predictions = clf.predict(list(crops))
    cluster_crops: dict[int, list[np.ndarray]] = {0: [], 1: []}
    for crop, raw in zip(crops, raw_predictions):
        cluster_crops[int(raw)].append(crop)
    brightness_0 = _mean_brightness(cluster_crops[0])
    brightness_1 = _mean_brightness(cluster_crops[1])
    swap = brightness_0 > brightness_1
    return AnchoredTeamClassifier(classifier=clf, swap=swap)


# Sample jersey crops across a video to use as fitting data for the classifier.
def collect_fit_crops(
    video_path: str | None = None,
    detector: Any = None,
    *,
    stride: int = 30,
    player_class_id: int = 3,
    conf: float = 0.25,
    iou: float = 0.5,
    crop_factor: float = JERSEY_CROP_FACTOR,
) -> list[np.ndarray]:
    """Sample jersey crops from across a video for fitting the classifier.

    Mirrors Player-Detection-v2 cell 42's collection loop: walk the video at a fixed
    stride, run the player detector, filter to the player class, tighten each box to
    its torso, and crop. Returns the flat list of crops.
    """
    if video_path is None or detector is None:
        raise ValueError("video_path and detector are required")

    # Walk the video at a fixed stride, detect players, and crop each torso.
    crops: list[np.ndarray] = []
    frame_generator = sv.get_video_frames_generator(str(video_path), stride=stride)
    for frame in frame_generator:
        result = detector.predict(frame, conf=conf, iou=iou, verbose=False)[0]
        det = sv.Detections.from_ultralytics(result)
        det = det[det.class_id == player_class_id]
        for box in sv.scale_boxes(xyxy=det.xyxy, factor=crop_factor):
            crops.append(sv.crop_image(frame, box))
    return crops


# Re-read a shooter's team from their jersey across several frames and majority-vote.
def predict_team_multi_frame(
    anchored: AnchoredTeamClassifier,
    video_path: str,
    samples: Sequence[tuple[int, Sequence[float]]],
    *,
    crop_factor: float = JERSEY_CROP_FACTOR,
) -> int | None:
    """Classify the shooter's team from several (frame_index, bbox) samples and majority-vote.

    A single crop at the release frame is the worst moment to read a jersey (shooter
    mid-jump, ball occluding the torso, motion blur). Voting across a few frames where
    the shooter is visible is far more stable. The video is opened once and seeked per
    sample. Returns the majority anchored team id (0 or 1), or None when no usable crop
    could be taken from any sample.
    """
    if not samples:
        return None

    capture = cv2.VideoCapture(str(video_path))
    try:
        crops: list[np.ndarray] = []
        for frame_index, bbox in samples:
            if bbox is None:
                continue
            capture.set(cv2.CAP_PROP_POS_FRAMES, int(frame_index))
            ok, frame = capture.read()
            if not ok or frame is None:
                continue
            crop_box = sv.scale_boxes(xyxy=np.array([bbox], dtype=float), factor=crop_factor)[0]
            crop = sv.crop_image(frame, crop_box)
            if crop is None or crop.size == 0:
                continue
            crops.append(crop)
    finally:
        capture.release()

    if not crops:
        return None
    votes = anchored.predict(crops)
    if not votes:
        return None
    # Majority vote across the sampled frames. Tie-break deterministically toward the
    # lower team id so the same clip always resolves the same way run-to-run.
    counts = {t: votes.count(t) for t in set(votes)}
    most = max(counts.values())
    return min(t for t, c in counts.items() if c == most)


# Re-read a shooter's team straight from their jersey at the release frame.
def predict_at_release_frame(
    anchored: AnchoredTeamClassifier,
    video_path: str,
    release_frame: int,
    shooter_bbox: Sequence[float] | None,
    *,
    crop_factor: float = JERSEY_CROP_FACTOR,
) -> int | None:
    """Re-classify the shooter team directly from their jersey at the release frame.

    Thin wrapper over `predict_team_multi_frame` with a single sample, kept for callers
    that only have the release-frame crop. Returns the anchored team id (0 or 1) or None
    when the crop can't be obtained.
    """
    if shooter_bbox is None:
        return None
    return predict_team_multi_frame(
        anchored, video_path, [(int(release_frame), shooter_bbox)], crop_factor=crop_factor
    )
