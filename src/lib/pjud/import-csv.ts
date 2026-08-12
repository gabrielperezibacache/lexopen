export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_CSV_ROWS = 1000;
export const MOVIMIENTOS_CSV_HEADER =
  "titulo,detalle,fecha,referencia,id,cuaderno,folio,etapa,tramite,receptor,documento";

export type CsvMovimientoRow = {
  titulo: string;
  detalle: string;
  fecha: string;
  referencia: string;
  externalId: string;
  cuaderno: string;
  folio: string;
  etapa: string;
  tramite: string;
  receptor: string;
  documento: string;
};

export type CsvMovimientoExportRow = {
  titulo: string;
  detalle?: string | null;
  fecha: string;
  referencia?: string | null;
  externalId?: string | null;
  cuaderno?: string | null;
  folio?: string | null;
  etapa?: string | null;
  tramite?: string | null;
  esReceptor?: boolean | null;
  documentoRef?: string | null;
};

export class CsvImportError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CsvImportError";
    this.status = status;
  }
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseMovimientosCsv(csv: string): CsvMovimientoRow[] {
  if (Buffer.byteLength(csv, "utf8") > MAX_CSV_BYTES) {
    throw new CsvImportError("El CSV supera el límite de 5 MB", 413);
  }
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];
  if (lines.length - 1 > MAX_CSV_ROWS) {
    throw new CsvImportError(
      `El CSV supera el límite de ${MAX_CSV_ROWS} filas`,
      413
    );
  }
  const headers = parseCsvLine(lines[0]).map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/, "") : header).toLowerCase()
  );
  const indexOf = (...names: string[]) =>
    names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;
  const titleIndex = indexOf("titulo", "title");
  const detailIndex = indexOf("detalle", "detail");
  const dateIndex = indexOf("fecha", "date");
  const referenceIndex = indexOf("referencia", "reference", "ref");
  const externalIdIndex = indexOf("externalid", "external_id", "id", "identificador");
  const cuadernoIndex = indexOf("cuaderno", "notebook");
  const folioIndex = indexOf("folio");
  const etapaIndex = indexOf("etapa");
  const tramiteIndex = indexOf("tramite", "trámite");
  const receptorIndex = indexOf("receptor", "esreceptor", "es_receptor");
  const documentoIndex = indexOf("documento", "documentoref", "documento_ref", "documentoUrl");
  const valueAt = (row: string[], index: number) => (index >= 0 ? row[index] || "" : "");

  return lines
    .slice(1)
    .map((line) => {
      const row = parseCsvLine(line);
      return {
        titulo: valueAt(row, titleIndex) || row[0] || "",
        detalle: valueAt(row, detailIndex) || row[1] || "",
        fecha: valueAt(row, dateIndex) || row[2] || "",
        referencia: valueAt(row, referenceIndex),
        externalId: valueAt(row, externalIdIndex),
        cuaderno: valueAt(row, cuadernoIndex),
        folio: valueAt(row, folioIndex),
        etapa: valueAt(row, etapaIndex),
        tramite: valueAt(row, tramiteIndex),
        receptor: valueAt(row, receptorIndex),
        documento: valueAt(row, documentoIndex),
      };
    })
    .filter((row) => row.titulo.trim());
}

export function parseReceptorFlag(value: string | undefined | null) {
  const raw = (value || "").trim().toLowerCase();
  return ["1", "true", "si", "sí", "yes", "x", "receptor"].includes(raw);
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function serializeMovimientosCsv(rows: CsvMovimientoExportRow[]) {
  return [
    MOVIMIENTOS_CSV_HEADER,
    ...rows.map((row) =>
      [
        row.titulo,
        row.detalle,
        row.fecha,
        row.referencia,
        row.externalId?.replace(/^(import|pjud|demo):/, ""),
        row.cuaderno || "Principal",
        row.folio,
        row.etapa,
        row.tramite,
        row.esReceptor ? "1" : "",
        row.documentoRef,
      ]
        .map(csvCell)
        .join(",")
    ),
  ].join("\r\n") + "\r\n";
}
