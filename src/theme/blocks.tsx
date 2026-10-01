import { type CSSProperties, Fragment, type ReactNode } from "react";
import type {
  Block,
  ButtonBlock,
  ColumnsBlock,
  FaqBlock,
  GalleryBlock,
  HeadingBlock,
  HeroBlock,
  HoursBlock,
  ImageBlock,
  PricesBlock,
  QuoteBlock,
  SectionBlock,
  TeamBlock,
  TextBlock,
  VideoBlock,
} from "../blocks";
import { sectionBackgrounds } from "../blocks";
import { TextField } from "./fields";
import { Img } from "./image";
import { videoPlaceholder, videoSource } from "./video";
import { SocialIcon } from "./icons";
import { ContactForm } from "./form";

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
      <Img src={block.src} alt={block.alt} focal={block.focal} sizes={imageSizes[block.width]} />
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
          <Img src={image.src} alt={image.alt} focal={image.focal} sizes={`(min-width: 44rem) ${Math.ceil(42 / block.columns)}rem, ${Math.ceil(100 / Math.min(block.columns, 2))}vw`} />
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
  if (block.style === "list" || block.style === "timeline") {
    const Title = block.heading ? "h3" : "h2";
    return <div className={`t-list t-list-${block.style}`}>
      {(block.heading || (edit && block.heading !== undefined)) && <div className="t-list-heading">
        <h2><TextField value={block.heading ?? ""} onChange={edit && ((heading) => edit({ heading }))} placeholder="Überschrift" /></h2>
        {block.href && block.linkLabel && (edit
          ? <span className="t-list-all"><TextField value={block.linkLabel} onChange={(linkLabel) => edit({ linkLabel })} /></span>
          : <a className="t-list-all" href={block.href}>{block.linkLabel}</a>)}
      </div>}
      <div className="t-list-items">{block.items.map((item, i) => <div key={i} className="t-list-item">
        {(item.meta || edit) && <p className="t-list-meta"><TextField value={item.meta ?? ""} onChange={edit && ((meta) => change(i, { meta }))} placeholder="Datum oder Zeitraum" /></p>}
        <Title className="t-list-title">{!edit && item.href
          ? <a href={item.href}>{item.title}<span aria-hidden="true" className="t-list-arrow">→</span></a>
          : <TextField value={item.title} onChange={edit && ((title) => change(i, { title }))} placeholder="Titel" />}</Title>
        {(edit || item.text.trim()) && <div className="t-text"><TextField value={item.text} onChange={edit && ((text) => change(i, { text }))} rich placeholder="Beschreibung" /></div>}
        {item.tags?.length ? <ul className="t-tags" aria-label="Tags">{item.tags.map((tag, n) => <li key={n}>{tag}</li>)}</ul> : null}
      </div>)}</div>
    </div>;
  }
  return (
    <div className={`t-columns t-columns-${block.style}`} style={{ "--t-columns": block.items.length } as CSSProperties}>
      {block.items.map((item, i) => (
        <div key={i} className="t-column">
          {block.style === "cards" && item.src && <Img src={item.src} alt={item.alt} focal={item.focal} sizes="(min-width: 44rem) 20rem, 100vw" />}
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
  if (block.layout === "profile") {
    return <div className="t-profile">
      {block.src && <Img src={block.src} alt={block.alt} focal={block.focal} sizes="128px" eager />}
      <div className="t-profile-content">
        {(block.eyebrow || edit) && <p className="t-profile-eyebrow">{edit
          ? <TextField value={block.eyebrow ?? ""} onChange={(eyebrow) => edit({ eyebrow })} placeholder="Kurzbezeichnung" />
          : block.eyebrow?.split("|").map((label, i) => <span className="t-profile-badge" key={i}>{label.trim()}</span>)}</p>}
        <h1 className="t-profile-title"><TextField value={block.title} highlight={block.highlight} onChange={edit && ((title) => edit({ title }))} placeholder="Titel" /></h1>
        <div className="t-profile-text"><TextField value={block.text} onChange={edit && ((text) => edit({ text }))} multiline placeholder="Kurzbeschreibung" /></div>
        {block.links?.length ? <div className="t-social-links">{block.links.filter((link) => link.label && link.href).map((link, i) => edit
          ? <span key={i} title={link.label}><SocialIcon href={link.href} /></span>
          : <a key={i} href={link.href} aria-label={link.label} title={link.label} rel="noopener"><SocialIcon href={link.href} /></a>)}</div> : null}
        <div className="t-button-row">{buttons.map((button, i) => edit
          ? <span key={i} className={`t-button t-button-${i ? "secondary" : "primary"}`}><TextField value={button.label} onChange={(label) => changeButton(i, label)} placeholder="Beschriftung" /></span>
          : <a key={i} className={`t-button t-button-${i ? "secondary" : "primary"}`} href={button.href}>{button.label}</a>)}</div>
      </div>
    </div>;
  }
  return (
    <div className={`${block.src ? "t-hero t-hero-image" : "t-hero t-band-accent"}${block.width ? ` t-band-width-${block.width}` : ""}`}>
      {block.src && <Img src={block.src} alt={block.alt} focal={block.focal} sizes="100vw" eager />}
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

// Replaces one entry of a list field, for blocks made of several similar entries.
const patchAt = <T,>(list: T[], index: number, patch: Partial<T>) => list.map((item, i) => (i === index ? { ...item, ...patch } : item));

function Prices({ block, edit }: BlockProps<PricesBlock>) {
  const items = edit ? block.items : block.items.filter((item) => item.name.trim() || item.price.trim());
  if (items.length === 0) return null;
  const change = (index: number, patch: Partial<PricesBlock["items"][number]>) => edit?.({ items: patchAt(block.items, index, patch) });
  return (
    <ul className="t-prices">
      {items.map((item, i) => (
        <li key={i}>
          <div className="t-price-line">
            <span className="t-price-name">
              <TextField value={item.name} onChange={edit && ((name) => change(i, { name }))} placeholder="Name, z. B. Cappuccino" />
            </span>
            <span className="t-price-dots" aria-hidden="true" />
            <span className="t-price">
              <TextField value={item.price} onChange={edit && ((price) => change(i, { price }))} placeholder="Preis" />
            </span>
          </div>
          {(edit || item.description.trim()) && (
            <div className="t-price-description">
              <TextField value={item.description} onChange={edit && ((description) => change(i, { description }))} placeholder="Beschreibung (optional)" />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function Faq({ block, edit }: BlockProps<FaqBlock>) {
  const change = (index: number, patch: Partial<FaqBlock["items"][number]>) => edit?.({ items: patchAt(block.items, index, patch) });
  if (edit) {
    // Everything stays open while editing, so each answer can be written in place.
    return (
      <div className="t-faq">
        {block.items.map((item, i) => (
          <div key={i} className="t-faq-item">
            <div className="t-faq-question">
              <TextField value={item.question} onChange={(question) => change(i, { question })} placeholder="Frage" />
            </div>
            <div className="t-text t-faq-answer">
              <TextField value={item.answer} onChange={(answer) => change(i, { answer })} rich placeholder="Antwort" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  const items = block.items.filter((item) => item.question.trim() && item.answer.trim());
  if (items.length === 0) return null;
  // details/summary opens and closes without any script.
  return (
    <div className="t-faq">
      {items.map((item, i) => (
        <details key={i} className="t-faq-item">
          <summary className="t-faq-question">{item.question}</summary>
          <div className="t-text t-faq-answer">
            <TextField value={item.answer} rich />
          </div>
        </details>
      ))}
    </div>
  );
}

function Hours({ block, edit }: BlockProps<HoursBlock>) {
  const rows = edit ? block.rows : block.rows.filter((row) => row.days.trim() && row.time.trim());
  if (rows.length === 0 && !block.note.trim()) return null;
  const change = (index: number, patch: Partial<HoursBlock["rows"][number]>) => edit?.({ rows: patchAt(block.rows, index, patch) });
  return (
    <div className="t-hours">
      <dl>
        {rows.map((row, i) => (
          <div key={i} className="t-hours-row">
            <dt>
              <TextField value={row.days} onChange={edit && ((days) => change(i, { days }))} placeholder="Tage, z. B. Montag bis Freitag" />
            </dt>
            <dd>
              <TextField value={row.time} onChange={edit && ((time) => change(i, { time }))} placeholder="Zeit, z. B. 8 bis 18 Uhr" />
            </dd>
          </div>
        ))}
      </dl>
      {(edit || block.note.trim()) && (
        <p className="t-hours-note">
          <TextField value={block.note} onChange={edit && ((note) => edit({ note }))} placeholder="Hinweis (optional), z. B. an Feiertagen geschlossen" />
        </p>
      )}
    </div>
  );
}

function Team({ block, edit }: BlockProps<TeamBlock>) {
  const members = edit ? block.members : block.members.filter((member) => member.name.trim());
  if (members.length === 0) return null;
  const change = (index: number, patch: Partial<TeamBlock["members"][number]>) => edit?.({ members: patchAt(block.members, index, patch) });
  return (
    <ul className="t-team">
      {members.map((member, i) => (
        <li key={i} className="t-member">
          {member.src ? (
            <Img src={member.src} alt={member.alt} focal={member.focal} sizes="10rem" />
          ) : (
            edit && <span className="t-member-photo-empty" aria-hidden="true" />
          )}
          <h3 className="t-member-name">
            <TextField value={member.name} onChange={edit && ((name) => change(i, { name }))} placeholder="Name" />
          </h3>
          {(edit || member.role.trim()) && (
            <p className="t-member-role">
              <TextField value={member.role} onChange={edit && ((role) => change(i, { role }))} placeholder="Aufgabe, z. B. Inhaberin" />
            </p>
          )}
          {(edit || member.text.trim()) && (
            <div className="t-member-text">
              <TextField value={member.text} onChange={edit && ((text) => change(i, { text }))} multiline placeholder="Ein paar Worte (optional)" />
            </div>
          )}
        </li>
      ))}
    </ul>
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
  const bands: { start: number; blocks: Block[]; continuation?: SectionBlock }[] = [{ start: 0, blocks: [] }];
  let running: SectionBlock | undefined;
  blocks.forEach((block, index) => {
    if (block.type === "section") { running = block; bands.push({ start: index, blocks: [block] }); }
    else if (block.type === "shared") {
      bands.push({ start: index, blocks: [block] }, {
        start: index + 1, blocks: [],
        continuation: running ?? { id: `${block.id}-continuation`, type: "section", background: "plain" },
      });
    }
    else bands.at(-1)!.blocks.push(block);
  });
  return (
    <>
      {bands.map(({ start, blocks: band, continuation }) => {
        const first = band[0];
        if (!first) return null;
        const section = first.type === "section" ? first : continuation;
        if (!section) return <Runs key={first.id} blocks={band} start={start} children={children} />;
        return (
          <div key={first.id} className={`t-band t-band-${section.background} t-band-width-${section.width ?? "content"} t-band-spacing-${section.spacing ?? "normal"} t-band-align-${section.align ?? "left"}`}>
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
    case "shared":
      return null; // Resolved on the server; the editor supplies a labelled preview.
    case "hero":
      return <Hero block={block} edit={e} />;
    case "prices":
      return <Prices block={block} edit={e} />;
    case "faq":
      return <Faq block={block} edit={e} />;
    case "hours":
      return <Hours block={block} edit={e} />;
    case "team":
      return <Team block={block} edit={e} />;
    case "form":
      return <ContactForm block={block} edit={e} />;
  }
}
