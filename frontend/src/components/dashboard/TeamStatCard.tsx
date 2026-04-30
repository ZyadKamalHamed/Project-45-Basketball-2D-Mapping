import { TeamStats } from '@/types/basketball'

interface Props {
  stats: TeamStats
}

export function TeamStatCard({ stats }: Props) {
  return (
    <div className="flex-1 rounded-xl border border-slate-700 bg-slate-800/60 p-5 min-w-0">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <span
          className="w-1 h-10 rounded-full flex-shrink-0"
          style={{ backgroundColor: stats.color }}
        />
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-widest text-slate-400 font-medium">
            {stats.shortName}
          </div>
          <div className="font-semibold text-slate-100 text-base truncate">
            {stats.teamName}
          </div>
        </div>
      </div>

      {/* Primary stat row */}
      <div className="flex gap-4 mb-4">
        <BigStat label="FG%" value={`${stats.fgPercent}%`} />
        <BigStat label="3P%" value={`${stats.threePPercent}%`} />
        <BigStat label="2P%" value={`${stats.twoPPercent}%`} />
      </div>

      {/* Secondary row */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-700">
        <MiniStat label="Shots" value={stats.totalShots} />
        <MiniStat label="Makes" value={stats.makes} color="#22c55e" />
        <MiniStat label="Misses" value={stats.misses} color="#ef4444" />
      </div>

      {/* Shot breakdown bar */}
      <div className="mt-3 h-1.5 rounded-full overflow-hidden bg-slate-700">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${stats.fgPercent}%`,
            backgroundColor: stats.color,
          }}
        />
      </div>
    </div>
  )
}

function BigStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-xl font-mono font-semibold text-slate-100 tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-0.5">{label}</div>
    </div>
  )
}

function MiniStat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="text-center">
      <div
        className="text-base font-mono font-semibold tabular-nums"
        style={{ color: color ?? '#f1f5f9' }}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
    </div>
  )
}
