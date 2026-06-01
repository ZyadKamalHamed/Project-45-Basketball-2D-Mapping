'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FilterProvider } from '@/context/FilterContext'
import { CourtMap } from '@/components/dashboard/CourtMap'
import { FilterControls } from '@/components/dashboard/FilterControls'
import { StatsCardsRow } from '@/components/dashboard/StatsCardsRow'
import { VideoFeed } from '@/components/dashboard/VideoFeed'
import { ShotLog } from '@/components/dashboard/ShotLog'
import { computeTeamStats } from '@/lib/stats-utils'
import { pollResult } from '@/lib/analysis-client'
import type { VideoAnalysis } from '@/types/basketball'

export default function HomePage() {
  const { analysis, analysisId, status, message, setAnalysisId } = useAnalysis()
  const [currentTime, setCurrentTime] = useState(0)

  const teams = analysis?.teams ?? {}
  const shots = analysis?.shots ?? []
  const playerTracks = analysis?.playerTracks ?? []
  const frames = analysis?.frames ?? []
  const court = analysis?.court ?? null
  const gameLabel = analysis?.gameLabel ?? 'No clip uploaded'
  const courtImageUrl = courtImageFor(analysisId, status, analysis)

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
              />
            </section>

            <section className="min-w-0">
              <div className="glass-panel glass-mount h-full p-5">
                {showCourt ? (
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
                      imageUrl={courtImageUrl}
                      court={court}
                    />
                  </>
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

          {/* Shot log — full width below the team cards. */}
          {status === 'ready' && hasTeams && (
            <div className="mt-6">
              <ShotLog shots={shots} teams={teams} fps={analysis?.fps ?? 30} />
            </div>
          )}
        </main>

        <footer className="border-t border-[var(--border)] px-6 py-5 text-center">
          <p className="text-xs text-[var(--text-soft)]">
            CourtVision · Live tracking analytics for professional basketball
          </p>
        </footer>
      </div>
    </FilterProvider>
  )
}

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
            CourtVision
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

type AnalysisStatus = 'idle' | 'processing' | 'ready' | 'error'

interface UseAnalysisReturn {
  analysis: VideoAnalysis | null
  analysisId: string | null
  status: AnalysisStatus
  message: string | null
  setAnalysisId: (id: string | null) => void
}

function useAnalysis(): UseAnalysisReturn {
  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null)
  const [status, setStatus] = useState<AnalysisStatus>('idle')
  const [message, setMessage] = useState<string | null>(null)

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

  useEffect(() => {
    if (!analysisId) return
    let cancelled = false

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
