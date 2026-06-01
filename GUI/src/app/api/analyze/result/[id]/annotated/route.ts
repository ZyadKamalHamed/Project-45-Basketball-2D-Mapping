import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TMP_DIR = path.join(process.cwd(), 'tmp')

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  // Guard against path traversal — only allow plain uuid-like ids.
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    return new Response('invalid id', { status: 400 })
  }

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
