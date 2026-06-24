"""
Colour-based team classifier — pipeline module.

A drop-in replacement for the SigLIP→UMAP→KMeans `AnchoredTeamClassifier` that separates
the two teams by the jersey colour *actually observed in this clip*, not by a per-team
colour database (which is unreliable — NBA jerseys change home/away/City/Statement and
many teams have a white variant) and not by greyscale brightness (a weak, easily-inverted
clue).

Why colour over the SigLIP embedding here:
  - It separates on the real discriminator (jersey colour), so it is robust to a player's
    pose, the ball occluding the torso, and motion blur — the exact things that made the
    embedding flip on shot frames.
  - It is deterministic and cheap (no neural net at inference).
  - The two cluster centroids ARE the teams' real colours, so we can hand the GUI a correct
    swatch per team straight from this game's pixels (the agreed "auto buckets" behaviour).

Single per-frame reads are still only ~85% reliable on broadcast crops, so callers MUST
aggregate the per-frame `predict()` output over each track's whole life (the bridge already
does this) — many colour reads out-vote the occasional bad one.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Sequence

import cv2
import numpy as np
from sklearn.cluster import KMeans  # type: ignore[import-not-found]


# Median CIELAB colour of a jersey crop's chest region.
def torso_lab(crop: np.ndarray | None) -> np.ndarray | None:
    """Median CIELAB colour of the chest region of a player crop, or None if unusable.

    The crop is expected to be a torso-tightened player box. We take its upper-centre
    (the jersey, above the shorts), drop near-black pixels (deep shadow / background bleed),
    and take the median so a few stray pixels don't move the estimate. LAB is used because
    Euclidean distance in LAB is roughly perceptual — white separates from blue on the L
    (lightness) axis, red from blue on the a/b (colour) axes, so one space handles both
    light-vs-dark and colour-vs-colour matchups.
    """
    if crop is None or crop.size == 0:
        return None
    h, w = crop.shape[:2]
    if h < 4 or w < 4:
        return None
    # Upper-centre of the crop ≈ chest/jersey, away from shorts and the box edges.
    region = crop[: max(1, int(0.55 * h)), max(0, int(0.12 * w)) : max(1, int(0.88 * w))]
    if region.size == 0:
        region = crop
    lab = cv2.cvtColor(region, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
    value = cv2.cvtColor(region, cv2.COLOR_BGR2HSV).reshape(-1, 3)[:, 2]
    # Keep white jerseys (high V, low saturation) — only drop deep shadow / black pixels.
    keep = value > 35
    use = lab[keep] if int(keep.sum()) >= 10 else lab
    return np.median(use, axis=0)


# Convert an OpenCV LAB triplet back to a #RRGGBB hex string for the GUI.
def _lab_to_hex(lab: np.ndarray) -> str:
    px = np.clip(np.round(lab), 0, 255).astype(np.uint8).reshape(1, 1, 3)
    bgr = cv2.cvtColor(px, cv2.COLOR_LAB2BGR)[0, 0]
    return f"#{int(bgr[2]):02x}{int(bgr[1]):02x}{int(bgr[0]):02x}"


# Two-team classifier anchored to the clip's own jersey colours.
@dataclass(frozen=True)
class ColorTeamClassifier:
    """Assigns each jersey crop to team 0 or 1 by nearest observed jersey colour.

    `centroids[t]` is the LAB colour of team `t`; `team_hex[t]` is the same colour as a
    GUI swatch. Anchoring is deterministic: team 0 is always the *darker* jersey (lower LAB
    lightness), so the same clip resolves the same way every run.
    """

    centroids: np.ndarray   # shape (2, 3), LAB, row t = team t
    team_hex: list[str]     # display hex per team id

    # Best team id for one LAB colour plus a 0..1 confidence (centroid-distance margin).
    def _assign(self, lab: np.ndarray) -> tuple[int, float]:
        d0 = float(np.linalg.norm(lab - self.centroids[0]))
        d1 = float(np.linalg.norm(lab - self.centroids[1]))
        total = d0 + d1
        team = 0 if d0 <= d1 else 1
        conf = abs(d0 - d1) / total if total > 1e-6 else 0.0
        return team, conf

    # Predict a team id (0/1) and confidence for each crop.
    def predict_with_conf(self, crops: Sequence[np.ndarray]) -> list[tuple[int, float]]:
        out: list[tuple[int, float]] = []
        for crop in crops:
            lab = torso_lab(crop)
            out.append((0, 0.0) if lab is None else self._assign(lab))
        return out

    # Predict just the team id for each crop (drop-in for AnchoredTeamClassifier.predict).
    def predict(self, crops: Sequence[np.ndarray]) -> list[int]:
        return [team for team, _ in self.predict_with_conf(crops)]


# Fit the two team colours from sampled jersey crops and anchor darker → team 0.
def fit_color_anchored(crops: Sequence[np.ndarray]) -> ColorTeamClassifier:
    """Cluster the sampled crops' jersey colours into the two teams and anchor them.

    Mirrors how `team_classification.fit_anchored` is called (same crop list), but clusters
    on LAB jersey colour instead of SigLIP embeddings. Deterministic (seeded KMeans + a
    fixed darker→team_0 anchor).
    """
    labs = [torso_lab(c) for c in crops]
    labs = [l for l in labs if l is not None]
    if len(labs) < 2:
        raise ValueError("fit_color_anchored needs at least 2 usable jersey crops")
    x = np.asarray(labs, dtype=np.float32)
    km = KMeans(n_clusters=2, random_state=42, n_init=10).fit(x)
    c0, c1 = km.cluster_centers_[0], km.cluster_centers_[1]
    # Deterministic anchor: the darker jersey (lower LAB lightness L) is team 0.
    if float(c0[0]) > float(c1[0]):
        c0, c1 = c1, c0
    centroids = np.vstack([c0, c1])
    return ColorTeamClassifier(centroids=centroids, team_hex=[_lab_to_hex(c0), _lab_to_hex(c1)])
