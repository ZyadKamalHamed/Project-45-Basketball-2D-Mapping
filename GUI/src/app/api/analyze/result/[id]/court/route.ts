import { readFile, access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import path from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GUI_ROOT = process.cwd()
const TMP_DIR = path.join(GUI_ROOT, 'tmp')

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return Response.json({ error: 'invalid_id' }, { status: 400 })
  }

  const pngPath = path.join(TMP_DIR, `${id}-court.png`)

  try {
    await access(pngPath, fsConstants.R_OK)
  } catch {
    return Response.json({ status: 'processing' }, { status: 202 })
  }

  try {
    const data = await readFile(pngPath)
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return Response.json(
      {
        error: 'read_failed',
        message: err instanceof Error ? err.message : 'Failed to read court image',
      },
      { status: 500 },
    )
  }
}
