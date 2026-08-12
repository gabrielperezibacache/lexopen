import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";

/** Rotate a secret in process.env and, for Desktop Host, persist into dataDir/.env. */
export async function rotateDesktopEnvSecret(
  key: string,
  nextValue?: string
): Promise<string> {
  const value = nextValue ?? randomBytes(32).toString("hex");
  process.env[key] = value;

  if (process.env.LEXOPEN_DESKTOP !== "1") return value;
  const dataDir = process.env.LEXOPEN_DATA_DIR?.trim();
  if (!dataDir) return value;

  const file = path.join(dataDir, ".env");
  try {
    let text = "";
    try {
      text = await fs.readFile(file, "utf8");
    } catch {
      return value;
    }
    const lines = text.split(/\r?\n/);
    let found = false;
    const next = lines.map((line) => {
      if (!line || line.trim().startsWith("#") || !line.includes("=")) return line;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      if (k !== key) return line;
      found = true;
      return `${key}=${value}`;
    });
    if (!found) next.push(`${key}=${value}`);
    const out = next.join("\n").replace(/\n*$/, "\n");
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, out, "utf8");
    await fs.rename(tmp, file);
  } catch (error) {
    console.warn(`[env-secrets] no se pudo persistir ${key}`, error);
  }
  return value;
}

export async function clearDesktopEnvSecret(key: string) {
  process.env[key] = "";
  if (process.env.LEXOPEN_DESKTOP !== "1") return;
  const dataDir = process.env.LEXOPEN_DATA_DIR?.trim();
  if (!dataDir) return;
  const file = path.join(dataDir, ".env");
  try {
    const text = await fs.readFile(file, "utf8");
    const next = text
      .split(/\r?\n/)
      .map((line) => {
        if (!line || line.trim().startsWith("#") || !line.includes("=")) return line;
        const i = line.indexOf("=");
        const k = line.slice(0, i).trim();
        if (k !== key) return line;
        return `${key}=`;
      })
      .join("\n")
      .replace(/\n*$/, "\n");
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, next, "utf8");
    await fs.rename(tmp, file);
  } catch {
    /* best effort */
  }
}
