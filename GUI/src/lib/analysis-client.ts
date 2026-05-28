import { VideoAnalysis } from '@/types/basketball'

export interface UploadResponse {
  analysisId: string
}

export async function uploadVideo(file: File): Promise<UploadResponse> {
  const form = new FormData()
  form.append('video', file)
  const res = await fetch('/api/analyze', {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Upload failed (${res.status}): ${text || res.statusText}`)
  }
  return res.json() as Promise<UploadResponse>
}

export interface PollResult {
  status: 'processing' | 'ready' | 'error'
  analysis?: VideoAnalysis
  message?: string
}

/** Single-shot poll of the result endpoint. Returns `processing` until the JSON is written. */
export async function fetchResult(analysisId: string): Promise<PollResult> {
  const res = await fetch(`/api/analyze/result/${analysisId}`, { cache: 'no-store' })
  if (res.status === 202) {
    return { status: 'processing' }
  }
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json()
      if (body?.message) message = body.message
    } catch {}
    return { status: 'error', message }
  }
  const analysis = (await res.json()) as VideoAnalysis | { error: string; message?: string }
  if ('error' in analysis) {
    return { status: 'error', message: analysis.message ?? analysis.error }
  }
  return { status: 'ready', analysis }
}

/**
 * Async iterable of poll results — yields `processing` updates until the analysis is `ready`
 * (or until an `error` is hit). Caller controls the loop end.
 */
export async function* pollResult(
  analysisId: string,
  { intervalMs = 1500, maxAttempts = 600 }: { intervalMs?: number; maxAttempts?: number } = {},
): AsyncIterable<PollResult> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await fetchResult(analysisId)
    yield result
    if (result.status === 'ready' || result.status === 'error') return
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
}
