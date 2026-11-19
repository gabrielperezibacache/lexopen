export const commandInProgressMessage = "Operación en curso; reintente con la misma clave";

export function hasUnconfirmedOutcome(failure: { status: number; error: string }): boolean {
  return failure.status === 0 || failure.status === 408 || failure.status >= 500 ||
    (failure.status === 409 && failure.error === commandInProgressMessage);
}
