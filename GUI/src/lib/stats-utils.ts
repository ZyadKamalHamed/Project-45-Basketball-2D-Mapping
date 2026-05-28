import { Shot, Team, PlayerTrack, TeamStats, PlayerStats } from '@/types/basketball'

function pct(makes: number, attempts: number): number {
  return attempts === 0 ? 0 : Math.round((makes / attempts) * 1000) / 10
}

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

export function computePlayerStats(
  shots: Shot[],
  playerTracks: PlayerTrack[],
  teams: Record<string, Team>,
): PlayerStats[] {
  return playerTracks.map(pt => {
    const playerShots = shots.filter(s => s.shooterTrackId === pt.trackId)
    const makes = playerShots.filter(s => s.result === 'made').length
    const threeAttempts = playerShots.filter(s => s.isThreePointer).length
    const threeMakes = playerShots.filter(s => s.isThreePointer && s.result === 'made').length
    const twoAttempts = playerShots.filter(s => !s.isThreePointer).length
    const twoMakes = playerShots.filter(s => !s.isThreePointer && s.result === 'made').length

    return {
      trackId: pt.trackId,
      playerName: pt.playerName,
      jerseyNumber: pt.jerseyNumber,
      teamId: pt.teamId,
      teamName: teams[pt.teamId]?.name ?? pt.teamId,
      color: teams[pt.teamId]?.color ?? '#888',
      totalShots: playerShots.length,
      makes,
      misses: playerShots.length - makes,
      fgPercent: pct(makes, playerShots.length),
      threePointAttempts: threeAttempts,
      threePointMakes: threeMakes,
      threePPercent: pct(threeMakes, threeAttempts),
      twoPointAttempts: twoAttempts,
      twoPointMakes: twoMakes,
      twoPPercent: pct(twoMakes, twoAttempts),
    }
  })
}
