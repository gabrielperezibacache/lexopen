import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { authorizedEvidenceFragment, evidenceFragmentHref } from "@/lib/evidence/service";
import { verifyEvidenceQuote } from "@/lib/evidence/fragments";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(req); const user = await requireStaff(); const { id } = await params;
    const body = await parseBody(req, z.object({ quote: z.string().min(1).max(4000) }));
    const fragment = await authorizedEvidenceFragment(id, user);
    return NextResponse.json({ verified: verifyEvidenceQuote(fragment, body.quote), versionId: fragment.versionId, fragmentId: id, pageNumber: fragment.page?.pageNumber || null, sourceSha256: fragment.version.sourceSha256, href: evidenceFragmentHref(fragment) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return handleRouteError(e); }
}
