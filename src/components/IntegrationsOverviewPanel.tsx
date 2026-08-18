"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";

type ApiCard = {
  id: string;
  title: string;
  status: string;
  detail: string;
  href?: string;
  ok?: boolean;
};

export function IntegrationsOverviewPanel() {
  const { t } = useI18n();
  const [cards, setCards] = useState<ApiCard[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [llm, google, obsidian, captcha] = await Promise.all([
        fetch("/api/integrations/llm")
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch("/api/integrations/google")
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch("/api/integrations/obsidian")
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch("/api/pjud/captcha")
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      if (cancelled) return;

      const next: ApiCard[] = [
        {
          id: "llm",
          title: "IA / LLM",
          ok: Boolean(llm?.enabled && llm?.config?.apiUrl),
          status: llm
            ? `${llm.config?.preset || "personalizado"} · ${
                llm.enabled ? "activo" : "pausado"
              }`
            : "Sin configurar",
          detail: llm
            ? `${llm.config?.apiUrl || "sin URL"} · modelo ${llm.config?.model || "—"} · clave ${
                llm.config?.hasApiKey ? "guardada" : "sin clave"
              }`
            : "Configure el endpoint en Configuración → IA.",
          href: "#llm-settings",
        },
        {
          id: "google",
          title: "Google Workspace",
          ok: Boolean(google?.connected),
          status: google?.connected
            ? `Conectado${google.connectedEmail ? `: ${google.connectedEmail}` : ""}`
            : google?.credentialsConfigured
              ? "Credenciales OK — pendiente OAuth"
              : "Sin credenciales",
          detail:
            "OAuth Drive / Calendar / Gmail. Variables GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.",
          href: "/integraciones",
        },
        {
          id: "obsidian",
          title: "Obsidian",
          ok: true,
          status: obsidian?.config?.vaultPath
            ? "Vault / REST"
            : "Storage Markdown",
          detail:
            "Exporta causas a Markdown. OBSIDIAN_VAULT_PATH / OBSIDIAN_REST_URL.",
          href: "/integraciones",
        },
        {
          id: "pjud",
          title: "Seguimiento judicial",
          ok: Boolean(
            captcha?.liveIngestConfigured ||
              captcha?.sidecar?.configured ||
              captcha?.captcha?.configured
          ),
          status: captcha?.liveIngestConfigured
            ? "Consulta en vivo lista"
            : captcha?.sidecar?.configured
              ? captcha.sidecar.reachable
                ? "Servicio auxiliar activo"
                : "Servicio auxiliar apagado"
              : captcha?.captcha?.configured
                ? `CAPTCHA ${captcha.captcha.provider || "activo"}`
                : "Sin consulta en vivo",
          detail:
            "Oficina Judicial Virtual, ClaveÚnica y CAPTCHA. Configure en Causas → ClaveÚnica e Integraciones.",
          href: "/integraciones",
        },
      ];
      setCards(next);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      id="integraciones-overview"
      className="panel space-y-4 rounded-3xl p-5 md:p-6"
      data-testid="integrations-overview-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Integraciones de APIs</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]/70">
            Estado resumido de los conectores externos del estudio. El detalle y
            las acciones viven en Integraciones; los endpoints de IA se editan
            arriba.
          </p>
        </div>
        <a href="/integraciones" className="btn btn-ghost inline-flex text-sm">
          Abrir Integraciones
        </a>
      </div>

      {!cards ? (
        <p className="text-sm text-[var(--ink-soft)]/65">{t("integrations.loadingStatus")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <a
              key={card.id}
              href={card.href || "/integraciones"}
              className="rounded-2xl border border-[var(--line)] bg-white/70 p-4 transition hover:border-[var(--sea)]/40"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{card.title}</h3>
                <span
                  className={`badge ${
                    card.ok ? "badge-sea" : "badge-pendiente"
                  }`}
                >
                  {card.ok ? "Activo" : "Pendiente"}
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-[var(--ink)]">
                {card.status}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--ink-soft)]/70">
                {card.detail}
              </p>
            </a>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-[var(--line)] bg-white/60 p-4 text-xs text-[var(--ink-soft)]/75">
        <p className="font-medium text-[var(--ink)]">Referencia rápida de APIs</p>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          <li>
            <code>POST /api/integrations/llm</code> — guardar / probar IA
          </li>
          <li>
            <code>POST /api/integrations/hermes</code> — copiloto (chat)
          </li>
          <li>
            <code>/api/integrations/google</code> — OAuth Workspace
          </li>
          <li>
            <code>/api/integrations/obsidian</code> — sync vault
          </li>
          <li>
            <code>PJUD_API_URL</code> / <code>PJUD_SCRAPER_URL</code> — ingest
          </li>
          <li>
            <code>CAPTCHA_SOLVER_*</code> — BYOK scrape OJV
          </li>
        </ul>
      </div>
    </section>
  );
}
