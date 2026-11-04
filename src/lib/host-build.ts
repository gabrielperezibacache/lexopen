type BuildVisibility = { staff: boolean; desktopRuntime: boolean; localProbe: boolean };

/** Build identity is diagnostic information for an authorized or local Desktop probe. */
export function hostBuildDetails(access: BuildVisibility, env: Readonly<Record<string, string | undefined>> = process.env) {
  if (!access.staff && !(access.desktopRuntime && access.localProbe)) return {};
  const buildId = env.LEXOPEN_BUILD_ID || "";
  const sourceRevision = env.LEXOPEN_SOURCE_REVISION || "";
  return {
    buildId: /^[A-Za-z0-9_.-]{1,200}$/.test(buildId) ? buildId : null,
    sourceRevision: /^[a-f0-9]{40}$/i.test(sourceRevision) ? sourceRevision.toLowerCase() : null,
  };
}
