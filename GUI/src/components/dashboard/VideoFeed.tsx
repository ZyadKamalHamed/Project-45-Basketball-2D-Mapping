'use client'

import Image from 'next/image'
import { Maximize2, Pause, Volume2 } from 'lucide-react'
import { LiveBadge } from './LiveBadge'

interface Props {
  gameLabel: string
  clock?: string
  quarter?: string
}

export function VideoFeed({ gameLabel, clock = '08:42', quarter = 'Q3' }: Props) {
  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-[var(--border)] bg-black shadow-[0_1px_2px_rgba(11,18,32,0.04)]">
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
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
          <LiveBadge size="md" variant="overlay" />
          <div className="rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm tabular-nums">
            {quarter} · {clock}
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
