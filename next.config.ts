import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./src/lib/security/headers";

// CSP is applied per-request from src/proxy.ts with a fresh nonce.
const securityHeaders = buildSecurityHeaders({ includeCsp: false });

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
  /* LexOpen Host: `next start` / web:host. Empaquetado Desktop:
     LEXOPEN_STANDALONE=1 npm run build → .next/standalone */
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
