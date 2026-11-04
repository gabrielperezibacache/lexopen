import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError, requireStaff } from "@/lib/api";
import { altazorActor } from "@/lib/altazor/access";
export const runtime = "nodejs";
export async function GET() { try { const user = await altazorActor(await requireStaff()); const books = await prisma.libraryBook.findMany({ where: { ownerId: user.id, deletedAt: null }, select: { id: true, title: true, author: true }, orderBy: { title: "asc" }, take: 200 }); return NextResponse.json({ books }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
