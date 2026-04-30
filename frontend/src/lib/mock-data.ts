import { VideoAnalysis, Shot } from '@/types/basketball'

const celtics = 'celtics'
const knicks = 'knicks'

// Celtics players: trackId 1-5
// Knicks players:  trackId 6-10

type ShotDef = [
  number,   // shooterTrackId
  string,   // shooterTeamId
  number,   // x (0-1, 0=left sideline, 1=right sideline)
  number,   // y (0-1, 0=baseline/basket, 1=half-court line)
  number,   // distance (feet)
  'jump' | 'layup' | 'dunk',
  'made' | 'missed',
  boolean   // isThreePointer
]

const rawShots: ShotDef[] = [
  // ── CELTICS (trackIds 1-5) ──────────────────────────────────────────
  // Jayson Tatum (#0) - trackId 1 - primary scorer, mid-range + 3s
  [1, celtics, 0.50, 0.08, 4,  'layup', 'made',   false],
  [1, celtics, 0.50, 0.06, 3,  'layup', 'missed', false],
  [1, celtics, 0.50, 0.10, 5,  'layup', 'made',   false],
  [1, celtics, 0.65, 0.22, 12, 'jump',  'made',   false],
  [1, celtics, 0.35, 0.22, 12, 'jump',  'missed', false],
  [1, celtics, 0.70, 0.30, 17, 'jump',  'made',   false],
  [1, celtics, 0.30, 0.28, 16, 'jump',  'missed', false],
  [1, celtics, 0.68, 0.30, 17, 'jump',  'made',   false],
  [1, celtics, 0.50, 0.35, 20, 'jump',  'missed', false],
  [1, celtics, 0.95, 0.12, 22, 'jump',  'made',   true],  // corner 3
  [1, celtics, 0.05, 0.12, 22, 'jump',  'missed', true],  // corner 3
  [1, celtics, 0.80, 0.38, 25, 'jump',  'made',   true],  // above break 3
  [1, celtics, 0.20, 0.38, 25, 'jump',  'missed', true],
  [1, celtics, 0.50, 0.42, 27, 'jump',  'made',   true],  // top of key 3
  [1, celtics, 0.50, 0.42, 27, 'jump',  'missed', true],

  // Jaylen Brown (#7) - trackId 2 - athletic wing, drives + corner 3s
  [2, celtics, 0.50, 0.07, 3,  'layup', 'made',   false],
  [2, celtics, 0.45, 0.09, 4,  'layup', 'made',   false],
  [2, celtics, 0.55, 0.08, 4,  'layup', 'missed', false],
  [2, celtics, 0.60, 0.18, 10, 'jump',  'made',   false],
  [2, celtics, 0.40, 0.20, 11, 'jump',  'missed', false],
  [2, celtics, 0.62, 0.25, 14, 'jump',  'made',   false],
  [2, celtics, 0.04, 0.12, 22, 'jump',  'made',   true],  // corner 3
  [2, celtics, 0.96, 0.12, 22, 'jump',  'missed', true],  // corner 3
  [2, celtics, 0.04, 0.11, 22, 'jump',  'made',   true],  // corner 3
  [2, celtics, 0.75, 0.40, 26, 'jump',  'missed', true],
  [2, celtics, 0.25, 0.40, 26, 'jump',  'made',   true],

  // Kristaps Porzingis (#8) - trackId 3 - big man, post + 3s
  [3, celtics, 0.50, 0.15, 8,  'jump',  'made',   false],
  [3, celtics, 0.50, 0.12, 6,  'jump',  'missed', false],
  [3, celtics, 0.34, 0.28, 16, 'jump',  'made',   false],
  [3, celtics, 0.66, 0.28, 16, 'jump',  'missed', false],
  [3, celtics, 0.50, 0.32, 19, 'jump',  'made',   false],
  [3, celtics, 0.78, 0.38, 25, 'jump',  'made',   true],
  [3, celtics, 0.22, 0.38, 25, 'jump',  'missed', true],
  [3, celtics, 0.50, 0.44, 27, 'jump',  'made',   true],

  // Jrue Holiday (#4) - trackId 4 - guard, mid-range shooter
  [4, celtics, 0.50, 0.08, 4,  'layup', 'made',   false],
  [4, celtics, 0.48, 0.07, 3,  'layup', 'missed', false],
  [4, celtics, 0.55, 0.20, 11, 'jump',  'made',   false],
  [4, celtics, 0.45, 0.22, 12, 'jump',  'missed', false],
  [4, celtics, 0.60, 0.30, 17, 'jump',  'made',   false],
  [4, celtics, 0.95, 0.11, 22, 'jump',  'made',   true],
  [4, celtics, 0.05, 0.13, 22, 'jump',  'missed', true],
  [4, celtics, 0.50, 0.42, 27, 'jump',  'missed', true],

  // Al Horford (#42) - trackId 5 - veteran big, face-up + 3s
  [5, celtics, 0.50, 0.14, 7,  'jump',  'made',   false],
  [5, celtics, 0.38, 0.26, 15, 'jump',  'missed', false],
  [5, celtics, 0.62, 0.26, 15, 'jump',  'made',   false],
  [5, celtics, 0.72, 0.36, 24, 'jump',  'made',   true],
  [5, celtics, 0.28, 0.36, 24, 'jump',  'missed', true],

  // ── KNICKS (trackIds 6-10) ──────────────────────────────────────────
  // Jalen Brunson (#11) - trackId 6 - primary scorer, mid-range maestro
  [6, knicks, 0.50, 0.07, 3,  'layup', 'made',   false],
  [6, knicks, 0.52, 0.08, 4,  'layup', 'made',   false],
  [6, knicks, 0.48, 0.09, 4,  'layup', 'missed', false],
  [6, knicks, 0.50, 0.07, 3,  'layup', 'made',   false],
  [6, knicks, 0.60, 0.18, 10, 'jump',  'made',   false],
  [6, knicks, 0.40, 0.19, 10, 'jump',  'missed', false],
  [6, knicks, 0.65, 0.25, 14, 'jump',  'made',   false],
  [6, knicks, 0.35, 0.25, 14, 'jump',  'made',   false],
  [6, knicks, 0.62, 0.32, 19, 'jump',  'missed', false],
  [6, knicks, 0.38, 0.32, 19, 'jump',  'made',   false],
  [6, knicks, 0.55, 0.35, 21, 'jump',  'made',   false],
  [6, knicks, 0.75, 0.38, 25, 'jump',  'made',   true],
  [6, knicks, 0.25, 0.40, 26, 'jump',  'missed', true],
  [6, knicks, 0.50, 0.42, 27, 'jump',  'made',   true],
  [6, knicks, 0.50, 0.44, 27, 'jump',  'missed', true],

  // Mikal Bridges (#25) - trackId 7 - 3-and-D wing
  [7, knicks, 0.50, 0.08, 4,  'layup', 'made',   false],
  [7, knicks, 0.46, 0.07, 3,  'layup', 'missed', false],
  [7, knicks, 0.63, 0.22, 12, 'jump',  'missed', false],
  [7, knicks, 0.37, 0.20, 11, 'jump',  'made',   false],
  [7, knicks, 0.04, 0.12, 22, 'jump',  'made',   true],  // corner 3
  [7, knicks, 0.96, 0.12, 22, 'jump',  'made',   true],  // corner 3
  [7, knicks, 0.04, 0.11, 22, 'jump',  'missed', true],
  [7, knicks, 0.80, 0.38, 25, 'jump',  'made',   true],
  [7, knicks, 0.20, 0.40, 26, 'jump',  'missed', true],
  [7, knicks, 0.50, 0.44, 27, 'jump',  'made',   true],
  [7, knicks, 0.70, 0.40, 26, 'jump',  'missed', true],

  // Karl-Anthony Towns (#32) - trackId 8 - shooting big, 3s + post
  [8, knicks, 0.50, 0.13, 7,  'jump',  'made',   false],
  [8, knicks, 0.50, 0.15, 8,  'jump',  'missed', false],
  [8, knicks, 0.36, 0.28, 16, 'jump',  'made',   false],
  [8, knicks, 0.64, 0.28, 16, 'jump',  'missed', false],
  [8, knicks, 0.50, 0.30, 18, 'jump',  'made',   false],
  [8, knicks, 0.78, 0.38, 25, 'jump',  'made',   true],
  [8, knicks, 0.22, 0.38, 25, 'jump',  'missed', true],
  [8, knicks, 0.50, 0.42, 27, 'jump',  'made',   true],
  [8, knicks, 0.50, 0.44, 27, 'jump',  'missed', true],

  // OG Anunoby (#8 NYK) - trackId 9 - 3-and-D, corner 3s
  [9, knicks, 0.50, 0.07, 3,  'layup', 'made',   false],
  [9, knicks, 0.53, 0.08, 4,  'layup', 'missed', false],
  [9, knicks, 0.61, 0.20, 11, 'jump',  'missed', false],
  [9, knicks, 0.96, 0.11, 22, 'jump',  'made',   true],  // corner 3
  [9, knicks, 0.04, 0.13, 22, 'jump',  'missed', true],
  [9, knicks, 0.96, 0.12, 22, 'jump',  'made',   true],
  [9, knicks, 0.73, 0.40, 26, 'jump',  'made',   true],
  [9, knicks, 0.27, 0.40, 26, 'jump',  'missed', true],

  // Josh Hart (#3) - trackId 10 - hustle guard, paint + 3s
  [10, knicks, 0.50, 0.08, 4,  'layup', 'made',   false],
  [10, knicks, 0.47, 0.09, 4,  'layup', 'made',   false],
  [10, knicks, 0.53, 0.07, 3,  'layup', 'missed', false],
  [10, knicks, 0.55, 0.18, 10, 'jump',  'missed', false],
  [10, knicks, 0.45, 0.22, 12, 'jump',  'made',   false],
  [10, knicks, 0.50, 0.42, 27, 'jump',  'made',   true],
  [10, knicks, 0.50, 0.44, 27, 'jump',  'missed', true],
]

