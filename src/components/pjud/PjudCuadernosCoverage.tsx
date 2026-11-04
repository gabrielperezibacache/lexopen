import { BookOpen, Check, CircleAlert } from "lucide-react";
import { normalizeCuadernosCoverage } from "@/lib/pjud/cuadernos-coverage";
import "./pjud-cuadernos.css";

export function PjudCuadernosCoverage({ coverage, compact = false }: { coverage?: unknown; compact?: boolean }) {
  const value = normalizeCuadernosCoverage(coverage);
  const complete = value.status === "complete";
  const title = complete ? "Todos los cuadernos consultados" : value.status === "partial" ? "Hay cuadernos pendientes" : "Cuadernos sin comprobar";
  const summary = value.total === null ? "La consulta no permitió enumerar los cuadernos." : `${value.read} de ${value.total} cuadernos leídos`;
  const list = value.items.length > 0 && <ul className="pjud-cuadernos-list">
    {value.items.map(item => <li key={item.key}>
      <span className="pjud-cuadernos-name">{item.label}</span>
      <span className="pjud-cuadernos-count">{item.count} {item.count === 1 ? "movimiento" : "movimientos"}</span>
      <span className="pjud-cuadernos-state" data-complete={item.status === "ok"}>
        {item.status === "ok" ? <Check size={15} aria-hidden="true" /> : <CircleAlert size={15} aria-hidden="true" />}
        {item.status === "ok" ? "Leído" : "Lectura incompleta"}
      </span>
      {item.note && <p>{item.note}</p>}
    </li>)}
  </ul>;

  if (compact) return <details className="pjud-cuadernos pjud-cuadernos-compact" data-status={value.status}>
    <summary><BookOpen size={16} aria-hidden="true" /><span>{value.total === null ? title : summary}</span></summary>
    <p className="pjud-cuadernos-caption">{title}. {value.total === null ? summary : "Cobertura de la última consulta."}</p>
    {list}
  </details>;

  return <section className="pjud-cuadernos" data-status={value.status} aria-label="Cobertura de cuadernos">
    <div className="pjud-cuadernos-heading">
      <BookOpen size={21} strokeWidth={1.6} aria-hidden="true" />
      <div><h4>{title}</h4><p>{summary}</p></div>
    </div>
    {list}
    {value.status === "partial" && <p className="pjud-cuadernos-caption">Los movimientos recuperados se conservan. Vuelva a sincronizar para completar los cuadernos pendientes.</p>}
    {complete && <p className="pjud-cuadernos-caption">Corresponde a los cuadernos que la OJV informó en esta consulta.</p>}
  </section>;
}
