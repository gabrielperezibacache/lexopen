import { NextResponse } from "next/server";
import { handleRouteError, requireStaff } from "@/lib/api";
import { listBookPeople } from "@/lib/books/service";
export async function GET() { try { const user = await requireStaff(); return NextResponse.json(await listBookPeople(user), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
