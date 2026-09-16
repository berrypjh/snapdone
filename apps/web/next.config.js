//@ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Workspace libs ship TypeScript source; Next compiles them like app code. */
  transpilePackages: ['@snapdone/webview-bridge'],
};

module.exports = nextConfig;
