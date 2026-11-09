"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Check, ExternalLink, Link2, RefreshCw, Unplug } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Button } from "@/components/ui";
import { apiMutation } from "@/lib/api-mutation";
import type { CodexConnectionStatus } from "@/lib/integrations/codex-session";
import "./CodexConnection.css";

type State = { connectionHost: CodexConnectionStatus; policy: { enabled: boolean; revision: string }; remoteAllowed: boolean };
type Model = { id: string; displayName: string; isDefault?: boolean };
const endpoint = "/api/admin/codex";
async function readConnection(signal: AbortSignal | undefined, fallback: string): Promise<State> {
  const response = await fetch(endpoint, { cache: "no-store", signal });
  const value = await response.json();
  if (!response.ok) throw Error(value.error || fallback);
  return value;
}

export function HostCodexSettings() {
  const { dict } = useI18n(), c = dict.codex, a = c.admin;
  const id = useId(), [data, setData] = useState<State>(), [catalog, setCatalog] = useState<Model[]>();
  const [enabled, setEnabled] = useState(false), [model, setModel] = useState("");
  const [busy, setBusy] = useState(""), [catalogVersion, setCatalogVersion] = useState(0);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const apply = useCallback((value: State) => { setData(value); setEnabled(value.policy.enabled); }, []);
  const refresh = useCallback(async (initial = false, signal?: AbortSignal) => {
    try {
      const value = await readConnection(signal, c.loadError);
      if (signal?.aborted) return;
      if (initial) apply(value); else setData(value);
      setError("");
    } catch (reason) { if (!signal?.aborted) setError(reason instanceof Error ? reason.message : c.loadError); }
  }, [apply, c.loadError]);
  useEffect(() => {
    const control = new AbortController();
    void readConnection(control.signal, c.loadError).then(value => { if (!control.signal.aborted) { apply(value); setError(""); } }).catch(reason => { if (!control.signal.aborted) setError(reason instanceof Error ? reason.message : c.loadError); });
    return () => control.abort();
  }, [apply, c.loadError]);
  const connected = Boolean(data?.connectionHost.connected), pending = Boolean(data?.connectionHost.pendingLogin);
  const models = catalog || [], loadingModels = connected && catalog === undefined;
  useEffect(() => {
    if (!pending) return;
    const control = new AbortController(), timer = setInterval(() => { void refresh(false, control.signal); }, 5000);
    return () => { clearInterval(timer); control.abort(); };
  }, [pending, refresh]);
  useEffect(() => {
    if (!connected) return;
    const control = new AbortController();
    const timeout = setTimeout(() => { control.abort(); setCatalog([]); setError(c.modelsTimeout); }, 30_000);
    void apiMutation<{ models: Model[] }>(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "models" }), signal: control.signal }).then(result => {
      if (control.signal.aborted) return;
      if (!result.ok) { setCatalog([]); setError(result.error); return; }
      setCatalog(result.data.models);
      setModel(previous => result.data.models.some(item => item.id === previous) ? previous : result.data.models.find(item => item.isDefault)?.id || result.data.models[0]?.id || "");
    }).finally(() => { clearTimeout(timeout); });
    return () => { clearTimeout(timeout); control.abort(); };
  }, [connected, catalogVersion, c.modelsTimeout]);
  async function action(name: "connect" | "cancel" | "disconnect" | "save" | "test") {
    setBusy(name); setError(""); setNotice("");
    try {
      const result = await apiMutation<State & { preview?: string }>(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: name, ...(name === "save" ? { enabled } : name === "test" ? { model } : {}) }) });
      if (!result.ok) { setError(result.error); if (name === "disconnect") await refresh(true); return; }
      if (name === "test") setNotice(`${c.testSucceeded.replace("{model}", model)} ${result.data.preview || ""}`);
      else { apply(result.data); if (name === "save") setNotice(a.saved); if (name === "disconnect") { setCatalog(undefined); setModel(""); setNotice(a.disconnected); } }
    } finally { setBusy(""); }
  }
  return <section id="host-codex" className="codex-connection codex-host-settings" aria-labelledby={`${id}-title`}>
    <header><div><h2 id={`${id}-title`}>{a.title}</h2><p>{a.description}</p></div><Link2 size={28} strokeWidth={1.5} aria-hidden="true" /></header>
    <p className="codex-help">{a.privateHelp}</p>
    {error && <div className="codex-message" data-error="true" role="alert"><p>{error}</p><Button variant="ghost" disabled={Boolean(busy)} onClick={() => void refresh(!data)}>{c.retry}</Button></div>}
    {!data && !error && <p role="status">{c.loading}</p>}
    {data && <>
      <div className="codex-account-state" role="status"><strong>{connected ? c.connected : pending ? c.pending : data.connectionHost.available ? c.notConnected : c.needsSetup}</strong><span>{data.connectionHost.account?.email || data.connectionHost.account?.planType || data.connectionHost.note || a.connectHint}</span></div>
      {!data.remoteAllowed && <p className="codex-message">{c.localOnly}</p>}
      {!connected && !pending && <Button disabled={Boolean(busy) || !data.connectionHost.available || !data.remoteAllowed} loading={busy === "connect"} onClick={() => void action("connect")}><Link2 size={16} aria-hidden="true" />{a.connect}</Button>}
      {data.connectionHost.pendingLogin && <div className="codex-authorize"><h3>{a.authorize}</h3><p>{c.authorizeHelp}</p><code aria-label={a.code}>{data.connectionHost.pendingLogin.userCode}</code><a href={data.connectionHost.pendingLogin.verificationUrl} target="_blank" rel="noreferrer" className="btn btn-primary">{c.openOpenAI}<ExternalLink size={16} aria-hidden="true" /></a><Button variant="ghost" disabled={Boolean(busy)} onClick={() => void action("cancel")}>{c.cancel}</Button></div>}
      <div className="codex-preferences">
        <label className="codex-check"><input type="checkbox" checked={enabled} disabled={Boolean(busy) || (!connected || !data.remoteAllowed) && !enabled} onChange={event => setEnabled(event.target.checked)} /><span>{a.share}</span></label>
        <p className="codex-help">{a.shareHelp}</p>
        <div className="codex-actions"><Button disabled={Boolean(busy) || enabled && (!connected || !data.remoteAllowed)} loading={busy === "save"} onClick={() => void action("save")}><Check size={16} aria-hidden="true" />{a.save}</Button>
          {connected && <Button variant="ghost" disabled={Boolean(busy)} onClick={() => void action("disconnect")}><Unplug size={16} aria-hidden="true" />{a.disconnect}</Button>}
        </div>
        {connected && <div className="codex-model-test">
          <label className="codex-field" htmlFor={`${id}-model`}>{a.testModel}<select className="select" id={`${id}-model`} value={model} disabled={Boolean(busy) || loadingModels} onChange={event => setModel(event.target.value)}><option value="">{c.chooseModel}</option>{models.map(item => <option key={item.id} value={item.id}>{item.displayName || item.id}</option>)}</select></label>
          <p className="codex-help">{a.testHelp}</p>
          <div className="codex-actions"><Button variant="ghost" disabled={Boolean(busy) || loadingModels} loading={loadingModels} onClick={() => { setError(""); setCatalog(undefined); setCatalogVersion(value => value + 1); }}><RefreshCw size={15} aria-hidden="true" />{c.reloadModels}</Button><Button variant="secondary" disabled={Boolean(busy) || !model || !data.remoteAllowed || loadingModels} loading={busy === "test"} onClick={() => void action("test")}>{c.test}</Button></div>
        </div>}
      </div>
      <details className="codex-host-help"><summary>{c.setup}</summary><p>{a.setupHelp}</p><a href="https://learn.chatgpt.com/docs/app-server" target="_blank" rel="noreferrer" className="codex-text-action">{c.docs}<ExternalLink size={14} aria-hidden="true" /></a></details>
    </>}
    {notice && <p className="codex-message" role="status">{notice}</p>}
  </section>;
}
