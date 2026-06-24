'use client'

// React hooks, the filter context provider, dashboard components and helpers
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FilterProvider } from '@/context/FilterContext'
import { CourtPanel } from '@/components/dashboard/CourtPanel'
import { StatsCardsRow } from '@/components/dashboard/StatsCardsRow'
import { VideoFeed } from '@/components/dashboard/VideoFeed'
import { ShotLog } from '@/components/dashboard/ShotLog'
import { MovementStats } from '@/components/dashboard/MovementStats'
import { computeTeamStats } from '@/lib/stats-utils'
import { pollResult } from '@/lib/analysis-client'
import type { VideoAnalysis } from '@/types/basketball'

// Build-time flag for the public showcase / QR-code build. When NEXT_PUBLIC_DEMO_MODE=1
// (set on Vercel), the app loads a committed demo result from /demo/result.json instead of
// expecting a live Python analysis backend, and the upload UI is hidden. Local dev leaves
// it unset, so the normal upload → analyse flow still works.
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === '1'

// Main dashboard page that ties the video, court map, stats and shot log together
export default function HomePage() {
  const { analysis, analysisId, status, message, setAnalysisId } = useAnalysis()
  const [currentTime, setCurrentTime] = useState(0)

  // Pull the pieces of the analysis payload, falling back to safe empties while loading
  const teams = analysis?.teams ?? {}
  const shots = analysis?.shots ?? []
  const playerTracks = analysis?.playerTracks ?? []
  const frames = analysis?.frames ?? []
  const court = analysis?.court ?? null
  const gameLabel = analysis?.gameLabel ?? 'No clip uploaded'
  const courtImageUrl = courtImageFor(analysisId, status, analysis)

  // Derive team stats and work out which panels should be shown for the current status
  const teamStats = useMemo(() => computeTeamStats(shots, teams), [shots, teams])
  const hasTeams = Object.keys(teams).length > 0
  const showCourt = status === 'ready' && (courtImageUrl !== null || playerTracks.length > 0)
  // Render the score cards as soon as the analyser identifies both teams, even if shots
  // are still empty — they fill in once the shot-detection module wires in.
  const showStats = status === 'ready' && hasTeams

  return (
    <FilterProvider>
      <div className="min-h-screen">
        <DashboardHeader gameLabel={gameLabel} status={status} message={message} />

        <main className="mx-auto w-full max-w-[1280px] px-6 pb-12 pt-6">
          {/* Top row: video + court map */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[3fr_2fr]">
            <section className="min-w-0">
              <VideoFeed
                gameLabel={gameLabel}
                onAnalysisStarted={setAnalysisId}
                onTimeUpdate={setCurrentTime}
                annotatedUrl={analysis?.annotatedVideoUrl ?? null}
                demo={DEMO_MODE}
              />
            </section>

            <section className="min-w-0">
              <div className="glass-panel glass-mount h-full p-5">
                {showCourt ? (
                  <CourtPanel
                    shots={shots}
                    playerTracks={playerTracks}
                    teams={teams}
                    imageUrl={courtImageUrl}
                    court={court}
                    frames={frames}
                    currentTime={currentTime}
                    hasTeams={hasTeams}
                  />
                ) : (
                  <CourtPlaceholder status={status} />
                )}
              </div>
            </section>
          </div>

          {/* Team stats row (only renders when analysis has shot data) */}
          {showStats && (
            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
              {teamStats.map(stats => (
                <StatsCardsRow.Card key={stats.teamId} stats={stats} />
              ))}
            </div>
          )}

          {/* Movement & hustle analytics — derived from the on-court tracking samples. */}
          {status === 'ready' && hasTeams && frames.length > 0 && (
            <div className="mt-6">
              <MovementStats frames={frames} teams={teams} playerTracks={playerTracks} />
            </div>
          )}

          {/* Shot log — full width below the team cards. */}
          {status === 'ready' && hasTeams && (
            <div className="mt-6">
              <ShotLog shots={shots} teams={teams} fps={analysis?.fps ?? 30} />
            </div>
          )}
        </main>

        <footer className="border-t border-[var(--border)] px-6 py-5 text-center">
          <p className="text-xs text-[var(--text-soft)]">
            CourtIQ · Live tracking analytics for professional basketball
          </p>
        </footer>
      </div>
    </FilterProvider>
  )
}

// Works out which court image URL to use, preferring the server payload over the conventional path
function courtImageFor(
  analysisId: string | null,
  status: AnalysisStatus,
  analysis: VideoAnalysis | null,
): string | null {
  if (!analysisId || status !== 'ready') return null
  // Preferred: server-provided URL on the payload. Fallback: convention-based path.
  if (analysis && typeof (analysis as { courtImageUrl?: string }).courtImageUrl === 'string') {
    return (analysis as { courtImageUrl?: string }).courtImageUrl as string
  }
  return `/api/analyze/result/${analysisId}/court`
}

// Empty-state panel shown in place of the court map, with copy tailored to each status
function CourtPlaceholder({ status }: { status: AnalysisStatus }) {
  const lines: Record<AnalysisStatus, [string, string]> = {
    idle: ['Court map appears here', 'Upload game footage to project player positions onto the court.'],
    processing: ['Building court map…', 'Running detector + court homography. This can take a minute.'],
    ready: ['No on-court tracks', 'The model did not return any player paths for this clip.'],
    error: ['Analysis failed', 'See the banner above for details, or try a different clip.'],
  }
  const [title, sub] = lines[status]
  return (
    <div className="flex h-full min-h-[260px] flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-6 text-center">
      <p
        className="text-sm font-semibold text-[var(--text)]"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {title}
      </p>
      <p className="mt-1.5 max-w-[280px] text-xs text-[var(--text-muted)]">{sub}</p>
    </div>
  )
}

// Sticky top header showing the brand, game label and a live analysing or error badge
function DashboardHeader({
  gameLabel,
  status,
  message,
}: {
  gameLabel: string
  status: AnalysisStatus
  message: string | null
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[rgba(6,8,15,0.55)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-6 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <Logo />
          <span
            className="text-[15px] font-semibold tracking-tight text-[var(--text)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            CourtIQ
          </span>
          <span className="hidden text-[var(--text-soft)] sm:inline">·</span>
          <span className="hidden truncate text-sm text-[var(--text-muted)] sm:inline">
            {gameLabel}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {status === 'processing' && (
            <span className="hidden items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)] backdrop-blur-md md:inline-flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
              Analysing
            </span>
          )}
          {status === 'error' && message && (
            <span
              className="hidden max-w-[300px] truncate rounded-full border border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.10)] px-3 py-1 text-[11px] font-medium text-[var(--miss)] backdrop-blur-md md:inline-flex"
              title={message}
            >
              {message}
            </span>
          )}
        </div>
      </div>
    </header>
  )
}

// The small CourtIQ basketball mark drawn as an inline SVG
function Logo() {
  return (
    <div
      className="flex h-7 w-7 items-center justify-center rounded-md text-white"
      style={{
        background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
        boxShadow: '0 0 16px rgba(108,140,255,0.45)',
      }}
      aria-hidden
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3a13 13 0 0 1 0 18" />
        <path d="M12 3a13 13 0 0 0 0 18" />
      </svg>
    </div>
  )
}

// The lifecycle states an analysis can be in
type AnalysisStatus = 'idle' | 'processing' | 'ready' | 'error'

// Shape returned by the useAnalysis hook
interface UseAnalysisReturn {
  analysis: VideoAnalysis | null
  analysisId: string | null
  status: AnalysisStatus
  message: string | null
  setAnalysisId: (id: string | null) => void
}

// Hook that tracks an analysis by id and polls the backend until it is ready or fails
function useAnalysis(): UseAnalysisReturn {
  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null)
  // Demo builds open in 'processing' so the first paint shows a loading court rather than
  // the "upload footage" idle copy, until /demo/result.json arrives a moment later.
  const [status, setStatus] = useState<AnalysisStatus>(DEMO_MODE ? 'processing' : 'idle')
  const [message, setMessage] = useState<string | null>(null)

  // Set or clear the active analysis id and reset the related state accordingly
  const handleSetAnalysisId = useCallback((id: string | null) => {
    setAnalysisId(id)
    if (id === null) {
      setStatus('idle')
      setMessage(null)
      setAnalysis(null)
    } else {
      setStatus('processing')
      setMessage(null)
      setAnalysis(null)
    }
  }, [])

  // Showcase mode: load the committed demo result instead of polling a live backend.
  // Triggered by the build-time flag (Vercel) or a ?demo=1 query param (handy locally).
  useEffect(() => {
    const demo =
      DEMO_MODE ||
      (typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('demo') === '1')
    if (!demo) return
    let cancelled = false
    setStatus('processing')
    fetch('/demo/result.json')
      .then((r) => r.json())
      .then((data: VideoAnalysis) => {
        if (cancelled) return
        setAnalysis(data)
        setAnalysisId('demo')
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error')
          setMessage('Could not load demo data')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Poll for results whenever the analysis id changes, cancelling cleanly on unmount.
  // The reserved 'demo' id is handled by the loader above, so skip polling for it.
  useEffect(() => {
    if (!analysisId || analysisId === 'demo') return
    let cancelled = false

    // Drive the polling loop and update status as processing, ready or error results arrive
    async function run(id: string) {
      try {
        for await (const result of pollResult(id, { intervalMs: 2000 })) {
          if (cancelled) return
          if (result.status === 'ready' && result.analysis) {
            setAnalysis(result.analysis)
            setStatus('ready')
            return
          }
          if (result.status === 'error') {
            setStatus('error')
            setMessage(result.message ?? 'Analysis failed')
            return
          }
        }
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setMessage(err instanceof Error ? err.message : 'Polling failed')
      }
    }

    run(analysisId)
    return () => {
      cancelled = true
    }
  }, [analysisId])

  return { analysis, analysisId, status, message, setAnalysisId: handleSetAnalysisId }
}
