'use client'

import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Shot, PlayerTrack } from '@/types/basketball'

interface Props {
  shot: Shot
  svgX: number
  svgY: number
  player: PlayerTrack | undefined
  teamColor: string
  teamName: string
  index?: number
}

interface TooltipState {
  x: number
  y: number
}

const MADE_COLOR = '#16a34a'
const MISSED_COLOR = '#dc2626'

export function ShotMarker({ shot, svgX, svgY, player, teamColor, teamName, index = 0 }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const made = shot.result === 'made'
  const color = made ? MADE_COLOR : MISSED_COLOR
  const label = player?.playerName ?? `Player #${shot.shooterTrackId}`

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
          style={{ animationDelay: `${delay}ms`, paintOrder: 'stroke', stroke: '#ffffff', strokeWidth: 2.5 }}
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
      className="rounded-xl border border-[var(--border)] bg-white/95 backdrop-blur p-3.5 text-xs shadow-[0_8px_24px_rgba(11,18,32,0.08)]"
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

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
