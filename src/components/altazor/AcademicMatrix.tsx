"use client";
import { Plus, X } from "lucide-react";
import { operationKey } from "@/lib/client-submission-key";
import type { AcademicMatrix as Matrix } from "./academic-ui";
import type { AltazorSelectedSource } from "./AltazorSources";

export function AcademicMatrix({ title, matrix, sources, onChange }: { title: string; matrix: Matrix; sources: AltazorSelectedSource[]; onChange: (value: Matrix) => void }) {
  const locked = matrix.rows.some(row => row.available === false);
  const updateRow = (id: string, change: Partial<Matrix["rows"][number]>) => onChange({ ...matrix, rows: matrix.rows.map(row => row.id === id ? { ...row, ...change } : row) });
  return <section className="altazor-matrix" aria-label="Matriz de literatura">
    <h2>Matriz de literatura</h2>
    <p>Compara pregunta, método y hallazgos. Vincula cada celda con un pasaje; las anotaciones sin fuente permanecen como notas manuales.</p>
    {locked && <p role="status">Hay filas con fuentes que ya no están disponibles. Se conservan sin cambios; puedes seguir trabajando en las demás.</p>}
    <details><summary>Configurar columnas</summary><div className="altazor-matrix-dimensions">
      {matrix.dimensions.map((dimension, index) => <div key={dimension.id}>
        <label>Columna {index + 1}<input maxLength={100} value={dimension.label} disabled={locked} onChange={event => onChange({ ...matrix, dimensions: matrix.dimensions.map(item => item.id === dimension.id ? { ...item, label: event.target.value } : item) })}/></label>
        <label>Tipo<select value={dimension.type} disabled={locked} onChange={event => onChange({ ...matrix, dimensions: matrix.dimensions.map(item => item.id === dimension.id ? { ...item, type: event.target.value as typeof item.type } : item) })}><option value="text">Texto</option><option value="number">Número</option><option value="date">Fecha</option><option value="tag">Etiqueta</option></select></label>
        <button type="button" className="btn btn-ghost" aria-label={`Retirar columna ${dimension.label}`} disabled={locked} onClick={() => onChange({ dimensions: matrix.dimensions.filter(item => item.id !== dimension.id), rows: matrix.rows.map(row => ({ ...row, cells: Object.fromEntries(Object.entries(row.cells).filter(([key]) => key !== dimension.id)) })) })}><X size={16}/></button>
      </div>)}
    </div><button type="button" className="btn btn-ghost" disabled={locked || matrix.dimensions.length >= 12} onClick={() => onChange({ ...matrix, dimensions: [...matrix.dimensions, { id: `col-${operationKey().slice(0, 8)}`, label: "Nueva dimensión", type: "text" }] })}><Plus size={16}/> Añadir columna</button></details>
    <div className="altazor-table-scroll" tabIndex={0} aria-label="Tabla desplazable de literatura"><table><caption>Documentos de {title}</caption><thead><tr><th scope="col">Documento</th>{matrix.dimensions.map(dimension => <th key={dimension.id} scope="col">{dimension.label}</th>)}</tr></thead><tbody>
      {matrix.rows.map(row => <tr key={row.id}><th scope="row">
        <label><input type="checkbox" checked={row.included} disabled={row.available === false} onChange={event => updateRow(row.id, { included: event.target.checked })}/> Usar en análisis</label>
        <input aria-label="Título del documento en la matriz" maxLength={240} disabled={row.available === false} value={row.title} onChange={event => updateRow(row.id, { title: event.target.value })}/>
        <button type="button" className="btn btn-ghost" disabled={row.available === false} onClick={() => onChange({ ...matrix, rows: matrix.rows.filter(item => item.id !== row.id) })}>Retirar fila</button>
      </th>{matrix.dimensions.map(dimension => {
        const entry = row.cells[dimension.id], selected = sources.findIndex(source => JSON.stringify(source.input) === JSON.stringify(entry?.source));
        return <td key={dimension.id}>
          <textarea aria-label={`${dimension.label} de ${row.title}`} disabled={row.available === false} value={entry?.value || ""} maxLength={5000} onChange={event => updateRow(row.id, { cells: { ...row.cells, [dimension.id]: { ...entry, value: event.target.value } } })}/>
          <label>Respaldo<select disabled={row.available === false} value={entry?.source ? String(selected) : ""} onChange={event => updateRow(row.id, { cells: { ...row.cells, [dimension.id]: { value: entry?.value || "", ...(event.target.value !== "" && sources[Number(event.target.value)] ? { source: sources[Number(event.target.value)].input } : {}) } } })}>
            <option value="">Nota manual</option>{entry?.source && selected < 0 && <option value="-1">Pasaje conservado</option>}{sources.map((source, index) => <option key={index} value={index}>R{index + 1} · {source.title}</option>)}
          </select></label>
        </td>;
      })}</tr>)}
    </tbody></table></div>
    {!matrix.rows.length && <p>Añade el primer documento y registra qué aporta a tu investigación.</p>}
    <button type="button" className="btn btn-outline" disabled={matrix.rows.length >= 100} onClick={() => onChange({ ...matrix, rows: [...matrix.rows, { id: operationKey(), title: "Documento por revisar", included: true, cells: {} }] })}><Plus size={16}/> Añadir documento</button>
  </section>;
}
