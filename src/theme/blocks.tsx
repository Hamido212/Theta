import { type CSSProperties, Fragment, type ReactNode } from "react";
import type {
  Block,
  ButtonBlock,
  ColumnsBlock,
  GalleryBlock,
  HeadingBlock,
  HeroBlock,
  ImageBlock,
  QuoteBlock,
  SectionBlock,
  TextBlock,
  VideoBlock,
} from "../blocks";
import { sectionBackgrounds } from "../blocks";
import { TextField } from "./fields";
import { Img } from "./image";
import { videoPlaceholder, videoSource } from "./video";

// The default theme. Every block component renders on the server (edit is undefined)
// and inside the editor (edit updates the block), so both views look identical.

export type BlockProps<B extends Block> = {
  block: B;
  edit?: (patch: Partial<Omit<B, "id" | "type">>) => void;
};

function Heading({ block, edit }: BlockProps<HeadingBlock>) {
  const Tag = `h${block.level}` as const;
  return (
    <Tag className={`t-heading t-heading-${block.level}`}>
      <TextField value={block.text} onChange={edit && ((text) => edit({ text }))} placeholder="Überschrift" />
    </Tag>
  );
}

function Text({ block, edit }: BlockProps<TextBlock>) {
  return (
    <div className="t-text">
      <TextField
        value={block.text}
        onChange={edit && ((text) => edit({ text }))}
        rich
        placeholder="Schreib etwas …"
      />
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return <div className="t-empty">{children}</div>;
}

const imageSizes = {
  normal: "(min-width: 44rem) 42rem, 100vw",
  wide: "(min-width: 74rem) 72rem, 100vw",
  full: "100vw",
};

function Image({ block, edit }: BlockProps<ImageBlock>) {
  if (!block.src) return edit ? <Empty>Noch kein Bild ausgewählt</Empty> : null;
  return (
    <figure className={`t-image t-width-${block.width}`}>
      <Img src={block.src} alt={block.alt} sizes={imageSizes[block.width]} />
      {(edit || block.caption.trim()) && (
        <figcaption>
          <TextField value={block.caption} onChange={edit && ((caption) => edit({ caption }))} placeholder="Bildunterschrift (optional)" />
        </figcaption>
      )}
    </figure>
  );
}

function Gallery({ block, edit }: BlockProps<GalleryBlock>) {
  const images = block.images.filter((image) => image.src);
  if (images.length === 0) return edit ? <Empty>Noch keine Bilder in der Galerie</Empty> : null;
  return (
    <ul className={block.crop ? "t-gallery t-gallery-crop" : "t-gallery"} style={{ "--t-gallery-columns": block.columns } as CSSProperties}>
      {images.map((image, i) => (
        <li key={i}>
          <Img src={image.src} alt={image.alt} sizes={`(min-width: 44rem) ${Math.ceil(42 / block.columns)}rem, ${Math.ceil(100 / Math.min(block.columns, 2))}vw`} />
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
    <div className={`t-columns t-columns-${block.style}`} style={{ "--t-columns": block.items.length } as CSSProperties}>
      {block.items.map((item, i) => (
        <div key={i} className="t-column">
          {block.style === "cards" && item.src && <Img src={item.src} alt={item.alt} sizes="(min-width: 44rem) 20rem, 100vw" />}
          {(edit || item.title) && (
            <h3 className="t-column-title">
              <TextField value={item.title} onChange={edit && ((title) => change(i, { title }))} placeholder="Titel" />
            </h3>
          )}
          <div className="t-text">
            <TextField value={item.text} onChange={edit && ((text) => change(i, { text }))} rich placeholder="Text" />
          </div>
          {item.href &&
            (edit || item.linkLabel.trim()) &&
            (edit ? (
              <span className="t-column-link">
                <TextField value={item.linkLabel} onChange={(linkLabel) => change(i, { linkLabel })} placeholder="Linktext, z. B. Mehr erfahren" />
              </span>
            ) : (
              <a className="t-column-link" href={item.href}>
                {item.linkLabel}
              </a>
            ))}
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

function Hero({ block, edit }: BlockProps<HeroBlock>) {
  const changeButton = (index: number, label: string) =>
    edit?.({ buttons: block.buttons.map((button, i) => (i === index ? { ...button, label } : button)) });
  const buttons = edit ? block.buttons : block.buttons.filter((button) => button.label.trim() && button.href);
  return (
    <div className={block.src ? "t-hero t-hero-image" : "t-hero t-band-accent"}>
      {block.src && <Img src={block.src} alt={block.alt} sizes="100vw" eager />}
      <div className="t-hero-content">
        <h1 className="t-hero-title">
          <TextField value={block.title} onChange={edit && ((title) => edit({ title }))} placeholder="Titel der Seite" />
        </h1>
        {(edit || block.text.trim()) && (
          <div className="t-hero-text">
            <TextField value={block.text} onChange={edit && ((text) => edit({ text }))} multiline placeholder="Ein Satz, der neugierig macht" />
          </div>
        )}
        {buttons.length > 0 && (
          <div className="t-button-row">
            {buttons.map((button, i) => {
              const className = `t-button t-button-${i === 0 ? "primary" : "secondary"}`;
              return edit ? (
                <span key={i} className={className}>
                  <TextField value={button.label} onChange={(label) => changeButton(i, label)} placeholder="Beschriftung" />
                </span>
              ) : (
                <a key={i} className={className} href={button.href}>
                  {button.label}
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// In the editor a section shows where a new band starts; on the site it is the band itself.
function Section({ block, edit }: BlockProps<SectionBlock>) {
  return edit ? <div className="t-section-marker">Neuer Abschnitt · {sectionBackgrounds[block.background]}</div> : null;
}

type FlowProps = { blocks: Block[]; children: (block: Block, index: number) => ReactNode };

// Renders a page's blocks in order. A section block starts a full-width band that holds
// everything up to the next section. Buttons that follow each other share one row,
// so "Book now" and "Menu" sit side by side instead of stacking.
export function BlockFlow({ blocks, children }: FlowProps) {
  const bands: { start: number; blocks: Block[] }[] = [{ start: 0, blocks: [] }];
  blocks.forEach((block, index) => {
    if (block.type === "section") bands.push({ start: index, blocks: [block] });
    else bands.at(-1)!.blocks.push(block);
  });
  return (
    <>
      {bands.map(({ start, blocks: band }) => {
        const first = band[0];
        if (first?.type !== "section") return <Runs key="start" blocks={band} start={start} children={children} />;
        return (
          <div key={first.id} className={`t-band t-band-${first.background}`}>
            <Runs blocks={band} start={start} children={children} />
          </div>
        );
      })}
    </>
  );
}

function Runs({ blocks, start, children }: FlowProps & { start: number }) {
  const runs: { start: number; blocks: Block[] }[] = [];
  blocks.forEach((block, i) => {
    const last = runs.at(-1);
    if (block.type === "button" && last?.blocks[0]?.type === "button") last.blocks.push(block);
    else runs.push({ start: start + i, blocks: [block] });
  });
  return (
    <>
      {runs.map(({ start: at, blocks: run }) =>
        run.length > 1 ? (
          <div key={run[0]!.id} className="t-button-row">
            {run.map((block, i) => children(block, at + i))}
          </div>
        ) : (
          <Fragment key={run[0]!.id}>{children(run[0]!, at)}</Fragment>
        ),
      )}
    </>
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
    case "section":
      return <Section block={block} edit={e} />;
    case "hero":
      return <Hero block={block} edit={e} />;
  }
}
