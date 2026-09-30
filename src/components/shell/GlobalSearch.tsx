"use client";

import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { FormEvent, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";

export function GlobalSearch({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const query = q.trim();
    router.push(query ? `/buscar?q=${encodeURIComponent(query)}` : "/buscar");
  }

  return (
    <form
      onSubmit={onSubmit}
      className={compact ? "w-full" : "hidden min-w-0 flex-1 md:block md:max-w-md"}
      role="search"
    >
      <label className="sr-only" htmlFor="lexopen-global-search">
        {t("common.searchGlobal")}
      </label>
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          aria-hidden
        />
        <input
          id="lexopen-global-search"
          type="search"
          className="input !py-2 pl-9 pr-3"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("common.searchPlaceholder")}
          aria-label={t("common.searchGlobal")}
        />
      </div>
    </form>
  );
}
