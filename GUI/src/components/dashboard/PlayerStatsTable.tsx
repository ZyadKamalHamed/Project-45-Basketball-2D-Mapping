'use client'

import { useState, useMemo } from 'react'
import { PlayerStats, SortColumn, SortDirection } from '@/types/basketball'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

interface Props {
  playerStats: PlayerStats[]
}

export function PlayerStatsTable({ playerStats }: Props) {
  const [sortCol, setSortCol] = useState<SortColumn>('totalShots')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')

  function handleSort(col: SortColumn) {
    if (col === sortCol) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  const sorted = useMemo(() => {
    return [...playerStats].sort((a, b) => {
      const av = a[sortCol]
      const bv = b[sortCol]
      const cmp = typeof av === 'string'
        ? (av as string).localeCompare(bv as string)
        : (av as number) - (bv as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [playerStats, sortCol, sortDir])

  const cols: { key: SortColumn; label: string; hint?: string; align?: 'left' | 'right' }[] = [
    { key: 'playerName', label: 'Player', align: 'left' },
    { key: 'totalShots', label: 'FGA', hint: 'Field Goal Attempts', align: 'right' },
    { key: 'makes', label: 'FGM', hint: 'Field Goal Makes', align: 'right' },
    { key: 'fgPercent', label: 'FG%', align: 'right' },
    { key: 'threePPercent', label: '3P%', align: 'right' },
    { key: 'twoPPercent', label: '2P%', align: 'right' },
  ]

  return (
    <div className="overflow-hidden rounded-xl border border-white/60 bg-white/75 backdrop-blur-md shadow-[0_1px_2px_rgba(11,18,32,0.04)]">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)]">
              {cols.map(col => (
                <th
                  key={col.key}
                  className={`cursor-pointer select-none whitespace-nowrap px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-soft)] hover:text-[var(--text)] ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                  title={col.hint}
                  onClick={() => handleSort(col.key)}
                >
                  <span
                    className={`inline-flex items-center gap-1 ${
                      col.align === 'right' ? 'justify-end' : ''
                    } ${sortCol === col.key ? 'text-[var(--accent)]' : ''}`}
                  >
                    {col.label}
                    <SortIcon active={sortCol === col.key} direction={sortDir} />
                  </span>
                </th>
              ))}
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-soft)]">
                Team
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(p => (
              <tr
                key={p.trackId}
                className="border-b border-[var(--border)] last:border-b-0 transition-colors hover:bg-[var(--surface)]"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-[var(--text)]">{p.playerName}</div>
                  <div className="text-[11px] text-[var(--text-soft)] tabular-nums">#{p.jerseyNumber}</div>
                </td>
                <NumCell value={p.totalShots} />
                <NumCell value={p.makes} color="var(--made)" />
                <PctCell value={p.fgPercent} />
                <PctCell value={p.threePPercent} />
                <PctCell value={p.twoPPercent} />
                <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--text-muted)]">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    {p.teamName}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function NumCell({ value, color }: { value: number; color?: string }) {
  return (
    <td
      className="px-4 py-3 text-right tabular-nums"
      style={{ color: color ?? 'var(--text)', fontFamily: 'var(--font-display)' }}
    >
      {value}
    </td>
  )
}

function PctCell({ value }: { value: number }) {
  let color = 'var(--text-muted)'
  if (value >= 50) color = 'var(--made)'
  else if (value >= 40) color = 'var(--text)'
  else if (value > 0) color = 'var(--text-muted)'
  else color = 'var(--text-soft)'

  return (
    <td
      className="px-4 py-3 text-right tabular-nums font-medium"
      style={{ color, fontFamily: 'var(--font-display)' }}
    >
      {value > 0 ? `${value}%` : '—'}
    </td>
  )
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ChevronsUpDown size={11} className="text-[var(--text-soft)]/60" />
  return direction === 'asc'
    ? <ChevronUp size={11} className="text-[var(--accent)]" />
    : <ChevronDown size={11} className="text-[var(--accent)]" />
}
