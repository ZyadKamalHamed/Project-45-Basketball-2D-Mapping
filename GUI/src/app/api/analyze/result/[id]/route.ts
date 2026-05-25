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
  // Basic safety check on the id.
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return Response.json({ error: 'invalid_id' }, { status: 400 })
  }

  const jsonPath = path.join(TMP_DIR, `${id}.json`)

  try {
    await access(jsonPath, fsConstants.R_OK)
  } catch {
    return Response.json({ status: 'processing' }, { status: 202 })
  }

  try {
    const raw = await readFile(jsonPath, 'utf-8')
    const parsed = JSON.parse(raw)
    return Response.json(parsed)
  } catch (err) {
    return Response.json(
      {
        error: 'parse_failed',
        message: err instanceof Error ? err.message : 'Failed to read result',
      },
      { status: 500 },
    )
  }
}
