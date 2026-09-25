import path from "path";
import type { NextConfig } from "next";

// Base URL of the crawler's HTTP API.
const API_URL = /*process.env.NEXT_PUBLIC_API_URL ||*/ "http://localhost:3333";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname, "../"),
  },
  // Proxy requests to /api/* from the frontend to the crawler, so the
  // browser only ever talks to this server (no CORS needed).
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;