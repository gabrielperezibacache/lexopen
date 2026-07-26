import { Fragment, type ReactNode } from "react";

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(text: string): ReactNode[] {
  const escaped = escapeHtml(text);
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(escaped))) {
    if (match.index > last) {
      parts.push(escaped.slice(last, match.index));
    }
    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      parts.push(
        <code key={key++} className="rounded bg-black/5 px-1 py-0.5 text-[0.9em]">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("*")) {
      parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }
  if (last < escaped.length) parts.push(escaped.slice(last));
  return parts;
}

/** Minimal Markdown → React for wiki pages (headings, lists, code, paragraphs). */
export function MarkdownView({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(
        <pre
          key={key++}
          className="my-3 overflow-auto rounded-xl bg-[var(--ink)]/95 p-4 text-xs text-white/90"
        >
          <code>{code.join("\n")}</code>
        </pre>
      );
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = inlineMarkdown(heading[2]);
      const className =
        level === 1
          ? "mt-4 text-2xl font-semibold"
          : level === 2
            ? "mt-3 text-xl font-semibold"
            : "mt-2 text-lg font-semibold";
      blocks.push(
        <Fragment key={key++}>
          {level === 1 ? (
            <h2 className={className}>{text}</h2>
          ) : level === 2 ? (
            <h3 className={className}>{text}</h3>
          ) : (
            <h4 className={className}>{text}</h4>
          )}
        </Fragment>
      );
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ul key={key++} className="my-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
          {items.map((item, idx) => (
            <li key={idx}>{inlineMarkdown(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ol key={key++} className="my-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
          {items.map((item, idx) => (
            <li key={idx}>{inlineMarkdown(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith("```") &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={key++} className="my-2 text-sm leading-relaxed text-[var(--ink-soft)]/90">
        {inlineMarkdown(para.join(" "))}
      </p>
    );
  }

  if (blocks.length === 0) {
    return <p className="text-sm text-[var(--ink-soft)]/60">Sin contenido.</p>;
  }

  return <div className="markdown-body">{blocks}</div>;
}
