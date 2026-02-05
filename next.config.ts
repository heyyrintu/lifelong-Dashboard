import type { NextConfig } from 'next';

// Backend URL for server-side proxying (Docker internal or external)
const BACKEND_INTERNAL_URL = process.env.BACKEND_INTERNAL_URL || 'http://backend:3001';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@prisma/client'],

  // Image optimization
  images: {
    domains: ['fra.cloud.appwrite.io', 'cdn.dribbble.com'],
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60,
  },

  // Environment variables
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_APPWRITE_ENDPOINT: process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT,
    NEXT_PUBLIC_APPWRITE_PROJECT_ID: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID,
    NEXT_PUBLIC_APPWRITE_PROJECT_NAME: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_NAME,
  },

  // Proxy API requests to backend (works in Docker without exposing port 3001)
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: `${BACKEND_INTERNAL_URL}/:path*`,
      },
    ];
  },

  // Performance optimizations
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  // Compiler optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // Experimental features for better performance
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'framer-motion'],
  },
};

export default nextConfig;

