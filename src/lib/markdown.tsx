import type { ReactNode } from "react";

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(text: string, academic: boolean): ReactNode[] {
  const source = academic ? text : escapeHtml(text);
  const parts: ReactNode[] = [];
  const re = academic ? /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g : /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(source))) {
    if (match.index > last) {
      parts.push(source.slice(last, match.index));
    }
    const token = match[0];
    if (academic && token.startsWith("***")) {
      parts.push(<strong key={key++}><em>{token.slice(3, -3)}</em></strong>);
    } else if (token.startsWith("**")) {
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
  if (last < source.length) parts.push(source.slice(last));
  return parts;
}

/** Minimal Markdown to inert React text and semantic elements. */
export function MarkdownView({ content, variant = "wiki" }: { content: string; variant?: "wiki" | "academic" }) {
  const academic = variant === "academic";
  const renderInline = (text: string) => inlineMarkdown(text, academic);
  const quotePrefix = /^>[ \t]?/;
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
      const text = renderInline(heading[2]);
      const className =
        level === 1
          ? "mt-4 text-2xl font-semibold"
          : level === 2
            ? "mt-3 text-xl font-semibold"
            : "mt-2 text-lg font-semibold";
      const Heading = academic ? (["h3", "h4", "h5"] as const)[level - 1] : (["h2", "h3", "h4"] as const)[level - 1];
      blocks.push(<Heading key={key++} className={className}>{text}</Heading>);
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
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const first = academic ? /^\d{1,9}(?=\.)/.exec(line)?.[0] : undefined;
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ol key={key++} start={first === undefined ? undefined : Number(first)} className="my-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed">
          {items.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    if (academic && quotePrefix.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && quotePrefix.test(lines[i])) {
        quote.push(lines[i].replace(quotePrefix, ""));
        i += 1;
      }
      blocks.push(<blockquote key={key++}>{renderInline(quote.join("\n"))}</blockquote>);
      continue;
    }

    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith("```") &&
      !(academic && quotePrefix.test(lines[i])) &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={key++} className="my-2 text-sm leading-relaxed text-[var(--ink-soft)]/90">
        {renderInline(para.join(" "))}
      </p>
    );
  }

  if (blocks.length === 0) {
    return <p className="text-sm text-[var(--ink-soft)]/60">Sin contenido.</p>;
  }

  return <div className="markdown-body">{blocks}</div>;
}
