'use client'

// React hooks, shared types, filter context, court geometry helpers and the shot marker component
import { useMemo, useState } from 'react'
import { Shot, PlayerTrack, Team, CourtMeta } from '@/types/basketball'
import { useFilters } from '@/context/FilterContext'
import { COURT, courtToSvg, getCourtHeight } from '@/lib/court-utils'
import { ShotMarker } from './ShotMarker'

// Props for the court map, including optional model-rendered PNG and its pixel/feet metadata
interface Props {
  shots: Shot[]
  playerTracks: PlayerTrack[]
  teams: Record<string, Team>
  /** When supplied, renders the model-rendered court PNG instead of the synthetic SVG court. */
  imageUrl?: string | null
  /** Pixel/feet metadata for the court image so dots line up with the rendered PNG. */
  court?: CourtMeta | null
}

// Shared colours for the synthetic SVG court lines, background, paint and rim
const LINE = 'rgba(255, 255, 255, 0.35)'
const COURT_BG = 'rgba(12, 18, 38, 0.45)'
const PAINT_BG = 'rgba(108, 140, 255, 0.18)'
const RIM = '#ffae5b'

// Main court map component that plots shots over either a model PNG or a synthetic SVG court
export function CourtMap({
  shots,
  playerTracks,
  teams,
  imageUrl,
  court,
}: Props) {
  // Read the active filters and current court mode from context
  const filters = useFilters()
  const { courtMode } = filters

  // Index player tracks by their track id so each shot can look up its shooter quickly
  const trackMap = useMemo(
    () => new Map(playerTracks.map(pt => [pt.trackId, pt])),
    [playerTracks],
  )

  // Narrow the shots down to those matching the active team, player and shot-type filters
  const filteredShots = useMemo(() => {
    return shots.filter(s => {
      if (filters.teamId && s.shooterTeamId !== filters.teamId) return false
      if (filters.playerTrackId !== null && s.shooterTrackId !== filters.playerTrackId) return false
      // FilterControls overloads `shotType`: 'jump' chip means 3P only, 'layup' chip means 2P only.
      // The underlying Shot.shotType from the analyzer is currently always 'jump' so we filter by
      // the geometric `isThreePointer` flag instead, which is what users actually expect.
      if (filters.shotType === 'jump' && !s.isThreePointer) return false
      if (filters.shotType === 'layup' && s.isThreePointer) return false
      return true
    })
  }, [shots, filters])

  // Prefer the rendered PNG from the model when available.
  if (imageUrl) {
    return (
      <ModelCourtImage
        imageUrl={imageUrl}
        court={court}
        totalTracks={playerTracks.length}
        shots={filteredShots}
      />
    )
  }

  // Work out the SVG viewbox height for the chosen half or full court mode
  const height = getCourtHeight(courtMode)

  // Render the synthetic SVG court with line work, shot markers and a legend
  return (
    <div className="w-full">
      <div className="w-full" style={{ aspectRatio: `${COURT.WIDTH} / ${height}` }}>
        <svg
          viewBox={`0 0 ${COURT.WIDTH} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full rounded-lg"
        >
          <CourtLines courtMode={courtMode} />

          <g>
            {filteredShots.map((shot, i) => {
              const { x: svgX, y: svgY } = courtToSvg(shot.location, courtMode)
              const player = trackMap.get(shot.shooterTrackId)
              const team = teams[shot.shooterTeamId]
              return (
                <ShotMarker
                  key={shot.id}
                  shot={shot}
                  svgX={svgX}
                  svgY={svgY}
                  player={player}
                  teamColor={team?.color ?? '#888'}
                  teamName={team?.name ?? shot.shooterTeamId}
                  index={i}
                />
              )
            })}
          </g>
        </svg>
      </div>

      <div className="mt-4 flex items-center gap-5 text-xs text-[var(--text-muted)]">
        <LegendItem color="var(--made)" symbol="O" label="Made" />
        <LegendItem color="var(--miss)" symbol="X" label="Missed" />
        <span className="ml-auto tabular-nums text-[var(--text-soft)]">
          {filteredShots.length} shot{filteredShots.length !== 1 ? 's' : ''} shown
        </span>
      </div>
    </div>
  )
}

// Renders the model's court PNG with an SVG overlay of shot markers aligned to the image pixels
function ModelCourtImage({
  imageUrl,
  court,
  totalTracks,
  shots,
}: {
  imageUrl: string
  court?: CourtMeta | null
  totalTracks: number
  shots: Shot[]
}) {
  // Track whether the PNG failed to load so we can show a fallback message
  const [loadError, setLoadError] = useState(false)

  // Show a friendly placeholder when the court render could not be loaded
  if (loadError) {
    return (
      <div className="flex h-full min-h-[260px] flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-6 text-center">
        <p
          className="text-sm font-semibold text-[var(--text)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Court render unavailable
        </p>
        <p className="mt-1.5 max-w-[280px] text-xs text-[var(--text-muted)]">
          The analyzer ran but no court image was produced for this clip.
        </p>
      </div>
    )
  }

  // Use the rendered PNG's pixel dimensions when available so the SVG overlay matches
  // the underlying image exactly. Fallback: NBA full-court aspect with default padding
  // (sports.basketball.draw_court uses scale=20 px/ft and 50px padding).
  const widthPx = court?.widthPx ?? 1980
  const heightPx = court?.heightPx ?? 1100
  const scale = court?.scale ?? 20
  const padding = court?.padding ?? 50

  return (
    <div className="w-full">
      <div className="relative overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- dynamic API endpoint */}
        <img
          src={imageUrl}
          alt="Court map with live player positions"
          className="block h-auto w-full"
          onError={() => setLoadError(true)}
        />
        <svg
          viewBox={`0 0 ${widthPx} ${heightPx}`}
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          {/* Shot markers (O for made, X for missed). Player tracking dots are intentionally
              omitted from the shot map — they live in the video feed instead. */}
          {shots.map((shot) => {
            const cx = shot.location.x * scale + padding
            const cy = shot.location.y * scale + padding
            const made = shot.result === 'made'
            const color = made ? '#22d65f' : '#ff6b6b'
            return (
              <g key={`shot-${shot.id}`} style={{ pointerEvents: 'none' }}>
                <text
                  x={cx}
                  y={cy}
                  fontSize={36}
                  fontFamily="var(--font-display)"
                  fontWeight={700}
                  fill={color}
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{ filter: `drop-shadow(0 0 6px ${color}80)` }}
                >
                  {made ? 'O' : 'X'}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="mt-4 flex items-center gap-5 text-xs text-[var(--text-muted)]">
        <LegendItem color="var(--made)" symbol="O" label="Made" />
        <LegendItem color="var(--miss)" symbol="X" label="Missed" />
        <span className="tabular-nums text-[var(--text-soft)]">
          {shots.length} shot{shots.length !== 1 ? 's' : ''}
        </span>
        <span className="ml-auto tabular-nums text-[var(--text-soft)]">
          {totalTracks} track{totalTracks !== 1 ? 's' : ''} projected
        </span>
      </div>
    </div>
  )
}

// Small legend entry pairing a coloured symbol with its label
function LegendItem({ color, symbol, label }: { color: string; symbol: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        style={{ color, fontFamily: 'var(--font-display)' }}
        className="text-sm font-bold leading-none"
      >
        {symbol}
      </span>
      {label}
    </span>
  )
}

// Draws the court outline, mirroring the half court for full-court mode and adding the centre line
function CourtLines({ courtMode }: { courtMode: 'half' | 'full' }) {
  return (
    <>
      <HalfCourt yOffset={0} />
      {courtMode === 'full' && (
        <g transform={`translate(0, ${COURT.HALF_HEIGHT}) scale(1, -1) translate(0, -${COURT.HALF_HEIGHT})`}>
          <HalfCourt yOffset={COURT.HALF_HEIGHT} />
        </g>
      )}
      {courtMode === 'full' && (
        <line
          x1={0} y1={COURT.HALF_HEIGHT}
          x2={COURT.WIDTH} y2={COURT.HALF_HEIGHT}
          stroke={LINE} strokeWidth={1.5}
        />
      )}
    </>
  )
}

// Draws all the line work for a single half court, offset vertically for the second half
function HalfCourt({ yOffset }: { yOffset: number }) {
  // Pre-compute the basket, key and three-point arc positions for this half
  const bx = COURT.BASKET_X
  const by = COURT.BASKET_Y + yOffset
  const keyTop = COURT.KEY_Y + yOffset

  const threeArcD = describeArc(bx, by, COURT.THREE_POINT_RADIUS,
    angleForCorner(yOffset),
    180 - angleForCorner(yOffset))

  return (
    <g stroke={LINE} strokeWidth={1.5} fill="none">
      {/* Court background */}
      <rect x={0} y={yOffset} width={COURT.WIDTH} height={COURT.HALF_HEIGHT} fill={COURT_BG} />

      {/* Paint */}
      <rect
        x={COURT.KEY_X} y={keyTop}
        width={COURT.KEY_WIDTH} height={COURT.KEY_HEIGHT}
        fill={PAINT_BG} stroke={LINE}
      />

      {/* Free throw circle top half */}
      <path
        d={describeArc(bx, keyTop, COURT.FREE_THROW_RADIUS, 180, 360)}
        stroke={LINE} fill="none"
      />
      {/* Free throw circle bottom half (dashed) */}
      <path
        d={describeArc(bx, keyTop, COURT.FREE_THROW_RADIUS, 0, 180)}
        stroke={LINE} fill="none" strokeDasharray="6 5"
      />

      {/* Restricted area arc */}
      <path
        d={describeArc(bx, by, COURT.RESTRICTED_RADIUS, 180, 360)}
        stroke={LINE} fill="none"
      />

      {/* Backboard */}
      <line
        x1={bx - COURT.BACKBOARD_HALF} y1={COURT.BACKBOARD_Y + yOffset}
        x2={bx + COURT.BACKBOARD_HALF} y2={COURT.BACKBOARD_Y + yOffset}
        stroke={LINE} strokeWidth={2.5}
      />

      {/* Basket rim */}
      <circle cx={bx} cy={by} r={7.5} stroke={RIM} strokeWidth={1.75} fill="none" />

      {/* Corner 3-point lines */}
      <line
        x1={COURT.CORNER_THREE_X_LEFT} y1={yOffset}
        x2={COURT.CORNER_THREE_X_LEFT} y2={COURT.CORNER_THREE_Y + yOffset}
        stroke={LINE}
      />
      <line
        x1={COURT.CORNER_THREE_X_RIGHT} y1={yOffset}
        x2={COURT.CORNER_THREE_X_RIGHT} y2={COURT.CORNER_THREE_Y + yOffset}
        stroke={LINE}
      />

      {/* 3-point arc */}
      <path d={threeArcD} stroke={LINE} fill="none" />

      {/* Boundary */}
      <rect
        x={0.75} y={yOffset + 0.75}
        width={COURT.WIDTH - 1.5} height={COURT.HALF_HEIGHT - 1.5}
        stroke={LINE} strokeWidth={1.5}
      />
    </g>
  )
}

// Converts a centre point, radius and angle into x/y coordinates on a circle
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  }
}

// Builds an SVG path string for an arc between two angles around a centre point
function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polarToCartesian(cx, cy, r, endDeg)
  const end = polarToCartesian(cx, cy, r, startDeg)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`
}

// Works out the angle where the three-point arc meets the corner three lines
function angleForCorner(_yOffset: number) {
  const dx = COURT.BASKET_X - COURT.CORNER_THREE_X_LEFT
  const dy = COURT.CORNER_THREE_Y - COURT.BASKET_Y
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI
  return 90 - angleDeg
}
