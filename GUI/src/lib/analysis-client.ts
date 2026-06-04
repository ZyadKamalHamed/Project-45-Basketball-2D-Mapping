import { VideoAnalysis } from '@/types/basketball'

// Shape of the response returned when a video upload is accepted
export interface UploadResponse {
  analysisId: string
}

// Uploads a video file to the analyse endpoint and returns its new analysis id
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

// Result of a single poll, carrying the status plus the analysis or an error message
export interface PollResult {
  status: 'processing' | 'ready' | 'error'
  analysis?: VideoAnalysis
  message?: string
}

// Fetches the result once and normalises the HTTP response into a PollResult
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
// Repeatedly polls at a fixed interval, yielding each result until ready, error or attempts run out
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
