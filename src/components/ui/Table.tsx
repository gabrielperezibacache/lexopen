"use client";

import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/chile";
import { useI18n } from "@/components/i18n/I18nProvider";

export type TableColumn<T> = {
  id: string;
  header: string;
  sortable?: boolean;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
};

export function Table<T extends { id: string }>({
  columns,
  rows,
  pageSize = 20,
  filterPlaceholder,
  empty,
}: {
  columns: TableColumn<T>[];
  rows: T[];
  pageSize?: number;
  filterPlaceholder?: string;
  empty?: ReactNode;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [sortId, setSortId] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = rows.filter((row) =>
        columns.some((c) => {
          const raw = c.sortValue ? String(c.sortValue(row)) : String(c.cell(row));
          return raw.toLowerCase().includes(q);
        })
      );
    }
    if (sortId) {
      const col = columns.find((c) => c.id === sortId);
      if (col?.sortValue) {
        list = [...list].sort((a, b) => {
          const av = col.sortValue!(a);
          const bv = col.sortValue!(b);
          if (av < bv) return sortDir === "asc" ? -1 : 1;
          if (av > bv) return sortDir === "asc" ? 1 : -1;
          return 0;
        });
      }
    }
    return list;
  }, [rows, columns, query, sortId, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize);

  function toggleSort(id: string) {
    if (sortId === id) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortId(id);
      setSortDir("asc");
    }
    setPage(0);
  }

  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className="space-y-3">
      <input
        className="input max-w-sm"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(0);
        }}
        placeholder={filterPlaceholder || t("common.filter")}
        aria-label={filterPlaceholder || t("common.filter")}
      />
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--line)]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[color-mix(in_srgb,var(--mist)_70%,transparent)] text-[var(--muted)]">
            <tr>
              {columns.map((c) => (
                <th key={c.id} scope="col" className="px-3 py-2 font-semibold">
                  {c.sortable ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-[var(--ink)]"
                      onClick={() => toggleSort(c.id)}
                      aria-sort={
                        sortId === c.id
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      {c.header}
                      {sortId === c.id ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.id} className="table-row">
                {columns.map((c) => (
                  <td key={c.id} className="px-3 py-2 align-top text-[var(--ink)]">
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-6 text-center text-[var(--muted)]"
                >
                  {t("common.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-2 text-sm text-[var(--muted)]">
          <span>
            {t("common.pageOf")
              .replace("{page}", String(page + 1))
              .replace("{pages}", String(pageCount))}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-ghost !min-h-0 !py-1.5"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              {t("common.prev")}
            </button>
            <button
              type="button"
              className="btn btn-ghost !min-h-0 !py-1.5"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              {t("common.next")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
