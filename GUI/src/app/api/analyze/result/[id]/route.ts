// Pull in the file system helpers and path utilities needed to read result files.
import { readFile, access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import path from 'node:path'

// Run on the Node.js runtime and never cache, as results change as the pipeline runs.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Work out where result JSON files are stored.
const GUI_ROOT = process.cwd()
const TMP_DIR = path.join(GUI_ROOT, 'tmp')

// Shape of the route context, with the dynamic id param resolved as a promise.
interface RouteContext {
  params: Promise<{ id: string }>
}

// Return the analysis result JSON for a given id, or a processing status if it isn't ready.
export async function GET(_req: Request, ctx: RouteContext) {
  // Validate the id to guard against path traversal.
  const { id } = await ctx.params
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return Response.json({ error: 'invalid_id' }, { status: 400 })
  }

  // Work out the result file path and check whether it exists yet.
  const jsonPath = path.join(TMP_DIR, `${id}.json`)

  try {
    await access(jsonPath, fsConstants.R_OK)
  } catch {
    return Response.json({ status: 'processing' }, { status: 202 })
  }

  // Read and parse the result JSON, returning a 500 if it can't be read.
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
