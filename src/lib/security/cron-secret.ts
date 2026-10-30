import { cronSecretMatches } from "@/lib/security/cron-paths";

/** Constant-time check for x-cron-secret against CRON_SECRET. */
export function verifyCronSecret(provided: string | null | undefined): boolean {
  return cronSecretMatches(provided, process.env.CRON_SECRET);
}
