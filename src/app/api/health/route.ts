import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { storageConfigured } from "@/lib/storage";

export async function GET() {
  const time = new Date().toISOString();
  const storage = storageConfigured() ? "s3" : "local";
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      db: "up",
      storage,
      time,
    });
  } catch {
    return NextResponse.json(
      { ok: false, db: "down", storage, time },
      { status: 503 }
    );
  }
}
