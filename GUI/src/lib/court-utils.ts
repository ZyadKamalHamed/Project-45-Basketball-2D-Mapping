import { CourtMode } from '@/types/basketball'

// NBA half-court: 47ft deep x 50ft wide
// SVG viewBox: "0 0 500 470" — 10px per foot
// Basket at top: (250, 52.5) — 5.25ft from baseline
// y=0 → baseline (near basket), y=1 → half-court line

// Fixed court dimensions and landmark positions in SVG units, at 10px per foot
export const COURT = {
  WIDTH: 500,
  HALF_HEIGHT: 470,
  FULL_HEIGHT: 940,
  THREE_POINT_RADIUS: 238,   // 23.75ft * 10
  CORNER_THREE_X_LEFT: 30,   // 3ft from sideline
  CORNER_THREE_X_RIGHT: 470,
  CORNER_THREE_Y: 140,       // where arc meets corner line
  KEY_X: 170,                // (500 - 160) / 2
  KEY_WIDTH: 160,            // 16ft * 10
  KEY_Y: 280,                // top of key (from top/basket end)
  KEY_HEIGHT: 190,           // 19ft * 10
  FREE_THROW_RADIUS: 60,     // 6ft * 10
  RESTRICTED_RADIUS: 40,     // 4ft * 10
  BASKET_X: 250,
  BASKET_Y: 52.5,
  BACKBOARD_Y: 42.5,
  BACKBOARD_HALF: 30,        // 3ft each side
}

// Converts normalised court coordinates into SVG pixel coordinates for the chosen court mode
export function courtToSvg(
  pt: { x: number; y: number },
  courtMode: CourtMode,
): { x: number; y: number } {
  // x: 0=left sideline → 1=right sideline → maps to 0→500
  // y: 0=baseline → 1=half-court → maps to 470→0 in SVG (basket at top)
  const svgX = pt.x * COURT.WIDTH
  const svgY = (1 - pt.y) * COURT.HALF_HEIGHT

  if (courtMode === 'full') {
    // Full court: half-court shots stay top half (y 0→470),
    // the mirrored "away" basket is at bottom half (y 470→940).
    // Mock data is all half-court, so just use top half.
    return { x: svgX, y: svgY }
  }

  return { x: svgX, y: svgY }
}

// Returns the SVG height for the current court mode, half or full court
export function getCourtHeight(courtMode: CourtMode): number {
  return courtMode === 'full' ? COURT.FULL_HEIGHT : COURT.HALF_HEIGHT
}

// Computes the perceived brightness of a hex colour on a 0 to 1 scale
export function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

// Picks black or white text for the best contrast against a given background colour
export function contrastText(hex: string): '#000000' | '#ffffff' {
  return luminance(hex) > 0.5 ? '#000000' : '#ffffff'
}
