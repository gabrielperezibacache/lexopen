import { configuredStudyDriveIdentity, studyDriveMode } from "@/lib/integrations/google-study-drive";
import { readCaseDriveFolderBindings } from "@/lib/integrations/case-drive";
import { isRealDriveFolderId } from "@/lib/integrations/drive-folder";

type Cause = {
  id: string;
  titulo: string;
  clienteId: string | null;
  rit?: string | null;
  googleDriveFolderId: string | null;
  googleDriveFolderName: string | null;
  cliente?: { razonSocial: string } | null;
  driveSyncSubscription?: { account: string; connectionId?: string | null; folderId?: string | null } | null;
};

export function uploadDestination(cause: Cause, clientName: string | null, setup: "folder" | "connection" | null = null) {
  const folderId = cause.googleDriveFolderId;
  const studyFolder = folderId && /^[A-Za-z0-9_-]{10,180}$/.test(folderId) && isRealDriveFolderId(folderId) && (!cause.driveSyncSubscription || cause.driveSyncSubscription.account === "study");
  return {
    id: cause.id, clientId: cause.clienteId, label: [cause.rit, cause.titulo].filter(Boolean).join(" · "), clientName,
    driveSetup: setup,
    drive: studyFolder && !setup ? { id: folderId, name: cause.googleDriveFolderName || folderId } : null,
  };
}

export async function uploadDestinations(causes: Cause[], clientName?: string) {
  const sharedOrganization = await studyDriveMode();
  const linkedIds = causes.filter(cause => isRealDriveFolderId(cause.googleDriveFolderId)).map(cause => cause.id);
  const [account, bindings] = sharedOrganization && linkedIds.length
    ? await Promise.all([configuredStudyDriveIdentity(), readCaseDriveFolderBindings(linkedIds)])
    : [null, null];
  const destinations = causes.map(cause => {
    const binding = bindings?.get(cause.id), subscription = cause.driveSyncSubscription;
    const accountMatches = binding?.source === "study" && account && binding.accountId === account.connectionId &&
      binding.accountRevision === account.bindingRevision && binding.proofRevision === account.bindingRevision;
    const approved = accountMatches && binding.folderId === cause.googleDriveFolderId && subscription?.account === "study" &&
      subscription.folderId === binding.folderId && subscription.connectionId === binding.accountId;
    const setup = sharedOrganization && !approved
      ? binding?.source === "study" && !accountMatches ? "connection" : "folder"
      : null;
    return uploadDestination(cause, clientName ?? cause.cliente?.razonSocial ?? null, setup);
  });
  return { sharedOrganization, destinations };
}
