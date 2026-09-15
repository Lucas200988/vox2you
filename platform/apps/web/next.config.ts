import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@vox/shared'],
  output: 'standalone',
  reactStrictMode: true,
}

export default nextConfig
