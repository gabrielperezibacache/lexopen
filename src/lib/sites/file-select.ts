/** Shared Prisma selects that never embed file body content. */

export const siteFileListSelect = {
  id: true,
  name: true,
  mimeType: true,
  tags: true,
  version: true,
  sizeBytes: true,
  confidencial: true,
  privilegio: true,
  folderId: true,
  siteId: true,
  storageKey: true,
  updatedAt: true,
  createdAt: true,
  checkedOut: true,
  metadataJson: true,
};

export const fileVersionListSelect = {
  id: true,
  version: true,
  note: true,
  createdAt: true,
  authorId: true,
};

export const documentoListSelect = {
  id: true,
  nombre: true,
  tipo: true,
  mimeType: true,
  ruta: true,
  storageKey: true,
  extractionStatus: true,
  confidencial: true,
  privilegio: true,
  version: true,
  obsidianPath: true,
  googleDriveId: true,
  causaId: true,
  clienteId: true,
  autorId: true,
  createdAt: true,
  updatedAt: true,
};
