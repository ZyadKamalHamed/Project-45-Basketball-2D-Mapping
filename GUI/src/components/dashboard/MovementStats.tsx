'use client'

import { useMemo } from 'react'
import { AnalysisFrame, PlayerTrack, Team } from '@/types/basketball'
import { computePlayerMovement, computeTeamSpacing } from '@/lib/movement-utils'

// Props: the tracking samples plus team and roster metadata for labels and colours.
interface Props {
  frames: AnalysisFrame[]
  teams: Record<string, Team>
  playerTracks: PlayerTrack[]
}

// Panel surfacing movement analytics (distance, speed, team spacing) derived from the
// tracking data the analyzer already produces — no extra model inference.
export function MovementStats({ frames, teams, playerTracks }: Props) {
  const movers = useMemo(() => computePlayerMovement(frames), [frames])
  const spacing = useMemo(() => computeTeamSpacing(frames, teams), [frames, teams])

  // Map track ids to display names for the top-movers list.
  const nameByTrack = useMemo(
    () => new Map(playerTracks.map(pt => [pt.trackId, pt.playerName])),
    [playerTracks],
  )

  if (movers.length === 0) return null

  const topMovers = movers.slice(0, 8)
  const maxDistance = topMovers[0]?.distanceFt ?? 1

  return (
    <div className="glass-panel glass-mount p-6">
      {/* Header */}
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h3
          className="text-[15px] font-semibold text-[var(--text)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Movement &amp; Hustle
        </h3>
        <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-soft)] font-medium">
          From on-court tracking
        </span>
      </div>

      {/* Per-team headline: total ground covered + average spacing */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {spacing.map(t => (
          <div
            key={t.teamId}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4"
          >
            <div className="mb-3 flex items-center gap-2.5">
              <span
                className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: t.color, boxShadow: `0 0 12px ${t.color}80` }}
              />
              <span
                className="truncate text-[13px] font-semibold text-[var(--text)]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {t.teamName}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Metric
                label="Distance"
                value={formatDistance(t.totalDistanceFt)}
                unit="covered"
              />
              <Metric
                label="Spacing"
                value={t.avgSpacingSqFt >= 1 ? Math.round(t.avgSpacingSqFt).toLocaleString() : '—'}
                unit="avg sq ft"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Top movers */}
      <div className="mb-2.5 text-[10px] uppercase tracking-[0.2em] text-[var(--text-soft)] font-medium">
        Top movers
      </div>
      <div className="flex flex-col gap-2">
        {topMovers.map(m => {
          const color = teams[m.teamId]?.color ?? '#9aa4bf'
          const name = nameByTrack.get(m.trackId) ?? `Player #${m.trackId}`
          const widthPct = Math.max(6, (m.distanceFt / maxDistance) * 100)
          return (
            <div key={m.trackId} className="flex items-center gap-3">
              <span
                className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="w-20 flex-shrink-0 truncate text-xs text-[var(--text-muted)]">
                {name}
              </span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${widthPct}%`,
                    background: `linear-gradient(90deg, ${color}, ${color}aa)`,
                    boxShadow: `0 0 10px ${color}66`,
                  }}
                />
              </div>
              <span className="w-16 flex-shrink-0 text-right text-xs tabular-nums text-[var(--text)]">
                {formatDistance(m.distanceFt)}
              </span>
              <span className="w-20 flex-shrink-0 text-right text-[11px] tabular-nums text-[var(--text-soft)]">
                {m.topSpeedMph.toFixed(1)} mph
              </span>
            </div>
          )
        })}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-[var(--text-soft)]">
        Distance and speed are estimated from projected court positions; numbers are
        indicative for short clips and improve with longer, stable footage.
      </p>
    </div>
  )
}

// Renders feet as feet under ~1000, otherwise rounded; keeps the headline compact.
function formatDistance(ft: number): string {
  if (ft >= 1000) return `${(ft / 1000).toFixed(1)}k ft`
  return `${Math.round(ft)} ft`
}

// Small labelled metric used in the per-team headline cards.
function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div>
      <div
        className="text-[18px] font-semibold tabular-nums leading-none text-[var(--text)]"
        style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-soft)] font-medium">
        {label} · {unit}
      </div>
    </div>
  )
}
