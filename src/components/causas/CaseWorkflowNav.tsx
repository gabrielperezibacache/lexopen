"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { BookOpen, FilePenLine, FolderOpen, ListChecks, MessagesSquare, PanelsTopLeft } from "lucide-react";
import { caseViewHref, caseViewParams } from "@/lib/causas/portfolio-navigation";
import type { CaseManagementMode } from "@/lib/causas/management-mode";
import "./CaseWorkflowNav.css";

type Stage = "case" | "archive" | "library" | "hearing" | "writing" | "workbench";
function subscribeHash(changed: () => void) { window.addEventListener("hashchange", changed); window.addEventListener("popstate", changed); return () => { window.removeEventListener("hashchange", changed); window.removeEventListener("popstate", changed); }; }
const currentHash = () => window.location.hash;
const serverHash = () => "";
const identifier = (value: string | null | undefined) => value && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : undefined;

export function CaseWorkflowNav({ causaId, title, current, workspaceId, mode = "manual", canUseKnowledge = true }: { causaId: string; title: string; current: Stage; workspaceId?: string; mode?: CaseManagementMode; canUseKnowledge?: boolean }) {
  const query = useSearchParams(), hash = useSyncExternalStore(subscribeHash, currentHash, serverHash);
  const draftId = identifier(query.get("draft") || query.get("escrito"));
  const selectedWorkspace = identifier(workspaceId || query.get("mesa"));
  const base = `/causas/${encodeURIComponent(causaId)}`;
  const context = caseViewParams(causaId, { escrito: draftId, mesa: selectedWorkspace, volver: query.get("volver") || (mode === "pjud_cl" ? "/pjud" : undefined) });
  const back = context.get("volver");
  const overview = mode === "pjud_cl" || back?.split(/[?#]/)[0] === "/pjud" ? `/pjud/${encodeURIComponent(causaId)}` : base;
  const deskContext = new URLSearchParams(context);
  deskContext.delete("mesa");
  const writingContext = new URLSearchParams();
  if (draftId) writingContext.set("draft", draftId);
  if (selectedWorkspace) writingContext.set("mesa", selectedWorkspace);
  if (back) writingContext.set("volver", back);
  const libraryContext = new URLSearchParams({ causa: causaId });
  for (const [key, value] of context) libraryContext.set(key, value);
  const active = current === "archive" ? "file" : current === "hearing" || current === "writing" ? current : current !== "case" ? "prepare" : ["#preparacion", "#conocimiento", "#audios", "#minutas"].includes(hash) ? "prepare" : "overview";
  const steps = [
    { stage: "overview", label: "Resumen", href: caseViewHref(overview, context, "#estado-causa"), icon: PanelsTopLeft },
    { stage: "file", label: "Expediente", href: caseViewHref(`${base}/expediente`, context), icon: FolderOpen },
    { stage: "prepare", label: "Preparación", href: caseViewHref(overview, context, "#preparacion"), icon: ListChecks },
    ...(canUseKnowledge ? [{ stage: "hearing", label: "Audiencias", href: selectedWorkspace ? caseViewHref(`/audiencias/${encodeURIComponent(selectedWorkspace)}`, deskContext) : caseViewHref(`${base}/audiencias`, context), icon: MessagesSquare },
    { stage: "writing", label: "Escritos", href: caseViewHref(`${base}/escritos`, writingContext), icon: FilePenLine }] : []),
  ];
  return <nav className="case-workflow" aria-label="Recorrido de la causa" data-testid="case-workflow">
    {current !== "case" && current !== "archive" && <Link className="case-workflow-title" href={caseViewHref(overview, context)} title={title}><FolderOpen size={19} aria-hidden="true" /><span>{title}</span></Link>}
    <ol>{steps.map(({ stage, label, href, icon: Icon }) => <li key={stage}>{current === "case" && ["overview", "prepare"].includes(stage) ? <a href={href} aria-current={active === stage ? "location" : undefined}><Icon size={17} aria-hidden="true" /><span>{label}</span></a> : <Link href={href} aria-current={active === stage ? "page" : undefined}><Icon size={17} aria-hidden="true" /><span>{label}</span></Link>}</li>)}</ol>
    {canUseKnowledge && <div className="case-workflow-resources" aria-label="Fuentes y asistente de la causa">
      <Link href={caseViewHref("/biblioteca", libraryContext)} aria-current={current === "library" ? "page" : undefined}><BookOpen size={17} aria-hidden="true" />Biblioteca</Link>
      <Link href={caseViewHref(`${base}/mesa`, context)} aria-current={current === "workbench" ? "page" : undefined}><PanelsTopLeft size={17} aria-hidden="true" />Mesa del asistente</Link>
    </div>}
  </nav>;
}
