import { ConnectorError } from "@/lib/personal-connectors/core";

export const COMPUTER_LOCAL_ONLY_REASON = "La política del estudio permite sólo IA local. Kitties no acredita el destino de su proveedor; no se pueden iniciar escritorios ni enviar tareas o entrada manual. Puede consultar, cancelar y detener una sesión existente.";
export function computerPolicyAllowed(mode: string) { return mode !== "local_only"; }
export function assertComputerPolicy(mode: string) {
  if (!computerPolicyAllowed(mode)) throw new ConnectorError("computer_local_only", COMPUTER_LOCAL_ONLY_REASON, 403);
}
