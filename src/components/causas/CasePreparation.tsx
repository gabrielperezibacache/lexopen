import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import "./CasePreparation.css";

type Props = {
  causaId: string;
  documentCount: number;
  documentsWithText: number;
  pendingDocuments: number;
  minutaCount: number;
  pendingActions: number;
  canUseKnowledge: boolean;
  privateHearingCount: number;
  audioCount: number;
  transcriptCount: number;
  audioLimited: boolean;
};
const counted = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;

/** A preparation index describes saved work; it never certifies its contents. */
export function CasePreparation(props: Props) {
  const {
    causaId, documentCount, documentsWithText, pendingDocuments,
    minutaCount, pendingActions, canUseKnowledge, privateHearingCount,
    audioCount, transcriptCount, audioLimited,
  } = props;
  const rows = [
    {
      title: "Reunir el expediente",
      state: documentCount ? `${counted(documentCount, "documento", "documentos")} · ${documentsWithText} con texto${pendingDocuments ? ` · ${pendingDocuments} en proceso` : ""}` : "Aún no hay documentos accesibles",
      href: "#documentos",
      action: "Revisar documentos",
    },
    ...(canUseKnowledge ? [
      {
        title: "Ordenar los hechos",
        state: "Hechos, cronología y contradicciones con revisión humana",
        href: "#conocimiento",
        action: "Abrir conocimiento",
      },
      {
        title: "Escuchar y contrastar",
        state: audioCount ? `${audioLimited ? "Selección de " : ""}${counted(audioCount, "grabación", "grabaciones")} · ${transcriptCount} con transcripción registrada` : "Aún no hay grabaciones accesibles",
        href: "#audios",
        action: "Abrir grabaciones",
      },
      {
        title: "Preparar la audiencia",
        state: privateHearingCount ? `${counted(privateHearingCount, "mesa privada", "mesas privadas")} de tu propiedad` : "Tu primera mesa de audiencia está por preparar",
        href: `/causas/${causaId}/audiencias`,
        action: "Abrir mesa de audiencia",
      },
    ] : []),
    {
      title: "Dejar continuidad",
      state: `${counted(minutaCount, "minuta accesible", "minutas accesibles")} · ${counted(pendingActions, "acción abierta", "acciones abiertas")}`,
      href: "#minutas",
      action: "Revisar minutas",
    },
  ];

  return (
    <section id="preparacion" className="case-preparation case-destination" aria-labelledby="case-preparation-title" data-testid="case-preparation">
      <div className="case-preparation-intro">
        <h2 id="case-preparation-title">Preparar la causa</h2>
        {canUseKnowledge && <Link href={`/causas/${causaId}/escritos`} className="case-preparation-draft">Escribir con fuentes<ArrowUpRight size={16} aria-hidden="true" /></Link>}
      </div>
      <ol className="case-preparation-steps">
        {rows.map(row => <li key={row.title}>
          <div><h3>{row.title}</h3><span className="case-preparation-state">{row.state}</span></div>
          {row.href.startsWith("#")
            ? <a href={row.href} className="case-preparation-action">{row.action}<ArrowUpRight size={16} aria-hidden="true" /></a>
            : <Link href={row.href} className="case-preparation-action">{row.action}<ArrowUpRight size={16} aria-hidden="true" /></Link>}
        </li>)}
      </ol>
    </section>
  );
}

export function CasePreparationIndex({ canUseKnowledge }: { canUseKnowledge: boolean }) {
  const entries = [
    ["#preparacion", "Preparación"],
    ["#ficha", "Ficha"],
    ...(canUseKnowledge ? [["#conocimiento", "Hechos y fuentes"]] : []),
    ["#documentos", "Documentos"],
    ...(canUseKnowledge ? [["#audios", "Grabaciones"]] : []),
    ["#minutas", "Minutas"],
    ["#plazos", "Plazos"],
    ["#tramites", "Trámites"],
    ["#actividad", "Actividad"],
  ];
  return <details className="case-preparation-directory"><summary>Ir a una sección del expediente</summary><nav className="case-preparation-index" aria-label="Índice del expediente">{entries.map(([href, label]) => <a href={href} key={href}>{label}</a>)}</nav></details>;
}
