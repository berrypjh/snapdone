//@ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Workspace libs ship TypeScript source; Next compiles them like app code. */
  transpilePackages: ['@snapdone/auth-contracts', '@snapdone/webview-bridge'],
  /** Handoff and callback URLs carry one-time codes: never cache them or leak them via Referer. */
  async headers() {
    return [
      {
        source: '/auth/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
