import {
  type Block,
  type ButtonBlock,
  type ColumnsBlock,
  type GalleryBlock,
  type ImageBlock,
  MAX_COLUMNS,
  type NavItem,
  type VideoBlock,
  emptyColumn,
  publicPath,
} from "../blocks";
import { videoSource } from "../theme/video";
import { MediaPicker } from "./media-picker";

// Settings shown below a block for everything that is not edited directly on the page.

type Props<B extends Block> = { block: B; onChange: (patch: Partial<B>) => void; pages: NavItem[] };

export function BlockSettings({ block, onChange, pages }: Props<Block>) {
  const change = onChange as never;
  switch (block.type) {
    case "image":
      return <ImageSettings block={block} onChange={change} pages={pages} />;
    case "gallery":
      return <GallerySettings block={block} onChange={change} pages={pages} />;
    case "button":
      return <ButtonSettings block={block} onChange={change} pages={pages} />;
    case "columns":
      return <ColumnsSettings block={block} onChange={change} pages={pages} />;
    case "video":
      return <VideoSettings block={block} onChange={change} pages={pages} />;
    default:
      return null;
  }
}

function AltHint({ src, alt }: { src: string; alt: string }) {
  return src && !alt.trim() ? (
    <p className="theta-hint">Ohne Beschreibung können blinde Menschen und Suchmaschinen das Bild nicht erfassen.</p>
  ) : null;
}

function ImageSettings({ block, onChange }: Props<ImageBlock>) {
  return (
    <div className="theta-settings">
      <div>
        <MediaPicker label={block.src ? "Anderes Bild wählen" : "Bild wählen oder hochladen"} onSelect={([item]) => onChange({ src: item!.url })} />
      </div>
      <label>
        Bild-Adresse
        <input type="url" value={block.src} placeholder="https://… oder /media/…" onChange={(e) => onChange({ src: e.target.value })} />
      </label>
      <label>
        Bildbeschreibung
        <input value={block.alt} placeholder="Was ist auf dem Bild zu sehen?" onChange={(e) => onChange({ alt: e.target.value })} />
      </label>
      <AltHint src={block.src} alt={block.alt} />
    </div>
  );
}

function GallerySettings({ block, onChange }: Props<GalleryBlock>) {
  const update = (index: number, patch: Partial<GalleryBlock["images"][number]>) =>
    onChange({ images: block.images.map((image, i) => (i === index ? { ...image, ...patch } : image)) });
  return (
    <div className="theta-settings">
      {block.images.map((image, i) => (
        <fieldset key={i} className="theta-row">
          <legend>Bild {i + 1}</legend>
          <input type="url" value={image.src} placeholder="Bild-Adresse" aria-label={`Bild ${i + 1}: Adresse`} onChange={(e) => update(i, { src: e.target.value })} />
          <input value={image.alt} placeholder="Bildbeschreibung" aria-label={`Bild ${i + 1}: Beschreibung`} onChange={(e) => update(i, { alt: e.target.value })} />
          <button className="theta-button" onClick={() => onChange({ images: block.images.filter((_, j) => j !== i) })}>
            Entfernen
          </button>
          <AltHint src={image.src} alt={image.alt} />
        </fieldset>
      ))}
      <div className="theta-inline">
        <MediaPicker
          multiple
          label="Bilder aus der Mediathek hinzufügen"
          onSelect={(items) => onChange({ images: [...block.images, ...items.map((item) => ({ src: item.url, alt: "" }))] })}
        />
        <button className="theta-button" onClick={() => onChange({ images: [...block.images, { src: "", alt: "" }] })}>
          + Bild per Adresse
        </button>
      </div>
    </div>
  );
}

function ButtonSettings({ block, onChange, pages }: Props<ButtonBlock>) {
  const listId = `theta-pages-${block.id}`;
  return (
    <div className="theta-settings">
      <label>
        Ziel
        <input
          value={block.href}
          list={listId}
          placeholder="Eine Seite wie /kontakt, https://… oder mailto:…"
          onChange={(e) => onChange({ href: e.target.value })}
        />
        <datalist id={listId}>
          {pages.map((page) => (
            <option key={page.slug} value={page.href ?? publicPath(page.slug)}>
              {page.title}
            </option>
          ))}
        </datalist>
      </label>
      <label>
        Art
        <select value={block.variant} onChange={(e) => onChange({ variant: e.target.value as ButtonBlock["variant"] })}>
          <option value="primary">Hervorgehoben</option>
          <option value="secondary">Dezent</option>
        </select>
      </label>
      {!block.href && <p className="theta-hint">Ohne Ziel wird der Button auf der Website nicht angezeigt.</p>}
    </div>
  );
}

function ColumnsSettings({ block, onChange }: Props<ColumnsBlock>) {
  return (
    <div className="theta-settings theta-inline">
      <span>{block.items.length} Spalten</span>
      <button className="theta-button" disabled={block.items.length >= MAX_COLUMNS} onClick={() => onChange({ items: [...block.items, emptyColumn()] })}>
        + Spalte
      </button>
      <button className="theta-button" disabled={block.items.length <= 1} onClick={() => onChange({ items: block.items.slice(0, -1) })}>
        − Letzte Spalte entfernen
      </button>
    </div>
  );
}

function VideoSettings({ block, onChange }: Props<VideoBlock>) {
  const source = videoSource(block.url);
  return (
    <div className="theta-settings">
      <label>
        Video-Adresse
        <input
          type="url"
          value={block.url}
          placeholder="Link zu YouTube, Vimeo oder einer MP4-Datei"
          onChange={(e) => onChange({ url: e.target.value })}
        />
      </label>
      <label>
        Titel
        <input value={block.title} placeholder="Worum geht es im Video?" onChange={(e) => onChange({ title: e.target.value })} />
      </label>
      {source && source.kind !== "file" && (
        <p className="theta-note">Das Video lädt erst, wenn jemand auf Abspielen klickt. So bleibt die Seite schnell und datenschutzfreundlich.</p>
      )}
    </div>
  );
}
