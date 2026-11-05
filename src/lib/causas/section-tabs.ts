/** Compatibility navigation remains on the older connected entry routes. */
export function shouldShowCausasSectionTabs(pathname: string): boolean {
  const path = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  return (
    path === "/causas/monitoreo" ||
    path === "/causas/mis-causas"
  );
}
