'use client'

// React hooks, upload icons and the client helper that posts the video to the analysis bridge
import { useCallback, useEffect, useRef, useState } from 'react'
import { UploadCloud, X, AlertCircle, FileWarning } from 'lucide-react'
import { uploadVideo } from '@/lib/analysis-client'

// Props for the video feed, including playback time callback and the annotated video URL
interface Props {
  gameLabel: string
  onAnalysisStarted?: (analysisId: string) => void
  /** Fires on `timeupdate` (and play/pause/seek) so the parent can sync overlays to playback. */
  onTimeUpdate?: (currentTime: number) => void
  /** Server-rendered annotated video. When present, the player swaps from the raw blob URL
   *  to this so users see the team-coloured detection boxes on top of the source. */
  annotatedUrl?: string | null
}

// Accepted file extensions and MIME types for the upload input
const ACCEPTED = '.mp4,.mov,video/mp4,video/quicktime'

// Discriminated union describing the upload and playback lifecycle
type UploadState =
  | { kind: 'idle' }
  | { kind: 'uploading'; fileName: string }
  | { kind: 'ready'; fileName: string; objectUrl: string; analysisId: string | null }
  | { kind: 'error'; message: string }

// Handles uploading game footage, previewing it and swapping to the annotated render
export function VideoFeed({ gameLabel, onAnalysisStarted, onTimeUpdate, annotatedUrl = null }: Props) {
  // Upload lifecycle state, drag styling, decode error code and refs for the input, video and blob URL
  const [state, setState] = useState<UploadState>({ kind: 'idle' })
  const [dragActive, setDragActive] = useState(false)
  // Set to a non-null code when the browser refuses to decode the uploaded file
  // (codec not supported, container corrupt, etc.). The bridge analysis keeps running
  // regardless — only the in-browser preview is affected.
  const [videoErrorCode, setVideoErrorCode] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  // Stash the active blob URL outside React state so we can revoke it on unmount or
  // when the user picks a new file — never inside a useEffect cleanup, because React's
  // strict-mode double-mount in dev would revoke the URL between renders and leave the
  // <video> element pointing at a dead blob.
  const activeUrlRef = useRef<string | null>(null)

  // Revoke the active blob URL when the component unmounts to free memory
  useEffect(() => {
    return () => {
      if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current)
        activeUrlRef.current = null
      }
    }
  }, [])

  // When the annotated MP4 URL becomes available we swap `src` to it. The previous video
  // may have errored on a codec the browser couldn't play — the annotated stream is always
  // H.264, so give it a fresh chance by clearing the error.
  useEffect(() => {
    if (annotatedUrl) setVideoErrorCode(null)
  }, [annotatedUrl])

  // Mirror video playback time into the parent so dots can follow the playhead.
  // The native `timeupdate` event fires ~4× per second, which is enough for the dot
  // animation and avoids hammering the parent with re-renders.
  //
  // `annotatedUrl` is a dependency on purpose: when the annotated render swaps in, the
  // <video> below gets a new `key` and React mounts a *fresh* DOM element. Without this
  // dep the effect wouldn't re-run, leaving the listeners bound to the old, discarded
  // element — so playback time (and the tracking dots) would freeze on the swap.
  useEffect(() => {
    if (state.kind !== 'ready' || !onTimeUpdate) return
    const video = videoRef.current
    if (!video) return

    const emit = () => onTimeUpdate(video.currentTime)
    emit()
    video.addEventListener('timeupdate', emit)
    video.addEventListener('seeked', emit)
    return () => {
      video.removeEventListener('timeupdate', emit)
      video.removeEventListener('seeked', emit)
    }
  }, [state.kind, onTimeUpdate, annotatedUrl])

  // Create a local preview URL, upload the file to the bridge and move to the ready state
  const handleFile = useCallback(
    async (file?: File | null) => {
      if (!file) return
      // If there's already a blob URL from a previous upload, revoke it before replacing.
      if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current)
      }
      const objectUrl = URL.createObjectURL(file)
      activeUrlRef.current = objectUrl
      setVideoErrorCode(null)
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

  // Clear the current upload and return the feed to its idle drop-zone state
  const reset = useCallback(() => {
    if (activeUrlRef.current) {
      URL.revokeObjectURL(activeUrlRef.current)
      activeUrlRef.current = null
    }
    setVideoErrorCode(null)
    setState({ kind: 'idle' })
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  // Before a file is ready, render the click-or-drag drop zone with upload and error states
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

  // Ready: file picked, render the actual video below a small header strip with the
  // filename and a reset button. The header lives in a sibling div (not an overlay)
  // so nothing can intercept clicks on the video itself.
  //
  // Source priority: prefer the server-rendered annotated MP4 once analysis finishes,
  // otherwise fall back to the local blob URL. The `key` on the <video> element forces
  // a fresh DOM element when the src changes so the browser actually picks up the swap.
  // Choose the playback source, preferring the annotated render over the local blob
  const playbackSrc = annotatedUrl ?? state.objectUrl
  const isAnnotated = playbackSrc === annotatedUrl
  // Render the header strip and the video, falling back to a placeholder if it can't decode
  return (
    <div className="glass-mount w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-black/40 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[12px] font-medium text-white/85" title={state.fileName}>
            {state.fileName}
          </span>
          {isAnnotated && (
            <span className="rounded-full bg-[rgba(108,140,255,0.18)] border border-[rgba(108,140,255,0.35)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--accent)]">
              Annotated
            </span>
          )}
          {state.analysisId === null && (
            <span className="rounded-full bg-[rgba(255,107,107,0.18)] border border-[rgba(255,107,107,0.35)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--miss)]">
              Local only
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={reset}
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white/8 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
          aria-label="Replace upload"
          title="Replace upload"
        >
          <X size={12} />
        </button>
      </div>

      {videoErrorCode === null ? (
        <video
          ref={videoRef}
          key={playbackSrc}
          src={playbackSrc}
          controls
          playsInline
          preload="metadata"
          onError={(e) => {
            const code = e.currentTarget.error?.code ?? 0
            setVideoErrorCode(code)
          }}
          className="block aspect-video w-full bg-black"
          aria-label={`Game footage — ${gameLabel}`}
        />
      ) : (
        <UnplayablePlaceholder code={videoErrorCode} />
      )}
    </div>
  )
}

// 1 = MEDIA_ERR_ABORTED, 2 = NETWORK, 3 = DECODE, 4 = SRC_NOT_SUPPORTED.
// In practice, all three of 2/3/4 mean "browser can't decode this file" — the analysis
// backend still works, only the in-browser preview is unavailable.
// Placeholder shown when the browser can't decode the file, mapping the error code to a message
function UnplayablePlaceholder({ code }: { code: number }) {
  // Pick a headline and detail message based on the media error code
  const headline =
    code === 4
      ? "Browser can't play this file"
      : code === 3
        ? 'Video decoder failed'
        : code === 2
          ? 'Network error loading video'
          : 'Video playback unavailable'

  const detail =
    code === 4
      ? 'Likely an unsupported codec (MPEG-4 Part 2, HEVC, etc). Re-encode to H.264 to preview it here. The shot map and team stats below are still running on the file you uploaded.'
      : 'The shot map and team stats below are still running on the file you uploaded — only the in-browser preview is affected.'

  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-black/60 px-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.10)] text-[var(--miss)]">
        <FileWarning size={20} />
      </div>
      <p
        className="text-sm font-semibold text-[var(--text)]"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        {headline}
      </p>
      <p className="max-w-[460px] text-xs leading-relaxed text-[var(--text-muted)]">{detail}</p>
    </div>
  )
}
