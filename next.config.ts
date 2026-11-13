import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  images: {
    // Image optimization is enabled (default).
    // Next.js will automatically resize, compress, and serve WebP/AVIF
    // — dramatically reducing bandwidth vs serving raw originals.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pub-58f10aa79a8d494ab12dad618a158e60.r2.dev',
      },
      {
        protocol: 'https',
        hostname: '**.r2.dev',
      },
      {
        protocol: 'https',
        hostname: 'poswtkarskyouacsjfct.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:all*(svg|jpg|png|webp|ico|woff|woff2)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
