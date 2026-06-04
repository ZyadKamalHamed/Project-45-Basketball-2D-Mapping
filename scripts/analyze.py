#!/usr/bin/env python3
"""
CourtVision analysis bridge.

Thin orchestrator that walks an uploaded video through the team's three notebooks
(player detection, court vision mapping, shot detection) and emits a JSON payload
the Next.js GUI consumes. All algorithmic logic lives in the `pipeline/` package;
this file only does:

  - CLI / path / error handling.
  - The per-frame loop that drives the pipeline modules in order.
  - Annotated-video rendering + ffmpeg re-encode for browser playback.
  - JSON payload assembly that matches `VideoAnalysis` in `GUI/src/types/basketball.ts`.

See DEFENSE_NOTES.md "Architecture" and "Module → notebook map" for which pipeline
module corresponds to which team-member notebook.
"""

from __future__ import annotations

# Standard library imports for CLI parsing, file handling, subprocess calls, and timing.
import argparse
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import time
import traceback
from pathlib import Path
from typing import Any

# Resolve the repo root and make the sibling pipeline package importable.
REPO_ROOT = Path(__file__).resolve().parent.parent
# Make the sibling pipeline/ package importable when analyze.py runs from anywhere
# (the GUI spawns it as a subprocess from the GUI/ working dir).
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Model weight file locations, overridable by environment variable.
# Weight paths can be overridden via env vars so the same script runs on SageMaker
# (different file layout) without code changes. Locally, both weight files live under
# the top-level `weights/` directory.
CVM_MODEL_PATH = Path(os.environ.get(
    "CVM_MODEL_PATH",
    str(REPO_ROOT / "weights" / "runs" / "CVM_Best.pt"),
)).resolve()
PLAYER_MODEL_PATH = Path(os.environ.get(
    "PLAYER_MODEL_PATH",
    str(REPO_ROOT / "weights" / "runs_abdo" / "Player_detection.pt"),
)).resolve()

# Confidence, IoU, and sampling-stride settings for the detection and team-fitting passes.
# Detection runs every frame so shot detection has a continuous ball + rim trajectory.
# The GUI's animated dots are subsampled separately via SAMPLE_STRIDE to keep the JSON
# small.
CVM_CONF = 0.30
CVM_ANCHOR_CONF = 0.50
PLAYER_CONF = 0.25
PLAYER_IOU = 0.50
SAMPLE_STRIDE = 5
TEAM_FIT_STRIDE = 30

# Two-team palette emitted in the JSON. Anchored by jersey brightness in
# pipeline.team_classification so team_0 is always the darker cluster on a given clip.
TEAM_PALETTE_HEX = ["#6c8cff", "#ea580c"]
TEAM_LABELS = ["Team A", "Team B"]


# ── Helpers ────────────────────────────────────────────────────────────────────

# Print a line to stdout for the Next.js dev server to stream.
def log(msg: str) -> None:
    """Stdout line — Next.js streams these to the dev-server console."""
    print(msg, flush=True)


# Write a payload dict to disk as pretty-printed JSON, creating parent folders.
def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as f:
        json.dump(payload, f, indent=2)


# Dynamically import the team roster constants from the non-standard filename.
def load_team_rosters() -> tuple[dict[int, str], dict[str, str]]:
    """Load TEAM_NAMES / TEAM_COLORS from `Data/Team.rosters.py` (non-standard filename)."""
    roster_path = REPO_ROOT / "Data" / "Team.rosters.py"
    spec = importlib.util.spec_from_file_location("team_rosters", roster_path)
    if spec is None or spec.loader is None:
        return {}, {}
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return getattr(module, "TEAM_NAMES", {}), getattr(module, "TEAM_COLORS", {})


# Write an error JSON payload, log it, and return the error exit code.
def emit_error(out_path: Path, code: str, message: str) -> int:
    write_json(out_path, {"error": code, "message": message})
    log(f"[error] {code}: {message}")
    return 2


# Show a path relative to the repo root when possible, for tidier log messages.
def display_path(p: Path) -> str:
    try:
        return str(p.relative_to(REPO_ROOT))
    except ValueError:
        return str(p)


