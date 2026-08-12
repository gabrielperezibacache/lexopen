import { readFileSync } from "fs";
import path from "path";

export type Semver = { major: number; minor: number; patch: number };

/** Strip leading `v` and optional pre-release/build metadata for comparison. */
export function normalizeVersionTag(input: string | null | undefined): string | null {
  if (!input?.trim()) return null;
  let v = input.trim();
  if (v.toLowerCase().startsWith("v")) v = v.slice(1);
  // Drop pre-release / build for ordering (0.1.5-beta < 0.1.5 treated as equal base).
  v = v.split("-")[0]!.split("+")[0]!.trim();
  return v || null;
}

export function parseSemver(input: string | null | undefined): Semver | null {
  const normalized = normalizeVersionTag(input);
  if (!normalized) return null;
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(normalized);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
  };
}

/** Positive if a > b, negative if a < b, 0 if equal/unparseable. */
export function compareSemver(a: string | null | undefined, b: string | null | undefined): number {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) return 0;
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

export function isNewerVersion(
  latest: string | null | undefined,
  current: string | null | undefined
): boolean {
  return compareSemver(latest, current) > 0;
}

export function getAppVersion(): string {
  const fromEnv = process.env.LEXOPEN_APP_VERSION?.trim();
  if (fromEnv) return fromEnv.replace(/^v/i, "");
  try {
    const raw = readFileSync(path.join(process.cwd(), "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    return String(pkg.version || "0.0.0").replace(/^v/i, "");
  } catch {
    return "0.0.0";
  }
}

export function getGithubRepoSlug(): string {
  const fromEnv = process.env.LEXOPEN_GITHUB_REPO?.trim();
  if (fromEnv && /^[\w.-]+\/[\w.-]+$/.test(fromEnv)) return fromEnv;
  return "gabrielperezibacache/lexopen";
}
