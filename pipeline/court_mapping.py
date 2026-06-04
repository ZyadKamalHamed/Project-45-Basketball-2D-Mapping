"""
Court vision mapping (CVM) — pipeline module.

Mirrors the inference half of `CVM_notebook.ipynb` (Zyad's notebook). The notebook
trains a 33-keypoint pose model that detects court vertices on a broadcast frame;
this module wraps the steps the notebook uses to turn those keypoints into a
homography, and then to project image-space points (e.g. a player's feet) into
real-world court coordinates in NBA feet.

The same `sports` library primitives the notebook uses are used here:
    - `sports.basketball.CourtConfiguration` (League.NBA, MeasurementUnit.FEET)
    - `sports.basketball.draw_court` for the top-down court PNG
    - `sports.common.view.ViewTransformer` for the homography itself

Notebook cell references:
    - cell 13: load CVM pose model + run on a frame, mask vertices by confidence.
    - cell 14: build `CourtConfiguration` and call ``ViewTransformer`` from the
      visible court_landmarks ↔ frame_landmarks pair.
    - cell 15: full-frame player→court projection over the whole clip.
"""

from __future__ import annotations

# Standard library and third-party imports for arrays, detections, and the homography helper.
from dataclasses import dataclass
from typing import Any

import numpy as np
import supervision as sv
from sports.common.view import ViewTransformer  # type: ignore[import-not-found]


# Minimum court keypoints needed to solve a homography. cv2.findHomography needs at
# least 4 non-degenerate correspondences. CVM_notebook uses the same threshold.
MIN_VISIBLE_VERTICES = 4


# Holds the court vertices the pose model detected on one frame.
@dataclass
class CourtKeypoints:
    """Result of running the CVM pose model on a single frame."""

    landmarks_mask: np.ndarray   # bool array over the 33 court vertices
    frame_landmarks: np.ndarray  # (N, 2) image-space points for the visible vertices

    # Count how many of the 33 court vertices were seen with enough confidence.
    @property
    def visible_count(self) -> int:
        return int(np.count_nonzero(self.landmarks_mask))


# Run the CVM pose model on a frame and keep only the confident court vertices.
def detect_court_keypoints(
    cvm_model: Any,
    frame: np.ndarray,
    *,
    conf: float = 0.30,
    anchor_conf: float = 0.50,
) -> CourtKeypoints | None:
    """Run the CVM pose model on a frame and return the high-confidence vertices.

    Mirrors CVM_notebook cell 13: predict → ``sv.KeyPoints.from_ultralytics`` →
    keep only vertices above ``anchor_conf``. Returns None when the model returned
    no keypoints at all (e.g. crowd shots, replays).
    """
    # Run inference and wrap the raw output as supervision keypoints.
    result = cvm_model.predict(frame, conf=conf, verbose=False)[0]
    key_points = sv.KeyPoints.from_ultralytics(result)
    if key_points.confidence is None or len(key_points.confidence) == 0:
        return None
    # Keep only vertices above the anchor threshold and bail out if too few remain.
    landmarks_mask = key_points.confidence[0] > anchor_conf
    if int(np.count_nonzero(landmarks_mask)) < MIN_VISIBLE_VERTICES:
        return None
    frame_landmarks = key_points[:, landmarks_mask].xy[0]
    return CourtKeypoints(landmarks_mask=landmarks_mask, frame_landmarks=frame_landmarks)


# Build the image-to-court homography from the visible court vertices.
def build_homography(
    court_config: Any,
    keypoints: CourtKeypoints,
) -> ViewTransformer:
    """Build the image → court homography from visible court vertices.

    Mirrors CVM_notebook cell 14: take the ``CourtConfiguration.vertices`` for the
    vertices the pose model saw, and pass the (source=frame, target=court) pair to
    ``ViewTransformer`` (which wraps ``cv2.findHomography`` under the hood).
    """
    court_landmarks = np.array(court_config.vertices)[keypoints.landmarks_mask]
    return ViewTransformer(source=keypoints.frame_landmarks, target=court_landmarks)


# Project every player's feet position from image space into court coordinates.
def project_players_to_court(
    transformer: ViewTransformer,
    player_detections: sv.Detections,
) -> np.ndarray:
    """Project each player's bottom-center anchor into court coords.

    Mirrors CVM_notebook cell 15: ``detections.get_anchors_coordinates(BOTTOM_CENTER)``
    followed by ``transformer.transform_points()``. Returns an (N, 2) array of
    court-space (x, y) in feet.
    """
    anchors = player_detections.get_anchors_coordinates(anchor=sv.Position.BOTTOM_CENTER)
    return transformer.transform_points(points=anchors)


# Project a single image-space point into court coordinates.
def project_point_to_court(
    transformer: ViewTransformer,
    image_xy: tuple[float, float],
) -> tuple[float, float]:
    """Project a single (x, y) point in image coords to court coords. Convenience wrapper."""
    pt = transformer.transform_points(points=np.array([[image_xy[0], image_xy[1]]], dtype=float))[0]
    return float(pt[0]), float(pt[1])
