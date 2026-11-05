import type { CSSProperties } from "react";
export function AltazorMark({ state = "ready", size = 104, label = false }: { state?: "ready" | "reading" | "thinking" | "finished"; size?: number; label?: boolean }) {
  const positions = { ready: "0% 0%", reading: "100% 0%", thinking: "0% 100%", finished: "100% 100%" };
  return <span className="altazor-brand"><span className="altazor-companion" role={label ? "img" : undefined} aria-label={label ? "Chungungo de Altazor AI" : undefined} aria-hidden={label ? undefined : true} style={{ width: size, height: size, backgroundPosition: positions[state] } as CSSProperties} />{label && <span className="altazor-wordmark"><strong>Altazor AI</strong><small>Tu asistente</small></span>}</span>;
}
