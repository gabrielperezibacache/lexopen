/** Safe User projection — never expose password hashes. */
export const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  avatarColor: true,
  title: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarColor: string;
  title: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export function publicUser<T extends { password?: string } | null | undefined>(
  user: T
): T extends null | undefined ? null : PublicUser {
  if (!user) return null as T extends null | undefined ? null : PublicUser;
  const rest = { ...(user as { password?: string } & PublicUser) };
  delete rest.password;
  return rest as T extends null | undefined ? null : PublicUser;
}

export function publicUsers<T extends { password?: string }>(users: T[]) {
  return users.map((u) => publicUser(u)!);
}

/** Recursively strip password from known user-shaped objects in JSON trees. */
export function stripPasswordsDeep<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((v) => stripPasswordsDeep(v)) as T;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k === "password") continue;
      next[k] = stripPasswordsDeep(v);
    }
    return next as T;
  }
  return value;
}
