// Pull in the file system helpers and path utilities for serving the annotated video.
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

// Run on the Node.js runtime and never cache, as the video appears once the pipeline finishes.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Work out where the annotated video files are stored.
const TMP_DIR = path.join(process.cwd(), 'tmp')

// Stream back the annotated MP4 for a given id, or a 404 if it isn't ready yet.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  // Guard against path traversal — only allow plain uuid-like ids.
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    return new Response('invalid id', { status: 400 })
  }

  // Read the annotated video and return it with video headers, or a 404 if it's missing.
  const filePath = path.join(TMP_DIR, `${id}-annotated.mp4`)
  try {
    const meta = await stat(filePath)
    const buf = await readFile(filePath)
    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(meta.size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=0, must-revalidate',
      },
    })
  } catch {
    return new Response('annotated video not yet ready', { status: 404 })
  }
}
