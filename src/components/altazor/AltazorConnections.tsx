"use client";
import { useEffect, useState } from "react";
import { KeyRound, LibraryBig, Link2 } from "lucide-react";
import { AltazorConnectorCatalog } from "./AltazorConnectorCatalog";
import { AltazorConnectors } from "./AltazorConnectors";
import { AltazorSecrets } from "./AltazorSecrets";
import styles from "./AltazorConnectorCatalog.module.css";

export function AltazorConnections({ causaId }: { causaId?: string | null }) {
  const [tab, setTab] = useState("apps");
  useEffect(() => { if (new URLSearchParams(location.search).get("conexion") === "secretos") queueMicrotask(() => setTab("secretos")); }, []);
  const tabs = [{ id: "apps", label: "Aplicaciones", Icon: Link2 }, { id: "secretos", label: "Secretos", Icon: KeyRound }, { id: "academic", label: "Compartir en LinkedIn", Icon: LibraryBig }];
  return <div className={styles.root}>
    <nav className={styles.tabs} aria-label="Conexiones y credenciales">{tabs.map(({id, label, Icon}) => <button type="button" key={id} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}><Icon size={17} aria-hidden="true" />{label}</button>)}</nav>
    {tab === "apps" ? <AltazorConnectorCatalog key={causaId || "personal"} causaId={causaId} /> : tab === "secretos" ? <AltazorSecrets /> : <AltazorConnectors />}
  </div>;
}
