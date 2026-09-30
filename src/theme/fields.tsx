import { Fragment, type ReactNode, type Ref, useLayoutEffect, useRef } from "react";
import { type Inline, escapeRich, parseInline, parseRich } from "../richtext";

// Theme components render text through <TextField>. On the public site it is plain
// HTML; in the editor (when onChange is given) the same spot becomes editable in place.

type TextFieldProps = {
  value: string;
  onChange?: (value: string) => void;
  multiline?: boolean;
  // Allows bold, italic, links and lists (see src/richtext.ts). Implies multiline.
  rich?: boolean;
  placeholder?: string;
};

export function TextField({ value, onChange, multiline = false, rich = false, placeholder }: TextFieldProps) {
  if (onChange) {
    if (rich) return <RichEditable value={value} onChange={onChange} placeholder={placeholder} />;
    return <EditableText value={value} onChange={onChange} multiline={multiline} placeholder={placeholder} />;
  }
  if (rich) return <RichText value={value} />;
  if (!multiline) return <>{value}</>;
  return <>{paragraphs(value).map((lines, i) => <p key={i}>{withLineBreaks(lines)}</p>)}</>;
}

// Blank lines separate paragraphs, single line breaks stay line breaks.
export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

function withLineBreaks(text: string) {
  return text.split("\n").map((line, i) => (
    <span key={i}>
      {i > 0 && <br />}
      {line}
    </span>
  ));
}

type EditableTextProps = Required<Omit<TextFieldProps, "placeholder" | "rich">> & { placeholder?: string };

function EditableText({ value, onChange, multiline, placeholder }: EditableTextProps) {
  const ref = useRef<HTMLElement>(null);

  // The element is uncontrolled while typing; only sync when the value changed from outside.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.innerText !== value) el.innerText = value;
  }, [value]);

  // A <span> stays valid inside headings; multiline text needs a block element.
  const Tag = multiline ? "div" : "span";
  return (
    <Tag
      ref={ref as Ref<HTMLDivElement & HTMLSpanElement>}
      className={multiline ? "theta-editable theta-editable-multiline" : "theta-editable"}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      aria-multiline={multiline}
      data-placeholder={placeholder}
      onInput={(event) => onChange(event.currentTarget.innerText)}
      onKeyDown={(event) => {
        if (!multiline && event.key === "Enter") event.preventDefault();
      }}
    />
  );
}

function InlineView({ nodes }: { nodes: Inline[] }): ReactNode {
  return nodes.map((node, i) => {
    switch (node.kind) {
      case "text":
        return <Fragment key={i}>{node.text}</Fragment>;
      case "bold":
        return <strong key={i}><InlineView nodes={node.children} /></strong>;
      case "italic":
        return <em key={i}><InlineView nodes={node.children} /></em>;
      case "link": {
        const external = /^https?:\/\//i.test(node.href);
        return (
          <a key={i} href={node.href} {...(external ? { rel: "noopener" } : {})}>
            <InlineView nodes={node.children} />
          </a>
        );
      }
    }
  });
}

// Formatted text on the public site: paragraphs, line breaks and lists.
export function RichText({ value }: { value: string }) {
  return (
    <>
      {parseRich(value).map((block, i) => {
        if (block.kind === "paragraph") {
          return (
            <p key={i}>
              {block.lines.map((line, j) => (
                <span key={j}>
                  {j > 0 && <br />}
                  <InlineView nodes={line} />
                </span>
              ))}
            </p>
          );
        }
        const List = block.kind === "bullets" ? "ul" : "ol";
        return (
          <List key={i}>
            {block.items.map((item, j) => (
              <li key={j}>
                <InlineView nodes={item} />
              </li>
            ))}
          </List>
        );
      })}
    </>
  );
}

// The editor keeps formatted text as simple HTML while typing and turns it back into
// the stored format on every change. Only the few tags below survive.

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inlineHtml(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      if (node.kind === "text") return escapeHtml(node.text);
      const inner = inlineHtml(node.children);
      if (node.kind === "link") return `<a href="${escapeHtml(node.href)}">${inner}</a>`;
      return node.kind === "bold" ? `<b>${inner}</b>` : `<i>${inner}</i>`;
    })
    .join("");
}

export function richToHtml(value: string): string {
  const lines = value.split("\n");
  let html = "";
  let list: "ul" | "ol" | null = null;
  for (const line of lines) {
    const bullet = /^\s*[-•]\s+/.exec(line);
    const number = /^\s*\d+[.)]\s+/.exec(line);
    const kind = bullet ? "ul" : number ? "ol" : null;
    if (list && kind !== list) html += `</${list}>`;
    if (kind && kind !== list) html += `<${kind}>`;
    list = kind;
    if (kind) html += `<li>${inlineHtml(parseInline(line.slice((bullet ?? number)![0].length)))}</li>`;
    else html += line.trim() === "" ? "<div><br></div>" : `<div>${inlineHtml(parseInline(line))}</div>`;
  }
  if (list) html += `</${list}>`;
  return html;
}

const BLOCK_TAGS = new Set(["DIV", "P", "LI", "UL", "OL", "H1", "H2", "H3", "BLOCKQUOTE"]);

export function htmlToRich(root: Node): string {
  let out = "";
  const newline = () => {
    if (out !== "" && !out.endsWith("\n")) out += "\n";
  };
  const walk = (node: Node, numbering: { n: number } | null) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += escapeRich((node.textContent ?? "").replace(/\u00a0/g, " ").replace(/\n/g, " "));
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName;
    const children = (list: { n: number } | null = numbering) => node.childNodes.forEach((child) => walk(child, list));
    if (tag === "BR") {
      out += "\n";
    } else if (tag === "B" || tag === "STRONG") {
      const inner = collect(node);
      if (inner.trim()) out += `**${inner}**`;
    } else if (tag === "I" || tag === "EM") {
      const inner = collect(node);
      if (inner.trim()) out += `*${inner}*`;
    } else if (tag === "A") {
      const inner = collect(node);
      const href = node.getAttribute("href") ?? "";
      out += inner.trim() && href ? `[${inner}](${href.replace(/[\s)]/g, encodeURIComponent)})` : inner;
    } else if (tag === "UL" || tag === "OL") {
      newline();
      children(tag === "OL" ? { n: 0 } : null);
      newline();
    } else if (tag === "LI") {
      newline();
      out += numbering ? `${++numbering.n}. ` : "- ";
      children(null);
      newline();
    } else if (BLOCK_TAGS.has(tag)) {
      newline();
      children();
      newline();
    } else {
      children();
    }
  };
  // Inline formatting is serialised on its own so empty marks can be dropped.
  const collect = (node: Node) => {
    const saved = out;
    out = "";
    node.childNodes.forEach((child) => walk(child, null));
    const inner = out;
    out = saved;
    return inner;
  };
  root.childNodes.forEach((child) => walk(child, null));
  return out
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function RichEditable({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  // Uncontrolled while typing; only rebuilt when the value changed from outside (e.g. undo via history).
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && htmlToRich(el) !== value) el.innerHTML = richToHtml(value);
  }, [value]);

  return (
    <div
      ref={ref}
      className="theta-editable theta-editable-rich"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline
      data-placeholder={placeholder}
      data-rich
      onInput={(event) => onChange(htmlToRich(event.currentTarget))}
      onPaste={(event) => {
        // Pasted text arrives without foreign formatting.
        event.preventDefault();
        document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
      }}
    />
  );
}
