// Team stats type and the individual stat card component
import { TeamStats } from '@/types/basketball'
import { TeamStatCard } from './TeamStatCard'

// Props taking the array of per-team stats to render
interface Props {
  teamStats: TeamStats[]
}

// Lays out one stat card per team in a responsive grid
export function StatsCardsRow({ teamStats }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {teamStats.map(stats => (
        <TeamStatCard key={stats.teamId} stats={stats} />
      ))}
    </div>
  )
}

// Re-export the card so pages can lay it out directly without the row wrapper.
StatsCardsRow.Card = TeamStatCard
