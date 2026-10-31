import { NextResponse } from "next/server";
import { handleRouteError, requireUser } from "@/lib/api";
import { getWebPushConfig } from "@/lib/notify/config";

export async function GET() {
  try {
    await requireUser();
    const wp = await getWebPushConfig();
    if (!wp.enabled || !wp.config) {
      return NextResponse.json({ enabled: false, publicKey: null });
    }
    return NextResponse.json({
      enabled: true,
      publicKey: wp.config.publicKey,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