# Re-encode the raw annotated video to browser-friendly H.264 via ffmpeg.
def reencode_annotated(raw_path: Path, h264_path: Path) -> bool:
    """Re-encode the OpenCV-written mp4v video to H.264 so browsers can play it."""
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        log("[warn] ffmpeg not on PATH — skipping annotated-video re-encode")
        return False
    result = subprocess.run(
        [
            ffmpeg, "-y", "-loglevel", "error",
            "-i", str(raw_path),
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            str(h264_path),
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0 and h264_path.exists():
        raw_path.unlink(missing_ok=True)
        return True
    log(f"[warn] ffmpeg failed: {result.stderr.strip()[:200]}")
    return False


# ── Main pipeline ─────────────────────────────────────────────────────────────

# Orchestrate the whole analysis run from CLI args through to the JSON payload.
def main() -> int:
    # Parse the command-line arguments for the input video, output path, and analysis id.
    parser = argparse.ArgumentParser(description="Run CVM + player + shot pipeline on a video.")
    parser.add_argument("--video", required=True, help="Path to the input video file.")
    parser.add_argument("--out", required=True, help="Path to write the result JSON.")
    parser.add_argument("--analysis-id", default="", help="Analysis identifier (logging only).")
    args = parser.parse_args()

    video_path = Path(args.video).resolve()
    out_path = Path(args.out).resolve()

    # Bail out early with a clear error if the video or model weights are missing.
    if not video_path.exists():
        return emit_error(out_path, "video_missing", f"Video not found: {video_path}")
    if not CVM_MODEL_PATH.exists():
        return emit_error(
            out_path, "cvm_weights_missing",
            f"CVM weights not found at {display_path(CVM_MODEL_PATH)}. "
            "Train the CVM model or sync the SageMaker weights to run the bridge locally.",
        )
    if not PLAYER_MODEL_PATH.exists():
        return emit_error(
            out_path, "player_weights_missing",
            f"Player detection weights not found at {display_path(PLAYER_MODEL_PATH)}. "
            "Sync Abdo's weights to enable end-to-end analysis locally.",
        )

    # Heavy imports happen after the weight check so a missing-deps error doesn't mask
    # the more useful missing-weights message.
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore
        import supervision as sv  # type: ignore
        from ultralytics import YOLO  # type: ignore
        from sports.basketball import (  # type: ignore
            CourtConfiguration,
            League,
            draw_court,
        )
        from sports.basketball.config import MeasurementUnit  # type: ignore

        # Import the pipeline modules that drive each analysis stage.
        from pipeline import (
            court_mapping,
            geometry,
            player_detection,
            shot_detection,
            team_classification,
        )
    except ImportError as exc:
        return emit_error(
            out_path, "deps_missing",
            f"Python dependency missing: {exc.name or exc}. Install requirements.txt or "
            "run the notebook setup cells.",
        )

    log(f"[start] analysis_id={args.analysis_id or '?'} video={video_path.name}")
    t0 = time.time()

    # Load rosters, both models, and the court configuration.
    team_names, _team_colors = load_team_rosters()

    cvm_model = YOLO(str(CVM_MODEL_PATH))
    player_model = player_detection.load_player_model(str(PLAYER_MODEL_PATH))
    court_config = CourtConfiguration(league=League.NBA, measurement_unit=MeasurementUnit.FEET)

    # Open the video and read its basic metadata.
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        return emit_error(out_path, "video_open_failed", f"OpenCV could not open {video_path}")

    fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = total_frames / fps if fps > 0 else 0.0
    src_width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    log(f"[meta] fps={fps:.2f} total_frames={total_frames} duration={duration:.1f}s")

    # ── Fit the team classifier (anchored) ───────────────────────────────────
    log("[team] sampling jersey crops to fit team classifier...")
    fit_crops = team_classification.collect_fit_crops(
        video_path=str(video_path),
        detector=player_model,
        stride=TEAM_FIT_STRIDE,
        player_class_id=player_detection.CLASS_PLAYER,
        conf=PLAYER_CONF,
        iou=PLAYER_IOU,
    )
    if len(fit_crops) < 2:
        return emit_error(
            out_path, "team_fit_failed",
            f"Only {len(fit_crops)} player crops collected — not enough to fit the team classifier. "
            "Check that the player model is firing on this clip.",
        )
    anchored_classifier = team_classification.fit_anchored(fit_crops)
    log(
        f"[team] fitted on {len(fit_crops)} crops; "
        f"{'swapped' if anchored_classifier.swap else 'kept'} cluster mapping (darker → team_0)."
    )

    # ── Per-frame accumulators ───────────────────────────────────────────────
    per_track_points: dict[int, list[tuple[float, float]]] = {}   # track_id → court coords seen
    per_track_teams: dict[int, list[int]] = {}                    # track_id → list of team votes
    per_frame_samples: list[tuple[int, dict[int, dict[str, Any]]]] = []  # for GUI dot animation
    detection_records: list[dict[str, Any]] = []                  # for shot_detection
    homography_by_frame: dict[int, Any] = {}                      # for shot projection

    # Team classification per track is a *majority vote over the first N frames* a track
    # is seen. First-seen wins is too brittle — a single noisy crop (mid-jump, occluded,
    # blurred) gets locked in for the track's entire life. With a small voting window we
    # let bad single crops get out-voted and the track settles on the right team.
    TRACK_TEAM_LOCK_AFTER = 5
    track_team_votes: dict[int, list[int]] = {}  # track_id → most recent team predictions
    track_team_cache: dict[int, int] = {}        # track_id → locked-in team (mode of votes)

    # ── Annotated video writer (raw mp4v; re-encoded to H.264 after the loop) ─
    annotated_raw_path = out_path.with_suffix("").parent / f"{out_path.stem}-annotated.raw.mp4"
    annotated_path = out_path.with_suffix("").parent / f"{out_path.stem}-annotated.mp4"
    annotated_raw_path.parent.mkdir(parents=True, exist_ok=True)
    annotated_writer = cv2.VideoWriter(
        str(annotated_raw_path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (src_width, src_height),
    )
    # Set up the box annotator with the two-team colour palette.
    box_palette = sv.ColorPalette([sv.Color.from_hex(c) for c in TEAM_PALETTE_HEX])
    box_annotator = sv.BoxAnnotator(color=box_palette, thickness=3, color_lookup=sv.ColorLookup.INDEX)

    # Main per-frame loop: detect, track, project, classify teams, and annotate.
    processed_frames = 0
    frame_index = 0
    while True:
        ok, frame = capture.read()
        if not ok:
            break

        try:
            # Player detection + BoT-SORT tracking — pipeline.player_detection.
            all_dets = player_detection.track_frame(
                player_model, frame, conf=PLAYER_CONF, iou=PLAYER_IOU,
            )

            # Persist the full detection log (filtered to classes shot detection uses).
            keep = player_detection.filter_to_shot_detection_classes(all_dets)
            for i in range(len(keep)):
                detection_records.append(
                    player_detection.detection_to_record(keep, i, frame_index)
                )

            # Court keypoints + homography — pipeline.court_mapping.
            keypoints = court_mapping.detect_court_keypoints(
                cvm_model, frame, conf=CVM_CONF, anchor_conf=CVM_ANCHOR_CONF,
            )
            transformer = None
            if keypoints is not None:
                transformer = court_mapping.build_homography(court_config, keypoints)
                homography_by_frame[frame_index] = transformer

            # Players-only subset for projection + team classification.
            players = player_detection.filter_to_players(all_dets)
            if len(players) > 0 and players.tracker_id is not None and transformer is not None:
                court_xy = court_mapping.project_players_to_court(transformer, players)

                # Team prediction: build a voting window for each track until it locks in.
                # Tracks with TRACK_TEAM_LOCK_AFTER or more votes are not re-predicted.
                voting_indices = [
                    i for i, tid in enumerate(players.tracker_id)
                    if tid is not None and int(tid) not in track_team_cache
                ]
                if voting_indices:
                    voting_crops = [
                        sv.crop_image(frame, box)
                        for box in sv.scale_boxes(
                            xyxy=players.xyxy[voting_indices],
                            factor=team_classification.JERSEY_CROP_FACTOR,
                        )
                    ]
                    voting_teams = anchored_classifier.predict(voting_crops)
                    for idx, team in zip(voting_indices, voting_teams):
                        key = int(players.tracker_id[idx])
                        track_team_votes.setdefault(key, []).append(team)
                        # Once we have enough votes, lock in the mode and stop re-classifying.
                        if len(track_team_votes[key]) >= TRACK_TEAM_LOCK_AFTER:
                            votes = track_team_votes[key]
                            track_team_cache[key] = max(set(votes), key=votes.count)

                # Return the best-known team for a track using cached or running votes.
                def _current_team(track_id: int) -> int:
                    """Best-known team for a track right now.
                    Use the locked-in mode if available; otherwise the running mode of
                    the votes collected so far (or 0 if no votes yet)."""
                    if track_id in track_team_cache:
                        return track_team_cache[track_id]
                    votes = track_team_votes.get(track_id, [])
                    if not votes:
                        return 0
                    return max(set(votes), key=votes.count)

                frame_sample: dict[int, dict[str, Any]] = {}
                for tid, (x, y) in zip(players.tracker_id, court_xy):
                    if tid is None:
                        continue
                    key = int(tid)
                    team = _current_team(key)
                    per_track_points.setdefault(key, []).append((float(x), float(y)))
                    per_track_teams.setdefault(key, []).append(team)
                    frame_sample[key] = {"xy": (float(x), float(y)), "team": team}

                if frame_index % SAMPLE_STRIDE == 0:
                    per_frame_samples.append((frame_index, frame_sample))

                # Annotated overlay for the playback video.
                color_lookup = np.array(
                    [_current_team(int(tid)) for tid in players.tracker_id], dtype=int
                )
                annotated_frame = box_annotator.annotate(
                    scene=frame.copy(),
                    detections=players,
                    custom_color_lookup=color_lookup,
                )
                annotated_writer.write(annotated_frame)
            else:
                annotated_writer.write(frame)

            processed_frames += 1
        except Exception as exc:  # noqa: BLE001 — non-fatal per-frame failures
            log(f"[warn] frame {frame_index}: {exc.__class__.__name__}: {exc}")
            try:
                annotated_writer.write(frame)
            except Exception:
                pass

        frame_index += 1

    capture.release()
    annotated_writer.release()
    log(
        f"[done] processed_frames={processed_frames} unique_tracks={len(per_track_points)} "
        f"detection_records={len(detection_records)}"
    )

    # ── Shot detection — pipeline.shot_detection ─────────────────────────────
    log(f"[shots] running shot detection on {len(detection_records)} records...")
    shot_events = shot_detection.detect_shots(detection_records, frame_count=max(1, frame_index))
    log(f"[shots] detected {len(shot_events)} shot event(s)")

    # ── Per-track dominant team (mode across all observations) ───────────────
    # Return the most common value in a list of team votes.
    def _mode(values: list[int]) -> int:
        counts: dict[int, int] = {}
        for v in values:
            counts[v] = counts.get(v, 0) + 1
        return max(counts, key=lambda k: counts[k]) if counts else 0

    track_team: dict[int, int] = {tid: _mode(votes) for tid, votes in per_track_teams.items()}

    # ── Map shot events into the GUI's Shot shape ────────────────────────────
    # Find a homography from a frame near the given index, scanning outward if needed.
    def _transformer_near(idx: int):
        if idx in homography_by_frame:
            return homography_by_frame[idx]
        for delta in range(1, 60):
            if (idx - delta) in homography_by_frame:
                return homography_by_frame[idx - delta]
            if (idx + delta) in homography_by_frame:
                return homography_by_frame[idx + delta]
        return None

    # Project each usable shot into court space and build its GUI Shot record.
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
        court_x, court_y = court_mapping.project_point_to_court(transformer, (sx, sy))

        # Prefer a fresh team prediction from the shooter's actual jersey at release;
        # fall back to the cached track-team vote if the crop can't be taken.
        shooter_tid = ev.get("shooter_track_id")
        cached_team = track_team.get(int(shooter_tid), 0) if shooter_tid is not None else 0
        direct_team = team_classification.predict_at_release_frame(
            anchored_classifier,
            str(video_path),
            int(ev["release_frame"]),
            ev.get("shooter_bbox_xyxy"),
        )
        team_idx = direct_team if direct_team is not None else cached_team
        if direct_team is not None and direct_team != cached_team:
            log(
                f"[shots] shot #{ev['shot_id']}: track {shooter_tid} cached team={cached_team} "
                f"but jersey at release reads team={direct_team} — using jersey reading"
            )

        _, dist_ft = geometry.nearest_basket(court_x, court_y)
        shots_out.append({
            "id": int(ev["shot_id"]),
            "frameIndex": int(ev["release_frame"]),
            "shooterTrackId": int(shooter_tid) if shooter_tid is not None else -1,
            "shooterTeamId": f"team_{team_idx}",
            "location": {"x": round(court_x, 3), "y": round(court_y, 3)},
            "distance": round(dist_ft, 2),
            "shotType": "jump",  # refine with shot-class detection later
            "result": "made" if ev["result"] == "make" else "missed",
            "isThreePointer": geometry.is_three_pointer(court_x, court_y),
        })

    if skipped_unknown:
        log(f"[shots] dropped {skipped_unknown} shot(s) with unknown result")
    if skipped_no_homography:
        log(f"[shots] dropped {skipped_no_homography} shot(s) with no homography near release frame")

    # ── Build teams + players payload ────────────────────────────────────────
    # Build the two team entries with their names, colours, and empty player lists.
    teams_out: dict[str, dict[str, Any]] = {}
    for team_idx in (0, 1):
        team_key = f"team_{team_idx}"
        teams_out[team_key] = {
            "name": TEAM_LABELS[team_idx],
            "shortName": TEAM_LABELS[team_idx].split()[-1],
            "color": TEAM_PALETTE_HEX[team_idx],
            "players": [],
        }
    # Build one player record per track and attach it to its team.
    players_out: list[dict[str, Any]] = []
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

    # ── Annotated video → H.264 for the GUI to play ──────────────────────────
    # Convert the raw annotated video to H.264 and expose its URL when it succeeds.
    annotated_video_url: str | None = None
    if annotated_raw_path.exists() and reencode_annotated(annotated_raw_path, annotated_path):
        if args.analysis_id:
            annotated_video_url = f"/api/analyze/result/{args.analysis_id}/annotated"
        log(f"[wrote] {annotated_path} ({annotated_path.stat().st_size / 1e6:.1f} MB)")

    # ── Static base-court PNG (GUI animates dots on top of this) ─────────────
    # Render the top-down base-court PNG and record its dimensions and scale.
    court_image_url: str | None = None
    court_meta: dict[str, Any] | None = None
    if per_track_points and per_frame_samples:
        try:
            png_path = out_path.with_suffix("").parent / f"{out_path.stem}-court.png"
            base_court = draw_court(config=court_config)
            png_path.parent.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(png_path), base_court)
            height_px, width_px = base_court.shape[:2]
            # `draw_court` uses scale=20 px/ft and padding=50 px (see sports.basketball.annotators).
            court_meta = {
                "imageUrl": f"/api/analyze/result/{args.analysis_id}/court" if args.analysis_id else None,
                "widthPx": int(width_px),
                "heightPx": int(height_px),
                "scale": 20,
                "padding": 50,
                "courtLengthFt": float(court_config.court_length),
                "courtWidthFt": float(court_config.court_width),
            }
            court_image_url = court_meta["imageUrl"]
            log(f"[wrote] {png_path} ({width_px}x{height_px}px)")
        except Exception as exc:  # noqa: BLE001 — render is best-effort
            log(f"[warn] court render failed: {exc.__class__.__name__}: {exc}")

    # ── Per-frame dot samples for the GUI to animate over video playback ─────
    # We re-stamp each sample's teamId with the *final* mode-voted team for that track.
    # Early frames may have used a noisy first guess; the mode across the track's entire
    # lifetime is more accurate, so the GUI's animated dots should reflect that.
    # Build the per-frame dot samples, restamping each with the track's final team.
    frames_out: list[dict[str, Any]] = [
        {
            "frameIndex": int(idx),
            "t": round(idx / fps if fps > 0 else 0.0, 4),
            "players": [
                {
                    "trackId": tid,
                    "x": round(entry["xy"][0], 3),
                    "y": round(entry["xy"][1], 3),
                    "teamId": f"team_{track_team.get(tid, entry['team'])}",
                }
                for tid, entry in sample.items()
            ],
        }
        for idx, sample in per_frame_samples
    ]

    # Assemble the final payload matching the GUI's VideoAnalysis shape and write it out.
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
    if annotated_video_url is not None:
        payload["annotatedVideoUrl"] = annotated_video_url

    write_json(out_path, payload)
    log(f"[wrote] {out_path}")
    return 0


# Run main when invoked as a script, emitting a JSON error payload on any unhandled crash.
if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 — last-chance JSON emission
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
