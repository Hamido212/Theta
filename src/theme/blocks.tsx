import type { Block, HeadingBlock, ImageBlock, TextBlock } from "../blocks";
import { TextField } from "./fields";

// The default theme. Every block component renders on the server (edit is undefined)
// and inside the editor (edit updates the block), so both views look identical.

export type BlockProps<B extends Block> = {
  block: B;
  edit?: (patch: Partial<Omit<B, "id" | "type">>) => void;
};

function Heading({ block, edit }: BlockProps<HeadingBlock>) {
  return (
    <h1 className="t-heading">
      <TextField value={block.text} onChange={edit && ((text) => edit({ text }))} placeholder="Überschrift" />
    </h1>
  );
}

function Text({ block, edit }: BlockProps<TextBlock>) {
  return (
    <div className="t-text">
      <TextField
        value={block.text}
        onChange={edit && ((text) => edit({ text }))}
        multiline
        placeholder="Schreib etwas …"
      />
    </div>
  );
}

function Image({ block, edit }: BlockProps<ImageBlock>) {
  if (!block.src) {
    return edit ? <div className="t-image t-image-empty">Noch kein Bild ausgewählt</div> : null;
  }
  return (
    <figure className="t-image">
      <img src={block.src} alt={block.alt} loading="lazy" decoding="async" />
    </figure>
  );
}

export function BlockView({ block, edit }: BlockProps<Block>) {
  switch (block.type) {
    case "heading":
      return <Heading block={block} edit={edit} />;
    case "text":
      return <Text block={block} edit={edit} />;
    case "image":
      return <Image block={block} edit={edit} />;
  }
}
