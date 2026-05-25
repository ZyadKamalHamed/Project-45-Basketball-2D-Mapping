'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { UploadCloud, X, AlertCircle } from 'lucide-react'
import { LiveBadge } from './LiveBadge'
import { uploadVideo } from '@/lib/analysis-client'

interface Props {
  gameLabel: string
  onAnalysisStarted?: (analysisId: string) => void
}

const ACCEPTED = '.mp4,.mov,video/mp4,video/quicktime'

type UploadState =
  | { kind: 'idle' }
  | { kind: 'uploading'; fileName: string }
  | { kind: 'ready'; fileName: string; objectUrl: string; analysisId: string | null }
  | { kind: 'error'; message: string }

export function VideoFeed({ gameLabel, onAnalysisStarted }: Props) {
  const [state, setState] = useState<UploadState>({ kind: 'idle' })
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Revoke object URLs when the file is replaced.
  useEffect(() => {
    return () => {
      if (state.kind === 'ready') URL.revokeObjectURL(state.objectUrl)
    }
  }, [state])

  const handleFile = useCallback(
    async (file?: File | null) => {
      if (!file) return
      const objectUrl = URL.createObjectURL(file)
      setState({ kind: 'uploading', fileName: file.name })

      try {
        const { analysisId } = await uploadVideo(file)
        setState({ kind: 'ready', fileName: file.name, objectUrl, analysisId })
        onAnalysisStarted?.(analysisId)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed'
        // Still show the video locally even if the bridge fails — useful for design QA.
        setState({ kind: 'ready', fileName: file.name, objectUrl, analysisId: null })
        console.warn('analyze upload failed:', message)
      }
    },
    [onAnalysisStarted],
  )

  const reset = useCallback(() => {
    setState(prev => {
      if (prev.kind === 'ready') URL.revokeObjectURL(prev.objectUrl)
      return { kind: 'idle' }
    })
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  if (state.kind === 'idle' || state.kind === 'uploading' || state.kind === 'error') {
    const uploading = state.kind === 'uploading'
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!uploading && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          if (!uploading) setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragActive(false)
          if (!uploading) handleFile(e.dataTransfer.files?.[0])
        }}
        className={`group glass-mount relative w-full overflow-hidden rounded-2xl border-2 border-dashed transition-all backdrop-blur-xl ${
          uploading
            ? 'cursor-progress border-[var(--accent)]/60 bg-[var(--surface-2)]'
            : dragActive
              ? 'cursor-copy border-[var(--accent)] bg-[var(--accent-soft)]'
              : 'cursor-pointer border-[var(--border-strong)] bg-[var(--surface-2)] hover:border-[var(--accent)] hover:bg-[var(--surface)]'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="sr-only"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 px-6 text-center">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-full border transition-colors ${
              dragActive || uploading
                ? 'border-[var(--accent)] bg-[var(--surface-elev)] text-[var(--accent)]'
                : 'border-[var(--border)] bg-[var(--surface-elev)] text-[var(--text-muted)] group-hover:border-[var(--accent)] group-hover:text-[var(--accent)]'
            }`}
            style={{ boxShadow: '0 0 32px rgba(108,140,255,0.25)' }}
          >
            <UploadCloud size={26} />
          </div>
          <div>
            <p
              className="text-base font-semibold text-[var(--text)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {uploading
                ? 'Uploading…'
                : dragActive
                  ? 'Drop to upload'
                  : 'Upload game footage'}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {uploading ? state.fileName : 'Click to choose a file or drag & drop'}
            </p>
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--text-soft)]">
            MP4 or MOV
          </p>

          {state.kind === 'error' && (
            <div className="flex items-center gap-2 text-xs text-[var(--miss)]">
              <AlertCircle size={13} />
              {state.message}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Ready: render the actual uploaded video.
  return (
    <div className="glass-mount relative w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-black/40 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
      <div className="relative aspect-video w-full">
        <video
          ref={videoRef}
          src={state.objectUrl}
          controls
          playsInline
          className="absolute inset-0 h-full w-full object-contain bg-black"
          aria-label={`Game footage — ${gameLabel}`}
        />

        {/* Top overlay row (sits above controls because of pointer-events) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 p-4">
          <div className="pointer-events-auto flex items-center gap-2">
            <LiveBadge size="md" variant="overlay" />
            <span className="max-w-[260px] truncate rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm border border-white/10">
              {state.fileName}
            </span>
            {state.analysisId === null && (
              <span className="rounded-full bg-[rgba(255,107,107,0.18)] border border-[rgba(255,107,107,0.35)] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--miss)] backdrop-blur-sm">
                Local only
              </span>
            )}
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm border border-white/10 transition-colors hover:bg-black/75"
              aria-label="Replace upload"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
