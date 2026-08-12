/**
 * Comprueba si hay un release más nuevo en GitHub Releases.
 * Fall-closed: errores de red / rate-limit → no hay aviso.
 */

import {
  getAppVersion,
  getGithubRepoSlug,
  isNewerVersion,
  normalizeVersionTag,
} from "@/lib/app-version";

export type UpdateCheckResult = {
  checked: boolean;
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string | null;
  releaseName: string | null;
  releaseUrl: string | null;
  desktop: boolean;
  disabled: boolean;
  checkedAt: string;
  error?: string;
};

type CacheEntry = {
  expiresAt: number;
  result: UpdateCheckResult;
};

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1h
let cache: CacheEntry | null = null;

function ttlMs() {
  const raw = Number(process.env.LEXOPEN_UPDATE_CHECK_TTL_MS || DEFAULT_TTL_MS);
  if (!Number.isFinite(raw) || raw < 60_000) return DEFAULT_TTL_MS;
  return Math.min(raw, 24 * 60 * 60 * 1000);
}

export function updateCheckDisabled() {
  return (
    process.env.LEXOPEN_UPDATE_CHECK === "0" ||
    process.env.LEXOPEN_UPDATE_CHECK === "off" ||
    process.env.LEXOPEN_UPDATE_CHECK === "false"
  );
}

export async function checkForAppUpdate(opts?: {
  force?: boolean;
}): Promise<UpdateCheckResult> {
  const currentVersion = getAppVersion();
  const desktop = process.env.LEXOPEN_DESKTOP === "1";
  const checkedAt = new Date().toISOString();

  if (updateCheckDisabled()) {
    return {
      checked: false,
      updateAvailable: false,
      currentVersion,
      latestVersion: null,
      releaseName: null,
      releaseUrl: null,
      desktop,
      disabled: true,
      checkedAt,
    };
  }

  if (!opts?.force && cache && cache.expiresAt > Date.now()) {
    return cache.result;
  }

  const repo = getGithubRepoSlug();
  const url = `https://api.github.com/repos/${repo}/releases/latest`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `LexOpen/${currentVersion}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });

    if (res.status === 404) {
      const result: UpdateCheckResult = {
        checked: true,
        updateAvailable: false,
        currentVersion,
        latestVersion: null,
        releaseName: null,
        releaseUrl: `https://github.com/${repo}/releases`,
        desktop,
        disabled: false,
        checkedAt,
      };
      cache = { expiresAt: Date.now() + ttlMs(), result };
      return result;
    }

    if (!res.ok) {
      const result: UpdateCheckResult = {
        checked: false,
        updateAvailable: false,
        currentVersion,
        latestVersion: null,
        releaseName: null,
        releaseUrl: null,
        desktop,
        disabled: false,
        checkedAt,
        error: `GitHub Releases HTTP ${res.status}`,
      };
      // Short negative cache on rate limits.
      cache = { expiresAt: Date.now() + 5 * 60_000, result };
      return result;
    }

    const body = (await res.json()) as {
      tag_name?: string;
      name?: string;
      html_url?: string;
      draft?: boolean;
      prerelease?: boolean;
    };

    if (body.draft || body.prerelease) {
      const result: UpdateCheckResult = {
        checked: true,
        updateAvailable: false,
        currentVersion,
        latestVersion: normalizeVersionTag(body.tag_name),
        releaseName: body.name || null,
        releaseUrl: body.html_url || `https://github.com/${repo}/releases`,
        desktop,
        disabled: false,
        checkedAt,
      };
      cache = { expiresAt: Date.now() + ttlMs(), result };
      return result;
    }

    const latestVersion = normalizeVersionTag(body.tag_name);
    const result: UpdateCheckResult = {
      checked: true,
      updateAvailable: isNewerVersion(latestVersion, currentVersion),
      currentVersion,
      latestVersion,
      releaseName: body.name || null,
      releaseUrl: body.html_url || `https://github.com/${repo}/releases`,
      desktop,
      disabled: false,
      checkedAt,
    };
    cache = { expiresAt: Date.now() + ttlMs(), result };
    return result;
  } catch (error) {
    const result: UpdateCheckResult = {
      checked: false,
      updateAvailable: false,
      currentVersion,
      latestVersion: null,
      releaseName: null,
      releaseUrl: null,
      desktop,
      disabled: false,
      checkedAt,
      error: error instanceof Error ? error.message : "Error de red",
    };
    cache = { expiresAt: Date.now() + 5 * 60_000, result };
    return result;
  }
}

/** Test helper */
export function clearUpdateCheckCache() {
  cache = null;
}
