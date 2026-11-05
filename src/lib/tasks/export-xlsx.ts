import { crc32, deflateRawSync } from "node:zlib";
import { httpError } from "@/lib/auth/access";
import { civilDateKey } from "@/lib/chile-time";

export const TASK_EXPORT_LIMIT = 500;
export const TASK_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const sheetByteLimit = 12 * 1024 * 1024;
const cellTextLimit = 32_767;
const illegalXmlText = new RegExp("[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\ufffe\\uffff]", "g");

export type TaskExportRow = {
  title: string;
  status: string;
  priority: string;
  cause: string | null;
  assignee: string | null;
  dueDate: Date | null;
  description: string | null;
  instructions: string | null;
  considerations: string | null;
};

const headers = ["Tarea", "Estado", "Prioridad", "Causa", "Responsable", "Vencimiento", "Descripción", "Instrucciones", "Consideraciones"];
const widths = [36, 20, 13, 34, 27, 17, 48, 48, 48];
const statusLabels = new Map([
  ["todo", "Por hacer"], ["in_progress", "En curso"], ["blocked", "Bloqueada"], ["waiting_client", "En espera del cliente"],
]);
const priorityLabels = new Map([["low", "Baja"], ["medium", "Media"], ["high", "Alta"], ["urgent", "Urgente"]]);

function textCell(reference: string, value: string | null, style: number) {
  const text = value ?? "";
  if (text.length > cellTextLimit) throw httpError("Una tarea supera el espacio de una celda de Excel. Acota ese texto antes de exportar.", 413);
  // Encode literal escape sequences and control characters as SpreadsheetML text.
  const escaped = text.toWellFormed()
    .replace(/_x[0-9a-f]{4}_/gi, match => `_x005F_${match.slice(1)}`)
    .replace(illegalXmlText, char => `_x${char.charCodeAt(0).toString(16).padStart(4, "0")}_`)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#13;");
  // All user fields, including strings beginning with =, +, -, or @, are inert strings.
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escaped}</t></is></c>`;
}

function dateCell(reference: string, date: Date | null) {
  if (!date) return `<c r="${reference}" s="3"/>`;
  const day = civilDateKey(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < "1900-01-01") return textCell(reference, day, 2);
  // Excel reserves serial 60 for a nonexistent 1900-02-29.
  const epoch = day < "1900-03-01" ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
  const serial = (Date.parse(day) - epoch) / 86_400_000;
  return `<c r="${reference}" s="3"><v>${serial}</v></c>`;
}

function taskSheet(rows: readonly TaskExportRow[]) {
  if (rows.length > TASK_EXPORT_LIMIT) throw httpError(`La exportación admite hasta ${TASK_EXPORT_LIMIT} pendientes. Reduce la lista con los filtros e inténtalo de nuevo.`, 413);
  const range = `A1:I${rows.length + 1}`;
  const columns = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
  const header = headers.map((value, index) => textCell(`${String.fromCharCode(65 + index)}1`, value, 1)).join("");
  const xml = [
    `<worksheet xmlns="${spreadsheetNs}"><dimension ref="${range}"/><sheetViews><sheetView workbookViewId="0"><pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="B2" sqref="B2"/></sheetView></sheetViews>`,
    `<sheetFormatPr defaultRowHeight="16"/><cols>${columns}</cols><sheetData><row r="1" ht="24" customHeight="1">${header}</row>`,
  ];
  let bytes = xml.reduce((sum, part) => sum + Buffer.byteLength(part), 0);
  for (const [index, task] of rows.entries()) {
    const row = index + 2;
    const cells = [
      textCell(`A${row}`, task.title, 2), textCell(`B${row}`, statusLabels.get(task.status) ?? task.status, 2),
      textCell(`C${row}`, priorityLabels.get(task.priority) ?? task.priority, 2), textCell(`D${row}`, task.cause, 2),
      textCell(`E${row}`, task.assignee, 2), dateCell(`F${row}`, task.dueDate), textCell(`G${row}`, task.description, 2),
      textCell(`H${row}`, task.instructions, 2), textCell(`I${row}`, task.considerations, 2),
    ].join("");
    const part = `<row r="${row}">${cells}</row>`;
    bytes += Buffer.byteLength(part);
    if (bytes > sheetByteLimit) throw httpError("La exportación es demasiado grande. Reduce la lista con los filtros e inténtalo de nuevo.", 413);
    xml.push(part);
  }
  xml.push(`</sheetData><autoFilter ref="${range}"/></worksheet>`);
  return xml.join("");
}

const spreadsheetNs = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const relationshipsNs = "http://schemas.openxmlformats.org/package/2006/relationships";
const officeRelationshipsNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const styles = `<styleSheet xmlns="${spreadsheetNs}">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>
  <fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFF4F3F7"/><name val="Arial"/></font></fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0D1022"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border/><border><right style="thin"><color rgb="FFB8C1FF"/></right></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/** The workbook's six fixed ZIP entries use DEFLATE. No supplied names, formulas or relationships. */
function archive(parts: Record<string, string>) {
  const entries: Buffer[] = [], directory: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(parts)) {
    const filename = Buffer.from(name), data = Buffer.from(content), compressed = deflateRawSync(data);
    const checksum = crc32(data), local = Buffer.alloc(30), central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(33, 12); // 1980-01-01, the earliest valid DOS ZIP date.
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(filename.length, 26);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(33, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(offset, 42);
    entries.push(local, filename, compressed);
    directory.push(central, filename);
    offset += local.length + filename.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(directory), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(Object.keys(parts).length, 8);
  end.writeUInt16LE(Object.keys(parts).length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...entries, centralDirectory, end]);
}

export function renderTaskWorkbook(rows: readonly TaskExportRow[]) {
  return archive({
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
      <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
      <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
    </Types>`,
    "_rels/.rels": `<Relationships xmlns="${relationshipsNs}"><Relationship Id="rId1" Type="${officeRelationshipsNs}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<workbook xmlns="${spreadsheetNs}" xmlns:r="${officeRelationshipsNs}"><bookViews><workbookView/></bookViews><sheets><sheet name="Pendientes" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="${relationshipsNs}">
      <Relationship Id="rId1" Type="${officeRelationshipsNs}/worksheet" Target="worksheets/sheet1.xml"/>
      <Relationship Id="rId2" Type="${officeRelationshipsNs}/styles" Target="styles.xml"/>
    </Relationships>`,
    "xl/styles.xml": styles,
    "xl/worksheets/sheet1.xml": taskSheet(rows),
  });
}
