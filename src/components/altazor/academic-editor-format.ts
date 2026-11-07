export type AcademicFormat = "title" | "heading" | "bold" | "italic" | "quote" | "bullets" | "numbered";

type TextEdit = {
  start: number;
  end: number;
  text: string;
  selectionStart: number;
  selectionEnd: number;
};

const blockPrefix = /^(?:#{1,6}[ \t]+|>[ \t]*|[-*][ \t]+|\d+\.[ \t]+)/;
const blockFormats = {
  title: { matches: /^#\s+$/, prefix: () => "# " },
  heading: { matches: /^##\s+$/, prefix: () => "## " },
  quote: { matches: /^>\s*$/, prefix: () => "> " },
  bullets: { matches: /^[-*]\s+$/, prefix: () => "- " },
  numbered: { matches: /^\d+\.\s+$/, prefix: (number: number) => `${number}. ` },
};

function replacement(start: number, end: number, text: string, selectionStart: number, selectionEnd = selectionStart): TextEdit {
  return { start, end, text, selectionStart: start + selectionStart, selectionEnd: start + selectionEnd };
}

export function formatAcademicSelection(value: string, start: number, end: number, format: AcademicFormat): TextEdit {
  if (format === "bold" || format === "italic") {
    const flag = format === "bold" ? 2 : 1;
    const marker = "*".repeat(flag);
    const selection = value.slice(start, end);
    if (!selection.trim()) return replacement(start, start, marker + marker, marker.length);

    const left = /\*+$/.exec(value.slice(0, start))?.[0].length || 0;
    const right = /^\*+/.exec(value.slice(end))?.[0].length || 0;
    if (left > 0 && left <= 3 && left === right && !selection.includes("\n")) {
      const next = "*".repeat(left ^ flag);
      return replacement(start - left, end + right, next + selection + next, next.length, next.length + selection.length);
    }
    const text = selection.split("\n").map(line => {
      const content = line.trim();
      if (!content) return line;
      const leading = line.length - line.trimStart().length;
      const trailing = line.length - line.trimEnd().length;
      const leftMarks = /^\*+/.exec(content)?.[0].length || 0;
      const rightMarks = /\*+$/.exec(content)?.[0].length || 0;
      const existing = leftMarks <= 3 && leftMarks === rightMarks && content.length > leftMarks * 2 ? leftMarks : 0;
      const next = "*".repeat(existing ^ flag);
      return line.slice(0, leading) + next + content.slice(existing, content.length - existing) + next + line.slice(line.length - trailing);
    }).join("\n");
    return replacement(start, end, text, 0, text.length);
  }

  const first = start > 0 ? value.lastIndexOf("\n", start - 1) + 1 : 0;
  const lastLine = value.indexOf("\n", end > start && value[end - 1] === "\n" ? end - 1 : end);
  const last = lastLine === -1 ? value.length : lastLine;
  const lines = value.slice(first, last).split("\n");
  const prefixes = lines.map(line => blockPrefix.exec(line)?.[0] || "");
  const rule = blockFormats[format];
  const remove = lines.some(line => line.trim()) && lines.every((line, index) => !line.trim() || rule.matches.test(prefixes[index]));
  let number = 0;
  const text = lines.map((line, index) => {
    if (!line.trim() && lines.length > 1) return line;
    return (remove ? "" : rule.prefix(++number)) + line.slice(prefixes[index].length);
  }).join("\n");
  if (start !== end) return replacement(first, last, text, 0, text.length);
  const caret = (remove ? 0 : rule.prefix(1).length) + Math.max(0, start - first - prefixes[0].length);
  return replacement(first, last, text, caret);
}

export function insertAcademicCitation(value: string, end: number, source: number): TextEdit {
  const before = end > 0 && !/\s/.test(value[end - 1]) ? " " : "";
  const after = /^[\p{L}\p{N}\[]/u.test(value.slice(end)) ? " " : "";
  const text = `${before}[R${source}]${after}`;
  return replacement(end, end, text, text.length);
}
