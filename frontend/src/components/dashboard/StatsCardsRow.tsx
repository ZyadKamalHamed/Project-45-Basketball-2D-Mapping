import { TeamStats } from '@/types/basketball'
import { TeamStatCard } from './TeamStatCard'

interface Props {
  teamStats: TeamStats[]
}

export function StatsCardsRow({ teamStats }: Props) {
  return (
    <div className="flex gap-4">
      {teamStats.map(stats => (
        <TeamStatCard key={stats.teamId} stats={stats} />
      ))}
    </div>
  )
}
