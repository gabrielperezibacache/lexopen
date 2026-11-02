"use client";

import Link from "next/link";
import { MarkdownView } from "@/lib/markdown";
import { PageHeader } from "@/components/sites/SiteNav";
import { SourceChip } from "@/components/agente/SourceChip";
import type { AgenteCopilotState } from "@/components/agente/useAgenteCopilot";
import "./agente.css";

export function AgenteCopilotView(props: AgenteCopilotState) {
  const {
    t,
    causas,
    utilities,
    utility,
    causaId,
    setCausaId,
    documentoId,
    setDocumentoId,
    docs,
    rutaPrefix,
    setRutaPrefix,
    selectedDocIds,
    setSelectedDocIds,
    allowDemoApproval,
    setAllowDemoApproval,
    lastSource,
    prompt,
    setPrompt,
    reply,
    meta,
    sources,
    actions,
    setActions,
    requireApproval,
    chatId,
    setChatId,
    chats,
    messages,
    setMessages,
    busy,
    approveBusy,
    approveMsg,
    setApproveMsg,
    approveHref,
    setApproveHref,
    setReply,
    setMeta,
    setSources,
    setRequireApproval,
    setDocs,
    plazoDesde,
    setPlazoDesde,
    plazoDias,
    setPlazoDias,
    plazoComputo,
    setPlazoComputo,
    plazoPreview,
    plazoVencimiento,
    folderPrefixes,
    visibleDocs,
    selectUtility,
    toggleDoc,
    resumeChat,
    onSubmit,
    approveToMinuta,
    discardDraft,
    estimatePlazo,
  } = props;

  return (
    <div className="lexopen-copilot space-y-6">
      <PageHeader
        title={t("ai.agente.title")}
        subtitle={t("ai.agente.subtitle")}
      />

      {utilities.length > 0 && (
        <div className="copilot-utilities grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" role="group" aria-label="Herramientas del asistente">
          {utilities.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => selectUtility(u)}
              aria-pressed={utility === u.id}
              className={`copilot-utility rounded-2xl border px-4 py-3 text-left transition ${
                utility === u.id
                  ? "border-[var(--sea)] bg-[var(--sea-soft)]"
                  : "border-[var(--line)] bg-[var(--surface-solid)] hover:border-[var(--sea)]/40"
              }`}
            >
              <div className="font-semibold">{u.label}</div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--ink-soft)]">
                {u.short}
              </p>
            </button>
          ))}
        </div>
      )}

      {utility === "plazos" && (
        <section className="copilot-section panel space-y-3 rounded-3xl p-5">
          <h2 className="copilot-section-title font-semibold text-[var(--ink)]">
            Cálculo interno de plazo
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="copilot-plazo-desde" className="mb-1 block text-sm font-medium">Desde</label>
              <input
                id="copilot-plazo-desde"
                className="input"
                type="date"
                value={plazoDesde}
                onChange={(e) => setPlazoDesde(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="copilot-plazo-dias" className="mb-1 block text-sm font-medium">Días</label>
              <input
                id="copilot-plazo-dias"
                className="input"
                type="number"
                min={1}
                value={plazoDias}
                onChange={(e) => setPlazoDias(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="copilot-plazo-computo" className="mb-1 block text-sm font-medium">Cómputo</label>
              <select
                id="copilot-plazo-computo"
                className="select"
                value={plazoComputo}
                onChange={(e) =>
                  setPlazoComputo(
                    e.target.value === "corridos" ? "corridos" : "habiles"
                  )
                }
              >
                <option value="habiles">Hábiles</option>
                <option value="corridos">Corridos</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                className="btn btn-secondary w-full"
                type="button"
                onClick={() => void estimatePlazo()}
              >
                Estimar
              </button>
            </div>
          </div>
          {plazoPreview && (
            <div className="space-y-2">
              <pre className="whitespace-pre-wrap rounded-2xl border border-[var(--line)] bg-[var(--surface-solid)] p-3 font-sans text-sm">
                {plazoPreview}
              </pre>
              {plazoVencimiento && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() =>
                      setPrompt(
                        (p) =>
                          `${p.trim()}\n\nVencimiento estimado LexOpen: ${plazoVencimiento} (${plazoDias} días ${plazoComputo} desde ${plazoDesde}).`
                      )
                    }
                  >
                    Insertar en la instrucción
                  </button>
                  <Link
                    href={`/plazos?${new URLSearchParams({
                      ...(causaId ? { causaId } : {}),
                      desde: plazoDesde,
                      dias: plazoDias,
                      computo: plazoComputo,
                      fechaLimite: plazoVencimiento,
                    }).toString()}`}
                    className="btn btn-secondary"
                  >
                    Ir a crear plazo
                  </Link>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <div className="copilot-workspace grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="copilot-conversations panel rounded-3xl p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <h2 className="font-semibold">Conversaciones</h2>
            <button
              className="copilot-text-action text-sm text-[var(--sea)]"
              type="button"
              aria-label="Nuevo chat"
              onClick={() => {
                setChatId("");
                setMessages([]);
                setReply("");
                setMeta("");
                setSources([]);
                setActions([]);
                setRequireApproval(false);
                setApproveMsg("");
                setApproveHref("");
                setRutaPrefix("");
                setSelectedDocIds([]);
              }}
            >
              Nuevo
            </button>
          </div>
          {causaId && (
            <p className="mb-2 text-xs text-[var(--ink-soft)]">
              Filtrado por causa seleccionada
            </p>
          )}
          <div className="space-y-2">
            {chats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                aria-current={chat.id === chatId ? "true" : undefined}
                className={`copilot-chat-link w-full rounded-2xl border px-3 py-2 text-left text-sm ${
                  chat.id === chatId
                    ? "border-[var(--sea)] bg-[var(--sea)]/8"
                    : "border-[var(--line)] bg-[var(--surface-solid)]"
                }`}
                onClick={() => void resumeChat(chat)}
              >
                <div className="font-medium">{chat.title}</div>
                <div className="text-xs text-[var(--ink-soft)]">
                  {chat.demoMode ? "demo" : "conectado"} ·{" "}
                  {new Date(chat.updatedAt).toLocaleDateString("es-CL")}
                </div>
              </button>
            ))}
            {chats.length === 0 && (
              <p className="text-sm text-[var(--ink-soft)]">
                Sin chats guardados.
              </p>
            )}
          </div>
        </aside>

        <form onSubmit={onSubmit} className="copilot-compose panel space-y-4 rounded-3xl p-6">
          {messages.length === 0 && !reply && !busy && (
            <p className="copilot-hint text-sm text-[var(--ink-soft)]">
              Elija una herramienta y escriba su consulta. Si selecciona una causa,
              puede elegir qué documentos usar como contexto.
            </p>
          )}
          {busy && (
            <div role="status" className="copilot-loading animate-pulse space-y-2 rounded-2xl border border-[var(--line)] bg-[var(--surface-solid)] p-4">
              <span className="sr-only">Preparando la respuesta…</span>
              <div aria-hidden="true" className="h-3 w-1/3 rounded bg-[var(--line)]" />
              <div aria-hidden="true" className="h-3 w-full rounded bg-[var(--line)]" />
              <div aria-hidden="true" className="h-3 w-5/6 rounded bg-[var(--line)]" />
            </div>
          )}
          <div>
            <label htmlFor="copilot-causa" className="mb-1 block text-sm font-medium">
              Causa de referencia
            </label>
            <select
              id="copilot-causa"
              className="select"
              value={causaId}
              onChange={(e) => {
                const next = e.target.value;
                setCausaId(next);
                // Evitar reutilizar un hilo de otra causa
                setChatId("");
                setDocumentoId("");
                setDocs([]);
                setRutaPrefix("");
                setSelectedDocIds([]);
                setMessages([]);
                setReply("");
                setMeta("");
                setSources([]);
                setActions([]);
                setRequireApproval(false);
                setApproveMsg("");
                setApproveHref("");
              }}
            >
              <option value="">Sin causa específica</option>
              {causas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.rit || c.titulo}
                </option>
              ))}
            </select>
          </div>

          {(utility === "doc_qa" || docs.length > 0) && causaId && (
            <div>
              <label htmlFor="copilot-documento" className="mb-1 block text-sm font-medium">
                Documento de referencia (opcional)
              </label>
              <select
                id="copilot-documento"
                className="select"
                value={documentoId}
                onChange={(e) => setDocumentoId(e.target.value)}
              >
                <option value="">Todos los documentos de la causa</option>
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          {causaId && (
            <div className="copilot-document-scope space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-solid)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Alcance documental</h3>
                <Link
                  href={causaId ? `/causas/${causaId}` : "/documentos"}
                  className="text-xs text-[var(--sea)]"
                >
                  Incorporar carpeta
                </Link>
              </div>
              <div>
                <label htmlFor="copilot-carpeta" className="mb-1 block text-xs font-medium text-[var(--ink-soft)]">
                  Carpeta investigativa
                </label>
                <select
                  id="copilot-carpeta"
                  className="select"
                  aria-label="Carpeta investigativa"
                  value={rutaPrefix}
                  onChange={(e) => {
                    setRutaPrefix(e.target.value);
                    setSelectedDocIds([]);
                  }}
                >
                  <option value="">Toda la causa (selección automática)</option>
                  {folderPrefixes.map((f) => (
                    <option key={f} value={f}>
                      {f}/
                    </option>
                  ))}
                </select>
              </div>
              {visibleDocs.length > 0 ? (
                <div>
                  <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 text-xs font-medium text-[var(--ink-soft)]">
                      Documentos ({selectedDocIds.length || "selección automática"} / {visibleDocs.length})
                    </p>
                    <button
                      type="button"
                      className="text-xs text-[var(--sea)]"
                      onClick={() => setSelectedDocIds([])}
                    >
                      Usar selección automática
                    </button>
                  </div>
                  <ul className="copilot-document-list max-h-40 space-y-1 overflow-y-auto text-sm">
                    {visibleDocs.slice(0, 40).map((d) => {
                      const path = d.ruta ? `${d.ruta}/${d.nombre}` : d.nombre;
                      const checked = selectedDocIds.includes(d.id);
                      return (
                        <li key={d.id}>
                          <label className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 hover:bg-[var(--surface-solid)]">
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={checked}
                              onChange={() => toggleDoc(d.id)}
                            />
                            <span className="min-w-0">
                              <span className="block break-words font-medium">{path}</span>
                              <span className="text-[11px] text-[var(--ink-soft)]">
                                {d.tipo}
                                {d.extractionStatus ? ` · ${d.extractionStatus}` : ""}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-[var(--ink-soft)]">
                  Sin documentos en esta causa. Incorpore una carpeta investigativa desde
                  Documentos o la ficha de la causa.
                </p>
              )}
            </div>
          )}
          <div>
            <label htmlFor="copilot-prompt" className="mb-1 block text-sm font-medium">Instrucción</label>
            <textarea
              id="copilot-prompt"
              className="textarea min-h-[140px]"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy} aria-busy={busy}>
            {busy ? "Trabajando…" : "Enviar al copiloto"}
          </button>
        </form>
      </div>

      {(sources.length > 0 || actions.length > 0) && (
        <section className="copilot-section panel space-y-3 rounded-3xl p-5">
          {sources.length > 0 && (
            <div>
              <h2 className="copilot-section-title font-semibold text-[var(--ink)]">
                Fuentes del estudio
              </h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {sources.slice(0, 16).map((s) => (
                  <li
                    key={`${s.type}-${s.id}`}
                    className="copilot-source-ref inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface-solid)] px-3 py-1 text-xs"
                  >
                    <SourceChip
                      s={s}
                      className={s.href ? "text-[var(--sea)]" : ""}
                    />
                    {s.downloadHref && (
                      <a
                        href={s.downloadHref}
                        className="text-[var(--ink-soft)] underline"
                        title="Descargar texto extraído"
                      >
                        Texto
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {actions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => (
                <Link key={a.href} href={a.href} className="btn btn-secondary">
                  {a.label}
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {(requireApproval || approveMsg) && reply && (
        <section className="copilot-approval panel space-y-3 rounded-3xl border border-[var(--copper)]/40 p-5">
          <h2 className="copilot-section-title font-semibold text-[var(--copper-deep)]">
            Revisión humana
          </h2>
          {requireApproval ? (
            <>
              <p className="text-sm text-[var(--ink-soft)]">
                Este borrador no es asesoría automática. Apruébelo para
                guardarlo como minuta de la causa, o descártelo.
              </p>
              {lastSource === "demo" && (
                <label className="flex items-center gap-2 text-sm text-[var(--ink-soft)]">
                  <input
                    type="checkbox"
                    checked={allowDemoApproval}
                    onChange={(e) => setAllowDemoApproval(e.target.checked)}
                  />
                  Confirmo guardar borrador demo como minuta de prueba
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={
                    approveBusy ||
                    !causaId ||
                    (lastSource === "demo" && !allowDemoApproval)
                  }
                  onClick={() => void approveToMinuta()}
                >
                  {approveBusy ? "Guardando…" : "Aprobar y guardar minuta"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={discardDraft}
                >
                  Descartar borrador
                </button>
              </div>
              {!causaId && (
                <p className="text-xs text-[var(--ink-soft)]">
                  Seleccione una causa para habilitar el guardado como minuta.
                </p>
              )}
            </>
          ) : null}
          {approveMsg && (
            <p className="text-sm text-[var(--sea)]">
              {approveMsg}{" "}
              {approveHref && (
                <Link href={approveHref} className="underline">
                  Abrir minuta
                </Link>
              )}
            </p>
          )}
        </section>
      )}

      {messages.length > 0 && (
        <section className="copilot-thread panel rounded-3xl p-6">
          {meta && (
            <p className="copilot-meta mb-4 text-sm text-[var(--copper-deep)]">
              {meta}
            </p>
          )}
          <h2 className="mb-4 text-lg font-semibold">Conversación</h2>
          <div className="space-y-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className="copilot-message rounded-2xl border border-[var(--line)] bg-[var(--surface-solid)] p-3"
              >
                <div className="copilot-message-role mb-1 text-xs text-[var(--ink-soft)]">
                  {m.role === "user"
                    ? "Usted"
                    : m.source === "demo"
                      ? "Copiloto demo"
                      : m.source === "error"
                        ? "Error"
                        : "Copiloto"}
                  {m.discarded ? " · descartado" : ""}
                  {m.approvedMinutaId ? " · aprobado" : ""}
                </div>
                {m.role === "assistant" ? (
                  <div className="copilot-message-content prose-sm max-w-none text-sm leading-relaxed text-[var(--ink)]">
                    <MarkdownView content={m.content} />
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {m.content}
                  </pre>
                )}
                {m.role === "assistant" &&
                  Array.isArray(m.sources) &&
                  m.sources.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {m.sources.slice(0, 8).map((s) => (
                        <li key={`${i}-${s.type}-${s.id}`}>
                          <SourceChip
                            s={s}
                            className={
                              s.href
                                ? "copilot-source-link rounded-full border border-[var(--line)] bg-[var(--surface-solid)] px-2 py-0.5 text-[11px] text-[var(--sea)]"
                                : "copilot-source-link rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px]"
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
            ))}
          </div>
        </section>
      )}

      {(reply || meta) && messages.length === 0 && (
        <section className="copilot-thread panel rounded-3xl p-6">
          {meta && (
            <p className="copilot-meta mb-3 text-sm text-[var(--copper-deep)]">
              {meta}
            </p>
          )}
          <div className="text-sm leading-relaxed">
            <MarkdownView content={reply} />
          </div>
        </section>
      )}
    </div>
  );
}
