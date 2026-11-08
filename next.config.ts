import type { NextConfig } from "next";
import path from "node:path";
import { calendarSubscriptionBasePath } from "./src/lib/altazor/calendar-feed-policy";
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
  // Eight MiB originals need room for base64; the upload route enforces this
  // same 12 MiB bound for declared and chunked JSON bodies.
  experimental: { proxyClientMaxBodySize: 12 * 1024 * 1024 },
  outputFileTracingExcludes: { "/*": privateRuntimePaths },
  /* Hide the floating "N" Next.js Dev Tools badge in development.
     Compile/runtime errors still surface via the error overlay. */
  devIndicators: false,
  logging: {
    incomingRequests: { ignore: [/\/api\/altazor\/academic\/calendar-subscriptions\//] },
  },
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
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: `${calendarSubscriptionBasePath}/:path*`,
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
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
