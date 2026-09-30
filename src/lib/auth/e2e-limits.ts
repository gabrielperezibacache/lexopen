/**
 * Playwright e2e (`scripts/e2e-server.mjs`) sets NODE_ENV=test and optionally
 * LEXOPEN_E2E=1. Raise auth buckets so suite retries don't cascade into 429.
 * Never relaxes production or normal development hosts.
 */
export function isE2eAuthRelaxed(): boolean {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.LEXOPEN_E2E === "1"
  );
}

export function loginIpLimit(): number {
  return isE2eAuthRelaxed() ? 500 : 40;
}

export function loginEmailLimit(): number {
  return isE2eAuthRelaxed() ? 200 : 10;
}
