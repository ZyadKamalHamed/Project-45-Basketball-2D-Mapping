'use client'

// React hooks, the portal helper for the tooltip and the shared shot and player types
import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Shot, PlayerTrack } from '@/types/basketball'

// Props for a single shot marker, including its SVG position and shooter details
interface Props {
  shot: Shot
  svgX: number
  svgY: number
  player: PlayerTrack | undefined
  teamColor: string
  teamName: string
  index?: number
}

// Cursor position used to place the hover tooltip
interface TooltipState {
  x: number
  y: number
}

// Colours used for made and missed shot markers
const MADE_COLOR = '#22d65f'
const MISSED_COLOR = '#ff6b6b'

// Renders one shot as an O or X on the court with a hover tooltip
export function ShotMarker({ shot, svgX, svgY, player, teamColor, teamName, index = 0 }: Props) {
  // Track the tooltip position and derive the marker colour and shooter label
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const made = shot.result === 'made'
  const color = made ? MADE_COLOR : MISSED_COLOR
  const label = player?.playerName ?? `Player #${shot.shooterTrackId}`

  // Show, move and hide the tooltip in response to mouse events
  const handleEnter = useCallback((e: React.MouseEvent) => {
    setTooltip({ x: e.clientX, y: e.clientY })
  }, [])
  const handleMove = useCallback((e: React.MouseEvent) => {
    setTooltip({ x: e.clientX, y: e.clientY })
  }, [])
  const handleLeave = useCallback(() => setTooltip(null), [])

  // Stagger entrance for cinematic effect (capped so big batches don't crawl)
  const delay = Math.min(index * 18, 800)

  return (
    <>
      <g
        onMouseEnter={handleEnter}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        style={{ cursor: 'pointer' }}
      >
        {/* Halo ring on hover (renders below) */}
        {tooltip && (
          <circle
            cx={svgX}
            cy={svgY}
            r={11}
            fill="none"
            stroke={color}
            strokeWidth={1.25}
            opacity={0.35}
          />
        )}

        <text
          x={svgX}
          y={svgY}
          textAnchor="middle"
          dominantBaseline="central"
          fill={color}
          fontFamily="var(--font-display), ui-sans-serif, system-ui"
          fontWeight={700}
          fontSize={made ? 15 : 16}
          className="shot-pop"
          style={{ animationDelay: `${delay}ms`, paintOrder: 'stroke', stroke: 'rgba(6, 8, 15, 0.85)', strokeWidth: 2.5 }}
        >
          {made ? 'O' : 'X'}
        </text>
      </g>

      {tooltip &&
        createPortal(
          <ShotTooltip
            x={tooltip.x}
            y={tooltip.y}
            label={label}
            shot={shot}
            teamColor={teamColor}
            teamName={teamName}
          />,
          document.body,
        )}
    </>
  )
}

// Floating tooltip showing the shooter, team and shot details, flipped to stay on screen
function ShotTooltip({
  x,
  y,
  label,
  shot,
  teamColor,
  teamName,
}: {
  x: number
  y: number
  label: string
  shot: Shot
  teamColor: string
  teamName: string
}) {
  // Position the tooltip near the cursor, flipping left when close to the right edge
  const flipLeft = x > window.innerWidth / 2
  const left = flipLeft ? x - 200 : x + 16
  const top = y - 8
  const made = shot.result === 'made'

  return (
    <div
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 9999,
        pointerEvents: 'none',
        width: 184,
      }}
      className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface-elev)] backdrop-blur-xl p-3.5 text-xs shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: teamColor }}
        />
        <span className="truncate font-semibold text-[var(--text)]">{label}</span>
      </div>
      <div className="mb-2 text-[11px] text-[var(--text-soft)]">{teamName}</div>
      <div className="space-y-1">
        <Row
          label="Result"
          value={made ? 'O  Made' : 'X  Missed'}
          color={made ? MADE_COLOR : MISSED_COLOR}
          mono
        />
        <Row label="Distance" value={`${shot.distance} ft`} />
        <Row label="Type" value={capitalize(shot.shotType)} />
        <Row label="Zone" value={shot.isThreePointer ? '3-Point' : '2-Point'} />
      </div>
    </div>
  )
}

// Single label/value row inside the tooltip
function Row({
  label,
  value,
  color,
  mono,
}: {
  label: string
  value: string
  color?: string
  mono?: boolean
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[var(--text-soft)]">{label}</span>
      <span
        className={`font-medium ${mono ? 'tabular-nums' : ''}`}
        style={{ color: color ?? 'var(--text)' }}
      >
        {value}
      </span>
    </div>
  )
}

// Capitalises the first letter of a string for display
function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
