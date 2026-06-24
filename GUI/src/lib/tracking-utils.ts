import { AnalysisFrame, FramePlayer } from '@/types/basketball'

// The analyzer samples player positions every few frames (SAMPLE_STRIDE), so to animate the
// court map smoothly we interpolate each player's position between the two samples that bracket
// the current playback time. Positions are in court feet — the same space shot locations use.

// Finds the index of the last frame whose timestamp is <= t (binary search over sorted frames).
// Returns -1 when t precedes the first sample.
function lastFrameAtOrBefore(frames: AnalysisFrame[], t: number): number {
  let lo = 0
  let hi = frames.length - 1
  let result = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (frames[mid].t <= t) {
      result = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return result
}

// Returns each player's interpolated court position at playback time `t` (seconds).
// Players present in only one of the two bracketing samples are passed through at their known
// position rather than dropped, so a player flickering in/out of detection still renders.
export function playersAtTime(frames: AnalysisFrame[], t: number): FramePlayer[] {
  if (frames.length === 0) return []

  const prevIdx = lastFrameAtOrBefore(frames, t)

  // Before the first sample → show the first frame as-is.
  if (prevIdx < 0) return frames[0].players
  // At or after the last sample → show the last frame as-is.
  if (prevIdx >= frames.length - 1) return frames[frames.length - 1].players

  const prev = frames[prevIdx]
  const next = frames[prevIdx + 1]

  // Fraction of the way from prev to next (guard against duplicate timestamps).
  const span = next.t - prev.t
  const frac = span > 0 ? Math.min(1, Math.max(0, (t - prev.t) / span)) : 0

  const nextById = new Map(next.players.map(p => [p.trackId, p]))
  const seen = new Set<number>()
  const out: FramePlayer[] = []

  for (const p of prev.players) {
    seen.add(p.trackId)
    const n = nextById.get(p.trackId)
    if (!n) {
      // Player only in the previous sample — hold position.
      out.push(p)
      continue
    }
    out.push({
      trackId: p.trackId,
      teamId: p.teamId,
      x: p.x + (n.x - p.x) * frac,
      y: p.y + (n.y - p.y) * frac,
    })
  }

  // Players that appear only in the next sample — show them at their next position.
  for (const n of next.players) {
    if (!seen.has(n.trackId)) out.push(n)
  }

  return out
}
