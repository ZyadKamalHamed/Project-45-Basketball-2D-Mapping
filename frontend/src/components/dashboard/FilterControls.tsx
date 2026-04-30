'use client'

import { Team, PlayerTrack, ShotType } from '@/types/basketball'
import { useFilters, useFilterDispatch } from '@/context/FilterContext'
import { RotateCcw } from 'lucide-react'

interface Props {
  teams: Record<string, Team>
  playerTracks: PlayerTrack[]
}

const SHOT_TYPES: { value: ShotType; label: string }[] = [
  { value: 'jump', label: 'Jump Shot' },
  { value: 'layup', label: 'Layup' },
  { value: 'dunk', label: 'Dunk' },
]

export function FilterControls({ teams, playerTracks }: Props) {
  const filters = useFilters()
  const dispatch = useFilterDispatch()

  const playersForTeam = filters.teamId
    ? playerTracks.filter(p => p.teamId === filters.teamId)
    : []

  const hasActiveFilter =
    filters.teamId !== null ||
    filters.playerTrackId !== null ||
    filters.shotType !== null ||
    filters.courtMode !== 'half'

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Team */}
      <Select
        value={filters.teamId ?? ''}
        onChange={v => dispatch({ type: 'SET_TEAM', payload: v || null })}
        placeholder="All Teams"
      >
        {Object.entries(teams).map(([id, t]) => (
          <option key={id} value={id}>{t.name}</option>
        ))}
      </Select>

      {/* Player */}
      <Select
        value={filters.playerTrackId?.toString() ?? ''}
        onChange={v => dispatch({ type: 'SET_PLAYER', payload: v ? parseInt(v) : null })}
        placeholder="All Players"
        disabled={!filters.teamId}
      >
        {playersForTeam.map(p => (
          <option key={p.trackId} value={p.trackId.toString()}>
            #{p.jerseyNumber} {p.playerName}
          </option>
        ))}
      </Select>

      {/* Shot type */}
      <Select
        value={filters.shotType ?? ''}
        onChange={v => dispatch({ type: 'SET_SHOT_TYPE', payload: (v as ShotType) || null })}
        placeholder="All Shot Types"
      >
        {SHOT_TYPES.map(({ value, label }) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </Select>

      {/* Court mode toggle */}
      <div className="flex rounded-md border border-slate-600 overflow-hidden text-sm">
        {(['half', 'full'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => dispatch({ type: 'SET_COURT_MODE', payload: mode })}
            className={`px-3 py-1.5 font-medium transition-colors ${
              filters.courtMode === mode
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {mode === 'half' ? 'Half Court' : 'Full Court'}
          </button>
        ))}
      </div>

      {/* Reset */}
      {hasActiveFilter && (
        <button
          onClick={() => dispatch({ type: 'RESET' })}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors px-2 py-1.5"
        >
          <RotateCcw size={13} />
          Reset
        </button>
      )}
    </div>
  )
}

function Select({
  value,
  onChange,
  placeholder,
  disabled,
  children,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className="rounded-md border border-slate-600 bg-slate-800 text-slate-200 text-sm px-3 py-1.5 pr-8 appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24'%3E%3Cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
        backgroundSize: '14px',
      }}
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  )
}
