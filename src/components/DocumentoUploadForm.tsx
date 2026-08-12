"use client";

import { DocumentoIngestForm } from "@/components/DocumentoIngestForm";

/** @deprecated Prefer DocumentoIngestForm; kept as thin alias for existing imports. */
export function DocumentoUploadForm({
  causas,
  lockedCausaId,
  compact,
}: {
  causas?: Array<{ id: string; label: string }>;
  lockedCausaId?: string | null;
  compact?: boolean;
}) {
  return (
    <DocumentoIngestForm
      causas={causas}
      lockedCausaId={lockedCausaId}
      compact={compact}
    />
  );
}
