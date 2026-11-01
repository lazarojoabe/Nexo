import type { NextConfig } from 'next';

function origin(value: string | undefined) {
  try { return value ? new URL(value).origin : undefined; } catch { return undefined; }
}

const apiOrigin = origin(process.env.NEXT_PUBLIC_API_URL);
const supabaseOrigin = origin(process.env.NEXT_PUBLIC_SUPABASE_URL);
const connectSources = ["'self'", apiOrigin, supabaseOrigin, 'https://*.supabase.co'].filter(Boolean).join(' ');
const scriptSources = process.env.NODE_ENV === 'development' ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";
const csp = [
  "default-src 'self'",
  `script-src ${scriptSources}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https:",
  `connect-src ${connectSources}`,
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

// Keep the dev compiler cache apart from production builds. It prevents a
// running `pnpm dev` process from reading a partially replaced `.next` folder
// while `pnpm build` is being validated in another terminal.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  async headers() {
    const headers = [
      { key: 'Content-Security-Policy', value: csp },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(), microphone=()' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ];
    if (process.env.NODE_ENV === 'production') headers.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' });
    return [{ source: '/:path*', headers }];
  },
};

export default nextConfig;
