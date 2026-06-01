'use client'

import { useMemo } from 'react'
import { Shot, Team } from '@/types/basketball'

interface Props {
  shots: Shot[]
  teams: Record<string, Team>
  fps?: number
}

/**
 * Tabular log of every detected shot — counterpart to the court map.
 * Loosely inspired by `render_image_space_shot_chart` in the shot-detection notebook,
 * but text-only so the layout fits cleanly under the team stat cards.
 */
export function ShotLog({ shots, teams, fps = 30 }: Props) {
  const rows = useMemo(
    () =>
      [...shots].sort((a, b) => a.frameIndex - b.frameIndex).map((s) => {
        const seconds = s.frameIndex / fps
        const team = teams[s.shooterTeamId]
        return {
          id: s.id,
          time: formatTimestamp(seconds),
          teamName: team?.name ?? s.shooterTeamId,
          teamColor: team?.color ?? '#6c8cff',
          result: s.result,
          isThreePointer: s.isThreePointer,
          distance: s.distance,
          locationX: s.location.x,
          locationY: s.location.y,
        }
      }),
    [shots, teams, fps],
  )

  if (rows.length === 0) {
    return (
      <div className="glass-panel glass-mount p-6">
        <SectionHeading>Shot log</SectionHeading>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          No shots detected yet for this clip. Drop in a longer game-action segment to give the
          detector more to work with.
        </p>
      </div>
    )
  }

  const made = rows.filter((r) => r.result === 'made').length
  const missed = rows.length - made

  return (
    <div className="glass-panel glass-mount p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <SectionHeading>Shot log</SectionHeading>
        <div className="flex items-center gap-4 text-[11px] uppercase tracking-[0.18em] text-[var(--text-soft)]">
          <span className="tabular-nums">
            <span style={{ color: 'var(--made)' }}>{made}</span> made
          </span>
          <span className="tabular-nums">
            <span style={{ color: 'var(--miss)' }}>{missed}</span> missed
          </span>
          <span className="tabular-nums">{rows.length} total</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-2)] text-left text-[10px] uppercase tracking-[0.18em] text-[var(--text-soft)]">
              <Th>#</Th>
              <Th>Time</Th>
              <Th>Team</Th>
              <Th>Type</Th>
              <Th align="right">Distance</Th>
              <Th align="right">Result</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.id}
                className={
                  i % 2 === 0
                    ? 'border-b border-[var(--border)] last:border-b-0'
                    : 'border-b border-[var(--border)] bg-white/[0.015] last:border-b-0'
                }
              >
                <Td>
                  <span className="text-[var(--text-soft)] tabular-nums">{r.id}</span>
                </Td>
                <Td>
                  <span className="tabular-nums text-[var(--text-muted)]">{r.time}</span>
                </Td>
                <Td>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{
                        backgroundColor: r.teamColor,
                        boxShadow: `0 0 6px ${r.teamColor}80`,
                      }}
                    />
                    <span className="text-[var(--text)]">{r.teamName}</span>
                  </span>
                </Td>
                <Td>
                  <span className="text-[var(--text-muted)]">
                    {r.isThreePointer ? '3PT' : '2PT'}
                  </span>
                </Td>
                <Td align="right">
                  <span className="tabular-nums text-[var(--text)]">
                    {r.distance.toFixed(1)} ft
                  </span>
                </Td>
                <Td align="right">
                  <ResultPill made={r.result === 'made'} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function formatTimestamp(seconds: number): string {
  const total = Math.max(0, seconds)
  const m = Math.floor(total / 60)
  const s = Math.floor(total % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-[13px] font-semibold uppercase tracking-[0.22em] text-[var(--text-soft)]"
      style={{ fontFamily: 'var(--font-display)' }}
    >
      {children}
    </h2>
  )
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className={`px-4 py-2.5 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}
    >
      {children}
    </th>
  )
}

function Td({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <td className={`px-4 py-3 ${align === 'right' ? 'text-right' : 'text-left'}`}>{children}</td>
  )
}

function ResultPill({ made }: { made: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider"
      style={
        made
          ? {
              color: 'var(--made)',
              backgroundColor: 'rgba(34, 214, 95, 0.10)',
              border: '1px solid rgba(34, 214, 95, 0.32)',
            }
          : {
              color: 'var(--miss)',
              backgroundColor: 'rgba(255, 107, 107, 0.10)',
              border: '1px solid rgba(255, 107, 107, 0.32)',
            }
      }
    >
      {made ? 'Made' : 'Missed'}
    </span>
  )
}
