/**
 * RFC 6238 TOTP (SHA-1, 30s, 6 digits) without external deps.
 */
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { decryptSecret, encryptSecret } from "@/lib/pjud/secret";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(bytes = 20): string {
  const buf = randomBytes(bytes);
  let bits = "";
  for (const b of buf) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

function base32Decode(secret: string): Buffer {
  const cleaned = secret.replace(/=+$/, "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const c of cleaned) {
    const idx = BASE32.indexOf(c);
    if (idx < 0) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotpCode(secret: string, at = Date.now()): string {
  const counter = Math.floor(at / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const key = base32Decode(secret);
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

export function verifyTotpCode(
  secret: string,
  code: string,
  window = 1,
  at = Date.now()
): boolean {
  const normalized = String(code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  for (let w = -window; w <= window; w++) {
    const expected = generateTotpCode(secret, at + w * 30_000);
    const a = Buffer.from(expected);
    const b = Buffer.from(normalized);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

export function totpOtpauthUrl(opts: {
  secret: string;
  email: string;
  issuer?: string;
}) {
  const issuer = encodeURIComponent(opts.issuer || "LexOpen");
  const label = encodeURIComponent(`${opts.issuer || "LexOpen"}:${opts.email}`);
  return `otpauth://totp/${label}?secret=${opts.secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

export function sealTotpSecret(plain: string) {
  return encryptSecret(plain);
}

export function unsealTotpSecret(enc: string | null | undefined) {
  return decryptSecret(enc, { strict: true });
}

export async function hashBackupCodes(codes: string[]) {
  return JSON.stringify(await Promise.all(codes.map((c) => hashPassword(c))));
}

export function generateBackupCodes(n = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < n; i++) {
    codes.push(randomBytes(4).toString("hex"));
  }
  return codes;
}

export async function consumeBackupCode(
  storedJson: string | null | undefined,
  code: string
): Promise<{ ok: boolean; remainingJson: string | null }> {
  if (!storedJson) return { ok: false, remainingJson: null };
  let hashes: string[];
  try {
    hashes = JSON.parse(storedJson);
    if (!Array.isArray(hashes)) return { ok: false, remainingJson: storedJson };
  } catch {
    return { ok: false, remainingJson: storedJson };
  }
  const remaining: string[] = [];
  let matched = false;
  for (const h of hashes) {
    if (!matched && (await verifyPassword(code.trim().toLowerCase(), h))) {
      matched = true;
      continue;
    }
    remaining.push(h);
  }
  return {
    ok: matched,
    remainingJson: remaining.length ? JSON.stringify(remaining) : null,
  };
}
