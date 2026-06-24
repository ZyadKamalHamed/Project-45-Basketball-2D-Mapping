'use client'

// React hooks, the portal helper, icons, shared types and the court/filter components.
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, X } from 'lucide-react'
import { Shot, PlayerTrack, Team, CourtMeta, AnalysisFrame } from '@/types/basketball'
import { CourtMap } from './CourtMap'
import { FilterControls } from './FilterControls'

// Props mirror what CourtMap needs, plus the teams/hasTeams used by the filter bar.
interface Props {
  shots: Shot[]
  playerTracks: PlayerTrack[]
  teams: Record<string, Team>
  imageUrl?: string | null
  court?: CourtMeta | null
  frames: AnalysisFrame[]
  currentTime: number
  hasTeams: boolean
}

// Court map panel with a fullscreen control. The same filter bar + court map render inline
// and (when expanded) inside a near-fullscreen modal. Both share the FilterProvider tree —
// React context flows through portals — so the team/shot filters and the live-tracking
// toggle stay fully interactive in either view, and playback time keeps animating the dots.
export function CourtPanel({
  shots,
  playerTracks,
  teams,
  imageUrl,
  court,
  frames,
  currentTime,
  hasTeams,
}: Props) {
  // Whether the expanded modal is open.
  const [expanded, setExpanded] = useState(false)

  // Render the filter bar + court map. A fresh tree per call so the inline and modal
  // instances are independent (each keeps its own live-tracking toggle state). In the
  // modal we pass `compact` so the court is height-capped and everything fits on screen.
  const renderBoard = (compact: boolean) => (
    <>
      {hasTeams && (
        <div className="mb-4">
          <FilterControls teams={teams} />
        </div>
      )}
      <CourtMap
        shots={shots}
        playerTracks={playerTracks}
        teams={teams}
        imageUrl={imageUrl}
        court={court}
        frames={frames}
        currentTime={currentTime}
        compact={compact}
      />
    </>
  )

  return (
    <div>
      {/* Header strip: title on the left, fullscreen control on the right. */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <span
          className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-soft)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Court Map
        </span>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Expand court map to fullscreen"
          title="Expand court map"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
        >
          <Maximize2 size={13} />
        </button>
      </div>

      {renderBoard(false)}

      {expanded && (
        <CourtModal onClose={() => setExpanded(false)}>{renderBoard(true)}</CourtModal>
      )}
    </div>
  )
}

// Near-fullscreen modal that dims the rest of the app and hosts the court board.
function CourtModal({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  // Close on Escape and lock background scroll while the modal is open.
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = prevOverflow
    }
  }, [handleKey])

  // Critical positioning/backdrop styles are inline so they always win against the
  // global `body > * { position: relative; z-index: 1 }` rule and don't depend on
  // Tailwind having generated these specific utilities — otherwise the overlay can drop
  // into normal flow at the bottom of the page (invisible while scroll is locked).
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Court map"
      onClick={onClose}
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
    >
      {/* Panel — stop click propagation so clicks inside don't close the modal. */}
      <div
        onClick={e => e.stopPropagation()}
        className="modal-panel glass-panel"
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          width: '96vw',
          maxWidth: 1500,
          maxHeight: '92vh',
          overflow: 'hidden',
          padding: '1.5rem',
        }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <span
            className="text-[13px] font-semibold text-[var(--text)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Court Map
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close fullscreen court map"
            title="Close (Esc)"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
          >
            <X size={15} />
          </button>
        </div>

        {/* Scrollable body so the board fits within the viewport on small screens. */}
        <div style={{ minHeight: 0, flex: 1, overflow: 'auto' }}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}
