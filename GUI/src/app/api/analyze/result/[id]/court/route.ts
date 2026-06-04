// Pull in the file system helpers and path utilities for serving the court image.
import { readFile, access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import path from 'node:path'

// Run on the Node.js runtime and never cache, as the image appears once the pipeline produces it.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Work out where the court image files are stored.
const GUI_ROOT = process.cwd()
const TMP_DIR = path.join(GUI_ROOT, 'tmp')

// Shape of the route context, with the dynamic id param resolved as a promise.
interface RouteContext {
  params: Promise<{ id: string }>
}

// Return the rendered court PNG for a given id, or a processing status if it isn't ready.
export async function GET(_req: Request, ctx: RouteContext) {
  // Validate the id to guard against path traversal.
  const { id } = await ctx.params
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return Response.json({ error: 'invalid_id' }, { status: 400 })
  }

  // Work out the court image path and check whether it exists yet.
  const pngPath = path.join(TMP_DIR, `${id}-court.png`)

  try {
    await access(pngPath, fsConstants.R_OK)
  } catch {
    return Response.json({ status: 'processing' }, { status: 202 })
  }

  // Read the PNG and return it with image headers, or a 500 if it can't be read.
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
