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

from dataclasses import dataclass
from typing import Any, Sequence

import cv2
import numpy as np
import supervision as sv
import torch  # type: ignore[import-not-found]
from sports.common.team import TeamClassifier  # type: ignore[import-not-found]


# Crop tightening factor — must match the notebook (factor=0.4 in v2 cell 42). This
# trims the bounding box inward so the crop is mostly torso + jersey, not background.
JERSEY_CROP_FACTOR = 0.4


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

    def _anchor(self, raw: int) -> int:
        return (1 - raw) if self.swap else raw

    def predict(self, crops: Sequence[np.ndarray]) -> list[int]:
        """Predict an anchored team id (0 or 1) for each crop."""
        if not crops:
            return []
        raw = self.classifier.predict(list(crops))
        return [self._anchor(int(t)) for t in raw]


def _mean_brightness(crops: Sequence[np.ndarray]) -> float:
    """Mean grayscale brightness across a list of BGR crops (0..255)."""
    if not crops:
        return 0.0
    means = [float(cv2.cvtColor(c, cv2.COLOR_BGR2GRAY).mean()) for c in crops]
    return sum(means) / len(means)


def fit_anchored(crops: Sequence[np.ndarray], device: str | None = None) -> AnchoredTeamClassifier:
    """Fit a TeamClassifier and anchor cluster labels by jersey brightness.

    Mirrors Player-Detection-v2 cell 42's fit step (``team_classifier.fit(crops)``),
    then adds the anchoring layer.
    """
    if not crops:
        raise ValueError("fit_anchored requires at least one crop")
    dev = device or ("cuda" if torch.cuda.is_available() else "cpu")
    clf = TeamClassifier(device=dev)
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

    crops: list[np.ndarray] = []
    frame_generator = sv.get_video_frames_generator(str(video_path), stride=stride)
    for frame in frame_generator:
        result = detector.predict(frame, conf=conf, iou=iou, verbose=False)[0]
        det = sv.Detections.from_ultralytics(result)
        det = det[det.class_id == player_class_id]
        for box in sv.scale_boxes(xyxy=det.xyxy, factor=crop_factor):
            crops.append(sv.crop_image(frame, box))
    return crops


def predict_at_release_frame(
    anchored: AnchoredTeamClassifier,
    video_path: str,
    release_frame: int,
    shooter_bbox: Sequence[float] | None,
    *,
    crop_factor: float = JERSEY_CROP_FACTOR,
) -> int | None:
    """Re-classify the shooter team directly from their jersey at the release frame.

    Used by the bridge to override the cached per-track team vote when BoT-SORT has
    shuffled track identities during a play. Returns the anchored team id (0 or 1)
    or None when the crop can't be obtained.
    """
    if shooter_bbox is None:
        return None
    capture = cv2.VideoCapture(str(video_path))
    try:
        capture.set(cv2.CAP_PROP_POS_FRAMES, int(release_frame))
        ok, frame = capture.read()
    finally:
        capture.release()
    if not ok or frame is None:
        return None

    crop_box = sv.scale_boxes(xyxy=np.array([shooter_bbox], dtype=float), factor=crop_factor)[0]
    crop = sv.crop_image(frame, crop_box)
    if crop is None or crop.size == 0:
        return None
    return anchored.predict([crop])[0]
