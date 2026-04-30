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
}

interface TooltipState {
  x: number
  y: number
}

const MADE_COLOR = '#22c55e'
const MISSED_COLOR = '#ef4444'
const MARKER_R = 7

export function ShotMarker({ shot, svgX, svgY, player, teamColor, teamName }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const color = shot.result === 'made' ? MADE_COLOR : MISSED_COLOR
  const label = player?.playerName ?? `Player #${shot.shooterTrackId}`

  const handleEnter = useCallback((e: React.MouseEvent) => {
    setTooltip({ x: e.clientX, y: e.clientY })
  }, [])

  const handleMove = useCallback((e: React.MouseEvent) => {
    setTooltip({ x: e.clientX, y: e.clientY })
  }, [])

  const handleLeave = useCallback(() => {
    setTooltip(null)
  }, [])

  return (
    <>
      <g
        onMouseEnter={handleEnter}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        style={{ cursor: 'pointer' }}
      >
        {shot.result === 'made' ? (
          <circle
            cx={svgX}
            cy={svgY}
            r={MARKER_R}
            fill="none"
            stroke={color}
            strokeWidth={2}
          />
        ) : (
          <>
            <line
              x1={svgX - MARKER_R + 2}
              y1={svgY - MARKER_R + 2}
              x2={svgX + MARKER_R - 2}
              y2={svgY + MARKER_R - 2}
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
            />
            <line
              x1={svgX + MARKER_R - 2}
              y1={svgY - MARKER_R + 2}
              x2={svgX - MARKER_R + 2}
              y2={svgY + MARKER_R - 2}
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
            />
          </>
        )}
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
  const left = flipLeft ? x - 180 : x + 14
  const top = y - 10

  return (
    <div
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 9999,
        pointerEvents: 'none',
        width: 168,
      }}
      className="rounded-lg border border-slate-600 bg-slate-800 p-3 shadow-xl text-xs"
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: teamColor }}
        />
        <span className="font-semibold text-slate-100 truncate">{label}</span>
      </div>
      <div className="text-slate-400 text-[11px] mb-1">{teamName}</div>
      <div className="space-y-0.5">
        <Row
          label="Result"
          value={shot.result === 'made' ? '● Made' : '✕ Missed'}
          color={shot.result === 'made' ? '#22c55e' : '#ef4444'}
        />
        <Row label="Distance" value={`${shot.distance} ft`} />
        <Row label="Type" value={capitalize(shot.shotType)} />
        <Row label="Zone" value={shot.isThreePointer ? '3-Point' : '2-Point'} />
      </div>
    </div>
  )
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium" style={{ color: color ?? '#f1f5f9' }}>
        {value}
      </span>
    </div>
  )
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
