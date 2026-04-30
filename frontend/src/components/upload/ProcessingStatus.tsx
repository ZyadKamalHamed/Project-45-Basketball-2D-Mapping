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
  const [activePhase, setActivePhase] = useState(-1) // -1 = uploading

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
    <div className="w-full max-w-xl mx-auto space-y-6">
      {/* File info */}
      <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3">
        <div className="w-8 h-8 rounded-md bg-blue-600/20 flex items-center justify-center flex-shrink-0">
          <span className="text-blue-400 text-xs font-bold">MP4</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-slate-200 truncate">{fileName}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {uploadProgress < 100 ? 'Uploading…' : 'Upload complete'}
          </div>
        </div>
        <span className="text-sm font-mono text-slate-400 tabular-nums">
          {uploadProgress}%
        </span>
      </div>

      {/* Upload progress bar */}
      <div>
        <div className="flex justify-between text-xs text-slate-500 mb-1.5">
          <span>Upload</span>
          <span>{uploadProgress}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-200"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      </div>

      {/* Processing phases */}
      {uploadProgress >= 100 && (
        <div className="space-y-1">
          <div className="text-xs text-slate-500 uppercase tracking-widest mb-3 font-medium">
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
      className={`flex items-center gap-3 rounded-lg px-4 py-2.5 transition-colors ${
        status === 'active' ? 'bg-blue-500/10' : ''
      }`}
    >
      <span className="flex-shrink-0">
        {status === 'done' ? (
          <CheckCircle size={17} className="text-green-500" />
        ) : status === 'active' ? (
          <Loader2 size={17} className="text-blue-400 animate-spin" />
        ) : (
          <Circle size={17} className="text-slate-600" />
        )}
      </span>
      <span
        className={`text-sm font-medium transition-colors ${
          status === 'done'
            ? 'text-slate-400 line-through'
            : status === 'active'
            ? 'text-slate-100'
            : 'text-slate-600'
        }`}
      >
        {phase}
      </span>
      {status === 'active' && (
        <span className="ml-auto text-xs text-blue-400 animate-pulse">Processing…</span>
      )}
      {status === 'done' && (
        <span className="ml-auto text-xs text-green-600">Done</span>
      )}
    </div>
  )
}
