export type ShotType = 'jump' | 'layup' | 'dunk'
export type ShotResult = 'made' | 'missed'
export type CourtMode = 'half' | 'full'
export type ProcessingPhase = 'Detection' | 'Team Assignment' | 'Court Mapping' | 'Shot Detection'

export interface Shot {
  id: number
  frameIndex: number
  shooterTrackId: number
  shooterTeamId: string
  location: { x: number; y: number }
  distance: number
  shotType: ShotType
  result: ShotResult
  isThreePointer: boolean
}

export interface PlayerTrack {
  trackId: number
  teamId: string
  jerseyNumber: string
  playerName: string
}

export interface Team {
  name: string
  shortName: string
  color: string
  players: PlayerTrack[]
}

export interface VideoAnalysis {
  videoId: string
  gameLabel: string
  duration: number
  fps: number
  totalFrames: number
  teams: Record<string, Team>
  shots: Shot[]
  playerTracks: PlayerTrack[]
}

export interface ShotFilters {
  teamId: string | null
  playerTrackId: number | null
  shotType: ShotType | null
  courtMode: CourtMode
}

export interface TeamStats {
  teamId: string
  teamName: string
  shortName: string
  color: string
  totalShots: number
  makes: number
  misses: number
  fgPercent: number
  threePointAttempts: number
  threePointMakes: number
  threePPercent: number
  twoPointAttempts: number
  twoPointMakes: number
  twoPPercent: number
}

export interface PlayerStats {
  trackId: number
  playerName: string
  jerseyNumber: string
  teamId: string
  teamName: string
  color: string
  totalShots: number
  makes: number
  misses: number
  fgPercent: number
  threePointAttempts: number
  threePointMakes: number
  threePPercent: number
  twoPointAttempts: number
  twoPointMakes: number
  twoPPercent: number
}

export type SortColumn = keyof Pick<PlayerStats, 'playerName' | 'totalShots' | 'fgPercent' | 'threePPercent' | 'twoPPercent' | 'makes'>
export type SortDirection = 'asc' | 'desc'
