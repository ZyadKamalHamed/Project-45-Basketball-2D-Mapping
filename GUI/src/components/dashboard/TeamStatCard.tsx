// Shared team stats type
import { TeamStats } from '@/types/basketball'

// Props taking a single team's computed stats
interface Props {
  stats: TeamStats
}

// Glass card summarising one team's points, shooting percentages and shot counts
export function TeamStatCard({ stats }: Props) {
  return (
    <div className="glass-panel glass-mount flex-1 min-w-0 p-6">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <span
          className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
          style={{
            backgroundColor: stats.color,
            boxShadow: `0 0 12px ${stats.color}80`,
          }}
        />
        <div className="min-w-0">
          <div
            className="font-semibold text-[var(--text)] text-[15px] leading-tight truncate"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {stats.teamName}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-[var(--text-soft)] font-medium">
            {stats.shortName}
          </div>
        </div>
      </div>

      {/* Hero: POINTS */}
      <div className="mb-5 flex items-baseline gap-3">
        <span
          className="tabular-nums leading-none"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 500,
            fontSize: 56,
            letterSpacing: '-0.03em',
            backgroundImage: 'var(--accent-grad, linear-gradient(135deg, var(--accent), var(--accent-2)))',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          {stats.points}
        </span>
        <span className="text-[10px] uppercase tracking-[0.24em] text-[var(--text-soft)] font-medium">
          Points
        </span>
      </div>

      {/* Percent row */}
      <div className="grid grid-cols-3 gap-3 pb-4 border-b border-[var(--border)]">
        <BigStat label="FG%" value={`${stats.fgPercent}%`} />
        <BigStat label="3P%" value={`${stats.threePPercent}%`} />
        <BigStat label="2P%" value={`${stats.twoPPercent}%`} />
      </div>

      {/* Secondary row */}
      <div className="grid grid-cols-3 gap-3 pt-3.5">
        <MiniStat label="Shots" value={stats.totalShots} />
        <MiniStat label="Makes" value={stats.makes} color="var(--made)" />
        <MiniStat label="Misses" value={stats.misses} color="var(--miss)" />
      </div>

      {/* FG% gradient bar */}
      <div className="mt-5">
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${stats.fgPercent}%`,
              background: 'linear-gradient(90deg, var(--accent), var(--accent-2))',
              boxShadow: '0 0 12px rgba(108, 140, 255, 0.45)',
            }}
          />
        </div>
      </div>
    </div>
  )
}

// Larger stat block used for the shooting percentage row
function BigStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="text-[22px] font-semibold tabular-nums leading-none text-[var(--text)]"
        style={{
          fontFamily: 'var(--font-display)',
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--text-soft)] font-medium">
        {label}
      </div>
    </div>
  )
}

// Smaller stat block used for the secondary shots/makes/misses row
function MiniStat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div
        className="text-[15px] font-semibold tabular-nums leading-none"
        style={{ color: color ?? 'var(--text)', fontFamily: 'var(--font-display)' }}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[var(--text-soft)] font-medium">
        {label}
      </div>
    </div>
  )
}
