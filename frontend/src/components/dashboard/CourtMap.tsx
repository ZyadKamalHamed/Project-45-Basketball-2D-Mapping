'use client'

import { useMemo } from 'react'
import { Shot, PlayerTrack, Team } from '@/types/basketball'
import { useFilters } from '@/context/FilterContext'
import { COURT, courtToSvg, getCourtHeight } from '@/lib/court-utils'
import { ShotMarker } from './ShotMarker'

interface Props {
  shots: Shot[]
  playerTracks: PlayerTrack[]
  teams: Record<string, Team>
}

const LINE = '#3f5070'
const COURT_BG = '#1a2744'
const PAINT_BG = '#162038'

export function CourtMap({ shots, playerTracks, teams }: Props) {
  const filters = useFilters()
  const { courtMode } = filters
  const height = getCourtHeight(courtMode)

  const trackMap = useMemo(
    () => new Map(playerTracks.map(pt => [pt.trackId, pt])),
    [playerTracks],
  )

  const filteredShots = useMemo(() => {
    return shots.filter(s => {
      if (filters.teamId && s.shooterTeamId !== filters.teamId) return false
      if (filters.playerTrackId !== null && s.shooterTrackId !== filters.playerTrackId) return false
      if (filters.shotType && s.shotType !== filters.shotType) return false
      return true
    })
  }, [shots, filters])

  return (
    <div className="w-full" style={{ aspectRatio: `${COURT.WIDTH} / ${height}` }}>
      <svg
        viewBox={`0 0 ${COURT.WIDTH} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full rounded-lg"
      >
        <CourtLines courtMode={courtMode} />

        <g>
          {filteredShots.map(shot => {
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
              />
            )
          })}
        </g>
      </svg>

      <div className="mt-3 flex items-center gap-5 text-xs text-slate-400">
        <LegendItem color="#22c55e" symbol="○" label="Made" />
        <LegendItem color="#ef4444" symbol="✕" label="Missed" />
        <span className="ml-auto">
          {filteredShots.length} shot{filteredShots.length !== 1 ? 's' : ''} shown
        </span>
      </div>
    </div>
  )
}

function LegendItem({ color, symbol, label }: { color: string; symbol: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span style={{ color }} className="font-bold text-sm leading-none">{symbol}</span>
      {label}
    </span>
  )
}

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
          stroke={LINE} strokeWidth={2}
        />
      )}
    </>
  )
}

function HalfCourt({ yOffset }: { yOffset: number }) {
  const bx = COURT.BASKET_X
  const by = COURT.BASKET_Y + yOffset
  const keyTop = COURT.KEY_Y + yOffset
  const keyBot = COURT.KEY_Y + COURT.KEY_HEIGHT + yOffset
  const halfLine = COURT.HALF_HEIGHT + yOffset

  const threeArcD = describeArc(bx, by, COURT.THREE_POINT_RADIUS,
    angleForCorner(yOffset),
    180 - angleForCorner(yOffset))

  return (
    <g stroke={LINE} strokeWidth={2} fill="none">
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
        stroke={LINE} fill="none" strokeDasharray="8 6"
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
        stroke={LINE} strokeWidth={3}
      />

      {/* Basket */}
      <circle cx={bx} cy={by} r={7.5} stroke="#e07030" strokeWidth={2} fill="none" />

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
      <rect x={0} y={yOffset} width={COURT.WIDTH} height={COURT.HALF_HEIGHT} stroke={LINE} />

      {/* Half-court line (only in half-court mode — draw as border) */}
    </g>
  )
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  }
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const start = polarToCartesian(cx, cy, r, endDeg)
  const end = polarToCartesian(cx, cy, r, startDeg)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`
}

function angleForCorner(_yOffset: number) {
  // angle where 3-point arc meets corner line at x=30, basket at (250, 52.5)
  // dx = 250-30 = 220, dy = 52.5 (upward in SVG), arc radius = 238
  // We want the arc to start at (30, CORNER_THREE_Y) and end at (470, CORNER_THREE_Y)
  const dx = COURT.BASKET_X - COURT.CORNER_THREE_X_LEFT  // 220
  const dy = COURT.CORNER_THREE_Y - COURT.BASKET_Y       // ~87.5
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI
  return 90 - angleDeg
}
