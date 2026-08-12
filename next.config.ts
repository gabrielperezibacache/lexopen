import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./src/lib/security/headers";

const securityHeaders = buildSecurityHeaders();

const nextConfig: NextConfig = {
  /* Hide the floating "N" Next.js Dev Tools badge in development.
     Compile/runtime errors still surface via the error overlay. */
  devIndicators: false,
  serverExternalPackages: [
    "@firecrawl/anydoc",
    "@firecrawl/pdf-inspector",
    "@d0paminedriven/pdfdown-ocr",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  /* LexOpen: Node web service on Render uses `next start`.
     Desktop / empaquetado: LEXOPEN_STANDALONE=1 npm run build → .next/standalone */
  ...(process.env.LEXOPEN_STANDALONE === "1"
    ? {
        output: "standalone" as const,
        outputFileTracingExcludes: {
          "*": ["./desktop/dist/**", "./desktop/node_modules/**"],
        },
      }
    : {}),
};

export default nextConfig;
