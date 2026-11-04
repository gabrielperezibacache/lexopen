import type { NextConfig } from "next";
import path from "node:path";
import { buildSecurityHeaders } from "./src/lib/security/headers";

// CSP is applied per-request from src/proxy.ts with a fresh nonce.
const securityHeaders = buildSecurityHeaders({ includeCsp: false });
// Runtime documents and personal credentials belong to the Host, never its package.
const privateRuntimePaths = ["./storage/**", "./.env*", "./.codex/**", "./.tmp/**", "./.git/**", "./.agents/**", "./.firecrawl/**", "./.lexopen-runtime/**", "./desktop/data/**", "./obsidian-vault/**"];
for (const directory of [process.env.CODEX_DATA_DIR, process.env.LEXOPEN_DATA_DIR, process.env.STORAGE_PATH]) {
  if (!directory) continue;
  const relative = path.relative(process.cwd(), path.resolve(directory)).split(path.sep).join("/");
  if (relative && relative !== ".." && !relative.startsWith("../")) privateRuntimePaths.push(`./${relative.replace(/[\\*?\[\]{}()!+@]/g, "\\$&")}/**`);
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingExcludes: { "/*": privateRuntimePaths },
  /* Hide the floating "N" Next.js Dev Tools badge in development.
     Compile/runtime errors still surface via the error overlay. */
  devIndicators: false,
  serverExternalPackages: [
    "@firecrawl/anydoc",
    "@firecrawl/pdf-inspector",
    "@d0paminedriven/pdfdown-ocr",
    "playwright",
    "playwright-core",
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
          "/*": [...privateRuntimePaths, "./desktop/dist/**", "./desktop/.release/**", "./desktop/node_modules/**"],
        },
        outputFileTracingIncludes: {
          "*": [
            "./node_modules/playwright/**",
            "./node_modules/playwright-core/**",
          ],
        },
      }
    : {}),
};

export default nextConfig;
