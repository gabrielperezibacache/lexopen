import { NextResponse } from "next/server";
import { getCurrentUser, listUsers } from "@/lib/auth/session";

export async function GET() {
  const [user, users] = await Promise.all([getCurrentUser(), listUsers()]);
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
  });
}
