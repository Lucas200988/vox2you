import type { NextConfig } from 'next'
import path from 'node:path'

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@vox/shared'],
  // Monorepo: trace files from the workspace root so the standalone output includes workspace packages.
  outputFileTracingRoot: path.join(import.meta.dirname, '../../'),
  reactStrictMode: true,
  poweredByHeader: false,
}

export default nextConfig
