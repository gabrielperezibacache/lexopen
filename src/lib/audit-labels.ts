const ACTION_LABELS: Record<string, string> = {
  "user.create": "Usuario creado",
  "user.update": "Usuario actualizado",
  "user.delete": "Usuario eliminado",
  "user.role_update": "Rol actualizado",
  "group.create": "Grupo creado",
  "group.update": "Grupo actualizado",
  "group.delete": "Grupo eliminado",
  "causa.create": "Causa creada",
  "causa.update": "Causa actualizada",
  "minuta.create": "Minuta creada",
  "minuta.update": "Minuta actualizada",
  "plazo.create": "Plazo creado",
  "tramite.create": "Trámite creado",
  "tramite.update": "Trámite actualizado",
  "tramite.delete": "Trámite eliminado",
  "tramite.apply-template": "Plantilla de trámites aplicada",
  "documento.create": "Documento creado",
  "documento.update": "Documento actualizado",
  "cliente.create": "Cliente creado",
  "cliente.update": "Cliente actualizado",
  "config.update": "Configuración actualizada",
  "billing.invoice.create": "Factura creada",
  "login": "Inicio de sesión",
};

const ENTITY_LABELS: Record<string, string> = {
  User: "Usuario",
  Group: "Grupo",
  Causa: "Causa",
  Minuta: "Minuta",
  Plazo: "Plazo",
  Tramite: "Trámite",
  Documento: "Documento",
  Cliente: "Cliente",
  FirmSettings: "Configuración",
  Invoice: "Factura",
  Site: "Espacio",
};

export function labelAuditAction(action: string) {
  return ACTION_LABELS[action] || action.replace(/[._]/g, " ");
}

export function labelAuditEntity(entityType: string) {
  return ENTITY_LABELS[entityType] || entityType;
}

export function summarizeAuditJson(raw?: string | null) {
  if (!raw) return "—";
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of ["email", "role", "name", "titulo", "rit", "status", "estado", "action"]) {
      if (data[key] !== undefined && data[key] !== null && data[key] !== "") {
        parts.push(`${key}: ${String(data[key])}`);
      }
    }
    if (parts.length) return parts.join(" · ");
    const keys = Object.keys(data).slice(0, 4);
    if (!keys.length) return "—";
    return keys.map((k) => `${k}: ${String(data[k])}`).join(" · ");
  } catch {
    return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
  }
}
