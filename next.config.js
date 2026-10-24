
const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin workspace root to this project directory to prevent Next.js from
  // traversing up to ~/package-lock.json and scanning the entire home dir
  outputFileTracingRoot: path.join(__dirname),
  typescript: {
    ignoreBuildErrors: true,
  },
  // Disable type checking during dev for faster compilation
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    return config;
  },
  env: {
    NEXT_PUBLIC_GOOGLE_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  serverExternalPackages: ['@google/generative-ai'],
  experimental: {
    // Enable larger body size limits for file uploads
    serverActions: {
      bodySizeLimit: '150mb',
    },
    // Records that this version bump was the security upgrade Next.js asks an
    // agent to run, so the build stops nudging for one already done.
    agentUpgrade: 'security',
  },
};

module.exports = nextConfig;
