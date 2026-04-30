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
    <div className="w-full max-w-xl mx-auto">
      <div
        {...getRootProps()}
        className={`relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-8 py-16 text-center cursor-pointer transition-all duration-200 ${
          isDragActive
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-slate-600 bg-slate-800/40 hover:border-slate-500 hover:bg-slate-800/60'
        }`}
      >
        <input {...getInputProps()} />

        <div
          className={`rounded-full p-4 transition-colors ${
            isDragActive ? 'bg-blue-500/20' : 'bg-slate-700/60'
          }`}
        >
          {isDragActive ? (
            <FileVideo size={32} className="text-blue-400" />
          ) : (
            <Upload size={32} className="text-slate-400" />
          )}
        </div>

        <div>
          <p className="text-base font-semibold text-slate-200">
            {isDragActive ? 'Drop to upload' : 'Drag & drop game footage'}
          </p>
          <p className="text-sm text-slate-400 mt-1">
            or <span className="text-blue-400 hover:underline">browse files</span>
          </p>
        </div>

        <p className="text-xs text-slate-500">MP4 or MOV · up to {MAX_MB} MB</p>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 text-sm text-red-400 bg-red-400/10 rounded-lg px-4 py-2.5">
          <AlertCircle size={15} className="flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  )
}
