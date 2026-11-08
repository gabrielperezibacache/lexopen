"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ExternalLink, Link2, RefreshCw, Unplug } from "lucide-react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { Button } from "@/components/ui";
import { apiMutation } from "@/lib/api-mutation";
import type { CodexConnectionStatus } from "@/lib/integrations/codex-session";
import "./CodexConnection.css";

type Source = "personal" | "host";
type Preference = { enabled: boolean; model: string; source: Source; revision: string };
type State = { connection: CodexConnectionStatus; preference: Preference; canUse: boolean; remoteAllowed: boolean; host: { enabled: boolean; available: boolean; connected: boolean } };
type Model = { id: string; displayName: string; isDefault?: boolean };
const endpoint = "/api/integrations/codex";
async function readConnection(signal: AbortSignal | undefined, fallback: string): Promise<State> {
  const response = await fetch(endpoint, { cache: "no-store", signal });
  const value = await response.json();
  if (!response.ok) throw Error(value.error || fallback);
  return value;
}

export function CodexConnection() {
  const { dict } = useI18n(), c = dict.codex;
  const id = useId(), [data, setData] = useState<State>(), [catalog, setCatalog] = useState<Model[]>();
  const [source, setSource] = useState<Source>("personal"), [model, setModel] = useState(""), [enabled, setEnabled] = useState(false);
  const currentSource = useRef<Source>("personal");
  const [busy, setBusy] = useState(""), [catalogVersion, setCatalogVersion] = useState(0);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const apply = useCallback((value: State) => {
    currentSource.current = value.preference.source;
    setData(value); setSource(value.preference.source); setModel(value.preference.model); setEnabled(value.preference.enabled);
  }, []);
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
  const personal = source === "personal", pending = Boolean(data?.connection.pendingLogin);
  const connected = Boolean(personal ? data?.connection.connected : data?.host.enabled && data.host.available && data.host.connected);
  const canActivate = Boolean(data?.canUse && data.remoteAllowed);
  const models = catalog || [], loadingModels = connected && canActivate && catalog === undefined;
  useEffect(() => {
    if (!pending) return;
    const control = new AbortController(), timer = setInterval(() => { void refresh(false, control.signal); }, 5000);
    return () => { clearInterval(timer); control.abort(); };
  }, [pending, refresh]);
  useEffect(() => {
    if (!connected || !canActivate) return;
    const control = new AbortController();
    // A source change cancels the old catalog before it can replace the new one.
    const timeout = setTimeout(() => { control.abort(); if (currentSource.current === source) { setCatalog([]); setError(c.modelsTimeout); } }, 30_000);
    void apiMutation<{ models: Model[] }>(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "models", source }), signal: control.signal,
    }).then(result => {
      if (control.signal.aborted || currentSource.current !== source) return;
      if (!result.ok) { setCatalog([]); setError(result.error); return; }
      setCatalog(result.data.models);
      setModel(previous => previous || result.data.models.find(item => item.isDefault)?.id || result.data.models[0]?.id || "");
    }).finally(() => {
      clearTimeout(timeout);
    });
    return () => { clearTimeout(timeout); control.abort(); };
  }, [connected, canActivate, source, catalogVersion, c.modelsTimeout]);
  function chooseSource(next: Source) {
    currentSource.current = next;
    setSource(next); setCatalog(undefined); setModel(next === data?.preference.source ? data.preference.model : ""); setEnabled(next === data?.preference.source ? data.preference.enabled : false); setError(""); setNotice("");
  }
  async function action(name: "connect" | "cancel" | "disconnect" | "save" | "test" | "disable") {
    setBusy(name); setError(""); setNotice("");
    try {
      const result = await apiMutation<State & { preview?: string }>(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: name === "disable" ? "save" : name,
          ...(name === "save" || name === "disable" ? { source, model, enabled: name === "disable" ? false : enabled } : name === "test" ? { source, model } : {}),
        }),
      });
      if (!result.ok) { setError(result.error); if (name === "disconnect") await refresh(false); return; }
      if (name === "test") setNotice(`${c.testSucceeded.replace("{model}", model)} ${result.data.preview || ""}`);
      else {
        if (name === "save" || name === "disable") { apply(result.data); setNotice(c.saved); }
        else {
          // Personal authorization must stay visible even when Host is the saved source.
          setData(result.data);
          setEnabled(result.data.preference.source === source ? result.data.preference.enabled : false);
          setModel(result.data.preference.source === source ? result.data.preference.model : "");
        }
        if (name === "disconnect") { setCatalog(undefined); setNotice(c.disconnected); }
      }
    } finally { setBusy(""); }
  }
  const sourceName = personal ? c.personal : c.host;
  return <section id="codex" className="codex-connection" aria-labelledby={`${id}-title`}>
    <header><div><h2 id={`${id}-title`}>{c.title}</h2><p>{c.description}</p></div><Link2 size={28} strokeWidth={1.5} aria-hidden="true" /></header>
    <p className="codex-help">{c.defaultHelp}</p>
    {error && <div className="codex-message" data-error="true" role="alert"><p>{error}</p><Button variant="ghost" disabled={Boolean(busy)} onClick={() => void refresh(!data)}>{c.retry}</Button></div>}
    {!data && !error && <p role="status">{c.loading}</p>}
    {data && <>
      <label className="codex-field" htmlFor={`${id}-source`}>{c.source}<select className="select" id={`${id}-source`} value={source} disabled={Boolean(busy)} onChange={event => chooseSource(event.target.value as Source)}>
        <option value="personal">{c.personal}</option>
        {(data.host.enabled || data.preference.source === "host" || !personal) && <option value="host" disabled={!data.host.enabled}>{data.host.enabled ? c.host : c.hostUnavailableOption}</option>}
      </select></label>
      <p className="codex-help">{personal ? c.personalHelp : c.hostHelp}</p>
      {!personal && !connected && <p className="codex-message">{c.hostUnavailableHelp}</p>}
      <div className="codex-account-state" role="status"><strong>{personal
        ? connected ? c.connected : pending ? c.pending : data.connection.available ? c.notConnected : c.needsSetup
        : !data.host.enabled ? c.hostDisabled : connected ? c.hostConnected : !data.host.available ? c.needsSetup : c.hostNotConnected}</strong>
        <span>{personal ? data.connection.account?.email || data.connection.account?.planType || data.connection.note || c.connectHint : c.hostManaged}</span>
      </div>
      {!data.canUse && <p className="codex-message" role="status">{c.noPermission}</p>}
      {!data.remoteAllowed && <p className="codex-message">{c.localOnly}</p>}
      {data.preference.enabled && (!connected || !canActivate) && <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void action("disable")}>{c.useStudy}</Button>}
      {personal && !connected && !pending && <Button disabled={Boolean(busy) || !data.connection.available || !canActivate} loading={busy === "connect"} onClick={() => void action("connect")}><Link2 size={16} aria-hidden="true" />{c.connect}</Button>}
      {personal && data.connection.pendingLogin && <div className="codex-authorize"><h3>{c.authorize}</h3><p>{c.authorizeHelp}</p><code aria-label={c.code}>{data.connection.pendingLogin.userCode}</code><a href={data.connection.pendingLogin.verificationUrl} target="_blank" rel="noreferrer" className="btn btn-primary">{c.openOpenAI}<ExternalLink size={16} aria-hidden="true" /></a><Button variant="ghost" disabled={Boolean(busy)} onClick={() => void action("cancel")}>{c.cancel}</Button></div>}
      <div className="codex-preferences">
        {connected && <>
          <label className="codex-field" htmlFor={`${id}-model`}>{c.model}<select className="select" id={`${id}-model`} value={model} disabled={Boolean(busy) || loadingModels || !canActivate} onChange={event => setModel(event.target.value)}><option value="">{c.chooseModel}</option>{model && !models.some(item => item.id === model) && <option value={model}>{model} · {c.recheck}</option>}{models.map(item => <option key={item.id} value={item.id}>{item.displayName || item.id}</option>)}</select></label>
          <Button variant="ghost" disabled={Boolean(busy) || loadingModels || !canActivate} loading={loadingModels} onClick={() => { setError(""); setCatalog(undefined); setCatalogVersion(value => value + 1); }}><RefreshCw size={15} aria-hidden="true" />{c.reloadModels}</Button>
        </>}
        <label className="codex-check"><input type="checkbox" checked={enabled} disabled={Boolean(busy) || (!connected || !canActivate) && !enabled} onChange={event => setEnabled(event.target.checked)} /><span>{c.useSelected.replace("{source}", sourceName)}</span></label>
        <p className="codex-help">{c.modelHelp}</p>
        <div className="codex-actions"><Button disabled={Boolean(busy) || enabled && (!model || !connected || !canActivate)} loading={busy === "save"} onClick={() => void action("save")}><Check size={16} aria-hidden="true" />{c.save}</Button>
          {connected && <Button variant="secondary" disabled={Boolean(busy) || !model || !canActivate || loadingModels} loading={busy === "test"} onClick={() => void action("test")}>{c.test}</Button>}
          {personal && connected && <Button variant="ghost" disabled={Boolean(busy)} onClick={() => void action("disconnect")}><Unplug size={16} aria-hidden="true" />{c.disconnect}</Button>}
        </div>
      </div>
      <details className="codex-host-help"><summary>{c.setup}</summary><p>{c.setupHelp}</p><a href="https://learn.chatgpt.com/docs/app-server" target="_blank" rel="noreferrer" className="codex-text-action">{c.docs}<ExternalLink size={14} aria-hidden="true" /></a></details>
    </>}
    {notice && <p className="codex-message" role="status">{notice}</p>}
  </section>;
}
