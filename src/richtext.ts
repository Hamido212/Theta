import { isSafeHref } from "./blocks";

// Formatted text is stored as a tiny, safe subset of Markdown:
//   **bold**, *italic*, [label](address), lines starting with "- " or "1. " for lists,
//   a blank line between paragraphs and a single line break inside one.
// A backslash keeps a character literal (\*). Nothing else is interpreted, so no HTML can get in.

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold" | "italic"; children: Inline[] }
  | { kind: "link"; href: string; children: Inline[] };

export type RichBlock = { kind: "paragraph"; lines: Inline[][] } | { kind: "bullets" | "numbers"; items: Inline[][] };

const INLINE = /\\([\\*[\]])|\*\*(.+?)\*\*|\*(.+?)\*|\[((?:\\.|[^\]\\])+)\]\(([^)\s]+)\)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const push = (node: Inline) => {
    const last = out.at(-1);
    if (node.kind === "text" && last?.kind === "text") last.text += node.text;
    else out.push(node);
  };
  let at = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > at) push({ kind: "text", text: text.slice(at, match.index) });
    const [whole, escaped, bold, italic, label, href] = match;
    if (escaped !== undefined) push({ kind: "text", text: escaped });
    else if (bold !== undefined) push({ kind: "bold", children: parseInline(bold) });
    else if (italic !== undefined) push({ kind: "italic", children: parseInline(italic) });
    // Links to unsafe addresses (javascript: and the like) stay plain text.
    else if (label !== undefined && isSafeHref(href!)) push({ kind: "link", href: href!, children: parseInline(label) });
    else push({ kind: "text", text: whole });
    at = match.index + whole.length;
  }
  if (at < text.length) push({ kind: "text", text: text.slice(at) });
  return out;
}

const BULLET = /^\s*[-•]\s+/;
const NUMBER = /^\s*\d+[.)]\s+/;

export function parseRich(text: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ kind: "paragraph", lines: paragraph.map(parseInline) });
    paragraph = [];
  };
  for (const line of text.split("\n")) {
    const list = BULLET.test(line) ? "bullets" : NUMBER.test(line) ? "numbers" : null;
    if (list) {
      flush();
      const item = parseInline(line.replace(list === "bullets" ? BULLET : NUMBER, ""));
      const last = blocks.at(-1);
      if (last?.kind === list) last.items.push(item);
      else blocks.push({ kind: list, items: [item] });
    } else if (line.trim() === "") {
      flush();
    } else {
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}

// The words without any formatting, e.g. for teasers and feeds.
export function plainText(text: string): string {
  const inline = (nodes: Inline[]): string => nodes.map((node) => (node.kind === "text" ? node.text : inline(node.children))).join("");
  return parseRich(text)
    .map((block) => (block.kind === "paragraph" ? block.lines : block.items).map(inline).join(" "))
    .join(" ");
}

export const escapeRich = (text: string) => text.replace(/[\\*[\]]/g, "\\$&");
