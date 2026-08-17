"use client";

import { useState } from "react";
import { AiAssist, type AiActionResponse } from "@/components/ai/AiAssist";
import { useI18n } from "@/components/i18n/I18nProvider";

export function WikiBorradorAi({
  siteId,
  onApply,
}: {
  siteId: string;
  onApply: (draft: { title: string; content: string }) => void;
}) {
  const { t } = useI18n();
  const [note, setNote] = useState("");

  function apply(result: AiActionResponse) {
    const data = result.data as { title?: string; content?: string } | null;
    if (!data?.content?.trim()) return;
    onApply({
      title: data.title?.trim() || "",
      content: data.content.trim(),
    });
    setNote(t("ai.wiki.applied"));
  }

  return (
    <div className="space-y-2">
      <AiAssist
        action="wiki.borrador"
        siteId={siteId}
        label={t("ai.wiki.label")}
        showPreview={false}
        onResult={(r) => apply(r)}
      />
      {note && (
        <p className="text-xs text-[var(--copper)]" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
