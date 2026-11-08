import { Fragment, type ReactNode } from "react";
import "./AltazorMessageContent.css";

function safeLink(value: string) {
  const href = value.trim();
  if (!href || /[\u0000-\u001f\u007f\\]/.test(href) || href.startsWith("//")) return null;
  if (href.startsWith("/") || href.startsWith("#")) return { href, external: false };
  try {
    const url = new URL(href);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    return { href: url.href, external: true };
  } catch { return null; }
}

function inline(text: string, depth = 0): ReactNode {
  if (depth > 3) return text;
  const tokens = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*|\[[^\]\n]+\]\([^\)\n]+\))/g;
  const nodes: ReactNode[] = [];
  let offset = 0;
  for (const match of text.matchAll(tokens)) {
    const at = match.index!, token = match[0];
    if (at > offset) nodes.push(text.slice(offset, at));
    if (token.startsWith("`")) nodes.push(<code key={at}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("**")) nodes.push(<strong key={at}>{inline(token.slice(2, -2), depth + 1)}</strong>);
    else if (token.startsWith("*")) nodes.push(<em key={at}>{inline(token.slice(1, -1), depth + 1)}</em>);
    else {
      const link = /^\[([^\]]+)\]\((.+)\)$/.exec(token)!, target = safeLink(link[2]);
      nodes.push(target ? <a key={at} href={target.href} {...(target.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{inline(link[1], depth + 1)}</a> : <Fragment key={at}>{token}</Fragment>);
    }
    offset = at + token.length;
  }
  if (offset < text.length) nodes.push(text.slice(offset));
  return nodes;
}
const tableCells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
const tableRule = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

/** Markdown stays React text: no HTML execution, embedded media or unsafe link protocols. */
export function AltazorMessageContent({ text, plain = false }: { text: string; plain?: boolean }) {
  if (plain) return <div className="altazor-message-content altazor-message-plain">{text}</div>;
  const lines = text.replace(/\r\n?/g, "\n").split("\n"), blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^\s*```/.test(line)) {
      const code: string[] = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push(<pre key={i} tabIndex={0} aria-label="Bloque de texto"><code>{code.join("\n")}</code></pre>); continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) { blocks.push(<p key={i++} className="altazor-message-heading"><strong>{inline(heading[2])}</strong></p>); continue; }
    if (i + 1 < lines.length && line.includes("|") && tableRule(lines[i + 1])) {
      const header = tableCells(line), rows: string[][] = []; i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) rows.push(tableCells(lines[i++]));
      blocks.push(<div key={i} className="altazor-message-table" tabIndex={0} role="region" aria-label="Tabla con desplazamiento"><table><thead><tr>{header.map((cell, index) => <th key={index}>{inline(cell)}</th>)}</tr></thead><tbody>{rows.map((cells, row) => <tr key={row}>{header.map((_, column) => <td key={column}>{inline(cells[column] || "")}</td>)}</tr>)}</tbody></table></div>); continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quotes: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) quotes.push(lines[i++].replace(/^\s*>\s?/, ""));
      blocks.push(<blockquote key={i}>{inline(quotes.join("\n"))}</blockquote>); continue;
    }
    const list = /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.exec(line);
    if (list) {
      const ordered = /^\s*\d/.test(line), items: string[] = [];
      const pattern = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
      while (i < lines.length && pattern.test(lines[i])) items.push(lines[i++].replace(pattern, ""));
      const children = items.map((item, index) => <li key={index}>{inline(item)}</li>);
      blocks.push(ordered ? <ol key={i}>{children}</ol> : <ul key={i}>{children}</ul>); continue;
    }
    const paragraph = [line]; i++;
    while (i < lines.length && lines[i].trim() && !/^(?:\s*```|#{1,4}\s|\s*>|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[i]) && !(i + 1 < lines.length && tableRule(lines[i + 1]))) paragraph.push(lines[i++]);
    blocks.push(<p key={i}>{inline(paragraph.join("\n"))}</p>);
  }
  return <div className="altazor-message-content">{blocks}</div>;
}
