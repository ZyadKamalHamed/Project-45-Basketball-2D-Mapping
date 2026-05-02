'use client'

import { useMemo, useState, useCallback, useEffect } from 'react'
import Image from 'next/image'
import { Upload, X } from 'lucide-react'
import { FilterProvider } from '@/context/FilterContext'
import { FilterControls } from '@/components/dashboard/FilterControls'
import { StatsCardsRow } from '@/components/dashboard/StatsCardsRow'
import { PlayerStatsTable } from '@/components/dashboard/PlayerStatsTable'
import { VideoFeed } from '@/components/dashboard/VideoFeed'
import { LiveBadge } from '@/components/dashboard/LiveBadge'
import { DropZone } from '@/components/upload/DropZone'
import { ProcessingStatus } from '@/components/upload/ProcessingStatus'
import { MOCK_ANALYSIS } from '@/lib/mock-data'
import { computeTeamStats, computePlayerStats } from '@/lib/stats-utils'

type Stage = 'idle' | 'uploading' | 'processing'

export default function HomePage() {
  const { shots, playerTracks, teams, gameLabel } = MOCK_ANALYSIS

  const teamStats = useMemo(() => computeTeamStats(shots, teams), [shots, teams])
  const playerStats = useMemo(
    () => computePlayerStats(shots, playerTracks, teams),
    [shots, playerTracks, teams],
  )

  const [uploadOpen, setUploadOpen] = useState(false)

  return (
    <FilterProvider>
      <div className="min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-white/75 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-3.5">
            <div className="flex items-center gap-3">
              <Logo />
              <span
                className="text-[15px] font-semibold tracking-tight text-[var(--text)]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                CourtVision
              </span>
              <span className="hidden text-[var(--border-strong)] sm:inline">·</span>
              <span className="hidden text-sm text-[var(--text-muted)] sm:inline">{gameLabel}</span>
            </div>

            <div className="flex items-center gap-3">
              <LiveBadge />
              <button
                onClick={() => setUploadOpen(true)}
                className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
              >
                <Upload size={13} />
                Upload Video
              </button>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="mx-auto max-w-[1200px] px-6 py-10 space-y-12">
          {/* Video feed */}
          <section>
            <SectionHeader
              eyebrow="Live Feed"
              title="Game broadcast"
              subtitle={gameLabel}
            />
            <VideoFeed gameLabel={gameLabel} />
          </section>

          {/* 2D Court */}
          <section>
            <SectionHeader
              eyebrow="Court Tracking"
              title="Real-time shot chart"
              subtitle="Each shot logged by the model appears here as it happens"
            />
            <div className="overflow-hidden rounded-xl border border-white/60 bg-white/75 backdrop-blur-md p-4 shadow-[0_1px_2px_rgba(11,18,32,0.04)]">
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg">
                <Image
                  src="/court.png"
                  alt="2D court with live shot markers"
                  fill
                  priority
                  sizes="(max-width: 1200px) 100vw, 1152px"
                  className="object-contain"
                />
              </div>
              <div className="mt-4 flex items-center gap-5 text-xs text-[var(--text-muted)]">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--made)]" />
                  Boston Celtics
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#2563eb]" />
                  New York Nicks
                </span>
                <span className="ml-auto tabular-nums text-[var(--text-soft)]">
                  Live court — updates as the game progresses
                </span>
              </div>
            </div>
          </section>

          {/* Team stats */}
          <section>
            <SectionHeader
              eyebrow="Team Statistics"
              title="Side by side"
              subtitle="Overall shooting performance"
            />
            <StatsCardsRow teamStats={teamStats} />
          </section>

          {/* Player stats */}
          <section>
            <SectionHeader
              eyebrow="Player Statistics"
              title="Individual breakdown"
              subtitle="Filter the chart and table by team, player or shot type"
            />
            <div className="mb-3 rounded-xl border border-white/60 bg-white/75 backdrop-blur-md p-3 shadow-[0_1px_2px_rgba(11,18,32,0.04)]">
              <FilterControls teams={teams} playerTracks={playerTracks} />
            </div>
            <PlayerStatsTable playerStats={playerStats} />
          </section>
        </main>

        <footer className="border-t border-[var(--border)] px-6 py-5 text-center">
          <p className="text-xs text-[var(--text-soft)]">
            CourtVision · Live tracking analytics for professional basketball
          </p>
        </footer>

        {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} />}
      </div>
    </FilterProvider>
  )
}

function Logo() {
  return (
    <div
      className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--accent)] text-white"
      aria-hidden
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3a13 13 0 0 1 0 18" />
        <path d="M12 3a13 13 0 0 0 0 18" />
      </svg>
    </div>
  )
}

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string
  title: string
  subtitle?: string
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
          {eyebrow}
        </div>
        <h2
          className="mt-1.5 text-[20px] font-semibold tracking-tight text-[var(--text)]"
          style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}
        >
          {title}
        </h2>
      </div>
      {subtitle && (
        <p className="hidden max-w-md text-right text-xs text-[var(--text-soft)] md:block">
          {subtitle}
        </p>
      )}
    </div>
  )
}

function UploadModal({ onClose }: { onClose: () => void }) {
  const [stage, setStage] = useState<Stage>('idle')
  const [fileName, setFileName] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)

  const handleFileAccepted = useCallback((file: File) => {
    setFileName(file.name)
    setStage('uploading')
    setUploadProgress(0)
  }, [])

  useEffect(() => {
    if (stage !== 'uploading') return

    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval)
          setStage('processing')
          return 100
        }
        const increment = prev < 70 ? 8 : prev < 90 ? 3 : 1
        return Math.min(prev + increment, 100)
      })
    }, 80)

    return () => clearInterval(interval)
  }, [stage])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b1220]/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-white p-6 shadow-[0_24px_60px_rgba(11,18,32,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
              Upload
            </div>
            <h3
              className="mt-1 text-lg font-semibold text-[var(--text)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Add game footage
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text)]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {stage === 'idle' && <DropZone onFileAccepted={handleFileAccepted} />}

        {(stage === 'uploading' || stage === 'processing') && (
          <ProcessingStatus
            fileName={fileName}
            uploadProgress={uploadProgress}
            onComplete={onClose}
          />
        )}
      </div>
    </div>
  )
}
