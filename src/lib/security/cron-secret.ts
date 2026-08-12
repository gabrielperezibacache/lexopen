import { timingSafeEqual } from "crypto";

/** Constant-time check for x-cron-secret against CRON_SECRET. */
export function verifyCronSecret(provided: string | null | undefined): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected || provided == null || provided === "") return false;
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) {
      timingSafeEqual(b, b);
      return false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
