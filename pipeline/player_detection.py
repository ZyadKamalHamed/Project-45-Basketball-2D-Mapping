"""
Player detection — pipeline module.

Wraps 6-class YOLO detector and the BoT-SORT tracker calls used in his
`Player-Detection-and-Tracking-v2.ipynb`. The detector itself is the trained
`Player_detection.pt` checkpoint produced by sections 1–4 of that notebook; this
module never trains, only loads and runs.

Notebook cell references:
    - cell 5: class-id constants. `Abdo's REMAP` keeps the schema as
      0=ball, 1=ball-in-basket, 2=number, 3=player, 4=referee, 5=rim.
    - cell 44: full-video tracking loop. Uses `predict.track(persist=True, tracker=...)`
      with BoT-SORT (we use the same here for stability across plays).
"""

from __future__ import annotations

# Imports for typing, arrays, detection handling, and the YOLO model.
from pathlib import Path
from typing import Any

import numpy as np
import supervision as sv
from ultralytics import YOLO  # type: ignore[import-not-found]


# Project-local tracker config (BoT-SORT + ReID + anti-fragmentation tuning). Falls back
# to the Ultralytics stock "botsort.yaml" if the file is missing, so the module still runs
# on a fresh checkout that hasn't synced configs/.
_CUSTOM_TRACKER = Path(__file__).resolve().parent.parent / "configs" / "custom_botsort.yaml"
DEFAULT_TRACKER = str(_CUSTOM_TRACKER) if _CUSTOM_TRACKER.exists() else "botsort.yaml"


# Class IDs from Abdo's model. Centralised here so the bridge and shot_detection
# both reference the same source of truth.
CLASS_BALL = 0
CLASS_BALL_IN_BASKET = 1
CLASS_NUMBER = 2
CLASS_PLAYER = 3
CLASS_REFEREE = 4
CLASS_RIM = 5

# Classes we keep in the detection log fed to shot detection. Numbers and referees
# add noise without informing make/miss / shooter selection.
KEEP_CLASSES_FOR_SHOT_DETECTION = (CLASS_BALL, CLASS_BALL_IN_BASKET, CLASS_PLAYER, CLASS_RIM)


# Load the trained player-detection YOLO model from a weights file.
def load_player_model(weights_path: str) -> YOLO:
    """Load the trained Player_detection.pt model.

    Mirrors how Player-Detection-v2 cell 17 instantiates YOLO. The model file is the
    same `best.pt` checkpoint produced by training in sections 1–4.
    """
    return YOLO(str(weights_path))


# Detect and track objects on a single frame using BoT-SORT.
def track_frame(
    player_model: YOLO,
    frame: np.ndarray,
    *,
    conf: float = 0.25,
    iou: float = 0.5,
    tracker: str = DEFAULT_TRACKER,
) -> sv.Detections:
    """Run player detection + BoT-SORT tracking on one frame.

    Mirrors the per-frame call inside Player-Detection-v2 cell 44's `callback_team`.
    `persist=True` is critical: it tells Ultralytics to keep BoT-SORT state between
    calls, otherwise every frame gets fresh track IDs and trajectory analysis breaks.
    """
    result = player_model.track(
        frame,
        persist=True,
        tracker=tracker,
        conf=conf,
        iou=iou,
        verbose=False,
    )[0]
    return sv.Detections.from_ultralytics(result)


# Keep only the player-class detections.
def filter_to_players(detections: sv.Detections) -> sv.Detections:
    """Keep only detections of the player class. Mirrors Player-Detection-v2 cell 31's
    class filter."""
    return detections[detections.class_id == CLASS_PLAYER]


# Keep only the classes that feed into shot detection.
def filter_to_shot_detection_classes(detections: sv.Detections) -> sv.Detections:
    """Keep ball / ball-in-basket / player / rim. Used when serialising the per-frame
    detection log that gets fed into `pipeline.shot_detection.detect_shots`."""
    return detections[np.isin(detections.class_id, list(KEEP_CLASSES_FOR_SHOT_DETECTION))]


# Turn one detection into the plain dict shape shot detection expects.
def detection_to_record(
    detections: sv.Detections,
    index: int,
    frame_index: int,
) -> dict:
    """Serialise one detection at row `index` into the dict shape `shot_detection`
    expects on its `detection_records` input. Matches the schema Ilias's notebook
    uses for its JSONL detection log."""
    tid = detections.tracker_id[index] if detections.tracker_id is not None else None
    return {
        "frame": int(frame_index),
        "class_id": int(detections.class_id[index]),
        "bbox_xyxy": [float(v) for v in detections.xyxy[index]],
        "conf": float(detections.confidence[index]) if detections.confidence is not None else 0.0,
        "track_id": int(tid) if tid is not None and not np.isnan(tid) else None,
    }
