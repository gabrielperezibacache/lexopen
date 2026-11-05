import assert from "node:assert/strict";
import { readBookZip } from "@/lib/books/formats";
import { renderTaskWorkbook, TASK_EXPORT_LIMIT, type TaskExportRow } from "./export-xlsx";

const row: TaskExportRow = {
  title: '=HYPERLINK("https://example.invalid","No ejecutar")', status: "todo", priority: "urgent",
  cause: "C-1-2099 · Gestión & análisis", assignee: "José Pérez", dueDate: new Date("2099-05-03T01:30:00.000Z"),
  description: "Línea 1\r\nLínea 2 <dato>", instructions: "+SUM(2,3)", considerations: "@SUM(2,3)",
};
const workbook = readBookZip(renderTaskWorkbook([row]));
assert.equal(workbook.size, 6);
const sheet = workbook.get("xl/worksheets/sheet1.xml")!.toString();
assert.match(sheet, /<autoFilter ref="A1:I2"\/>/);
assert.match(sheet, /topLeftCell="B2"/);
assert.match(sheet, /<c r="A2" s="2" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK\(/);
assert.match(sheet, /<c r="H2" s="2" t="inlineStr"><is><t xml:space="preserve">\+SUM\(2,3\)/);
assert.match(sheet, /<c r="I2" s="2" t="inlineStr"><is><t xml:space="preserve">@SUM\(2,3\)/);
assert.match(sheet, /Gestión &amp; análisis/);
assert.match(sheet, /Línea 1&#13;\nLínea 2 &lt;dato&gt;/);
assert.doesNotMatch(sheet, /<f\b|<hyperlinks?\b/);
assert.doesNotMatch(workbook.get("xl/_rels/workbook.xml.rels")!.toString(), /TargetMode="External"/);
const maySecond = (Date.UTC(2099, 4, 2) - Date.UTC(1899, 11, 30)) / 86_400_000;
assert.ok(sheet.includes(`<c r="F2" s="3"><v>${maySecond}</v></c>`), "An instant near UTC midnight keeps the same civil day as the task view");
const empty = readBookZip(renderTaskWorkbook([])).get("xl/worksheets/sheet1.xml")!.toString();
assert.match(empty, /<dimension ref="A1:I1"\/>/);
const status = (expected: number) => (error: unknown) => (error as { status?: number }).status === expected;
assert.throws(() => renderTaskWorkbook(Array(TASK_EXPORT_LIMIT + 1).fill(row)), status(413));
assert.throws(() => renderTaskWorkbook([{ ...row, instructions: "x".repeat(32_768) }]), status(413));
assert.throws(() => renderTaskWorkbook(Array(100).fill({ ...row, instructions: "<".repeat(32_000) })), status(413));
console.log("Task XLSX passed: XML/ZIP, literal text, sortable Chilean civil dates, filters and export limits.");
