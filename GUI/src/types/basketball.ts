// The kind of shot attempted
export type ShotType = 'jump' | 'layup' | 'dunk'
// Whether a shot was made or missed
export type ShotResult = 'made' | 'missed'
// Half-court or full-court view of the map
export type CourtMode = 'half' | 'full'

// A single shot attempt with its location, type and outcome
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

// A tracked player identified by track id, with jersey and team details
export interface PlayerTrack {
  trackId: number
  teamId: string
  jerseyNumber: string
  playerName: string
}

// A team with its display names, colour and roster of tracked players
export interface Team {
  name: string
  shortName: string
  color: string
  players: PlayerTrack[]
}

// A player's court position within a single frame
export interface FramePlayer {
  trackId: number
  x: number  // court coords, feet
  y: number  // court coords, feet
  teamId: string
}

// A single sampled frame holding the timestamp and every player's position
export interface AnalysisFrame {
  frameIndex: number  // index into the source video
  t: number           // timestamp in seconds (frameIndex / fps)
  players: FramePlayer[]
}

// Pixel and feet metadata describing how the rendered court image maps to court coordinates
export interface CourtMeta {
  imageUrl: string | null
  widthPx: number
  heightPx: number
  scale: number          // pixels per foot used when rendering the base court
  padding: number        // pixel padding around the court rectangle
  courtLengthFt: number  // x range = [0, courtLengthFt]
  courtWidthFt: number   // y range = [0, courtWidthFt]
}

// The full analysis payload for one video, covering teams, shots, tracks and rendered assets
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

// The active filters narrowing which shots are shown and the court mode
export interface ShotFilters {
  teamId: string | null
  playerTrackId: number | null
  shotType: ShotType | null
  courtMode: CourtMode
}

// Computed shooting summary for a single team
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

