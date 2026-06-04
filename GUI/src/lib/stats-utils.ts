import { Shot, Team, TeamStats } from '@/types/basketball'

// Works out a shooting percentage rounded to one decimal, guarding against divide by zero
function pct(makes: number, attempts: number): number {
  return attempts === 0 ? 0 : Math.round((makes / attempts) * 1000) / 10
}

// Aggregates per-team shooting totals, percentages and points from the shot list
export function computeTeamStats(shots: Shot[], teams: Record<string, Team>): TeamStats[] {
  return Object.entries(teams).map(([teamId, team]) => {
    const teamShots = shots.filter(s => s.shooterTeamId === teamId)
    const makes = teamShots.filter(s => s.result === 'made').length
    const threeAttempts = teamShots.filter(s => s.isThreePointer).length
    const threeMakes = teamShots.filter(s => s.isThreePointer && s.result === 'made').length
    const twoAttempts = teamShots.filter(s => !s.isThreePointer).length
    const twoMakes = teamShots.filter(s => !s.isThreePointer && s.result === 'made').length

    return {
      teamId,
      teamName: team.name,
      shortName: team.shortName,
      color: team.color,
      totalShots: teamShots.length,
      makes,
      misses: teamShots.length - makes,
      fgPercent: pct(makes, teamShots.length),
      threePointAttempts: threeAttempts,
      threePointMakes: threeMakes,
      threePPercent: pct(threeMakes, threeAttempts),
      twoPointAttempts: twoAttempts,
      twoPointMakes: twoMakes,
      twoPPercent: pct(twoMakes, twoAttempts),
      points: 2 * twoMakes + 3 * threeMakes,
    }
  })
}
