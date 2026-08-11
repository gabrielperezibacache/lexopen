import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* LexOpen: Node web service on Render uses `next start`.
     Desktop / empaquetado: LEXOPEN_STANDALONE=1 npm run build → .next/standalone */
  ...(process.env.LEXOPEN_STANDALONE === "1" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
