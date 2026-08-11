import { timingSafeEqual } from "node:crypto";

export const BOOTSTRAP_TOKEN_ENV = "LEXOPEN_BOOTSTRAP_TOKEN";

export function isValidBootstrapToken(
  provided: string | null | undefined,
  expected: string | null | undefined
) {
  if (!provided || !expected) return false;
  const providedBytes = Buffer.from(provided, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (providedBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(providedBytes, expectedBytes);
}
