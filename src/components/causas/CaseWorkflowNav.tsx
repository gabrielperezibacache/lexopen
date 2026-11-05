"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { BookOpen, FilePenLine, FolderOpen, ListChecks, MessagesSquare, PanelsTopLeft } from "lucide-react";
import { caseLibraryHref } from "@/lib/causas/workflow-links";
import type { CaseManagementMode } from "@/lib/causas/management-mode";
import "./CaseWorkflowNav.css";

type Stage = "case" | "library" | "hearing" | "writing" | "workbench";
function subscribeHash(changed: () => void) { window.addEventListener("hashchange", changed); window.addEventListener("popstate", changed); return () => { window.removeEventListener("hashchange", changed); window.removeEventListener("popstate", changed); }; }
const currentHash = () => window.location.hash;
const serverHash = () => "";
const identifier = (value: string | null | undefined) => value && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : undefined;

export function CaseWorkflowNav({ causaId, title, current, workspaceId, mode = "manual" }: { causaId: string; title: string; current: Stage; workspaceId?: string; mode?: CaseManagementMode }) {
  const query = useSearchParams(), hash = useSyncExternalStore(subscribeHash, currentHash, serverHash);
  const draftId = identifier(query.get("draft") || query.get("escrito"));
  const selectedWorkspace = identifier(workspaceId || query.get("mesa"));
  const base = `/causas/${encodeURIComponent(causaId)}`;
  const overview = mode === "pjud_cl" ? `/pjud/${encodeURIComponent(causaId)}` : base;
  const context = new URLSearchParams();
  if (draftId) context.set("escrito", draftId);
  if (selectedWorkspace) context.set("mesa", selectedWorkspace);
  const suffix = context.size ? `?${context}` : "";
  const hearingSuffix = draftId ? `?${new URLSearchParams({ escrito: draftId })}` : "";
  const writingContext = new URLSearchParams();
  if (draftId) writingContext.set("draft", draftId);
  if (selectedWorkspace) writingContext.set("mesa", selectedWorkspace);
  const active = current === "hearing" || current === "writing" ? current : current !== "case" ? "prepare" : ["#documentos", "#tramites", "#actividad"].includes(hash) ? "file" : ["#preparacion", "#conocimiento", "#audios", "#minutas"].includes(hash) ? "prepare" : "overview";
  const steps = [
    { stage: "overview", label: "Resumen", href: `${overview}${suffix}#ficha`, icon: PanelsTopLeft },
    { stage: "file", label: "Expediente", href: `${overview}${suffix}#documentos`, icon: FolderOpen },
    { stage: "prepare", label: "Preparación", href: `${overview}${suffix}#preparacion`, icon: ListChecks },
    { stage: "hearing", label: "Audiencias", href: selectedWorkspace ? `/audiencias/${encodeURIComponent(selectedWorkspace)}${hearingSuffix}` : `${base}/audiencias${suffix}`, icon: MessagesSquare },
    { stage: "writing", label: "Escritos", href: `${base}/escritos${writingContext.size ? `?${writingContext}` : ""}`, icon: FilePenLine },
  ];
  return <nav className="case-workflow" aria-label="Recorrido de la causa" data-testid="case-workflow">
    {current !== "case" && <Link className="case-workflow-title" href={base + suffix} title={title}><FolderOpen size={19} aria-hidden="true" /><span>{title}</span></Link>}
    <ol>{steps.map(({ stage, label, href, icon: Icon }) => <li key={stage}>{current === "case" && ["overview", "file", "prepare"].includes(stage) ? <a href={href} aria-current={active === stage ? "location" : undefined}><Icon size={17} aria-hidden="true" /><span>{label}</span></a> : <Link href={href} aria-current={active === stage ? "page" : undefined}><Icon size={17} aria-hidden="true" /><span>{label}</span></Link>}</li>)}</ol>
    <div className="case-workflow-resources" aria-label="Fuentes y asistente de la causa">
      <Link href={caseLibraryHref(causaId, draftId)} aria-current={current === "library" ? "page" : undefined}><BookOpen size={17} aria-hidden="true" />Biblioteca</Link>
      <Link href={`${base}/mesa${suffix}`} aria-current={current === "workbench" ? "page" : undefined}><PanelsTopLeft size={17} aria-hidden="true" />Mesa del asistente</Link>
    </div>
  </nav>;
}
