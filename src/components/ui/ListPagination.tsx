import Link from "next/link";
import { listPageHref } from "@/lib/api/list-window";
export function ListPagination({ path, filters = {}, after, next, count }: { path: string; filters?: Record<string, string | undefined>; after?: string; next: string | null; count: number }) {
  return <nav aria-label="Páginas de resultados" className="flex flex-wrap items-center gap-3 py-4 text-sm">
    <span role="status">{count === 1 ? "1 registro" : `${count} registros`} en esta página</span>
    {after && <Link className="btn btn-secondary" href={listPageHref(path, filters)}>Primera página</Link>}
    {next && <Link className="btn btn-secondary" href={listPageHref(path, filters, next)}>Ver siguientes</Link>}
  </nav>;
}
