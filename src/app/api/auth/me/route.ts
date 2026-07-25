import { NextResponse } from "next/server";
import { getCurrentUser, listUsers } from "@/lib/auth/session";
import { canImpersonate } from "@/lib/auth/rbac";

export async function GET() {
  const user = await getCurrentUser();
  const users = canImpersonate() ? await listUsers() : user ? [user] : [];
  return NextResponse.json({
    user: user
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          title: user.title,
          avatarColor: user.avatarColor,
        }
      : null,
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      title: u.title,
      avatarColor: u.avatarColor,
    })),
    demoSwitcher: canImpersonate(),
  });
}