const shots: Shot[] = rawShots.map((s, i) => ({
  id: i + 1,
  frameIndex: (i + 1) * 90,
  shooterTrackId: s[0],
  shooterTeamId: s[1],
  location: { x: s[2], y: s[3] },
  distance: s[4],
  shotType: s[5],
  result: s[6],
  isThreePointer: s[7],
}))

export const MOCK_ANALYSIS: VideoAnalysis = {
  videoId: 'game-2024-bos-nyk-g5',
  gameLabel: 'BOS vs NYK — Game 5 · 2024 Playoffs',
  duration: 7440,
  fps: 30,
  totalFrames: 223200,
  teams: {
    [celtics]: {
      name: 'Boston Celtics',
      shortName: 'BOS',
      color: '#007A33',
      players: [
        { trackId: 1, teamId: celtics, jerseyNumber: '0',  playerName: 'Jayson Tatum' },
        { trackId: 2, teamId: celtics, jerseyNumber: '7',  playerName: 'Jaylen Brown' },
        { trackId: 3, teamId: celtics, jerseyNumber: '8',  playerName: 'Kristaps Porzingis' },
        { trackId: 4, teamId: celtics, jerseyNumber: '4',  playerName: 'Jrue Holiday' },
        { trackId: 5, teamId: celtics, jerseyNumber: '42', playerName: 'Al Horford' },
      ],
    },
    [knicks]: {
      name: 'New York Knicks',
      shortName: 'NYK',
      color: '#006BB6',
      players: [
        { trackId: 6,  teamId: knicks, jerseyNumber: '11', playerName: 'Jalen Brunson' },
        { trackId: 7,  teamId: knicks, jerseyNumber: '25', playerName: 'Mikal Bridges' },
        { trackId: 8,  teamId: knicks, jerseyNumber: '32', playerName: 'Karl-Anthony Towns' },
        { trackId: 9,  teamId: knicks, jerseyNumber: '8',  playerName: 'OG Anunoby' },
        { trackId: 10, teamId: knicks, jerseyNumber: '3',  playerName: 'Josh Hart' },
      ],
    },
  },
  shots,
  playerTracks: [
    { trackId: 1,  teamId: celtics, jerseyNumber: '0',  playerName: 'Jayson Tatum' },
    { trackId: 2,  teamId: celtics, jerseyNumber: '7',  playerName: 'Jaylen Brown' },
    { trackId: 3,  teamId: celtics, jerseyNumber: '8',  playerName: 'Kristaps Porzingis' },
    { trackId: 4,  teamId: celtics, jerseyNumber: '4',  playerName: 'Jrue Holiday' },
    { trackId: 5,  teamId: celtics, jerseyNumber: '42', playerName: 'Al Horford' },
    { trackId: 6,  teamId: knicks,  jerseyNumber: '11', playerName: 'Jalen Brunson' },
    { trackId: 7,  teamId: knicks,  jerseyNumber: '25', playerName: 'Mikal Bridges' },
    { trackId: 8,  teamId: knicks,  jerseyNumber: '32', playerName: 'Karl-Anthony Towns' },
    { trackId: 9,  teamId: knicks,  jerseyNumber: '8',  playerName: 'OG Anunoby' },
    { trackId: 10, teamId: knicks,  jerseyNumber: '3',  playerName: 'Josh Hart' },
  ],
}
