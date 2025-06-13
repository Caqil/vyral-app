import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Experimental features for Next.js 15
  experimental: {
    // Enable turbo for faster builds
    turbo: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js',
        },
      },
    },
  },

  // Compiler options
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'pbs.twimg.com',
      },
      {
        protocol: 'https',
        hostname: 'cdn.discordapp.com',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // Plugin system support
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Plugin dynamic import support
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': './src',
      '@/core': './src/core',
      '@/components': './src/core/components',
      '@/lib': './src/core/lib',
      '@/hooks': './src/core/hooks',
      '@/types': './src/core/types',
      '@/models': './src/core/models',
      '@/services': './src/core/services',
      '@/config': './src/config',
      '@/plugins': './plugins',
      '@/ui': './src/core/components/ui',
    }

    // Plugin hot reloading support
    if (dev && !isServer) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.next/**',
          '**/plugins/uploads/**',
          '**/plugins/cache/**',
        ],
        poll: 1000,
      }
    }

    // Plugin asset handling
    config.module.rules.push({
      test: /\.(png|jpe?g|gif|svg|ico|webp)$/i,
      type: 'asset/resource',
      generator: {
        filename: 'static/media/[name].[hash:8][ext]',
      },
    })

    // Plugin CSS handling
    config.module.rules.push({
      test: /\.css$/,
      include: /plugins/,
      use: [
        'style-loader',
        {
          loader: 'css-loader',
          options: {
            modules: {
              localIdentName: '[local]__[hash:base64:5]',
            },
          },
        },
      ],
    })

    // Bundle analyzer for production analysis
    if (process.env.ANALYZE === 'true' && !dev && !isServer) {
      try {
        const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer')
        config.plugins.push(
          new BundleAnalyzerPlugin({
            analyzerMode: 'static',
            reportFilename: './analyze/client.html',
          })
        )
      } catch (error) {
        console.warn('webpack-bundle-analyzer not available, skipping bundle analysis')
      }
    }

    return config
  },

  // Headers for plugin security
  async headers() {
    return [
      {
        source: '/api/plugins/:path*',
        headers: [
          {
            key: 'X-Plugin-API',
            value: 'true',
          },
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
      {
        source: '/plugins/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
        ],
      },
    ]
  },

  // Redirects for plugin system
  async redirects() {
    return [
      {
        source: '/plugin/:slug*',
        destination: '/api/plugins/:slug*',
        permanent: false,
      },
    ]
  },

  // Rewrites for dynamic plugin pages
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/p/:plugin/:path*',
          destination: '/api/plugins/:plugin/page/:path*',
        },
      ],
      afterFiles: [
        {
          source: '/plugin-assets/:plugin/:path*',
          destination: '/plugins/:plugin/assets/:path*',
        },
      ],
    }
  },

  // Environment variables
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
    PLUGIN_DIR: './plugins',
    UPLOAD_DIR: './public/uploads',
  },

  // Output configuration
  output: 'standalone',
  
  // Disable x-powered-by header
  poweredByHeader: false,

  // Enable compression
  compress: true,

  // Development indicators
  devIndicators: {
    buildActivity: true,
    buildActivityPosition: 'bottom-right',
  },

  // TypeScript configuration
  typescript: {
    // Dangerously allow production builds to successfully complete even if
    // your project has TypeScript errors.
    ignoreBuildErrors: false,
  },

  // ESLint configuration
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: false,
    dirs: ['src', 'plugins/system', 'plugins/templates'],
  },

}

export default nextConfig