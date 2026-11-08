import { readFileSync } from "fs";
import path from "path";

export type Semver = { major: number; minor: number; patch: number; prerelease: string[] };

/** Strip the tag prefix and build metadata, preserving release precedence. */
export function normalizeVersionTag(input: string | null | undefined): string | null {
  if (!input || !parseSemver(input)) return null;
  let v = input.trim();
  if (v.toLowerCase().startsWith("v")) v = v.slice(1);
  v = v.split("+")[0]!.trim();
  return v || null;
}

export function parseSemver(input: string | null | undefined): Semver | null {
  const version = input?.trim().replace(/^v/i, "");
  if (!version) return null;
  const m = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(version);
  if (!m) return null;
  const core = m.slice(1, 4).map(Number);
  const prerelease = m[4]?.split(".") || [];
  if (core.some(value => !Number.isSafeInteger(value)) || prerelease.some(value => /^0\d+$/.test(value))) return null;
  return {
    major: core[0],
    minor: core[1],
    patch: core[2],
    prerelease,
  };
}

/** Positive if a > b, negative if a < b, 0 if equal/unparseable. */
export function compareSemver(a: string | null | undefined, b: string | null | undefined): number {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) return 0;
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  if (left.patch !== right.patch) return left.patch - right.patch;
  if (!left.prerelease.length || !right.prerelease.length) {
    return left.prerelease.length === right.prerelease.length ? 0 : left.prerelease.length ? -1 : 1;
  }
  for (let i = 0; i < Math.max(left.prerelease.length, right.prerelease.length); i++) {
    const a = left.prerelease[i], b = right.prerelease[i];
    if (a === b) continue;
    if (a === undefined || b === undefined) return a === undefined ? -1 : 1;
    const aNumeric = /^\d+$/.test(a), bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric && a.length !== b.length) return a.length < b.length ? -1 : 1;
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a < b ? -1 : 1;
  }
  return 0;
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
