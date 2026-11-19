import type { DocumentDownloadOptions } from "@/lib/sites/document-download-options";

export function DocumentDownloads({ id, options, className }: {
  id: string; options?: DocumentDownloadOptions; className: string;
}) {
  if (!options?.original && !options?.text) return <span className="text-xs text-[var(--muted)]">Sin archivo disponible</span>;
  const base = `/api/documentos/${encodeURIComponent(id)}`;
  return <>
    {options.original && <a className={className} href={`${base}/content?download=1`} download>Descargar original</a>}
    {options.text && <a className={className} href={options.text === "markdown" ? `${base}/markdown?download=1` : `${base}/content?format=text`} download>
      {options.text === "markdown" ? "Descargar texto preparado" : "Descargar texto conservado"}
    </a>}
  </>;
}
