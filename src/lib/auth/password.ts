import bcrypt from "bcryptjs";

const ROUNDS = 10;

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, ROUNDS);
}

export function looksHashed(value: string) {
  return value.startsWith("$2a$") || value.startsWith("$2b$") || value.startsWith("$2y$");
}

export async function verifyPassword(plain: string, hashed: string) {
  if (!looksHashed(hashed)) {
    // One-shot legacy: only allow plaintext compare outside production
    if (process.env.NODE_ENV === "production" && process.env.LEXOPEN_ALLOW_PLAINTEXT_PASSWORDS !== "1") {
      return false;
    }
    return plain === hashed;
  }
  return bcrypt.compare(plain, hashed);
}
