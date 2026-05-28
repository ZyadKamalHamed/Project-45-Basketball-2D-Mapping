#!/usr/bin/env python3
"""
CourtVision analysis bridge.

Wraps the player + CVM + shot-detection pipeline (CVM_notebook + Shot-Detection-and-Tracking
notebooks) and emits a JSON file that conforms to the `VideoAnalysis` shape in
`GUI/src/types/basketball.ts`.

Pipeline per video:
  - Run the player detector on every frame, keeping all six classes so the shot detection
    pass can see ball / ball-in-basket / rim alongside players.
  - Track players (BoT-SORT) so each detection carries a stable track_id.
  - Run the court keypoint model and fit a homography per frame; cache the transformer.
  - Fit an unsupervised TeamClassifier on jersey crops sampled from across the video,
    then memoise the team assignment per tracker_id (one predict per new track, not per
    frame).
  - Sample player → court positions into `frames` for the GUI's animated dots.
  - Hand the full detection log to `shot_detection.detect_shots`; map each event back
    into the GUI's `Shot` shape using the cached homography for the shot's frame.

If either model weight is missing on disk, the script writes a structured error JSON
instead of crashing. The GUI route surfaces this to the user.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
import time
import traceback
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent

# Weights live in different places locally vs SageMaker — env vars let the same script run anywhere.
CVM_MODEL_PATH = Path(os.environ.get(
    "CVM_MODEL_PATH",
    str(REPO_ROOT / "runs" / "CVM_Best.pt"),
)).resolve()
PLAYER_MODEL_PATH = Path(os.environ.get(
    "PLAYER_MODEL_PATH",
    str(REPO_ROOT / "Data" / "runs_abdo" / "Player_detection.pt"),
)).resolve()

# Detection runs every frame so the shot-detection pass has a continuous ball + rim
# trajectory to work with. The GUI's animated dots are subsampled separately via
# `SAMPLE_STRIDE` so the emitted JSON stays compact.
CVM_CONF = 0.3
CVM_ANCHOR_CONF = 0.5
PLAYER_CONF = 0.25
PLAYER_IOU = 0.5
SAMPLE_STRIDE = 5

# Abdo's model: 0=ball, 1=ball-in-basket, 2=number, 3=player, 4=referee, 5=rim.
PLAYER_CLASS_ID = 3

# Stride used when sampling jersey crops to fit the team classifier (matches the reference notebook).
TEAM_FIT_STRIDE = 30

# Two-team palette for the unsupervised classifier output. Swap if the colours look wrong on a given game.
TEAM_PALETTE_HEX = ["#6c8cff", "#ea580c"]
TEAM_LABELS = ["Team A", "Team B"]


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


def display_path(p: Path) -> str:
    """Show the repo-relative path when possible, else the absolute one (handles env var overrides)."""
    try:
        return str(p.relative_to(REPO_ROOT))
    except ValueError:
        return str(p)


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
            f"CVM weights not found at {display_path(CVM_MODEL_PATH)}. "
            "Train the CVM model or sync the SageMaker weights to run the bridge locally.",
        )

    if not PLAYER_MODEL_PATH.exists():
        return emit_error(
            out_path,
            "player_weights_missing",
            f"Player detection weights not found at {display_path(PLAYER_MODEL_PATH)}. "
            "Sync Abdo's weights to enable end-to-end analysis locally.",
        )

    # Heavy imports happen after the weights check so missing-deps errors don't mask the
    # more useful missing-weights message.
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore
        import supervision as sv  # type: ignore
        import torch  # type: ignore
        from ultralytics import YOLO  # type: ignore
        from sports.common.view import ViewTransformer  # type: ignore
        from sports.common.team import TeamClassifier  # type: ignore
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

    # Fit the team classifier first. We sample jersey crops from across the video,
    # then KMeans-cluster their embeddings into the two on-court teams.
    log("[team] sampling jersey crops to fit team classifier...")
    fit_crops: list[Any] = []
    fit_generator = sv.get_video_frames_generator(str(video_path), stride=TEAM_FIT_STRIDE)
    for sample_frame in fit_generator:
        result = player_model.predict(
            sample_frame, conf=PLAYER_CONF, iou=PLAYER_IOU, verbose=False
        )[0]
        det = sv.Detections.from_ultralytics(result)
        det = det[det.class_id == PLAYER_CLASS_ID]
        for box in sv.scale_boxes(xyxy=det.xyxy, factor=0.4):
            fit_crops.append(sv.crop_image(sample_frame, box))

    if len(fit_crops) < 2:
        return emit_error(
            out_path,
            "team_fit_failed",
            f"Only {len(fit_crops)} player crops collected — not enough to fit the team classifier. "
            "Check that the player model is firing on this clip.",
        )

    team_device = "cuda" if torch.cuda.is_available() else "cpu"
    team_classifier = TeamClassifier(device=team_device)
    team_classifier.fit(fit_crops)
    log(f"[team] fitted on {len(fit_crops)} crops (device={team_device}).")

    # Accumulators — keyed by tracker_id so the per-track centroids and team votes are stable
    # across frames.
    per_track_points: dict[int, list[tuple[float, float]]] = {}
    per_track_teams: dict[int, list[int]] = {}
    # Per-frame samples for the GUI's animated dots. Subsampled via SAMPLE_STRIDE so the
    # JSON stays small even on long clips.
    per_frame_samples: list[tuple[int, dict[int, dict[str, Any]]]] = []
    # Every detection from every frame — fed to the shot-detection pass after the loop.
    detection_records: list[dict[str, Any]] = []
    # Per-frame ViewTransformer (image → court, in feet). Used to project the shooter's
    # image-space anchor into court coords for each detected shot.
    homography_by_frame: dict[int, Any] = {}
    # team prediction cache: one team-classifier inference per new track, not per frame.
    track_team_cache: dict[int, int] = {}

    processed_frames = 0
    frame_index = 0

    while True:
        ok, frame = capture.read()
        if not ok:
            break

        try:
            # BoT-SORT keeps the same tracker_id on a player across frames (motion + Re-ID).
            # We run track() on every frame so the tracker has continuous motion to work with,
            # and so shot detection sees every ball / rim / ball-in-basket detection.
            player_result = player_model.track(
                frame,
                persist=True,
                tracker="botsort.yaml",
                conf=PLAYER_CONF,
                iou=PLAYER_IOU,
                verbose=False,
            )[0]
            all_dets = sv.Detections.from_ultralytics(player_result)

            # Save the full per-frame detection log (drop number/referee — shot detection
            # doesn't use them and they bloat the record).
            keep_classes = [0, 1, 3, 5]  # ball, ball-in-basket, player, rim
            for i in range(len(all_dets)):
                cid = int(all_dets.class_id[i])
                if cid not in keep_classes:
                    continue
                tid = all_dets.tracker_id[i] if all_dets.tracker_id is not None else None
                detection_records.append({
                    "frame": frame_index,
                    "class_id": cid,
                    "bbox_xyxy": [float(v) for v in all_dets.xyxy[i]],
                    "conf": float(all_dets.confidence[i]) if all_dets.confidence is not None else 0.0,
                    "track_id": int(tid) if tid is not None and not np.isnan(tid) else None,
                })

            # CVM court keypoints → homography for this frame.
            cvm_result = cvm_model.predict(frame, conf=CVM_CONF, verbose=False)[0]
            key_points = sv.KeyPoints.from_ultralytics(cvm_result)
            transformer = None
            if key_points.confidence is not None and len(key_points.confidence) > 0:
                landmarks_mask = key_points.confidence[0] > CVM_ANCHOR_CONF
                if int(np.count_nonzero(landmarks_mask)) >= 4:
                    court_landmarks = np.array(config.vertices)[landmarks_mask]
                    frame_landmarks = key_points[:, landmarks_mask].xy[0]
                    transformer = ViewTransformer(source=frame_landmarks, target=court_landmarks)
                    homography_by_frame[frame_index] = transformer

            # Player → court projection (only when we have both detections and homography).
            players = all_dets[all_dets.class_id == PLAYER_CLASS_ID]
            if (
                len(players) > 0
                and players.tracker_id is not None
                and transformer is not None
            ):
                anchors = players.get_anchors_coordinates(anchor=sv.Position.BOTTOM_CENTER)
                court_xy = transformer.transform_points(points=anchors)

                # Predict team only for tracker_ids we haven't seen before. With BoT-SORT
                # holding identities across frames, this collapses team-classifier work
                # from O(detections) to O(unique tracks).
                new_indices = [
                    i for i, tid in enumerate(players.tracker_id)
                    if tid is not None and int(tid) not in track_team_cache
                ]
                if new_indices:
                    new_crops = [
                        sv.crop_image(frame, box)
                        for box in sv.scale_boxes(xyxy=players.xyxy[new_indices], factor=0.4)
                    ]
                    new_teams = team_classifier.predict(new_crops) if new_crops else []
                    for idx, team in zip(new_indices, new_teams):
                        track_team_cache[int(players.tracker_id[idx])] = int(team)

                frame_sample: dict[int, dict[str, Any]] = {}
                for tid, (x, y) in zip(players.tracker_id, court_xy):
                    if tid is None:
                        continue
                    key = int(tid)
                    team = track_team_cache.get(key, 0)
                    per_track_points.setdefault(key, []).append((float(x), float(y)))
                    per_track_teams.setdefault(key, []).append(team)
                    frame_sample[key] = {"xy": (float(x), float(y)), "team": team}

                if frame_index % SAMPLE_STRIDE == 0:
                    per_frame_samples.append((frame_index, frame_sample))

            processed_frames += 1
        except Exception as exc:  # noqa: BLE001 — non-fatal per-frame failures
            log(f"[warn] frame {frame_index}: {exc.__class__.__name__}: {exc}")

        frame_index += 1

    capture.release()
    log(
        f"[done] processed_frames={processed_frames} unique_tracks={len(per_track_points)} "
        f"detection_records={len(detection_records)}"
    )

    # Pick the dominant team for each tracker_id (mode across all frames it appeared in).
    def _mode(values: list[int]) -> int:
        counts: dict[int, int] = {}
        for v in values:
            counts[v] = counts.get(v, 0) + 1
        return max(counts, key=lambda k: counts[k]) if counts else 0

    track_team: dict[int, int] = {tid: _mode(votes) for tid, votes in per_track_teams.items()}

    # --- Shot detection -----------------------------------------------------
    # Hand the full detection log to Ilias's pipeline. It builds smoothed ball / rim
    # trajectories, finds shot candidates, and classifies make/miss.
    from shot_detection import detect_shots  # late import: heavy deps only loaded if we get here

    log(f"[shots] running shot detection on {len(detection_records)} records...")
    shot_events = detect_shots(detection_records, frame_count=max(1, frame_index))
    log(f"[shots] detected {len(shot_events)} shot event(s)")

    # NBA basket centres in feet (court is 94 ft long × 50 ft wide, basket 5.25 ft from baseline).
    NBA_BASKETS = [(5.25, 25.0), (88.75, 25.0)]

    def _nearest_basket(x: float, y: float) -> tuple[tuple[float, float], float]:
        best = min(NBA_BASKETS, key=lambda b: (b[0] - x) ** 2 + (b[1] - y) ** 2)
        dist = float(np.hypot(best[0] - x, best[1] - y))
        return best, dist

    def _is_three_pointer(x: float, y: float) -> bool:
        # NBA: 23.75 ft arc, 22 ft in the corners (within 3 ft of the sideline).
        _, dist = _nearest_basket(x, y)
        in_corner = abs(y - 25.0) > 22.0  # corner zone (within ~3 ft of either sideline)
        return dist >= 22.0 if in_corner else dist >= 23.75

    def _transformer_near(frame_idx: int):
        """Find the closest cached homography to `frame_idx` (within ±60 frames)."""
        if frame_idx in homography_by_frame:
            return homography_by_frame[frame_idx]
        for delta in range(1, 60):
            if (frame_idx - delta) in homography_by_frame:
                return homography_by_frame[frame_idx - delta]
            if (frame_idx + delta) in homography_by_frame:
                return homography_by_frame[frame_idx + delta]
        return None

    shots_out: list[dict[str, Any]] = []
    skipped_unknown = 0
    skipped_no_homography = 0
    for ev in shot_events:
        if ev["result"] not in ("make", "miss"):
            skipped_unknown += 1
            continue
        sx, sy = ev.get("shot_x_image"), ev.get("shot_y_image")
        if sx is None or sy is None:
            continue
        transformer = _transformer_near(int(ev["release_frame"]))
        if transformer is None:
            skipped_no_homography += 1
            continue
        court_pt = transformer.transform_points(points=np.array([[sx, sy]], dtype=float))[0]
        court_x, court_y = float(court_pt[0]), float(court_pt[1])

        shooter_tid = ev.get("shooter_track_id")
        team_idx = track_team.get(int(shooter_tid), 0) if shooter_tid is not None else 0
        _, dist_ft = _nearest_basket(court_x, court_y)

        shots_out.append({
            "id": int(ev["shot_id"]),
            "frameIndex": int(ev["release_frame"]),
            "shooterTrackId": int(shooter_tid) if shooter_tid is not None else -1,
            "shooterTeamId": f"team_{team_idx}",
            "location": {"x": round(court_x, 3), "y": round(court_y, 3)},
            "distance": round(dist_ft, 2),
            "shotType": "jump",  # refine with shot-class detection later
            "result": "made" if ev["result"] == "make" else "missed",
            "isThreePointer": _is_three_pointer(court_x, court_y),
        })

    if skipped_unknown:
        log(f"[shots] dropped {skipped_unknown} shot(s) with unknown result")
    if skipped_no_homography:
        log(f"[shots] dropped {skipped_no_homography} shot(s) with no homography near release frame")

    teams_out: dict[str, dict[str, Any]] = {}
    players_out: list[dict[str, Any]] = []

    for team_idx in (0, 1):
        team_key = f"team_{team_idx}"
        teams_out[team_key] = {
            "name": TEAM_LABELS[team_idx],
            "shortName": TEAM_LABELS[team_idx].split()[-1],
            "color": TEAM_PALETTE_HEX[team_idx],
            "players": [],
        }

    for track_id in sorted(per_track_points.keys()):
        team_idx = track_team.get(track_id, 0)
        team_key = f"team_{team_idx}"
        player = {
            "trackId": track_id,
            "teamId": team_key,
            "jerseyNumber": "",
            "playerName": f"Player #{track_id}",
        }
        players_out.append(player)
        teams_out[team_key]["players"].append(player)

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
                "x": round(entry["xy"][0], 3),
                "y": round(entry["xy"][1], 3),
                "teamId": f"team_{entry['team']}",
            }
            for tid, entry in sample.items()
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
        "shots": shots_out,
        "playerTracks": players_out,
        "frames": frames_out,
        # Diagnostics — not part of the VideoAnalysis type but harmless extra fields.
        "_meta": {
            "processedFrames": processed_frames,
            "sampleStride": SAMPLE_STRIDE,
            "detectionRecords": len(detection_records),
            "shotEvents": len(shot_events),
            "shotsEmitted": len(shots_out),
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
