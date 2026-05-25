'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, Loader2, Circle } from 'lucide-react'
import { ProcessingPhase } from '@/types/basketball'

const PHASES: ProcessingPhase[] = [
  'Detection',
  'Team Assignment',
  'Court Mapping',
  'Shot Detection',
]

const PHASE_DURATION_MS = 1400

interface Props {
  fileName: string
  uploadProgress: number
  onComplete: () => void
}

type PhaseStatus = 'pending' | 'active' | 'done'

export function ProcessingStatus({ fileName, uploadProgress, onComplete }: Props) {
  const [activePhase, setActivePhase] = useState(-1)

  useEffect(() => {
    if (uploadProgress < 100) return

    let phase = 0
    setActivePhase(0)

    const tick = () => {
      phase += 1
      if (phase >= PHASES.length) {
        setTimeout(onComplete, 600)
        return
      }
      setActivePhase(phase)
      setTimeout(tick, PHASE_DURATION_MS)
    }

    const timer = setTimeout(tick, PHASE_DURATION_MS)
    return () => clearTimeout(timer)
  }, [uploadProgress, onComplete])

  return (
    <div className="w-full space-y-5">
      {/* File info */}
      <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3 backdrop-blur-md">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft)] border border-[var(--accent)]/30">
          <span className="text-[10px] font-bold tracking-wider text-[var(--accent)]">MP4</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[var(--text)]">{fileName}</div>
          <div className="mt-0.5 text-[11px] text-[var(--text-soft)]">
            {uploadProgress < 100 ? 'Uploading…' : 'Upload complete'}
          </div>
        </div>
        <span className="text-sm font-medium tabular-nums text-[var(--text-muted)]">
          {uploadProgress}%
        </span>
      </div>

      {/* Upload progress bar with gradient */}
      <div>
        <div className="mb-1.5 flex justify-between text-[11px] uppercase tracking-widest text-[var(--text-soft)]">
          <span>Upload</span>
          <span className="tabular-nums">{uploadProgress}%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{
              width: `${uploadProgress}%`,
              background: 'linear-gradient(90deg, var(--accent), var(--accent-2))',
              boxShadow: '0 0 10px rgba(108,140,255,0.4)',
            }}
          />
        </div>
      </div>

      {/* Processing phases */}
      {uploadProgress >= 100 && (
        <div className="space-y-1">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-soft)]">
            Analysing footage
          </div>
          {PHASES.map((phase, i) => {
            const status: PhaseStatus =
              i < activePhase ? 'done' : i === activePhase ? 'active' : 'pending'
            return <PhaseRow key={phase} phase={phase} status={status} />
          })}
        </div>
      )}
    </div>
  )
}

function PhaseRow({ phase, status }: { phase: ProcessingPhase; status: PhaseStatus }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-md px-3 py-2 transition-colors ${
        status === 'active' ? 'bg-[var(--accent-soft)]' : ''
      }`}
    >
      <span className="flex-shrink-0">
        {status === 'done' ? (
          <CheckCircle size={15} className="text-[var(--made)]" />
        ) : status === 'active' ? (
          <Loader2 size={15} className="animate-spin text-[var(--accent)]" />
        ) : (
          <Circle size={15} className="text-[var(--border-strong)]" />
        )}
      </span>
      <span
        className={`text-sm font-medium transition-colors ${
          status === 'done'
            ? 'text-[var(--text-soft)] line-through'
            : status === 'active'
            ? 'text-[var(--text)]'
            : 'text-[var(--text-soft)]'
        }`}
      >
        {phase}
      </span>
      {status === 'active' && (
        <span className="ml-auto text-[11px] font-medium uppercase tracking-widest text-[var(--accent)]">
          Processing
        </span>
      )}
      {status === 'done' && (
        <span className="ml-auto text-[11px] font-medium uppercase tracking-widest text-[var(--made)]">
          Done
        </span>
      )}
    </div>
  )
}
