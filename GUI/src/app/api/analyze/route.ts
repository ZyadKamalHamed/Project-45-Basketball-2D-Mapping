// This code serves the /api/analyze route, which accepts video uploads and spawns the analysis script. The script writes results to a JSON file in the tmp/ directory, which the GUI polls for results.
// Pull in the request type, child process spawning, file system helpers, a UUID generator and path utilities.
import { NextRequest } from 'next/server'
import { spawn } from 'node:child_process'
import { mkdir, writeFile, access } from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

// Run this route on the Node.js runtime and never cache it, as each request spawns work.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Work out the key directories and the path to the Python analysis script.
// `process.cwd()` for `next dev` is the GUI/ directory.
const GUI_ROOT = process.cwd()
const REPO_ROOT = path.resolve(GUI_ROOT, '..')
const TMP_DIR = path.join(GUI_ROOT, 'tmp')
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'analyze.py')

// Choose the Python interpreter, preferring the project's venv and falling back to system python3.
async function pickPython(): Promise<string> {
  const venvPython = path.join(REPO_ROOT, 'venv', 'bin', 'python')
  try {
    await access(venvPython, fsConstants.X_OK)
    return venvPython
  } catch {
    return 'python3'
  }
}

// Handle a video upload, kick off the analysis pipeline and return an id the GUI can poll.
export async function POST(req: NextRequest) {
  // Parse the multipart form data, returning a 400 if the body is malformed.
  let formData: FormData
  try {
    formData = await req.formData()
  } catch (err) {
    return Response.json(
      { error: 'invalid_form', message: err instanceof Error ? err.message : 'Bad form data' },
      { status: 400 },
    )
  }

  // Validate that a video file was actually supplied in the upload.
  const file = formData.get('video')
  if (!file || !(file instanceof File)) {
    return Response.json({ error: 'missing_file', message: 'No "video" field in form' }, { status: 400 })
  }

  // Generate a unique id and work out where the video and result JSON will live on disk.
  const analysisId = randomUUID()
  const ext = (file.name.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? '.mp4').toLowerCase()
  const videoPath = path.join(TMP_DIR, `${analysisId}${ext}`)
  const jsonPath = path.join(TMP_DIR, `${analysisId}.json`)

  // Make sure the tmp directory exists, then write the uploaded video to disk.
  await mkdir(TMP_DIR, { recursive: true })
  const buf = Buffer.from(await file.arrayBuffer())
  await writeFile(videoPath, buf)

  // Decide which Python interpreter to use for the pipeline.
  const python = await pickPython()

  // Spawn detached so the request returns quickly. Pipe stdout/stderr to a log file alongside the JSON.
  const child = spawn(
    python,
    [SCRIPT_PATH, '--video', videoPath, '--out', jsonPath, '--analysis-id', analysisId],
    {
      cwd: REPO_ROOT,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    },
  )

  // Wire up the child process events for logging and error handling.
  // Surface stdout/stderr to the dev server console for easier debugging.
  child.stdout?.on('data', (d) => process.stdout.write(`[analyze:${analysisId.slice(0, 8)}] ${d}`))
  child.stderr?.on('data', (d) => process.stderr.write(`[analyze:${analysisId.slice(0, 8)}] ${d}`))
  child.on('error', (err) => {
    // If Python isn't available we write an error JSON so the GUI gets a structured failure.
    const payload = {
      error: 'spawn_failed',
      message: `Failed to start Python: ${err.message}`,
    }
    writeFile(jsonPath, JSON.stringify(payload, null, 2)).catch(() => {})
  })
  child.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      // Non-zero exit and the script didn't write JSON itself — write an error stub so the GUI
      // stops polling.
      access(jsonPath, fsConstants.R_OK).catch(() => {
        writeFile(
          jsonPath,
          JSON.stringify(
            {
              error: 'script_failed',
              message: `analyze.py exited with code ${code} (signal=${signal ?? 'none'})`,
            },
            null,
            2,
          ),
        ).catch(() => {})
      })
    }
  })

  // Let the child outlive this request.
  child.unref()

  // Return the analysis id so the GUI knows which result to poll for.
  return Response.json({ analysisId })
}
