'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { DropZone } from '@/components/upload/DropZone'
import { ProcessingStatus } from '@/components/upload/ProcessingStatus'
import { Activity } from 'lucide-react'

type Stage = 'idle' | 'uploading' | 'processing'

export default function UploadPage() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('idle')
  const [fileName, setFileName] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)

  const handleFileAccepted = useCallback((file: File) => {
    setFileName(file.name)
    setStage('uploading')
    setUploadProgress(0)
  }, [])

  // Simulate upload progress
  useEffect(() => {
    if (stage !== 'uploading') return

    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval)
          setStage('processing')
          return 100
        }
        // Accelerate fast, then slow near end for realism
        const increment = prev < 70 ? 8 : prev < 90 ? 3 : 1
        return Math.min(prev + increment, 100)
      })
    }, 80)

    return () => clearInterval(interval)
  }, [stage])

  const handleComplete = useCallback(() => {
    router.push('/dashboard')
  }, [router])

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0f172a' }}>
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
            <Activity size={14} className="text-white" />
          </div>
          <span className="font-semibold text-slate-100 text-sm tracking-tight">CourtVision</span>
          <span className="text-slate-600 text-sm">· Analytics Platform</span>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-xl space-y-8">
          {/* Title */}
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-slate-100 tracking-tight">
              Upload Game Footage
            </h1>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed">
              Upload an MP4 or MOV recording. Our pipeline will detect players,<br />
              assign teams, map the court, and extract every shot automatically.
            </p>
          </div>

          {stage === 'idle' && <DropZone onFileAccepted={handleFileAccepted} />}

          {(stage === 'uploading' || stage === 'processing') && (
            <ProcessingStatus
              fileName={fileName}
              uploadProgress={uploadProgress}
              onComplete={handleComplete}
            />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 px-6 py-4 text-center">
        <p className="text-xs text-slate-600">
          CourtVision — Built for coaching and scouting professionals
        </p>
      </footer>
    </div>
  )
}
