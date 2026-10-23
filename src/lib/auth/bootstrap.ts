import { createHmac, timingSafeEqual } from "node:crypto";

export const BOOTSTRAP_TOKEN_ENV = "LEXOPEN_BOOTSTRAP_TOKEN";
export const MIN_BOOTSTRAP_TOKEN_LENGTH = 32;

export function isValidBootstrapToken(
  provided: string | null | undefined,
  expected: string | null | undefined
) {
  if (!provided || !expected) return false;
  if (expected.length < MIN_BOOTSTRAP_TOKEN_LENGTH) return false;

  const a = createHmac("sha256", expected).update(provided).digest();
  const b = createHmac("sha256", expected).update(expected).digest();
  return timingSafeEqual(a, b);
}
