import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "lexopen_session";

export async function getCurrentUser() {
  const jar = await cookies();
  const userId = jar.get(SESSION_COOKIE)?.value;
  if (!userId) {
    // Demo UX: default to first admin so the app is usable out of the box
    return prisma.user.findFirst({ where: { role: "admin" } });
  }
  return prisma.user.findUnique({ where: { id: userId } });
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("No autenticado");
  return user;
}

export async function listUsers() {
  return prisma.user.findMany({ orderBy: { name: "asc" } });
}
