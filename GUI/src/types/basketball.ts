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

export interface FramePlayer {
  trackId: number
  x: number  // court coords, feet
  y: number  // court coords, feet
  teamId: string
}

export interface AnalysisFrame {
  frameIndex: number  // index into the source video
  t: number           // timestamp in seconds (frameIndex / fps)
  players: FramePlayer[]
}

export interface CourtMeta {
  imageUrl: string | null
  widthPx: number
  heightPx: number
  scale: number          // pixels per foot used when rendering the base court
  padding: number        // pixel padding around the court rectangle
  courtLengthFt: number  // x range = [0, courtLengthFt]
  courtWidthFt: number   // y range = [0, courtWidthFt]
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
  // Time-aligned dot samples used to animate the court map over video playback.
  frames?: AnalysisFrame[]
  // Pixel/feet metadata for the rendered court image — lets the GUI position dots in
  // the same coordinate space as the PNG.
  court?: CourtMeta
  // Server-rendered court map (e.g. `/api/analyze/result/<id>/court`). Optional — the
  // GUI falls back to the conventional path when omitted.
  courtImageUrl?: string
  // Server-rendered video with team-coloured boxes drawn on each frame. When present, the
  // player swaps to this once analysis finishes so users see detections without re-uploading.
  annotatedVideoUrl?: string
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
  points: number
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
