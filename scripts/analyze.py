#!/usr/bin/env python3
"""
CourtVision analysis bridge.

Wraps the CVM + player-detection pipeline from `CVM_notebook.ipynb` and emits a JSON
file that conforms to the `VideoAnalysis` shape in `GUI/src/types/basketball.ts`.

Pass 1 scope:
  - Run the player detector on every Nth frame.
  - Run the court keypoint model on every Nth frame to build a homography.
  - Project player bottom-center anchors into court coordinates and accumulate per-track
    centroids so the GUI can render player metadata.
  - Emit `shots: []` (shot detection module lands later).

If either model weight is missing on disk, the script writes a structured error JSON
instead of crashing. The GUI route surfaces this to the user.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
import time
import traceback
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent

# Local weights the user committed alongside the repo.
CVM_MODEL_PATH = REPO_ROOT / "runs" / "CVM_Best.pt"
PLAYER_MODEL_PATH = REPO_ROOT / "Data" / "runs_abdo" / "Player_detection.pt"

# Sampling: 1 frame per N. Keeps Pass 1 fast on a CPU-only machine.
FRAME_STRIDE = 15
CVM_CONF = 0.3
CVM_ANCHOR_CONF = 0.5
PLAYER_CONF = 0.25
PLAYER_IOU = 0.5


def log(msg: str) -> None:
    """Stdout line — the Next.js route streams these to the dev server console."""
    print(msg, flush=True)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as f:
        json.dump(payload, f, indent=2)


def load_team_rosters() -> tuple[dict[int, str], dict[str, str]]:
    """Load TEAM_NAMES / TEAM_COLORS from `Data/Team.rosters.py` (non-standard filename)."""
    roster_path = REPO_ROOT / "Data" / "Team.rosters.py"
    spec = importlib.util.spec_from_file_location("team_rosters", roster_path)
    if spec is None or spec.loader is None:
        return {}, {}
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return getattr(module, "TEAM_NAMES", {}), getattr(module, "TEAM_COLORS", {})


def emit_error(out_path: Path, code: str, message: str) -> int:
    payload = {"error": code, "message": message}
    write_json(out_path, payload)
    log(f"[error] {code}: {message}")
    return 2


def main() -> int:
    parser = argparse.ArgumentParser(description="Run CVM + player detection on a video clip.")
    parser.add_argument("--video", required=True, help="Path to the input video file.")
    parser.add_argument("--out", required=True, help="Path to write the result JSON.")
    parser.add_argument("--analysis-id", default="", help="Analysis identifier (logging only).")
    args = parser.parse_args()

    video_path = Path(args.video).resolve()
    out_path = Path(args.out).resolve()

    if not video_path.exists():
        return emit_error(out_path, "video_missing", f"Video not found: {video_path}")

    # Verify model weights up front so the GUI shows a clean error on local dev hosts.
    if not CVM_MODEL_PATH.exists():
        return emit_error(
            out_path,
            "cvm_weights_missing",
            f"CVM weights not found at {CVM_MODEL_PATH.relative_to(REPO_ROOT)}. "
            "Train the CVM model or sync the SageMaker weights to run the bridge locally.",
        )

    if not PLAYER_MODEL_PATH.exists():
        return emit_error(
            out_path,
            "player_weights_missing",
            f"Player detection weights not found at {PLAYER_MODEL_PATH.relative_to(REPO_ROOT)}. "
            "Sync Abdo's weights to enable end-to-end analysis locally.",
        )

    # Heavy imports happen after the weights check so missing-deps errors don't mask the
    # more useful missing-weights message.
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore
        import supervision as sv  # type: ignore
        from ultralytics import YOLO  # type: ignore
        from sports.common.view import ViewTransformer  # type: ignore
        from sports.basketball import (  # type: ignore
            CourtConfiguration,
            League,
            draw_court,
        )
        from sports.basketball.config import MeasurementUnit  # type: ignore
    except ImportError as exc:
        return emit_error(
            out_path,
            "deps_missing",
            f"Python dependency missing: {exc.name or exc}. Install requirements.txt or "
            "run the CVM notebook's setup cell.",
        )

    log(f"[start] analysis_id={args.analysis_id or '?'} video={video_path.name}")
    t0 = time.time()

    team_names, team_colors = load_team_rosters()

    cvm_model = YOLO(str(CVM_MODEL_PATH))
    player_model = YOLO(str(PLAYER_MODEL_PATH))
    config = CourtConfiguration(league=League.NBA, measurement_unit=MeasurementUnit.FEET)

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        return emit_error(out_path, "video_open_failed", f"OpenCV could not open {video_path}")

    fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = total_frames / fps if fps > 0 else 0.0
    log(f"[meta] fps={fps:.2f} total_frames={total_frames} duration={duration:.1f}s")

    # Accumulators
    # track_id -> list of (x, y) court coords (NBA feet) and class_id observations
    per_track_points: dict[int, list[tuple[float, float]]] = {}
    per_track_classes: dict[int, list[int]] = {}
    # Per-frame samples — each entry is (source_frame_index, {tracker_id: (x, y)}). The
    # frame index lets the GUI map samples back to video timestamps (t = idx / fps) so
    # dots can animate in sync with playback.
    per_frame_samples: list[tuple[int, dict[int, tuple[float, float]]]] = []
    processed_frames = 0
    frame_index = 0

    while True:
        ok, frame = capture.read()
        if not ok:
            break
        if frame_index % FRAME_STRIDE != 0:
            frame_index += 1
            continue

        try:
            player_result = player_model.predict(
                frame, conf=PLAYER_CONF, iou=PLAYER_IOU, verbose=False
            )[0]
            detections = sv.Detections.from_ultralytics(player_result)
            if len(detections) == 0:
                frame_index += 1
                continue

            cvm_result = cvm_model.predict(frame, conf=CVM_CONF, verbose=False)[0]
            key_points = sv.KeyPoints.from_ultralytics(cvm_result)
            if key_points.confidence is None or len(key_points.confidence) == 0:
                frame_index += 1
                continue
            landmarks_mask = key_points.confidence[0] > CVM_ANCHOR_CONF
            if int(np.count_nonzero(landmarks_mask)) < 4:
                frame_index += 1
                continue

            court_landmarks = np.array(config.vertices)[landmarks_mask]
            frame_landmarks = key_points[:, landmarks_mask].xy[0]
            transformer = ViewTransformer(source=frame_landmarks, target=court_landmarks)

            anchors = detections.get_anchors_coordinates(anchor=sv.Position.BOTTOM_CENTER)
            court_xy = transformer.transform_points(points=anchors)

            tracker_ids = (
                detections.tracker_id
                if detections.tracker_id is not None
                else np.arange(1, len(detections) + 1)
            )
            class_ids = (
                detections.class_id
                if detections.class_id is not None
                else np.zeros(len(detections), dtype=int)
            )

            frame_sample: dict[int, tuple[float, float]] = {}
            for tid, (x, y), cls in zip(tracker_ids, court_xy, class_ids):
                key = int(tid)
                per_track_points.setdefault(key, []).append((float(x), float(y)))
                per_track_classes.setdefault(key, []).append(int(cls))
                frame_sample[key] = (float(x), float(y))
            per_frame_samples.append((frame_index, frame_sample))

            processed_frames += 1
        except Exception as exc:  # noqa: BLE001 — non-fatal per-frame failures
            log(f"[warn] frame {frame_index}: {exc.__class__.__name__}: {exc}")

        frame_index += 1

    capture.release()
    log(f"[done] processed_frames={processed_frames} unique_tracks={len(per_track_points)}")

    # Build teams + players output. With no team-classifier in Pass 1 we group every detected
    # track under a single "Unassigned" team — the GUI can still render real counts.
    teams_out: dict[str, dict[str, Any]] = {}
    players_out: list[dict[str, Any]] = []

    if per_track_points:
        team_id = "unassigned"
        teams_out[team_id] = {
            "name": "Detected Players",
            "shortName": "DET",
            "color": team_colors.get("Boston Celtics", "#6c8cff"),
            "players": [],
        }
        for track_id in sorted(per_track_points.keys()):
            player = {
                "trackId": track_id,
                "teamId": team_id,
                "jerseyNumber": "",
                "playerName": f"Player #{track_id}",
            }
            players_out.append(player)
            teams_out[team_id]["players"].append(player)

    # Render a base court PNG (no paths) — the GUI animates dots on top of it in sync
    # with video playback. The static all-paths render was useful for a quick check but
    # collides with animated overlays, so we leave it out here.
    court_image_url: str | None = None
    court_meta: dict[str, Any] | None = None
    if per_track_points and per_frame_samples:
        try:
            png_path = out_path.with_suffix("").parent / f"{out_path.stem}-court.png"
            base_court = draw_court(config=config)
            png_path.parent.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(png_path), base_court)
            height_px, width_px = base_court.shape[:2]
            # `draw_court` uses scale=20 px/ft and padding=50 px (see sports.basketball.annotators).
            # Hardcoding here matches that contract — if the upstream defaults change we'll need
            # to expose these properly.
            court_meta = {
                "imageUrl": f"/api/analyze/result/{args.analysis_id}/court" if args.analysis_id else None,
                "widthPx": int(width_px),
                "heightPx": int(height_px),
                "scale": 20,
                "padding": 50,
                "courtLengthFt": float(config.court_length),
                "courtWidthFt": float(config.court_width),
            }
            court_image_url = court_meta["imageUrl"]
            log(f"[wrote] {png_path} ({width_px}x{height_px}px)")
        except Exception as exc:  # noqa: BLE001 — render is best-effort, don't fail the run
            log(f"[warn] court render failed: {exc.__class__.__name__}: {exc}")

    # Per-frame dot samples for the GUI to animate over video playback.
    frames_out: list[dict[str, Any]] = []
    for source_frame_idx, sample in per_frame_samples:
        timestamp = source_frame_idx / fps if fps > 0 else 0.0
        players = [
            {
                "trackId": tid,
                "x": round(xy[0], 3),
                "y": round(xy[1], 3),
                "teamId": "unassigned",
            }
            for tid, xy in sample.items()
        ]
        frames_out.append(
            {
                "frameIndex": int(source_frame_idx),
                "t": round(timestamp, 4),
                "players": players,
            }
        )

    payload: dict[str, Any] = {
        "videoId": args.analysis_id or video_path.stem,
        "gameLabel": f"Local clip · {video_path.name}",
        "duration": round(duration, 2),
        "fps": round(fps, 2),
        "totalFrames": total_frames,
        "teams": teams_out,
        "shots": [],  # Shot detection lands when Ilias's module ships.
        "playerTracks": players_out,
        "frames": frames_out,
        # Diagnostics — not part of the VideoAnalysis type but harmless extra fields.
        "_meta": {
            "processedFrames": processed_frames,
            "frameStride": FRAME_STRIDE,
            "elapsedSeconds": round(time.time() - t0, 2),
            "teamNamesAvailable": len(team_names),
        },
    }
    if court_image_url is not None:
        payload["courtImageUrl"] = court_image_url
    if court_meta is not None:
        payload["court"] = court_meta

    write_json(out_path, payload)
    log(f"[wrote] {out_path}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 — last-chance JSON emission
        # If we have an --out arg, try to write the error JSON before bailing.
        try:
            parser = argparse.ArgumentParser(add_help=False)
            parser.add_argument("--out", default=None)
            args, _ = parser.parse_known_args()
            if args.out:
                Path(args.out).parent.mkdir(parents=True, exist_ok=True)
                with open(args.out, "w") as f:
                    json.dump(
                        {
                            "error": "unhandled_exception",
                            "message": f"{exc.__class__.__name__}: {exc}",
                            "traceback": traceback.format_exc(),
                        },
                        f,
                        indent=2,
                    )
        except Exception:
            pass
        print(f"[fatal] {exc}", file=sys.stderr)
        sys.exit(3)
