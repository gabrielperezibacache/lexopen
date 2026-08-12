import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@firecrawl/anydoc",
    "@firecrawl/pdf-inspector",
    "@d0paminedriven/pdfdown-ocr",
  ],
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
