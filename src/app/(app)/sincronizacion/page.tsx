import Link from "next/link";
import { ArrowUpRight, FolderSync } from "lucide-react";
import { isAdmin } from "@/lib/auth/rbac";
import { requireStaff } from "@/lib/auth/session";
import { causaAccessWhere } from "@/lib/auth/causa-access";
import { prisma } from "@/lib/db";
import { PjudManualSessionPanel } from "@/components/pjud/PjudManualSessionPanel";
import { PjudSyncPreferences } from "@/components/pjud/PjudSyncPreferences";
import { PersonalDriveConnection } from "@/components/altazor/PersonalDriveConnection";
import { can, canSome } from "@/lib/auth/permissions";
import styles from "./sync.module.css";

export default async function SyncPage() {
  const user = await requireStaff();
  const canConnectStudyGoogle = isAdmin(user);
  const google = await prisma.integrationConfig.findUnique({ where: { provider: "google" }, select: { enabled: true, configJson: true } });
  let driveConfigured = false;
  try { const config = JSON.parse(google?.configJson || "{}"); driveConfigured = google?.enabled === true && typeof config.accessToken === "string" && Boolean(config.accessToken) && config.syncDrive !== false; } catch { /* A malformed configuration remains disconnected. */ }
  const causes = await prisma.causa.findMany({ where: { AND: [causaAccessWhere(user), { OR: [{ pjudMonitoreoActivo: true }, { googleDriveFolderId: { not: null } }, { pjudDocumentJobs: { some: { status: "waiting_login" } } }] }] }, select: { id: true, rit: true, titulo: true, pjudMonitoreoActivo: true, pjudSyncIntervalMinutes: true, abogadoId: true, miembros: { where: { userId: user.id, desde: { lte: new Date() }, OR: [{ hasta: null }, { hasta: { gt: new Date() } }] }, select: { rol: true }, take: 1 }, pjudLastSyncAt: true, pjudLastSyncStatus: true, pjudDocumentDownloadsEnabled: true, googleDriveFolderName: true, googleDriveFolderId: true, driveSyncSubscription: { select: { enabled: true, status: true } }, _count: { select: { pjudDocumentJobs: { where: { status: "waiting_login" } } } } }, orderBy: [{ pjudLastSyncAt: "desc" }, { updatedAt: "desc" }], take: 100 });
  return <div className={styles.workspace}>
    <header className={styles.heading}><div><h1>Sincronización</h1><p>Conecte su cuenta judicial y reúna las novedades junto a los documentos de cada causa.</p></div><Link className="btn btn-secondary" href="/causas">Ir a mis causas <ArrowUpRight size={16} aria-hidden="true" /></Link></header>
    <nav className={styles.jump} aria-label="Opciones de sincronización"><a href="#pjud-manual-title">ClaveÚnica y Mis Causas</a><Link href="/causas/monitoreo#alta-rol">Consultar por RIT/ROL</Link><a href="#sync-files">Carpetas y documentos</a></nav>
    {canSome(user, "assistant.use") && <div id="sync-google"><PersonalDriveConnection /></div>}
    <PjudManualSessionPanel />
    <section className={styles.files} id="sync-files" aria-labelledby="sync-files-title"><div className={styles.sectionHeading}><FolderSync size={23} aria-hidden="true" /><div><h2 id="sync-files-title">Carpetas y documentos</h2><p>Abra una causa para elegir su carpeta de Drive, activar la actualización automática o revisar sus originales.</p></div></div>
      <div className={styles.connection}><div><h3>Google Drive del estudio</h3><p>{driveConfigured ? "Cuenta configurada. Active la actualización en la carpeta elegida para cada causa." : "Conecte la cuenta de Google del estudio y elija una carpeta con sus subcarpetas para cada causa."}</p><p>Su Drive personal se conecta en «Mi Google Drive», al comienzo de esta página.</p></div>{canConnectStudyGoogle ? <Link className="btn btn-secondary" href="/integraciones">{driveConfigured ? "Revisar conexión" : "Conectar Google"}<ArrowUpRight size={16} aria-hidden="true" /></Link> : <p className={styles.note}>{driveConfigured ? "La conexión del estudio la administra su encargado." : "Solicite al administrador conectar la cuenta del estudio en Configuración."}</p>}</div>
      {causes.length ? <ul className={styles.list}>{causes.map(cause => <li key={cause.id}><div><Link href={`/causas/${encodeURIComponent(cause.id)}`}>{cause.rit || cause.titulo}<ArrowUpRight size={15} aria-hidden="true" /></Link><p>{cause.rit ? cause.titulo : "Expediente"}</p></div><div className={styles.state}><span>{cause.pjudMonitoreoActivo ? ["failed","error","partial"].includes(cause.pjudLastSyncStatus || "") ? "Actualización judicial por revisar" : "Novedades judiciales activas" : "Consulta judicial pausada"}</span>{can(user,"causa.write", { causaRol: cause.miembros[0]?.rol || (cause.abogadoId === user.id ? "responsable" : null) }) && <Link href={`/causas/${encodeURIComponent(cause.id)}#drive-folder`}>Elegir carpeta y configurar Drive</Link>}{cause.googleDriveFolderId && <span>{cause.driveSyncSubscription?.enabled ? ["attention","partial"].includes(cause.driveSyncSubscription.status) ? "Drive por revisar" : "Drive automático" : "Drive vinculado"}{cause.googleDriveFolderName ? ` · ${cause.googleDriveFolderName}` : ""}</span>}{can(user,"causa.write", { causaRol: cause.miembros[0]?.rol || (cause.abogadoId === user.id ? "responsable" : null) }) && <PjudSyncPreferences causaId={cause.id} enabled={cause.pjudMonitoreoActivo} downloadDocuments={cause.pjudDocumentDownloadsEnabled} intervalMinutes={cause.pjudSyncIntervalMinutes} />}{cause._count.pjudDocumentJobs > 0 && <a href="#pjud-manual-title">{cause._count.pjudDocumentJobs} documentos requieren ClaveÚnica</a>}</div></li>)}</ul> : <div className={styles.empty}><h3>Conecte su primera causa</h3><p>Ingrese con ClaveÚnica arriba o consulte una causa por su RIT/ROL. Después podrá reunir también sus archivos de Drive.</p><Link className="btn btn-primary" href="/causas/monitoreo#alta-rol">Consultar una causa</Link></div>}
      {causes.length === 100 && <Link className="btn btn-ghost" href="/causas">Ver el resto de mi cartera</Link>}
      <p className={styles.note}>Las revisiones automáticas continúan mientras el equipo del estudio permanece abierto. Si la OJV termina su sesión, sus documentos pendientes se conservan hasta el próximo ingreso.</p>
    </section>
  </div>;
}
