import { AnalysisFrame, Team } from '@/types/basketball'

// Movement analytics derived purely from the tracking samples the analyzer already emits
// (frames[] — court positions in feet, per player, with timestamps). No extra model inference.

// Court bounds in feet (NBA full court) — mirrors pipeline/geometry.py.
const COURT_LENGTH_FT = 94
const COURT_WIDTH_FT = 50
const OUT_OF_BOUNDS_MARGIN_FT = 6
// 1 ft/s = 0.681818 mph; 1 ft = 0.3048 m.
const FTPS_TO_MPH = 0.681818
const FT_TO_M = 0.3048
// Homography can momentarily teleport a projected point. A sample step implying a speed above
// a basketball-plausible sprint is treated as jitter and excluded from totals.
const MAX_PLAUSIBLE_MPH = 22

// Per-player movement summary over the whole clip.
export interface PlayerMovement {
  trackId: number
  teamId: string
  distanceFt: number
  distanceM: number
  topSpeedMph: number
  avgSpeedMph: number
}

// Per-team court-spacing summary (average area covered by that team's players).
export interface TeamSpacing {
  teamId: string
  teamName: string
  shortName: string
  color: string
  avgSpacingSqFt: number
  totalDistanceFt: number
}

// True when a court point sits within the court (plus a small margin for projection slack).
function inBounds(x: number, y: number): boolean {
  return (
    x >= -OUT_OF_BOUNDS_MARGIN_FT &&
    x <= COURT_LENGTH_FT + OUT_OF_BOUNDS_MARGIN_FT &&
    y >= -OUT_OF_BOUNDS_MARGIN_FT &&
    y <= COURT_WIDTH_FT + OUT_OF_BOUNDS_MARGIN_FT
  )
}

// Computes total distance covered, top speed and average speed for every tracked player,
// rejecting implausible jumps caused by homography jitter.
export function computePlayerMovement(frames: AnalysisFrame[]): PlayerMovement[] {
  // Gather each player's (t, x, y) samples and tally how often each team label is seen.
  const tracks = new Map<
    number,
    { samples: { t: number; x: number; y: number }[]; teamVotes: Map<string, number> }
  >()

  for (const frame of frames) {
    for (const p of frame.players) {
      if (!inBounds(p.x, p.y)) continue
      let track = tracks.get(p.trackId)
      if (!track) {
        track = { samples: [], teamVotes: new Map() }
        tracks.set(p.trackId, track)
      }
      track.samples.push({ t: frame.t, x: p.x, y: p.y })
      track.teamVotes.set(p.teamId, (track.teamVotes.get(p.teamId) ?? 0) + 1)
    }
  }

  const out: PlayerMovement[] = []

  for (const [trackId, track] of tracks) {
    const samples = track.samples.sort((a, b) => a.t - b.t)
    if (samples.length < 2) continue

    let distanceFt = 0
    let movingTime = 0
    let topSpeedMph = 0

    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1]
      const cur = samples[i]
      const dt = cur.t - prev.t
      if (dt <= 0) continue
      const dist = Math.hypot(cur.x - prev.x, cur.y - prev.y)
      const speedMph = (dist / dt) * FTPS_TO_MPH
      if (speedMph > MAX_PLAUSIBLE_MPH) continue // jitter — skip this segment
      distanceFt += dist
      movingTime += dt
      if (speedMph > topSpeedMph) topSpeedMph = speedMph
    }

    if (distanceFt <= 0) continue

    // Pick the most frequently observed team label for this track.
    let teamId = ''
    let bestVotes = -1
    for (const [team, votes] of track.teamVotes) {
      if (votes > bestVotes) {
        bestVotes = votes
        teamId = team
      }
    }

    const avgSpeedMph = movingTime > 0 ? (distanceFt / movingTime) * FTPS_TO_MPH : 0

    out.push({
      trackId,
      teamId,
      distanceFt,
      distanceM: distanceFt * FT_TO_M,
      topSpeedMph,
      avgSpeedMph,
    })
  }

  // Most ground covered first.
  return out.sort((a, b) => b.distanceFt - a.distanceFt)
}

// Polygon area via the shoelace formula.
function polygonArea(points: { x: number; y: number }[]): number {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    area += a.x * b.y - b.x * a.y
  }
  return Math.abs(area) / 2
}

// Convex hull (Andrew's monotone chain) of a set of court points.
function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 3) return points
  const pts = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))
  const cross = (
    o: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

  const lower: { x: number; y: number }[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }
  const upper: { x: number; y: number }[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

// Computes each team's average on-court spacing (convex-hull area, sq ft) across the clip,
// plus the total distance the team covered. Frames where a team has fewer than 3 players are
// skipped for spacing since a hull needs at least a triangle.
export function computeTeamSpacing(
  frames: AnalysisFrame[],
  teams: Record<string, Team>,
): TeamSpacing[] {
  const movement = computePlayerMovement(frames)
  const distanceByTeam = new Map<string, number>()
  for (const m of movement) {
    distanceByTeam.set(m.teamId, (distanceByTeam.get(m.teamId) ?? 0) + m.distanceFt)
  }

  const areaSum = new Map<string, number>()
  const areaCount = new Map<string, number>()

  for (const frame of frames) {
    const byTeam = new Map<string, { x: number; y: number }[]>()
    for (const p of frame.players) {
      if (!inBounds(p.x, p.y)) continue
      if (!byTeam.has(p.teamId)) byTeam.set(p.teamId, [])
      byTeam.get(p.teamId)!.push({ x: p.x, y: p.y })
    }
    for (const [teamId, pts] of byTeam) {
      if (pts.length < 3) continue
      areaSum.set(teamId, (areaSum.get(teamId) ?? 0) + polygonArea(convexHull(pts)))
      areaCount.set(teamId, (areaCount.get(teamId) ?? 0) + 1)
    }
  }

  return Object.entries(teams).map(([teamId, team]) => {
    const count = areaCount.get(teamId) ?? 0
    return {
      teamId,
      teamName: team.name,
      shortName: team.shortName,
      color: team.color,
      avgSpacingSqFt: count > 0 ? (areaSum.get(teamId) ?? 0) / count : 0,
      totalDistanceFt: distanceByTeam.get(teamId) ?? 0,
    }
  })
}
