'use client'

import { useCallback, useRef, useState } from 'react'
import Image from 'next/image'
import { Maximize2, Pause, UploadCloud, Volume2, X } from 'lucide-react'
import { LiveBadge } from './LiveBadge'

interface Props {
  gameLabel: string
  clock?: string
  quarter?: string
}

const ACCEPTED = '.mp4,.mov,video/mp4,video/quicktime'

export function VideoFeed({ gameLabel, clock = '08:42', quarter = 'Q3' }: Props) {
  const [uploaded, setUploaded] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((file?: File | null) => {
    if (!file) return
    setFileName(file.name)
    setUploaded(true)
  }, [])

  const reset = useCallback(() => {
    setUploaded(false)
    setFileName(null)
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  if (!uploaded) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragActive(false)
          handleFile(e.dataTransfer.files?.[0])
        }}
        className={`group relative w-full cursor-pointer overflow-hidden rounded-xl border-2 border-dashed transition-all ${
          dragActive
            ? 'border-[var(--accent)] bg-[var(--accent-soft)]/70'
            : 'border-[var(--border-strong)] bg-white/65 hover:border-[var(--accent)] hover:bg-white/85'
        } backdrop-blur-md shadow-[0_1px_2px_rgba(11,18,32,0.04)]`}
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
            className={`flex h-14 w-14 items-center justify-center rounded-full border transition-colors ${
              dragActive
                ? 'border-[var(--accent)] bg-white text-[var(--accent)]'
                : 'border-[var(--border)] bg-white text-[var(--text-muted)] group-hover:border-[var(--accent)] group-hover:text-[var(--accent)]'
            }`}
          >
            <UploadCloud size={24} />
          </div>
          <div>
            <p
              className="text-base font-semibold text-[var(--text)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {dragActive ? 'Drop to upload' : 'Upload game footage here'}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Click to choose a file or drag &amp; drop
            </p>
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--text-soft)]">
            MP4 or MOV
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-white/60 bg-black shadow-[0_1px_2px_rgba(11,18,32,0.04)]">
      <div className="relative aspect-video w-full">
        <Image
          src="/video-placeholder.png"
          alt={`Live broadcast — ${gameLabel}`}
          fill
          priority
          className="object-cover"
          sizes="(max-width: 1200px) 100vw, 1200px"
        />

        {/* Top overlay row */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2">
            <LiveBadge size="md" variant="overlay" />
            {fileName && (
              <span className="max-w-[260px] truncate rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur-sm">
                {fileName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm tabular-nums">
              {quarter} · {clock}
            </div>
            <button
              type="button"
              onClick={reset}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75"
              aria-label="Replace upload"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Bottom controls bar */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4">
          <div className="flex items-center gap-3 text-white">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm transition-colors hover:bg-white/25"
              aria-label="Pause"
            >
              <Pause size={14} />
            </button>
            <div className="flex-1">
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/20">
                <div className="h-full w-1/3 rounded-full bg-[var(--accent)]" />
              </div>
            </div>
            <span className="text-xs font-medium tabular-nums text-white/80">
              {clock} / 12:00
            </span>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm transition-colors hover:bg-white/25"
              aria-label="Volume"
            >
              <Volume2 size={14} />
            </button>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm transition-colors hover:bg-white/25"
              aria-label="Fullscreen"
            >
              <Maximize2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
