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
    const folderId = folderMatch[1];
    return {
      folderId,
      folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
    };
  }

  // open?id=FOLDER_ID
  const openMatch = raw.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openMatch?.[1]) {
    const folderId = openMatch[1];
    return {
      folderId,
      folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
    };
  }

  // ID crudo
  if (/^[a-zA-Z0-9_-]{10,}$/.test(raw)) {
    return {
      folderId: raw,
      folderUrl: `https://drive.google.com/drive/folders/${raw}`,
    };
  }

  return null;
}

export function driveFolderUrl(folderId: string) {
  return `https://drive.google.com/drive/folders/${folderId}`;
}

export function driveFileUrl(fileId: string) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}
