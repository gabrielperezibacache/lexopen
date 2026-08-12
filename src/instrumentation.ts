export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { assertSafeProductionEnv } = await import(
    "@/lib/security/production-env"
  );
  assertSafeProductionEnv();
}
