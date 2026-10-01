import { type KeyboardEvent, type MouseEvent, useEffect, useRef } from "react";
import { type Block, blockLabels, sectionBackgrounds } from "../blocks";
import { plainText } from "../richtext";
import type { SharedSectionData } from "../shared-sections";
import { isSectionBoundary } from "./sections";

// The page as a tree: each section with the blocks inside it. A row selects its block;
// right-click (or the context-menu key) opens the actions for it.

export type BlockAction = "copy" | "paste" | "duplicate" | "hide" | "up" | "down" | "remove";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "⌘" : "Strg+";
const alt = isMac ? "⌥" : "Alt+";

export const shortcuts: Record<BlockAction, string> = {
  copy: `${mod}C`,
  paste: `${mod}V`,
  duplicate: `${mod}D`,
  hide: `${alt}H`,
  up: `${alt}↑`,
  down: `${alt}↓`,
  remove: "Entf",
};

const short = (text: string, max = 36) => {
  const clean = plainText(text).replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

// A few words that tell blocks of the same kind apart.
function snippet(block: Block): string {
  switch (block.type) {
    case "heading":
    case "text":
    case "quote":
      return short(block.text);
    case "hero":
      return short(block.title);
    case "image":
      return short(block.alt || block.caption);
    case "button":
      return short(block.label);
    case "columns":
      return short(block.heading ?? block.items[0]?.title ?? "");
    case "map":
      return short(block.label);
    case "video":
      return short(block.title);
    default:
      return "";
  }
}

export function rowLabel(block: Block, blocks: Block[], shared: SharedSectionData[]): string {
  if (block.type === "shared") return `Gemeinsam: ${shared.find((item) => item.page.slug === block.sectionId)?.page.title ?? "Nicht verfügbar"}`;
  if (block.type === "section") {
    const number = blocks.slice(0, blocks.indexOf(block) + 1).filter((item) => item.type === "section").length;
    return `Abschnitt ${number} · ${sectionBackgrounds[block.background]}`;
  }
  const words = snippet(block);
  return words ? `${blockLabels[block.type]}: ${words}` : blockLabels[block.type];
}

type TreeProps = {
  blocks: Block[];
  shared: SharedSectionData[];
  selected: string | null;
  hiddenIds: Set<string>;
  onSelect: (id: string) => void;
  onMenu: (id: string, x: number, y: number) => void;
};

export function StructureTree({ blocks, shared, selected, hiddenIds, onSelect, onMenu }: TreeProps) {
  const list = useRef<HTMLUListElement>(null);
  const groups: { head?: Block; children: Block[] }[] = [{ children: [] }];
  for (const block of blocks) {
    if (isSectionBoundary(block)) groups.push({ head: block, children: [] });
    else groups.at(-1)!.children.push(block);
  }
  const rows = () => [...(list.current?.querySelectorAll<HTMLButtonElement>("button[data-block]") ?? [])];
  // Arrow keys walk through the rows like a list of files.
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.altKey || event.metaKey || event.ctrlKey || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
    const all = rows();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    const next = all[Math.min(all.length - 1, Math.max(0, at + (event.key === "ArrowDown" ? 1 : -1)))];
    if (!next) return;
    event.preventDefault();
    next.focus();
    onSelect(next.dataset.block!);
  };
  const row = (block: Block, child: boolean) => {
    const open = (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      onSelect(block.id);
      // The context-menu key reports no mouse position; open the menu next to the row.
      const box = event.currentTarget.getBoundingClientRect();
      onMenu(block.id, event.clientX || box.left + 24, event.clientY || box.bottom);
    };
    const hidden = hiddenIds.has(block.id);
    return (
      <button
        type="button"
        data-block={block.id}
        className={["theta-tree-row", child && "theta-tree-child", selected === block.id && "theta-nav-selected", hidden && "theta-tree-hidden"].filter(Boolean).join(" ")}
        aria-current={selected === block.id ? "true" : undefined}
        onClick={() => onSelect(block.id)}
        onContextMenu={open}
      >
        <span>{rowLabel(block, blocks, shared)}</span>
        {block.hidden && <small>ausgeblendet</small>}
      </button>
    );
  };
  return (
    <ul className="theta-tree" ref={list} onKeyDown={onKeyDown} aria-label="Seitenaufbau">
      {groups.map((group, i) => (group.head || group.children.length > 0) && (
        <li key={group.head?.id ?? `start-${i}`}>
          {group.head ? row(group.head, false) : <span className="theta-tree-head">Seitenanfang</span>}
          {group.children.length > 0 && <ul>{group.children.map((block) => <li key={block.id}>{row(block, true)}</li>)}</ul>}
        </li>
      ))}
    </ul>
  );
}

type MenuProps = {
  x: number;
  y: number;
  block: Block;
  canMove: { up: boolean; down: boolean };
  locked: boolean;
  onAction: (action: BlockAction) => void;
  onClose: () => void;
};

export function BlockMenu({ x, y, block, canMove, locked, onAction, onClose }: MenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const away = (event: Event) => { if (!menu.current?.contains(event.target as Node)) onClose(); };
    window.addEventListener("pointerdown", away);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);
  const section = block.type === "section";
  const items: [BlockAction, string, boolean][] = [
    ["copy", section ? "Abschnitt kopieren" : "Kopieren", locked],
    ["paste", "Darunter einfügen", false],
    ["duplicate", "Verdoppeln", locked],
    ["hide", block.hidden ? "Wieder einblenden" : "Ausblenden", locked],
    ["up", "Nach oben", locked || !canMove.up],
    ["down", "Nach unten", locked || !canMove.down],
    ["remove", section ? "Abschnitt mit Inhalt löschen" : "Löschen", locked],
  ];
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); onClose(); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = [...menu.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(at + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
  };
  // Stay inside the window.
  const left = Math.min(x, window.innerWidth - 250);
  const top = Math.min(y, window.innerHeight - 320);
  return (
    <div ref={menu} className="theta-menu" role="menu" aria-label={`Aktionen für ${blockLabels[block.type]}`} style={{ left: Math.max(8, left), top: Math.max(8, top) }} onKeyDown={onKeyDown}>
      {items.map(([action, label, disabled]) => (
        <button key={action} type="button" role="menuitem" disabled={disabled} className={action === "remove" ? "theta-menu-danger" : undefined} onClick={() => { onClose(); onAction(action); }}>
          <span>{label}</span><kbd>{shortcuts[action]}</kbd>
        </button>
      ))}
    </div>
  );
}
