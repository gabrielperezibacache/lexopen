/**
 * Contract helpers for wiki restore ordering and blog slug uniqueness.
 * Pure logic mirrors the API behaviour without a live DB.
 */

export function shouldTakeRestorePath(body: {
  action?: string;
  revisionId?: string;
}) {
  return body.action === "restore" && Boolean(body.revisionId);
}

export function applyWikiRestore(params: {
  current: { title: string; content: string };
  revision: { title: string; content: string };
}) {
  // Snapshot current first (caller persists), then apply revision only.
  return {
    snapshot: {
      title: params.current.title,
      content: params.current.content,
    },
    next: {
      title: params.revision.title,
      content: params.revision.content,
    },
  };
}

export function blogSlugify(title: string) {
  return String(title || "post")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function blogSlugConflictMessage(status: number) {
  return status === 409
    ? "Ya existe una publicación con ese título/slug en el espacio"
    : null;
}
