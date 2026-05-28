"""
Basketball shot detection.

Port of Ilias's `Shot-Detection-and-Tracking.ipynb` into a standalone module the
bridge script can call. Given per-frame detection records (from Abdo's 6-class
detector), this builds smoothed ball + rim trajectories, finds shot candidates
(ball approaches rim, plausible arc), classifies each as make/miss/unknown using
the `ball-in-basket` class + a geometric hoop-plane test, and assigns the most
likely shooter from nearby player detections.

The class IDs match Abdo's model:
    0=ball  1=ball-in-basket  2=number  3=player  4=referee  5=rim
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

import numpy as np
import pandas as pd

try:
    from scipy.signal import savgol_filter  # type: ignore
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False


CLASS_BALL = 0
CLASS_BALL_IN_BASKET = 1
CLASS_PLAYER = 3
CLASS_RIM = 5

# Defaults copied from the notebook. These are the first knobs to tune on a new
# broadcast angle — exposed via `detect_shots(..., config=...)` if needed later.
MAX_BALL_GAP = 8
MAX_RIM_GAP = 45
MAX_BALL_SPEED_PX_PER_FRAME = 95
BALL_SMOOTH_WINDOW = 7
RIM_SMOOTH_WINDOW = 15
SHOT_WINDOW_FRAMES = 96
MIN_SHOT_FRAMES = 10
RIM_PROXIMITY_PX = 110
RELEASE_TO_RIM_MAX_FRAMES = 90
SHOT_COOLDOWN_FRAMES = 45
MIN_UPWARD_MOTION_PX = 22
MIN_DOWNWARD_MOTION_PX = 18
HOOP_ZONE_WIDTH_PX = 76
HOOP_ZONE_HEIGHT_PX = 52
SHOOTER_LOOKBACK_FRAMES = 18
MAX_SHOOTER_DISTANCE_PX = 170


# --- small helpers ----------------------------------------------------------

def _euclidean(a, b) -> float:
    if a is None or b is None:
        return float("inf")
    return float(np.linalg.norm(np.array(a, dtype=float) - np.array(b, dtype=float)))


def _bbox_center(bbox) -> tuple[float, float]:
    x1, y1, x2, y2 = map(float, bbox)
    return (0.5 * (x1 + x2), 0.5 * (y1 + y2))


def _bbox_upper_body_center(bbox) -> tuple[float, float]:
    x1, y1, x2, y2 = map(float, bbox)
    return (0.5 * (x1 + x2), y1 + 0.35 * (y2 - y1))


def _bbox_wh(bbox) -> tuple[float, float]:
    x1, y1, x2, y2 = map(float, bbox)
    return max(0.0, x2 - x1), max(0.0, y2 - y1)


def _bbox_area(bbox) -> float:
    w, h = _bbox_wh(bbox)
    return w * h


def _contiguous_runs(indices: np.ndarray) -> list[np.ndarray]:
    if len(indices) == 0:
        return []
    splits = np.where(np.diff(indices) > 1)[0] + 1
    return [run for run in np.split(indices, splits) if len(run)]


def _smooth_values(values: np.ndarray, window: int, poly: int = 2) -> np.ndarray:
    values = np.asarray(values, dtype=float)
    out = values.copy()
    valid_idx = np.flatnonzero(~np.isnan(values))
    for run in _contiguous_runs(valid_idx):
        if len(run) < 3:
            continue
        run_values = values[run]
        if SCIPY_AVAILABLE and len(run) >= 5:
            w = min(window, len(run) if len(run) % 2 == 1 else len(run) - 1)
            w = max(5, w)
            if w % 2 == 0:
                w -= 1
            if w >= 5 and w > poly:
                out[run] = savgol_filter(
                    run_values, window_length=w, polyorder=min(poly, w - 2), mode="interp"
                )
                continue
        out[run] = pd.Series(run_values).rolling(3, center=True, min_periods=1).median().to_numpy()
    return out


def _interpolate_short_gaps(
    df: pd.DataFrame, x_col: str, y_col: str, max_gap: int, flag_col: str
) -> pd.DataFrame:
    df = df.copy()
    valid = df[x_col].notna() & df[y_col].notna()
    valid_frames = df.loc[valid, "frame"].to_numpy(dtype=int)
    for left_frame, right_frame in zip(valid_frames[:-1], valid_frames[1:]):
        gap = right_frame - left_frame - 1
        if gap <= 0 or gap > max_gap:
            continue
        left = df.loc[df["frame"] == left_frame].iloc[0]
        right = df.loc[df["frame"] == right_frame].iloc[0]
        for frame in range(left_frame + 1, right_frame):
            alpha = (frame - left_frame) / (right_frame - left_frame)
            df.loc[df["frame"] == frame, x_col] = (1 - alpha) * left[x_col] + alpha * right[x_col]
            df.loc[df["frame"] == frame, y_col] = (1 - alpha) * left[y_col] + alpha * right[y_col]
            df.loc[df["frame"] == frame, flag_col] = True
            if "conf" in df.columns:
                df.loc[df["frame"] == frame, "conf"] = 0.0
            if "rim_conf" in df.columns:
                df.loc[df["frame"] == frame, "rim_conf"] = 0.0
    return df


# --- ball / rim track builders ---------------------------------------------

def _select_best_ball_detection(frame_dets: list[dict], prev_xy=None) -> dict | None:
    candidates = [d for d in frame_dets if int(d["class_id"]) in (CLASS_BALL, CLASS_BALL_IN_BASKET)]
    if not candidates:
        return None
    scored = []
    for d in candidates:
        center = _bbox_center(d["bbox_xyxy"])
        w, h = _bbox_wh(d["bbox_xyxy"])
        area = _bbox_area(d["bbox_xyxy"])
        class_bonus = 0.10 if int(d["class_id"]) == CLASS_BALL else 0.02
        shape_penalty = 0.0
        if w > 0 and h > 0:
            aspect = max(w / h, h / w)
            shape_penalty = max(0.0, aspect - 2.5) * 0.05
        area_penalty = max(0.0, area - 4500.0) / 25000.0
        temporal_penalty = 0.0 if prev_xy is None else min(_euclidean(center, prev_xy) / 300.0, 1.0)
        score = float(d.get("conf", 0.0)) + class_bonus - shape_penalty - area_penalty - temporal_penalty
        scored.append((score, d))
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[0][1]


def _select_best_rim_detection(frame_dets: list[dict], prev_xy=None) -> dict | None:
    candidates = [d for d in frame_dets if int(d["class_id"]) == CLASS_RIM]
    if not candidates:
        return None
    scored = []
    for d in candidates:
        center = _bbox_center(d["bbox_xyxy"])
        temporal_penalty = 0.0 if prev_xy is None else min(_euclidean(center, prev_xy) / 250.0, 1.0)
        score = float(d.get("conf", 0.0)) - temporal_penalty
        scored.append((score, d))
    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[0][1]


def _build_ball_track(detections_by_frame: dict[int, list[dict]], frame_count: int) -> pd.DataFrame:
    rows = []
    prev_xy = None
    for frame in range(frame_count):
        det = _select_best_ball_detection(detections_by_frame.get(frame, []), prev_xy=prev_xy)
        if det is None:
            rows.append({
                "frame": frame, "x": np.nan, "y": np.nan, "conf": np.nan,
                "is_interpolated": False, "is_outlier": False,
            })
            continue
        x, y = _bbox_center(det["bbox_xyxy"])
        prev_xy = (x, y)
        rows.append({
            "frame": frame, "x": x, "y": y,
            "conf": float(det.get("conf", 0.0)),
            "is_interpolated": False, "is_outlier": False,
        })

    df = pd.DataFrame(rows)

    # Reject single-frame jumps from the last accepted observation.
    last_frame, last_xy = None, None
    for idx, row in df[df["x"].notna()].iterrows():
        xy = (row["x"], row["y"])
        if last_xy is not None:
            gap = max(1, int(row["frame"] - last_frame))
            speed = _euclidean(xy, last_xy) / gap
            if speed > MAX_BALL_SPEED_PX_PER_FRAME:
                df.loc[idx, ["x", "y"]] = np.nan
                df.loc[idx, "is_outlier"] = True
                continue
        last_frame, last_xy = int(row["frame"]), xy

    df = _interpolate_short_gaps(df, "x", "y", MAX_BALL_GAP, "is_interpolated")
    df["x"] = _smooth_values(df["x"].to_numpy(dtype=float), BALL_SMOOTH_WINDOW)
    df["y"] = _smooth_values(df["y"].to_numpy(dtype=float), BALL_SMOOTH_WINDOW)
    return df


def _build_rim_track(detections_by_frame: dict[int, list[dict]], frame_count: int) -> pd.DataFrame:
    rows = []
    prev_xy = None
    for frame in range(frame_count):
        det = _select_best_rim_detection(detections_by_frame.get(frame, []), prev_xy=prev_xy)
        if det is None:
            rows.append({
                "frame": frame, "rim_x": np.nan, "rim_y": np.nan,
                "rim_w": np.nan, "rim_h": np.nan, "rim_conf": np.nan,
                "is_interpolated": False,
            })
            continue
        x, y = _bbox_center(det["bbox_xyxy"])
        w, h = _bbox_wh(det["bbox_xyxy"])
        prev_xy = (x, y)
        rows.append({
            "frame": frame, "rim_x": x, "rim_y": y,
            "rim_w": w, "rim_h": h, "rim_conf": float(det.get("conf", 0.0)),
            "is_interpolated": False,
        })

    df = pd.DataFrame(rows)
    df = _interpolate_short_gaps(df, "rim_x", "rim_y", MAX_RIM_GAP, "is_interpolated")
    df["rim_x"] = _smooth_values(df["rim_x"].to_numpy(dtype=float), RIM_SMOOTH_WINDOW)
    df["rim_y"] = _smooth_values(df["rim_y"].to_numpy(dtype=float), RIM_SMOOTH_WINDOW)
    return df


# --- shot candidate detection ----------------------------------------------

def _cluster_frames(frames: list[int], max_gap: int = 5) -> list[list[int]]:
    frames = sorted(set(int(f) for f in frames))
    if not frames:
        return []
    clusters = [[frames[0]]]
    for f in frames[1:]:
        if f - clusters[-1][-1] <= max_gap:
            clusters[-1].append(f)
        else:
            clusters.append([f])
    return clusters


def _add_ball_rim_distance(ball_track: pd.DataFrame, rim_track: pd.DataFrame) -> pd.DataFrame:
    df = ball_track[["frame", "x", "y", "conf", "is_interpolated", "is_outlier"]].merge(
        rim_track[["frame", "rim_x", "rim_y", "rim_w", "rim_h", "rim_conf"]],
        on="frame", how="left",
    )
    valid = df[["x", "y", "rim_x", "rim_y"]].notna().all(axis=1)
    df["rim_distance_px"] = np.nan
    df.loc[valid, "rim_distance_px"] = np.sqrt(
        (df.loc[valid, "x"] - df.loc[valid, "rim_x"]) ** 2
        + (df.loc[valid, "y"] - df.loc[valid, "rim_y"]) ** 2
    )
    return df


def _estimate_release_frame(distance_df: pd.DataFrame, start_frame: int, rim_frame: int) -> int:
    pre = distance_df[
        (distance_df["frame"] >= start_frame)
        & (distance_df["frame"] <= rim_frame)
        & distance_df["x"].notna()
        & distance_df["y"].notna()
    ].copy()
    if len(pre) == 0:
        return int(start_frame)
    if len(pre) < 3:
        return int(pre.iloc[0]["frame"])

    frames = pre["frame"].to_numpy(dtype=int)
    y = pre["y"].to_numpy(dtype=float)
    dy = np.diff(y)
    upward_steps = np.flatnonzero(dy < -1.5)
    if len(upward_steps) == 0:
        return int(frames[max(0, len(frames) - 1 - min(RELEASE_TO_RIM_MAX_FRAMES, len(frames) - 1))])

    runs = _contiguous_runs(upward_steps)
    runs = sorted(runs, key=lambda r: (len(r), r[-1]), reverse=True)
    chosen = runs[0]
    release_idx = max(0, int(chosen[0]) - 1)
    return int(frames[release_idx])


def _candidate_motion_stats(window_df: pd.DataFrame, rim_frame: int) -> dict:
    valid = window_df[window_df["x"].notna() & window_df["y"].notna()].copy()
    if len(valid) == 0:
        return {"upward_motion_px": 0.0, "downward_motion_px": 0.0, "valid_frames": 0}
    pre = valid[valid["frame"] <= rim_frame]
    post = valid[valid["frame"] >= rim_frame]
    upward = float(pre.iloc[0]["y"] - pre["y"].min()) if len(pre) >= 2 else 0.0
    downward = float(post["y"].max() - post.iloc[0]["y"]) if len(post) >= 2 else 0.0
    return {"upward_motion_px": upward, "downward_motion_px": downward, "valid_frames": int(len(valid))}


def _has_ball_in_basket_signal(
    detections_by_frame: dict[int, list[dict]], start_frame: int, end_frame: int, frame_count: int
) -> bool:
    for f in range(max(0, start_frame), min(frame_count - 1, end_frame) + 1):
        if any(int(d["class_id"]) == CLASS_BALL_IN_BASKET for d in detections_by_frame.get(f, [])):
            return True
    return False


def _detect_shot_candidates(
    ball_track: pd.DataFrame,
    rim_track: pd.DataFrame,
    detections_by_frame: dict[int, list[dict]],
    frame_count: int,
) -> tuple[list[dict], pd.DataFrame]:
    distance_df = _add_ball_rim_distance(ball_track, rim_track)
    near = distance_df[
        distance_df["rim_distance_px"].notna()
        & (distance_df["rim_distance_px"] <= RIM_PROXIMITY_PX)
    ]
    clusters = _cluster_frames(near["frame"].astype(int).tolist(), max_gap=5)

    candidates: list[dict] = []
    last_rim_frame = -SHOT_COOLDOWN_FRAMES
    for cluster in clusters:
        cluster_df = distance_df[distance_df["frame"].isin(cluster)]
        if len(cluster_df) == 0:
            continue
        rim_frame = int(cluster_df.sort_values("rim_distance_px").iloc[0]["frame"])
        if rim_frame - last_rim_frame < SHOT_COOLDOWN_FRAMES:
            continue

        start_frame = max(0, rim_frame - RELEASE_TO_RIM_MAX_FRAMES)
        end_frame = min(frame_count - 1, rim_frame + SHOT_WINDOW_FRAMES // 2)
        window_df = distance_df[(distance_df["frame"] >= start_frame) & (distance_df["frame"] <= end_frame)]
        stats = _candidate_motion_stats(window_df, rim_frame)
        bib_signal = _has_ball_in_basket_signal(
            detections_by_frame, rim_frame - 12, rim_frame + 24, frame_count
        )
        min_dist = float(window_df["rim_distance_px"].min()) if window_df["rim_distance_px"].notna().any() else np.nan

        enough_frames = stats["valid_frames"] >= MIN_SHOT_FRAMES
        arc_like = (
            stats["upward_motion_px"] >= MIN_UPWARD_MOTION_PX
            and stats["downward_motion_px"] >= MIN_DOWNWARD_MOTION_PX
        )
        very_close = np.isfinite(min_dist) and min_dist <= RIM_PROXIMITY_PX * 0.65

        if not enough_frames or not (arc_like or bib_signal or very_close):
            continue

        release_frame = _estimate_release_frame(distance_df, start_frame, rim_frame)
        valid_window = window_df[window_df["x"].notna() & window_df["y"].notna()]
        if len(valid_window):
            start_frame = int(valid_window.iloc[0]["frame"])
            end_frame = int(valid_window.iloc[-1]["frame"])

        candidates.append({
            "shot_id": len(candidates) + 1,
            "start_frame": int(start_frame),
            "release_frame": int(release_frame),
            "rim_frame": int(rim_frame),
            "end_frame": int(end_frame),
            "min_rim_distance_px": min_dist,
            "upward_motion_px": stats["upward_motion_px"],
            "downward_motion_px": stats["downward_motion_px"],
            "valid_ball_frames": stats["valid_frames"],
            "candidate_reason": "arc" if arc_like else ("ball-in-basket" if bib_signal else "close-pass"),
        })
        last_rim_frame = rim_frame

    return candidates, distance_df


# --- make/miss classification ----------------------------------------------

def _rim_row_at(rim_track: pd.DataFrame, frame: int) -> pd.Series | None:
    if frame < 0 or frame >= len(rim_track):
        return None
    row = rim_track.iloc[int(frame)]
    if pd.isna(row["rim_x"]) or pd.isna(row["rim_y"]):
        return None
    return row


def _hoop_zone(rim_track: pd.DataFrame, frame: int) -> tuple[float, float, float, float] | None:
    row = _rim_row_at(rim_track, frame)
    if row is None:
        return None
    rim_w = float(row["rim_w"]) if pd.notna(row.get("rim_w", np.nan)) else HOOP_ZONE_WIDTH_PX
    rim_h = float(row["rim_h"]) if pd.notna(row.get("rim_h", np.nan)) else HOOP_ZONE_HEIGHT_PX
    width = max(HOOP_ZONE_WIDTH_PX, rim_w * 1.4)
    height = max(HOOP_ZONE_HEIGHT_PX, rim_h * 1.6)
    return (float(row["rim_x"]), float(row["rim_y"]), width, height)


def _ball_in_basket_frames(
    rim_track: pd.DataFrame,
    detections_by_frame: dict[int, list[dict]],
    candidate: dict,
    frame_count: int,
) -> list[int]:
    frames: list[int] = []
    start = max(0, candidate["rim_frame"] - 12)
    end = min(frame_count - 1, candidate["rim_frame"] + 30)
    for f in range(start, end + 1):
        zone = _hoop_zone(rim_track, f)
        for d in detections_by_frame.get(f, []):
            if int(d["class_id"]) != CLASS_BALL_IN_BASKET:
                continue
            cx, cy = _bbox_center(d["bbox_xyxy"])
            if zone is None or (abs(cx - zone[0]) <= zone[2] / 2 and abs(cy - zone[1]) <= zone[3] / 2):
                frames.append(f)
                break
    return frames


def _crossed_hoop_plane(
    ball_track: pd.DataFrame, rim_track: pd.DataFrame, candidate: dict, frame_count: int
) -> bool:
    start = max(0, candidate["rim_frame"] - 18)
    end = min(frame_count - 1, candidate["rim_frame"] + 28)
    rows = ball_track[
        (ball_track["frame"] >= start)
        & (ball_track["frame"] <= end)
        & ball_track["x"].notna()
        & ball_track["y"].notna()
    ].sort_values("frame")
    if len(rows) < 2:
        return False

    for (_, a), (_, b) in zip(rows.iloc[:-1].iterrows(), rows.iloc[1:].iterrows()):
        zone = _hoop_zone(rim_track, int(b["frame"])) or _hoop_zone(rim_track, candidate["rim_frame"])
        if zone is None:
            return False
        rim_x, rim_y, width, height = zone
        descending = float(b["y"]) > float(a["y"])
        crosses_y = float(a["y"]) <= rim_y - height * 0.20 and float(b["y"]) >= rim_y + height * 0.20
        if not (descending and crosses_y):
            continue
        denom = float(b["y"] - a["y"])
        alpha = 0.5 if abs(denom) < 1e-6 else (rim_y - float(a["y"])) / denom
        x_at_rim = float(a["x"]) + alpha * float(b["x"] - a["x"])
        if abs(x_at_rim - rim_x) <= width / 2:
            return True
    return False


def _classify_shot_result(
    ball_track: pd.DataFrame,
    rim_track: pd.DataFrame,
    distance_df: pd.DataFrame,
    detections_by_frame: dict[int, list[dict]],
    candidate: dict,
    frame_count: int,
) -> dict:
    rim_frame = int(candidate["rim_frame"])
    rim = _rim_row_at(rim_track, rim_frame)
    if rim is None:
        return {
            "result": "unknown", "result_confidence": 0.20,
            "result_reason": "rim unavailable", "ball_in_basket_frames": [],
        }

    bib_frames = _ball_in_basket_frames(rim_track, detections_by_frame, candidate, frame_count)
    if bib_frames:
        return {
            "result": "make", "result_confidence": 0.92,
            "result_reason": "ball-in-basket detection near rim",
            "ball_in_basket_frames": bib_frames,
        }

    if _crossed_hoop_plane(ball_track, rim_track, candidate, frame_count):
        return {
            "result": "make", "result_confidence": 0.78,
            "result_reason": "descending ball crossed hoop plane",
            "ball_in_basket_frames": [],
        }

    post = distance_df[
        (distance_df["frame"] > rim_frame)
        & (distance_df["frame"] <= min(frame_count - 1, rim_frame + SHOT_WINDOW_FRAMES // 2))
        & distance_df["rim_distance_px"].notna()
        & distance_df["x"].notna()
        & distance_df["y"].notna()
    ]
    if len(post) < 3:
        return {
            "result": "unknown", "result_confidence": 0.30,
            "result_reason": "insufficient post-rim trajectory",
            "ball_in_basket_frames": [],
        }

    zone = _hoop_zone(rim_track, rim_frame)
    last = post.tail(min(5, len(post)))
    last_dist = float(last["rim_distance_px"].mean())
    min_dist = float(candidate.get("min_rim_distance_px", np.nan))
    moved_away = np.isfinite(min_dist) and last_dist > min_dist + RIM_PROXIMITY_PX * 0.55
    below_rim = float(last["y"].median()) > float(rim["rim_y"]) + HOOP_ZONE_HEIGHT_PX * 0.45
    outside_zone = True
    if zone is not None:
        outside_zone = not any(
            abs(float(r["x"]) - zone[0]) <= zone[2] / 2 and abs(float(r["y"]) - zone[1]) <= zone[3] / 2
            for _, r in last.iterrows()
        )

    if moved_away and below_rim and outside_zone:
        return {
            "result": "miss", "result_confidence": 0.70,
            "result_reason": "ball moved away and dropped below the rim without falling through",
            "ball_in_basket_frames": [],
        }
    return {
        "result": "unknown", "result_confidence": 0.40,
        "result_reason": "no decisive made/miss evidence",
        "ball_in_basket_frames": [],
    }


# --- shooter assignment -----------------------------------------------------

def _ball_xy_at(ball_track: pd.DataFrame, frame: int, max_nearest_gap: int = 3) -> tuple[float, float] | None:
    frame = int(frame)
    if 0 <= frame < len(ball_track):
        row = ball_track.iloc[frame]
        if pd.notna(row["x"]) and pd.notna(row["y"]):
            return (float(row["x"]), float(row["y"]))
    start = max(0, frame - max_nearest_gap)
    end = min(len(ball_track) - 1, frame + max_nearest_gap)
    nearby = ball_track[
        (ball_track["frame"] >= start)
        & (ball_track["frame"] <= end)
        & ball_track["x"].notna()
        & ball_track["y"].notna()
    ]
    if len(nearby) == 0:
        return None
    row = nearby.iloc[(nearby["frame"] - frame).abs().argmin()]
    return (float(row["x"]), float(row["y"]))


def _shooter_confidence(distance_px: float | None) -> float:
    if distance_px is None or not np.isfinite(distance_px):
        return 0.0
    if distance_px <= 45:
        return 0.90
    if distance_px <= 85:
        return 0.70
    if distance_px <= MAX_SHOOTER_DISTANCE_PX:
        return 0.45
    return 0.20


def _assign_likely_shooter(
    ball_track: pd.DataFrame,
    detections_by_frame: dict[int, list[dict]],
    candidate: dict,
) -> dict:
    release_frame = int(candidate["release_frame"])
    best = None
    for f in range(max(0, release_frame - SHOOTER_LOOKBACK_FRAMES), release_frame + 1):
        ball_xy = _ball_xy_at(ball_track, f)
        if ball_xy is None:
            continue
        for d in detections_by_frame.get(f, []):
            if int(d["class_id"]) != CLASS_PLAYER:
                continue
            anchor = _bbox_upper_body_center(d["bbox_xyxy"])
            dist = _euclidean(ball_xy, anchor)
            temporal_penalty = (release_frame - f) * 2.0
            score = dist + temporal_penalty
            if best is None or score < best["score"]:
                best = {
                    "score": score, "frame": f,
                    "track_id": d.get("track_id"),
                    "distance_px": float(dist),
                    "bbox": d["bbox_xyxy"],
                }

    if best is None or best["distance_px"] > MAX_SHOOTER_DISTANCE_PX:
        return {
            "shooter_track_id": None, "shooter_distance_px": None,
            "shooter_assignment_confidence": 0.0,
            "shooter_frame": None, "shooter_bbox_xyxy": None,
        }
    return {
        "shooter_track_id": int(best["track_id"]) if best["track_id"] is not None else None,
        "shooter_distance_px": best["distance_px"],
        "shooter_assignment_confidence": _shooter_confidence(best["distance_px"]),
        "shooter_frame": int(best["frame"]),
        "shooter_bbox_xyxy": best["bbox"],
    }


# --- public entrypoint ------------------------------------------------------

def detect_shots(
    detection_records: list[dict],
    frame_count: int,
) -> list[dict]:
    """Run the full shot pipeline.

    `detection_records`: list of dicts shaped like
        {"frame": int, "class_id": int, "bbox_xyxy": [x1, y1, x2, y2], "conf": float,
         "track_id": int | None}
    `frame_count`: total source video frame count.

    Returns a list of event dicts (one per shot), each carrying enough info for the
    bridge to project shooter coords into court space and emit the GUI's `Shot` shape.
    """
    detections_by_frame: dict[int, list[dict]] = defaultdict(list)
    for row in detection_records:
        detections_by_frame[int(row["frame"])].append(row)

    ball_track = _build_ball_track(detections_by_frame, frame_count)
    rim_track = _build_rim_track(detections_by_frame, frame_count)

    candidates, distance_df = _detect_shot_candidates(
        ball_track, rim_track, detections_by_frame, frame_count
    )

    events: list[dict] = []
    for cand in candidates:
        result = _classify_shot_result(
            ball_track, rim_track, distance_df, detections_by_frame, cand, frame_count
        )
        shooter = _assign_likely_shooter(ball_track, detections_by_frame, cand)
        rim = _rim_row_at(rim_track, cand["rim_frame"])

        shooter_bbox = shooter.get("shooter_bbox_xyxy")
        if shooter_bbox is not None:
            sx = 0.5 * (float(shooter_bbox[0]) + float(shooter_bbox[2]))
            sy = float(shooter_bbox[3])  # bottom-center y (player's feet)
        else:
            sx, sy = None, None

        events.append({
            "shot_id": cand["shot_id"],
            "start_frame": cand["start_frame"],
            "release_frame": cand["release_frame"],
            "rim_frame": cand["rim_frame"],
            "end_frame": cand["end_frame"],
            **result,
            **shooter,
            "shot_x_image": sx,
            "shot_y_image": sy,
            "rim_x": float(rim["rim_x"]) if rim is not None else None,
            "rim_y": float(rim["rim_y"]) if rim is not None else None,
            "candidate_reason": cand["candidate_reason"],
        })
    return events
