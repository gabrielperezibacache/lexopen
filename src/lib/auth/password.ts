import bcrypt from "bcryptjs";

const ROUNDS = 10;

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hashed: string) {
  // Compat: seeds/legacy pueden tener texto plano hasta el primer login
  if (!hashed.startsWith("$2")) {
    return plain === hashed;
  }
  return bcrypt.compare(plain, hashed);
}

export function looksHashed(value: string) {
  return value.startsWith("$2a$") || value.startsWith("$2b$") || value.startsWith("$2y$");
}
