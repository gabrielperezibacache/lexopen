import bcrypt from "bcryptjs";

const ROUNDS = 12;

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, ROUNDS);
}

export function looksHashed(value: string) {
  return value.startsWith("$2a$") || value.startsWith("$2b$") || value.startsWith("$2y$");
}

export async function verifyPassword(plain: string, hashed: string) {
  if (!looksHashed(hashed)) {
    // Legacy plaintext: never in production (LEXOPEN_ALLOW_PLAINTEXT_PASSWORDS ignored there).
    if (process.env.NODE_ENV === "production") {
      return false;
    }
    return plain === hashed;
  }
  return bcrypt.compare(plain, hashed);
}
