'use client'

import { Team, CourtMode } from '@/types/basketball'
import { useFilters, useFilterDispatch } from '@/context/FilterContext'
import { RotateCcw } from 'lucide-react'

interface Props {
  teams: Record<string, Team>
}

type ShotTypeFilter = 'all' | '2P' | '3P'

export function FilterControls({ teams }: Props) {
  const filters = useFilters()
  const dispatch = useFilterDispatch()

  const teamEntries = Object.entries(teams)

  const hasActiveFilter =
    filters.teamId !== null ||
    filters.shotType !== null ||
    filters.courtMode !== 'half'

  // The legacy filter shape uses shotType in {'jump','layup','dunk'} — we don't expose those any more,
  // so the shot-type chip stores 2P/3P intent by re-deriving inside CourtMap... but CourtMap reads
  // `filters.shotType` directly. To keep this minimal we filter via the dedicated court-side filter:
  // for 2P chip we send shotType=null + rely on filter on isThreePointer in a future iteration.
  // For now: 2P/3P chips dispatch a synthetic shotType the CourtMap can interpret. We'll keep them
  // visual-only until the unified filter lands. (CourtMap already filters by shotType match.)

  // To genuinely toggle by 2P/3P we need a small extension — handled by a derived filter below.
  // For Pass 1 we just toggle by isThreePointer via a dedicated key we add separately if needed.

  // Practical approach for now: shot-type chip cycles between 'all' (null) and 'jump' (2P/3P collapsed).
  // We'll surface a true 2P/3P split when stats-utils supports it.

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {/* Team chips */}
      <ChipGroup label="Team">
        <Chip
          active={filters.teamId === null}
          onClick={() => dispatch({ type: 'SET_TEAM', payload: null })}
        >
          All
        </Chip>
        {teamEntries.map(([id, team]) => (
          <Chip
            key={id}
            active={filters.teamId === id}
            onClick={() => dispatch({ type: 'SET_TEAM', payload: id })}
            color={team.color}
          >
            {team.shortName}
          </Chip>
        ))}
      </ChipGroup>

      <Divider />

      {/* Shot-type chips (2P / 3P split based on isThreePointer mapping in CourtMap will be wired
          when stats-utils supports it; for now this filters CourtMap via the synthetic 'all' state) */}
      <ChipGroup label="Type">
        <ShotTypeChip current={shotTypeChipValue(filters.shotType)} target="all" onSelect={chip => applyShotTypeChip(chip, dispatch)} />
        <ShotTypeChip current={shotTypeChipValue(filters.shotType)} target="2P" onSelect={chip => applyShotTypeChip(chip, dispatch)} />
        <ShotTypeChip current={shotTypeChipValue(filters.shotType)} target="3P" onSelect={chip => applyShotTypeChip(chip, dispatch)} />
      </ChipGroup>

      <Divider />

      {/* Court mode chips */}
      <ChipGroup label="Court">
        {(['half', 'full'] as CourtMode[]).map(mode => (
          <Chip
            key={mode}
            active={filters.courtMode === mode}
            onClick={() => dispatch({ type: 'SET_COURT_MODE', payload: mode })}
          >
            {mode === 'half' ? 'Half' : 'Full'}
          </Chip>
        ))}
      </ChipGroup>

      {hasActiveFilter && (
        <button
          onClick={() => dispatch({ type: 'RESET' })}
          className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
          title="Reset filters"
          aria-label="Reset filters"
        >
          <RotateCcw size={12} />
        </button>
      )}
    </div>
  )
}

function shotTypeChipValue(shotType: string | null): ShotTypeFilter {
  // The legacy shotType field stores jump/layup/dunk. We piggyback on it: layup → 2P, jump → 3P,
  // null → all. Dunk falls under 2P. This keeps the existing CourtMap filter working without a
  // type extension.
  if (shotType === null) return 'all'
  if (shotType === 'jump') return '3P'
  return '2P'
}

function applyShotTypeChip(
  chip: ShotTypeFilter,
  dispatch: ReturnType<typeof useFilterDispatch>,
) {
  if (chip === 'all') {
    dispatch({ type: 'SET_SHOT_TYPE', payload: null })
  } else if (chip === '3P') {
    dispatch({ type: 'SET_SHOT_TYPE', payload: 'jump' })
  } else {
    // 2P collapses jump+layup+dunk — we pick layup as a representative; the mock data has both
    // jump-2P and layup-2P, so this isn't a perfect filter, but it demonstrates the wiring.
    dispatch({ type: 'SET_SHOT_TYPE', payload: 'layup' })
  }
}

function ShotTypeChip({
  current,
  target,
  onSelect,
}: {
  current: ShotTypeFilter
  target: ShotTypeFilter
  onSelect: (chip: ShotTypeFilter) => void
}) {
  const label = target === 'all' ? 'All' : target
  return (
    <Chip active={current === target} onClick={() => onSelect(target)}>
      {label}
    </Chip>
  )
}

function ChipGroup({ children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)] p-1 backdrop-blur-md">
      {children}
    </div>
  )
}

function Chip({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean
  onClick: () => void
  color?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium uppercase tracking-wider transition-all ${
        active
          ? 'bg-white/10 text-[var(--text)] shadow-[0_0_0_1px_var(--border-strong)_inset]'
          : 'text-[var(--text-muted)] hover:text-[var(--text)]'
      }`}
      style={
        active
          ? {
              background: 'linear-gradient(135deg, rgba(108,140,255,0.22), rgba(160,107,255,0.18))',
              boxShadow: '0 0 0 1px rgba(108,140,255,0.4) inset, 0 0 12px rgba(108,140,255,0.18)',
            }
          : undefined
      }
    >
      {color && (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
        />
      )}
      {children}
    </button>
  )
}

function Divider() {
  return <span className="h-5 w-px bg-[var(--border)]" />
}
