import type { ComputerApproval } from "@/lib/altazor/computer/types";
import { computerOperationPresentation } from "@/lib/altazor/computer/presentation";
import styles from "./ConnectorOperationPreview.module.css";

export function ConnectorOperationPreview({ approval }: { approval: ComputerApproval }) {
  const presentation = approval.kind === "computer-use" ? null : computerOperationPresentation(approval);
  if (!presentation) return <><h4>{approval.connector} · {approval.action}</h4><p>{approval.summary}</p><pre>{JSON.stringify(approval.args, null, 2)}</pre></>;
  return <>
    <h4>{presentation.title}</h4>
    {presentation.fields.length > 0 && <dl className={styles.fields}>{presentation.fields.map(field => <div key={field.label}><dt>{field.label}</dt><dd>{field.href ? <a href={field.href} target="_blank" rel="noreferrer">{field.value}<span className="sr-only"> (abre en otra pestaña)</span></a> : field.value}</dd></div>)}</dl>}
    {presentation.warning && <p>{presentation.warning}</p>}
    <details className={styles.details}><summary>Detalles de la consulta</summary><p>{approval.summary}</p><pre>{JSON.stringify(approval.args, null, 2)}</pre></details>
  </>;
}
