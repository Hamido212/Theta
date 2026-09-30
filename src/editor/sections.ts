import type { Block } from "../blocks";

// Existing flat documents stay compatible. A section is manipulated as one range.
export function blockRange(blocks: Block[], at: number): [number, number] {
  if (blocks[at]?.type !== "section") return [at, at + 1];
  const end = blocks.findIndex((block, i) => i > at && block.type === "section");
  return [at, end < 0 ? blocks.length : end];
}

export function moveBlocks(blocks: Block[], from: number, to: number): Block[] {
  if (!blocks[from] || to < 0 || to > blocks.length) return blocks;
  const [start, end] = blockRange(blocks, from);
  // Sections land at section boundaries, never around a fragment of another section.
  if (blocks[from]?.type === "section" && to < blocks.length) {
    const boundary = blocks.findIndex((block, i) => i >= to && block.type === "section");
    to = boundary < 0 ? blocks.length : boundary;
  }
  if (to >= start && to <= end) return blocks;
  const rest = [...blocks.slice(0, start), ...blocks.slice(end)];
  const target = to > end ? to - (end - start) : to;
  return [...rest.slice(0, target), ...blocks.slice(start, end), ...rest.slice(target)];
}

export function stepBlocks(blocks: Block[], at: number, delta: -1 | 1): Block[] {
  if (blocks[at]?.type !== "section") return moveBlocks(blocks, at, delta === -1 ? at - 1 : at + 2);
  const sections = blocks.flatMap((block, i) => block.type === "section" ? [i] : []);
  const index = sections.indexOf(at);
  if (delta === -1) return index > 0 ? moveBlocks(blocks, at, sections[index - 1]!) : blocks;
  return index < sections.length - 1 ? moveBlocks(blocks, at, sections[index + 2] ?? blocks.length) : blocks;
}

export function copyBlocks(blocks: Block[]): Block[] {
  return structuredClone(blocks).map((block) => ({ ...block, id: crypto.randomUUID() }));
}

export function duplicateBlocks(blocks: Block[], at: number): Block[] {
  if (!blocks[at]) return blocks;
  const [start, end] = blockRange(blocks, at);
  return [...blocks.slice(0, end), ...copyBlocks(blocks.slice(start, end)), ...blocks.slice(end)];
}

export function removeBlocks(blocks: Block[], at: number): Block[] {
  if (!blocks[at]) return blocks;
  const [start, end] = blockRange(blocks, at);
  return [...blocks.slice(0, start), ...blocks.slice(end)];
}
