// Bring in the Next.js config type so the object below is type checked.
import type { NextConfig } from 'next'

// This app lives in a subdirectory of a larger repo, and there is a stray
// package-lock.json in a parent directory (~/). Next 16's Turbopack build otherwise walks
// up, picks that as the workspace root, and the Vercel build output ends up missing the
// app's routes (only /public survives) — so `/` and the API routes 404 in production.
// Pinning the root (and the file-tracing root) to this folder fixes the output.
const here = process.cwd()

const nextConfig: NextConfig = {
  turbopack: { root: here },
  outputFileTracingRoot: here,
}

export default nextConfig
