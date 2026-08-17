"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AiAssist } from "@/components/ai/AiAssist";
import { useI18n } from "@/components/i18n/I18nProvider";

function Inner() {
  const { t } = useI18n();
  const sp = useSearchParams();
  const q = sp.get("q") || "";

  return (
    <div className="panel rounded-3xl p-4">
      <div className="mb-2">
        <h2 className="text-sm font-semibold">{t("ai.brief.title")}</h2>
        <p className="text-xs text-[var(--ink-soft)]/70">{t("ai.brief.subtitle")}</p>
      </div>
      <AiAssist
        action="jurisprudencia.brief"
        label={t("ai.brief.generate")}
        prompt={q || undefined}
        extra={{ query: q }}
      />
    </div>
  );
}

export function JurisprudenciaBrief() {
  return (
    <Suspense fallback={<div className="panel h-24 rounded-3xl" />}>
      <Inner />
    </Suspense>
  );
}
