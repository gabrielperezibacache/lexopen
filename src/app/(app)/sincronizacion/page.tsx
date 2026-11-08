import Link from "next/link";
import { ArrowUpRight, FolderSync } from "lucide-react";
import { isAdmin } from "@/lib/auth/rbac";
import { requireStaff } from "@/lib/auth/session";
import { causaAccessWhere } from "@/lib/auth/causa-access";
import { prisma } from "@/lib/db";
import { PersonalDriveConnection } from "@/components/altazor/PersonalDriveConnection";
import { can, canSome } from "@/lib/auth/permissions";
import styles from "./sync.module.css";
import { EditorialHeading } from "@/components/ui/EditorialHeading";

export default async function SyncPage() {
  const user = await requireStaff();
  const google = await prisma.integrationConfig.findUnique({ where: { provider: "google" }, select: { enabled: true, configJson: true } });
  let driveConfigured = false;
  try { const config = JSON.parse(google?.configJson || "{}"); driveConfigured = google?.enabled === true && typeof config.accessToken === "string" && Boolean(config.accessToken) && config.syncDrive !== false; } catch { /* Invalid configuration remains disconnected. */ }
  const causes = await prisma.causa.findMany({
    where: { AND: [causaAccessWhere(user), { OR: [{ googleDriveFolderId: { not: null } }, { driveSyncSubscription: { isNot: null } }] }] },
    select: { id: true, rit: true, titulo: true, abogadoId: true,
      miembros: { where: { userId: user.id, desde: { lte: new Date() }, OR: [{ hasta: null }, { hasta: { gt: new Date() } }] }, select: { rol: true }, take: 1 },
      googleDriveFolderName: true, googleDriveFolderId: true,
      driveSyncSubscription: { select: { enabled: true, status: true } },
    }, orderBy: { updatedAt: "desc" }, take: 100,
  });
  return <div className={styles.workspace}>
    <header className={styles.heading}><EditorialHeading artwork="connections"><h1>Archivos conectados</h1></EditorialHeading><Link className="btn btn-secondary" href="/causas">Ver causas <ArrowUpRight size={16} aria-hidden="true" /></Link></header>
    {canSome(user,"assistant.use") && <div id="sync-google"><PersonalDriveConnection /></div>}
    <section className={styles.files} id="sync-files" aria-labelledby="sync-files-title">
      <div className={styles.sectionHeading}><FolderSync size={23} aria-hidden="true" /><h2 id="sync-files-title">Carpetas de mis causas</h2></div>
      <details className={styles.connection}><summary>Google Drive del estudio <span>{driveConfigured ? "Conectado" : "Sin conectar"}</span></summary><div>{isAdmin(user) ? <Link className="btn btn-secondary" href="/integraciones">{driveConfigured ? "Revisar conexión" : "Conectar Google"}<ArrowUpRight size={16} aria-hidden="true" /></Link> : <p className={styles.note}>La conexión del estudio la administra su encargado.</p>}</div></details>
      {causes.length ? <ul className={styles.list}>{causes.map(cause => <li key={cause.id}>
        <div><Link href={`/causas/${encodeURIComponent(cause.id)}`}>{cause.rit || cause.titulo}<ArrowUpRight size={15} aria-hidden="true" /></Link>{cause.rit && <p>{cause.titulo}</p>}</div>
        <div className={styles.state}><span>{cause.driveSyncSubscription?.enabled ? ["attention","partial"].includes(cause.driveSyncSubscription.status) ? "Requiere revisión" : "Actualización automática" : "Carpeta vinculada"}{cause.googleDriveFolderName ? ` · ${cause.googleDriveFolderName}` : ""}</span>
          {can(user,"causa.write",{causaRol:cause.miembros[0]?.rol || (cause.abogadoId===user.id ? "responsable" : null)}) && <Link href={`/causas/${encodeURIComponent(cause.id)}#drive-folder`}>Abrir carpeta de documentos</Link>}
        </div>
      </li>)}</ul> : <p className={styles.empty}>Vincula una carpeta desde el expediente de una causa.</p>}
      {causes.length === 100 && <Link className="btn btn-ghost" href="/causas">Ver todas mis causas</Link>}
    </section>
  </div>;
}
