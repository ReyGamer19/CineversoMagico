import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  // Se quitó la regla de turbopack con @tailwindcss/turbopack (era de Tailwind v4).
  // Tailwind v3 funciona solo con postcss.config.mjs.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "script-src 'self' 'unsafe-eval' 'unsafe-inline' https:; object-src 'self';",
          },
        ],
      },
    ];
  },
};

export default nextConfig;