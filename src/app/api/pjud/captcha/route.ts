import { NextResponse } from "next/server";
import { handleRouteError, requireStaff } from "@/lib/api";
import { providerStatusPublicAsync } from "@/lib/pjud/sync";

/** Catálogo + estado CAPTCHA / sidecar (sin secretos). */
export async function GET() {
  try {
    await requireStaff();
    const provider = await providerStatusPublicAsync();
    return NextResponse.json({
      ok: true,
      captcha: provider.captcha,
      sidecar: provider.sidecar,
      publicScrapeEnabled: provider.publicScrapeEnabled,
      publicScrapeReady: provider.publicScrapeReady,
      liveIngestConfigured: provider.liveIngestConfigured,
      honesty: provider.honesty,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
