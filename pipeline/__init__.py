"""
Bridge pipeline package.

Each module here is a Python extraction of one team member's notebook so the bridge
script (`scripts/analyze.py`) and the GUI can run that exact logic on uploaded video
without re-running the notebooks. See DEFENSE_NOTES.md for the cell-by-cell map.

Modules:
    geometry              — NBA-rules court math (is_three_pointer, nearest_basket).
    player_detection      — Abdo's 6-class YOLO + BoT-SORT.
    court_mapping         — Zyad's CVM pose model → homography → court projection.
    team_classification   — TeamClassifier fit/predict + brightness-anchored labels.
    shot_detection        — Ilias's shot pipeline (ball+rim trajectories, make/miss).
"""

from . import (  # noqa: F401 — re-export for convenience
    court_mapping,
    geometry,
    player_detection,
    shot_detection,
    team_classification,
)
