import { TeamStats } from '@/types/basketball'

interface Props {
  stats: TeamStats
}

export function TeamStatCard({ stats }: Props) {
  return (
    <div className="flex-1 min-w-0 rounded-xl border border-white/60 bg-white/75 backdrop-blur-md p-5 shadow-[0_1px_2px_rgba(11,18,32,0.04)]">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <span
          className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: stats.color }}
        />
        <div className="min-w-0">
          <div className="font-semibold text-[var(--text)] text-[15px] leading-tight truncate" style={{ fontFamily: 'var(--font-display)' }}>
            {stats.teamName}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-[var(--text-soft)] font-medium">
            {stats.shortName}
          </div>
        </div>
      </div>

      {/* Primary stat row */}
      <div className="grid grid-cols-3 gap-3 pb-4 border-b border-[var(--border)]">
        <BigStat label="FG%" value={`${stats.fgPercent}%`} accent />
        <BigStat label="3P%" value={`${stats.threePPercent}%`} />
        <BigStat label="2P%" value={`${stats.twoPPercent}%`} />
      </div>

      {/* Secondary row */}
      <div className="grid grid-cols-3 gap-3 pt-3.5">
        <MiniStat label="Shots" value={stats.totalShots} />
        <MiniStat label="Makes" value={stats.makes} color="var(--made)" />
        <MiniStat label="Misses" value={stats.misses} color="var(--miss)" />
      </div>

      {/* FG% bar */}
      <div className="mt-4">
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${stats.fgPercent}%`,
              backgroundColor: 'var(--accent)',
            }}
          />
        </div>
      </div>
    </div>
  )
}

function BigStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div
        className="text-[26px] font-semibold tabular-nums leading-none"
        style={{
          fontFamily: 'var(--font-display)',
          color: accent ? 'var(--accent)' : 'var(--text)',
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
