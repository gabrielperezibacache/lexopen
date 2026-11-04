import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { altazorId } from "@/lib/altazor/schemas";
import { deleteAltazorAttachment, readAltazorAttachment } from "@/lib/altazor/attachments";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; attachmentId: string }> };
export async function GET(_request: Request, { params }: Context) { try { const user = await requireStaff(); const { id, attachmentId } = await params; return NextResponse.json({ attachment: await readAltazorAttachment(altazorId.parse(id), altazorId.parse(attachmentId), user) }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
export async function DELETE(request: Request, { params }: Context) { try { assertCsrf(request); const user = await requireStaff(); const { id, attachmentId } = await params; return NextResponse.json(await deleteAltazorAttachment(altazorId.parse(id), altazorId.parse(attachmentId), user), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
