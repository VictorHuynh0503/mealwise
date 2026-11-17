/** @type {import('next').NextConfig} */
const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:8000";

module.exports = {
  reactStrictMode: true,
  async rewrites() {
    // Browser calls /api/* on the Next origin; Next forwards to the Python backend.
    return [{ source: "/api/:path*", destination: `${BACKEND}/api/:path*` }];
  },
};
