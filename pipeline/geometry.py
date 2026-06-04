"""
Court geometry helpers — pure NBA-rules math, no ML.

These are not derived from any team notebook because they're just standard NBA court
measurements.

Constants reflect the NBA full-court rectangle in feet, oriented with the long axis as
the x dimension (0 → 94 ft) and the short axis as y (0 → 50 ft). Basket centres are
the standard 5.25 ft inside each baseline.
"""

from __future__ import annotations

# Standard library import for distance maths.
import math

# Court dimensions and basket positions in feet for the NBA full court.
# NBA full court: 94 ft long, 50 ft wide. Basket centres sit 5.25 ft inside each baseline.
COURT_LENGTH_FT = 94.0
COURT_WIDTH_FT = 50.0
BASKETS_FT: list[tuple[float, float]] = [
    (5.25, 25.0),                       # left-hoop centre
    (COURT_LENGTH_FT - 5.25, 25.0),     # right-hoop centre
]

# NBA arc rules.
THREE_POINT_ARC_FT = 23.75   # distance from basket centre to the arc (top + wings)
THREE_POINT_CORNER_FT = 22.0  # corner threes are slightly closer because the sideline truncates the arc
CORNER_LANE_HALF_WIDTH_FT = 3.0  # within 3 ft of a sideline → "corner zone"


# Work out which basket is closest to a court point and how far away it is.
def nearest_basket(x: float, y: float) -> tuple[tuple[float, float], float]:
    """Return (basket_xy, distance_ft) for whichever basket is closer to the point."""
    best = min(BASKETS_FT, key=lambda b: (b[0] - x) ** 2 + (b[1] - y) ** 2)
    dist = math.hypot(best[0] - x, best[1] - y)
    return best, dist


# Decide whether a court point counts as a three-pointer under NBA rules.
def is_three_pointer(x: float, y: float) -> bool:
    """Classify a court-coordinate point as a 3-pointer per NBA rules.

    Anywhere within ``THREE_POINT_CORNER_FT`` of a basket *and* in the corner zone
    (within ``CORNER_LANE_HALF_WIDTH_FT`` of a sideline) is a 2. Above the break,
    the threshold relaxes to ``THREE_POINT_ARC_FT``. This matches the NBA rulebook.
    """
    _, dist = nearest_basket(x, y)
    in_corner = abs(y - COURT_WIDTH_FT / 2) > (COURT_WIDTH_FT / 2 - CORNER_LANE_HALF_WIDTH_FT)
    return dist >= THREE_POINT_CORNER_FT if in_corner else dist >= THREE_POINT_ARC_FT


# Check a point sits within the court rectangle, with a margin to tolerate homography wobble.
def is_on_court(x: float, y: float, margin: float = 6.0) -> bool:
    """True when (x, y) sits inside the court rectangle (with a forgiving margin).

    Used to drop projections that landed in the crowd because the homography wobbled
    on a noisy keypoint frame.
    """
    return (
        -margin <= x <= COURT_LENGTH_FT + margin
        and -margin <= y <= COURT_WIDTH_FT + margin
    )
