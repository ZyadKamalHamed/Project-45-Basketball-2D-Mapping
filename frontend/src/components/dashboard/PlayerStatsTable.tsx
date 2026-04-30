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

  const cols: { key: SortColumn; label: string; hint?: string }[] = [
    { key: 'playerName', label: 'Player' },
    { key: 'totalShots', label: 'FGA', hint: 'Field Goal Attempts' },
    { key: 'makes', label: 'FGM', hint: 'Field Goal Makes' },
    { key: 'fgPercent', label: 'FG%' },
    { key: 'threePPercent', label: '3P%' },
    { key: 'twoPPercent', label: '2P%' },
  ]

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/60 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-700">
        <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
          Player Breakdown
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              {/* Team indicator column */}
              <th className="w-1 px-0 py-0" />
              {cols.map(col => (
                <th
                  key={col.key}
                  className="px-4 py-2.5 text-left font-medium text-slate-400 uppercase tracking-wider text-[11px] cursor-pointer select-none hover:text-slate-200 whitespace-nowrap"
                  title={col.hint}
                  onClick={() => handleSort(col.key)}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    <SortIcon active={sortCol === col.key} direction={sortDir} />
                  </span>
                </th>
              ))}
              {/* Team name */}
              <th className="px-4 py-2.5 text-left font-medium text-slate-400 uppercase tracking-wider text-[11px]">
                Team
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr
                key={p.trackId}
                className={`border-b border-slate-700/50 transition-colors hover:bg-slate-700/30 ${
                  i % 2 === 0 ? '' : 'bg-slate-800/30'
                }`}
              >
                {/* Team color bar */}
                <td className="p-0 w-1">
                  <div
                    className="w-1 h-full min-h-[44px]"
                    style={{ backgroundColor: p.color }}
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-100">{p.playerName}</div>
                  <div className="text-slate-500 text-xs">#{p.jerseyNumber}</div>
                </td>
                <NumCell value={p.totalShots} />
                <NumCell value={p.makes} color="#22c55e" />
                <PctCell value={p.fgPercent} />
                <PctCell value={p.threePPercent} />
                <PctCell value={p.twoPPercent} />
                <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                  {p.teamName}
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
    <td className="px-4 py-3 font-mono tabular-nums" style={{ color: color ?? '#cbd5e1' }}>
      {value}
    </td>
  )
}

function PctCell({ value }: { value: number }) {
  const color =
    value >= 50 ? '#22c55e' :
    value >= 40 ? '#86efac' :
    value >= 33 ? '#cbd5e1' :
    '#94a3b8'

  return (
    <td className="px-4 py-3 font-mono tabular-nums" style={{ color }}>
      {value > 0 ? `${value}%` : '—'}
    </td>
  )
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ChevronsUpDown size={11} className="text-slate-600" />
  return direction === 'asc'
    ? <ChevronUp size={11} className="text-blue-400" />
    : <ChevronDown size={11} className="text-blue-400" />
}
