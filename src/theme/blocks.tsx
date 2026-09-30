import type { CSSProperties } from "react";
import type {
  Block,
  ButtonBlock,
  ColumnsBlock,
  GalleryBlock,
  HeadingBlock,
  ImageBlock,
  QuoteBlock,
  TextBlock,
  VideoBlock,
} from "../blocks";
import { TextField } from "./fields";
import { videoPlaceholder, videoSource } from "./video";

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

function Empty({ children }: { children: string }) {
  return <div className="t-empty">{children}</div>;
}

function Image({ block, edit }: BlockProps<ImageBlock>) {
  if (!block.src) return edit ? <Empty>Noch kein Bild ausgewählt</Empty> : null;
  return (
    <figure className="t-image">
      <img src={block.src} alt={block.alt} loading="lazy" decoding="async" />
    </figure>
  );
}

function Gallery({ block, edit }: BlockProps<GalleryBlock>) {
  const images = block.images.filter((image) => image.src);
  if (images.length === 0) return edit ? <Empty>Noch keine Bilder in der Galerie</Empty> : null;
  return (
    <ul className="t-gallery">
      {images.map((image, i) => (
        <li key={i}>
          <img src={image.src} alt={image.alt} loading="lazy" decoding="async" />
        </li>
      ))}
    </ul>
  );
}

function Button({ block, edit }: BlockProps<ButtonBlock>) {
  const className = `t-button t-button-${block.variant}`;
  if (edit) {
    // In the editor the button must not navigate away, so its label is edited in place instead.
    return (
      <div className="t-buttons">
        <span className={className}>
          <TextField value={block.label} onChange={(label) => edit({ label })} placeholder="Beschriftung" />
        </span>
      </div>
    );
  }
  if (!block.label.trim() || !block.href) return null;
  const external = /^https?:\/\//i.test(block.href);
  return (
    <div className="t-buttons">
      <a className={className} href={block.href} {...(external ? { rel: "noopener" } : {})}>
        {block.label}
      </a>
    </div>
  );
}

function Columns({ block, edit }: BlockProps<ColumnsBlock>) {
  const change = (index: number, patch: Partial<ColumnsBlock["items"][number]>) =>
    edit?.({ items: block.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  return (
    <div className="t-columns" style={{ "--t-columns": block.items.length } as CSSProperties}>
      {block.items.map((item, i) => (
        <div key={i} className="t-column">
          {(edit || item.title) && (
            <h2 className="t-column-title">
              <TextField value={item.title} onChange={edit && ((title) => change(i, { title }))} placeholder="Titel" />
            </h2>
          )}
          <div className="t-text">
            <TextField value={item.text} onChange={edit && ((text) => change(i, { text }))} multiline placeholder="Text" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Video({ block, edit }: BlockProps<VideoBlock>) {
  const source = videoSource(block.url);
  if (!source) {
    if (!edit) return null;
    return <Empty>{block.url ? "Diese Adresse wird nicht unterstützt. Möglich sind YouTube, Vimeo und MP4-Dateien." : "Noch kein Video ausgewählt"}</Empty>;
  }
  if (source.kind === "file") {
    return (
      <figure className="t-video">
        <video src={source.src} controls preload="metadata" title={block.title || undefined} />
      </figure>
    );
  }
  return (
    <figure className="t-video">
      <iframe
        title={block.title || "Video"}
        srcDoc={videoPlaceholder(source, block.title)}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        loading="lazy"
      />
    </figure>
  );
}

function Quote({ block, edit }: BlockProps<QuoteBlock>) {
  if (!edit && !block.text.trim()) return null;
  return (
    <figure className="t-quote">
      <blockquote className="t-text">
        <TextField value={block.text} onChange={edit && ((text) => edit({ text }))} multiline placeholder="Zitat" />
      </blockquote>
      {(edit || block.cite) && (
        <figcaption>
          <TextField value={block.cite} onChange={edit && ((cite) => edit({ cite }))} placeholder="Wer hat das gesagt?" />
        </figcaption>
      )}
    </figure>
  );
}

export function BlockView({ block, edit }: BlockProps<Block>) {
  // Each case narrows the block; edit is typed loosely here and precisely in each component.
  const e = edit as never;
  switch (block.type) {
    case "heading":
      return <Heading block={block} edit={e} />;
    case "text":
      return <Text block={block} edit={e} />;
    case "image":
      return <Image block={block} edit={e} />;
    case "gallery":
      return <Gallery block={block} edit={e} />;
    case "button":
      return <Button block={block} edit={e} />;
    case "columns":
      return <Columns block={block} edit={e} />;
    case "video":
      return <Video block={block} edit={e} />;
    case "quote":
      return <Quote block={block} edit={e} />;
    case "divider":
      return <hr className="t-divider" />;
  }
}
