/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    optimizeCss: true
  },
  webpack: (config, { isServer }) => {
    config.module.rules.push({
      test: /\.(ogg|mp3|wav|mpe?g)$/i,
      use: {
        loader: 'url-loader',
        options: {
          limit: 8192,
          fallback: 'file-loader',
          publicPath: '/_next/static/media/',
          outputPath: `${isServer ? '../' : ''}static/media/`,
          name: '[name]-[hash].[ext]'
        }
      }
    });

    return config;
  }
};

export default nextConfig;
