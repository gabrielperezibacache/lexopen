import type { Prisma } from "@prisma/client";

/**
 * User fields that are safe to expose in API payloads.
 * Password hashes must never cross the HTTP boundary.
 */
export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  title: true,
  avatarColor: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{
  select: typeof publicUserSelect;
}>;

export function toPublicUser(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  title: string | null;
  avatarColor: string;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    title: user.title,
    avatarColor: user.avatarColor,
  };
}
