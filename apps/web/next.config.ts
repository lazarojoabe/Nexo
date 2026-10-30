import type { NextConfig } from 'next';
// Keep the dev compiler cache apart from production builds. It prevents a
// running `pnpm dev` process from reading a partially replaced `.next` folder
// while `pnpm build` is being validated in another terminal.
const nextConfig: NextConfig = { reactStrictMode: true, distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next' };
export default nextConfig;
