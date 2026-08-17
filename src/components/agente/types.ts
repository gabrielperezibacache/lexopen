export type CausaOption = { id: string; titulo: string; rit: string | null };

export type SourceRef = {
  type: string;
  id: string;
  label: string;
  href?: string;
  downloadHref?: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  source?: string;
  utility?: string;
  sources?: SourceRef[];
  suggestedActions?: { label: string; href: string }[];
  alerts?: string[];
  requireApproval?: boolean;
  discarded?: boolean;
  approvedMinutaId?: string;
  documentScope?: {
    documentoIds?: string[] | null;
    rutaPrefix?: string | null;
  };
};

export type AgentChat = {
  id: string;
  title: string;
  messagesJson?: string;
  demoMode: boolean;
  updatedAt: string;
  causaId?: string | null;
};

export type Utility = {
  id: string;
  label: string;
  short: string;
  starter: string;
};

export type DocOption = {
  id: string;
  nombre: string;
  ruta: string | null;
  tipo: string;
  extractionStatus: string | null;
};

export function isSafeAppHref(href: string) {
  return href.startsWith("/") && !href.startsWith("//") && !href.includes("\\");
}
