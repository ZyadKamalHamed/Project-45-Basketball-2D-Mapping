'use client'

import { useCallback, useState } from 'react'
import { useDropzone, FileRejection } from 'react-dropzone'
import { Upload, FileVideo, AlertCircle } from 'lucide-react'

interface Props {
  onFileAccepted: (file: File) => void
}

const ACCEPTED = { 'video/mp4': ['.mp4'], 'video/quicktime': ['.mov'] }
const MAX_MB = 2048

export function DropZone({ onFileAccepted }: Props) {
  const [error, setError] = useState<string | null>(null)

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      setError(null)
      if (rejected.length > 0) {
        const msg = rejected[0].errors[0]?.message ?? 'File rejected'
        setError(msg)
        return
      }
      if (accepted[0]) {
        onFileAccepted(accepted[0])
      }
    },
    [onFileAccepted],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxFiles: 1,
    maxSize: MAX_MB * 1024 * 1024,
  })

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={`relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-8 py-14 text-center transition-all duration-200 ${
          isDragActive
            ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
            : 'border-[var(--border-strong)] bg-[var(--surface)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/40'
        }`}
      >
        <input {...getInputProps()} />

        <div
          className={`rounded-full p-3.5 transition-colors ${
            isDragActive ? 'bg-white' : 'bg-white border border-[var(--border)]'
          }`}
        >
          {isDragActive ? (
            <FileVideo size={26} className="text-[var(--accent)]" />
          ) : (
            <Upload size={26} className="text-[var(--text-muted)]" />
          )}
        </div>

        <div>
          <p className="text-sm font-semibold text-[var(--text)]">
            {isDragActive ? 'Drop to upload' : 'Drag & drop game footage'}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            or <span className="font-medium text-[var(--accent)] hover:underline">browse files</span>
          </p>
        </div>

        <p className="text-[11px] uppercase tracking-widest text-[var(--text-soft)]">
          MP4 or MOV · up to {MAX_MB} MB
        </p>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--miss)]/20 bg-[var(--miss)]/5 px-3 py-2 text-xs text-[var(--miss)]">
          <AlertCircle size={13} className="flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  )
}
