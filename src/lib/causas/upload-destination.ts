import { isRealDriveFolderId } from "@/lib/integrations/drive-folder";

type Cause = {
  id: string;
  titulo: string;
  clienteId: string | null;
  rit?: string | null;
  googleDriveFolderId: string | null;
  googleDriveFolderName: string | null;
  driveSyncSubscription?: { account: string } | null;
};

export function uploadDestination(cause: Cause, clientName: string | null) {
  const folderId = cause.googleDriveFolderId;
  const studyFolder = folderId && /^[A-Za-z0-9_-]{10,180}$/.test(folderId) && isRealDriveFolderId(folderId) && (!cause.driveSyncSubscription || cause.driveSyncSubscription.account === "study");
  return {
    id: cause.id, clientId: cause.clienteId, label: [cause.rit, cause.titulo].filter(Boolean).join(" · "), clientName,
    drive: studyFolder ? { id: folderId, name: cause.googleDriveFolderName || folderId } : null,
  };
}
