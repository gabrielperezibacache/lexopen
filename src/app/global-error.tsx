"use client";

import { useEffect } from "react";

/**
 * Root error boundary (replaces root layout when it fails).
 * Keep copy bilingual-safe without i18n context (layout may be down).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        msg: "global_error",
        err: error.message,
        digest: error.digest || null,
      })
    );
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          fontFamily:
            "Sora, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
          background:
            "linear-gradient(160deg, #f4f7f5 0%, #e8eef0 45%, #f7f3ee 100%)",
          color: "#1c2421",
          minHeight: "100vh",
        }}
      >
        <main
          style={{
            maxWidth: 480,
            margin: "0 auto",
            padding: "4rem 1.5rem",
          }}
        >
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#b42318",
              margin: 0,
            }}
          >
            Error
          </p>
          <h1 style={{ fontSize: "1.75rem", margin: "0.5rem 0 0" }}>
            Algo salió mal
          </h1>
          <p style={{ color: "#5a6660", fontSize: 14, lineHeight: 1.5 }}>
            Ocurrió un error inesperado en LexOpen. Recargue la página o vuelva
            al inicio.
          </p>
          {error.digest ? (
            <p style={{ color: "#8a9590", fontSize: 12 }}>
              Ref: {error.digest}
            </p>
          ) : null}
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                background: "#1c4d3d",
                color: "#fff",
                border: 0,
                borderRadius: 8,
                padding: "0.65rem 1rem",
                cursor: "pointer",
              }}
            >
              Reintentar
            </button>
            <a
              href="/inicio"
              style={{
                alignSelf: "center",
                color: "#1c4d3d",
                fontSize: 14,
              }}
            >
              Ir al inicio
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
