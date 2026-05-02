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
    <div className="flex flex-wrap items-center gap-2.5">
      <Select
        value={filters.teamId ?? ''}
        onChange={v => dispatch({ type: 'SET_TEAM', payload: v || null })}
        placeholder="All Teams"
      >
        {Object.entries(teams).map(([id, t]) => (
          <option key={id} value={id}>{t.name}</option>
        ))}
      </Select>

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
      <div className="flex overflow-hidden rounded-md border border-[var(--border)] text-sm">
        {(['half', 'full'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => dispatch({ type: 'SET_COURT_MODE', payload: mode })}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              filters.courtMode === mode
                ? 'bg-[var(--accent)] text-white'
                : 'bg-white text-[var(--text-muted)] hover:bg-[var(--surface)]'
            }`}
          >
            {mode === 'half' ? 'Half' : 'Full'}
          </button>
        ))}
      </div>

      {hasActiveFilter && (
        <button
          onClick={() => dispatch({ type: 'RESET' })}
          className="ml-auto flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text)]"
        >
          <RotateCcw size={12} />
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
      className="cursor-pointer appearance-none rounded-md border border-[var(--border)] bg-white px-3 py-1.5 pr-8 text-xs font-medium text-[var(--text)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24'%3E%3Cpath stroke='%235b6573' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
        backgroundSize: '12px',
      }}
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  )
}
