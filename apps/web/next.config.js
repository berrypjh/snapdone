//@ts-check
const path = require('node:path');
const { withSentryConfig } = require('@sentry/nextjs/config');

/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Container image runs .next/standalone; tracing starts at the repo root so workspace libs are included. */
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  /** Workspace libs ship TypeScript source; Next compiles them like app code. */
  transpilePackages: [
    '@snapdone/auth-contracts',
    '@snapdone/onboarding',
    '@snapdone/processing',
    '@snapdone/webview-bridge',
  ],
  /** The first-image upload goes through a Server Action; Go accepts images up to 7,500,000 bytes plus multipart overhead. */
  experimental: { serverActions: { bodySizeLimit: '8mb' } },
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

/** Source maps are not uploaded yet; Sentry only reports errors. */
module.exports = withSentryConfig(nextConfig, {
  sourcemaps: { disable: true },
  telemetry: false,
  silent: true,
});
