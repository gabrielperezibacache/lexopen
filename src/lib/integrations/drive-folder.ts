/** Prefijos de carpetas locales/demo — no son IDs reales de Google Drive. */
const PLACEHOLDER_PREFIXES = ["stub-", "demo-", "lexopen-stub-"] as const;

export function isPlaceholderDriveFolderId(
  folderId?: string | null
): boolean {
  if (!folderId) return true;
  const lower = folderId.toLowerCase();
  return PLACEHOLDER_PREFIXES.some((p) => lower.startsWith(p));
}

export function isRealDriveFolderId(folderId?: string | null): boolean {
  return Boolean(folderId) && !isPlaceholderDriveFolderId(folderId);
}

/** Extrae el ID de carpeta desde URL de Google Drive o ID crudo. */
export function parseGoogleDriveFolderRef(input: string): {
  folderId: string;
  folderUrl: string;
} | null {
  const raw = input.trim();
  if (!raw) return null;

  // https://drive.google.com/drive/folders/FOLDER_ID
  // https://drive.google.com/drive/u/0/folders/FOLDER_ID?...
  const folderMatch = raw.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch?.[1]) {
    return folderRefFromId(folderMatch[1]);
  }

  // open?id=FOLDER_ID
  const openMatch = raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openMatch?.[1]) {
    return folderRefFromId(openMatch[1]);
  }

  // ID crudo (rechaza placeholders cortos/enganosos)
  if (/^[a-zA-Z0-9_-]{10,}$/.test(raw)) {
    return folderRefFromId(raw);
  }

  return null;
}

function folderRefFromId(folderId: string) {
  if (isPlaceholderDriveFolderId(folderId)) {
    return {
      folderId,
      folderUrl: stubFolderUrl(folderId),
    };
  }
  return {
    folderId,
    folderUrl: driveFolderUrl(folderId),
  };
}

export function driveFolderUrl(folderId: string) {
  if (isPlaceholderDriveFolderId(folderId)) {
    return stubFolderUrl(folderId);
  }
  return `https://drive.google.com/drive/folders/${folderId}`;
}

/** URL local no navegable a Google — evita enlaces falsos en modo stub. */
export function stubFolderUrl(folderId: string) {
  return `lexopen://drive-stub/${folderId}`;
}

export function driveFileUrl(fileId: string) {
  if (isPlaceholderDriveFolderId(fileId) || fileId.startsWith("stub-")) {
    return `lexopen://drive-stub-file/${fileId}`;
  }
  return `https://drive.google.com/file/d/${fileId}/view`;
}

export function makeStubFolderId(causaId: string) {
  return `stub-folder-${causaId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}`;
}
