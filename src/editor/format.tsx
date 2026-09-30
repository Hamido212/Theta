import { useEffect, useState } from "react";
import { isSafeHref } from "../blocks";

// Formatting buttons for text that allows it (see TextField's rich mode). They act on the
// current selection; Ctrl/Cmd+B and +I work as usual, Ctrl/Cmd+K adds a link.

const richField = () => {
  const node = document.getSelection()?.anchorNode;
  const element = node instanceof Element ? node : node?.parentElement;
  return element?.closest<HTMLElement>("[data-rich]") ?? null;
};

function addLink() {
  const field = richField();
  if (!field) return;
  const href = window.prompt("Wohin soll der Link führen? Zum Beispiel /kontakt, https://… oder mailto:…", "https://")?.trim();
  if (!href) return;
  if (!isSafeHref(href)) {
    window.alert("Links müssen mit https://, http://, mailto:, tel: oder / beginnen.");
    return;
  }
  const selection = document.getSelection();
  // Without selected words, the address itself becomes the link text.
  if (selection?.isCollapsed) document.execCommand("insertHTML", false, `<a href="${href.replace(/"/g, "&quot;")}">${href.replace(/</g, "&lt;")}</a>`);
  else document.execCommand("createLink", false, href);
}

const actions = [
  { label: "F", title: "Fett (Strg+B)", run: () => document.execCommand("bold") },
  { label: "K", title: "Kursiv (Strg+I)", run: () => document.execCommand("italic") },
  { label: "Link", title: "Link (Strg+K)", run: addLink },
  { label: "• Liste", title: "Aufzählung", run: () => document.execCommand("insertUnorderedList") },
  { label: "1. Liste", title: "Nummerierte Liste", run: () => document.execCommand("insertOrderedList") },
];

export function FormatBar() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onSelection = () => setActive(richField() !== null);
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && richField()) {
        event.preventDefault();
        addLink();
      }
    };
    document.addEventListener("selectionchange", onSelection);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("selectionchange", onSelection);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="theta-format" role="toolbar" aria-label="Text formatieren">
      {actions.map((action) => (
        <button
          key={action.label}
          className="theta-button"
          title={action.title}
          disabled={!active}
          // Keep the text selection when clicking.
          onMouseDown={(event) => event.preventDefault()}
          onClick={action.run}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
