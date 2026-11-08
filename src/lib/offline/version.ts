import { createHash } from "node:crypto";
import type { Cliente, Task } from "@prisma/client";
import { canonicalJson } from "@/lib/command-execution";
export const clienteColumns = ["id", "razonSocial", "rut", "email", "telefono", "tipo", "estado", "notas", "abogadoId", "createdAt", "updatedAt"] as const;
export function clienteVersion(row: Pick<Cliente, typeof clienteColumns[number]>) {
  return createHash("sha256").update(canonicalJson(Object.fromEntries(clienteColumns.map(key => [key, row[key]])))).digest("hex");
}
export function taskVersion(row: Task) { return createHash("sha256").update(canonicalJson(row)).digest("hex"); }
