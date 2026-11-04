"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BookOpen, FilePenLine, FolderOpen, MessagesSquare, PanelsTopLeft } from "lucide-react";
import { caseLibraryHref } from "@/lib/causas/workflow-links";
import "./CaseWorkflowNav.css";

type Stage = "case" | "library" | "hearing" | "writing" | "workbench";

export function CaseWorkflowNav({ causaId, title, current, workspaceId }: { causaId: string; title: string; current: Stage; workspaceId?: string }) {
  const query = useSearchParams();
  const requestedDraft = query.get(current === "writing" ? "draft" : "escrito");
  const draftId = requestedDraft && /^[a-zA-Z0-9_-]{1,100}$/.test(requestedDraft) ? requestedDraft : undefined;
  const base = `/causas/${encodeURIComponent(causaId)}`;
  const context = draftId ? `?${new URLSearchParams({ escrito: draftId })}` : "";
  const requestedWorkspace = workspaceId || (current === "hearing" ? query.get("mesa") : undefined);
  const selectedWorkspace = requestedWorkspace && /^[a-zA-Z0-9_-]{1,100}$/.test(requestedWorkspace) ? requestedWorkspace : undefined;
  const steps = [
    { stage: "case", label: "Expediente", href: base + context, icon: FolderOpen },
    { stage: "library", label: "Biblioteca", href: caseLibraryHref(causaId, draftId), icon: BookOpen },
    { stage: "hearing", label: "Audiencias", href: selectedWorkspace ? `/audiencias/${encodeURIComponent(selectedWorkspace)}${context}` : `${base}/audiencias${context}`, icon: MessagesSquare },
    { stage: "writing", label: "Escritos", href: `${base}/escritos${draftId ? `?${new URLSearchParams({ draft: draftId })}` : ""}`, icon: FilePenLine },
    { stage: "workbench", label: "Mesa del asistente", href: `${base}/mesa`, icon: PanelsTopLeft },
  ];
  return <nav className="case-workflow" aria-label="Recorrido de la causa" data-testid="case-workflow">
    <Link className="case-workflow-title" href={base + context} title={title}><FolderOpen size={19} aria-hidden="true" /><span>{title}</span></Link>
    <ol>{steps.map(({ stage, label, href, icon: Icon }) => <li key={stage}><Link href={href} aria-current={current === stage ? "page" : undefined}><Icon size={17} aria-hidden="true" /><span>{label}</span></Link></li>)}</ol>
  </nav>;
}
