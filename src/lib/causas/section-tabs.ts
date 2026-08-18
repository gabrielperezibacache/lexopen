/** Hub tabs live on these paths; ficha / nueva hide them. */
export function shouldShowCausasSectionTabs(pathname: string): boolean {
  const path = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  return (
    path === "/causas" ||
    path === "/causas/monitoreo" ||
    path === "/causas/mis-causas"
  );
}
