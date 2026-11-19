"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { KeyRound, LibraryBig, Link2 } from "lucide-react";
import type { Pane } from "./pane-location";
import { AltazorConnectorCatalog } from "./AltazorConnectorCatalog";
import { AltazorConnectors } from "./AltazorConnectors";
import { AltazorSecrets } from "./AltazorSecrets";
import styles from "./AltazorConnectorCatalog.module.css";

export function AltazorConnections({ causaId, openPane }: { causaId?: string | null; openPane?: (pane: Pane) => void }) {
  const en = useI18n().locale === "en";
  const [tab, setTab] = useState("apps");
  useEffect(() => { if (new URLSearchParams(location.search).get("conexion") === "secretos") queueMicrotask(() => setTab("secretos")); }, []);
  const tabs = [{ id: "apps", label: en ? "Applications" : "Aplicaciones", Icon: Link2 }, { id: "secretos", label: en ? "Secrets" : "Secretos", Icon: KeyRound }, { id: "academic", label: en ? "Share on LinkedIn" : "Compartir en LinkedIn", Icon: LibraryBig }];
  return <div className={styles.root}>
    <nav className={styles.tabs} aria-label={en ? "Connections and credentials" : "Conexiones y credenciales"}>{tabs.map(({id, label, Icon}) => <button type="button" key={id} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}><Icon size={17} aria-hidden="true" />{label}</button>)}</nav>
    {tab === "apps" ? <AltazorConnectorCatalog key={causaId || "personal"} causaId={causaId} openPane={openPane} /> : tab === "secretos" ? <AltazorSecrets /> : <AltazorConnectors />}
  </div>;
}
