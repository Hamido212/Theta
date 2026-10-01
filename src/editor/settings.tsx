import {
  type Block,
  type ButtonBlock,
  type Column,
  type ColumnsBlock,
  type GalleryBlock,
  type HeadingBlock,
  type HeadingLevel,
  type HeroBlock,
  MAX_HERO_BUTTONS,
  type SectionBackground,
  type SectionBlock,
  emptyHeroButton,
  sectionBackgrounds,
  type ImageBlock,
  type ImageWidth,
  MAX_COLUMNS,
  type NavItem,
  type VideoBlock,
  emptyColumn,
  publicPath,
  type FaqBlock,
  type HoursBlock,
  type PricesBlock,
  type TeamBlock,
  type FormBlock,
  type MapBlock,
  type TeamMember,
  MAX_HOURS_ROWS,
  MAX_LIST_ITEMS,
  MAX_TEAM,
  emptyFaqItem,
  emptyHoursRow,
  emptyPriceItem,
  emptyTeamMember,
} from "../blocks";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { videoSource } from "../theme/video";
import { mapLink, parseLocation } from "../theme/map";
import { FocalPointPicker } from "./focal-point";
import { MediaPicker } from "./media-picker";

// Inspector settings for everything that is not edited directly on the page.

type Props<B extends Block> = { block: B; onChange: (patch: Partial<B>) => void; pages: NavItem[] };

export function BlockSettings({ block, onChange, pages }: Props<Block>) {
  const change = onChange as never;
  switch (block.type) {
    case "section":
      return <SectionSettings block={block} onChange={change} pages={pages} />;
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
    case "hero":
      return <HeroSettings block={block} onChange={change} pages={pages} />;
    case "prices":
      return <PricesSettings block={block} onChange={change} pages={pages} />;
    case "faq":
      return <FaqSettings block={block} onChange={change} pages={pages} />;
    case "hours":
      return <HoursSettings block={block} onChange={change} pages={pages} />;
    case "team":
      return <TeamSettings block={block} onChange={change} pages={pages} />;
    case "form":
      return <FormSettings block={block} onChange={change} pages={pages} />;
    case "map":
      return <MapSettings block={block} onChange={change} pages={pages} />;
    default:
      return null;
  }
}

// Controlled block variants shown in the inspector.
export function BlockOptions({ block, onChange, allowTitle = true }: { block: Block; onChange: (patch: Partial<Block>) => void; allowTitle?: boolean }) {
  if (block.type === "heading") {
    return (
      <select
        aria-label="Art der Überschrift"
        value={block.level}
        onChange={(e) => onChange({ level: Number(e.target.value) as HeadingLevel } as Partial<HeadingBlock>)}
      >
        {allowTitle && <option value={1}>Seitentitel</option>}
        <option value={2}>Überschrift</option>
        <option value={3}>Kleine Überschrift</option>
      </select>
    );
  }
  if (block.type === "section") {
    return (
      <select
        aria-label="Hintergrund des Abschnitts"
        value={block.background}
        onChange={(e) => onChange({ background: e.target.value as SectionBackground } as Partial<SectionBlock>)}
      >
        {Object.entries(sectionBackgrounds).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    );
  }
  if (block.type === "image" || block.type === "map") {
    return (
      <select
        aria-label={block.type === "map" ? "Breite der Karte" : "Breite des Bildes"}
        value={block.width}
        onChange={(e) => onChange({ width: e.target.value as ImageWidth } as Partial<ImageBlock>)}
      >
        <option value="normal">Textbreite</option>
        <option value="wide">Breit</option>
        <option value="full">Ganze Fensterbreite</option>
      </select>
    );
  }
  return null;
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
      <FocalPointPicker image={block} onChange={(focal) => onChange({ focal })} />
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
          <FocalPointPicker image={image} onChange={(focal) => update(i, { focal })} />
        </fieldset>
      ))}
      <div className="theta-inline">
        <select aria-label="Bilder pro Reihe" value={block.columns} onChange={(e) => onChange({ columns: Number(e.target.value) as GalleryBlock["columns"] })}>
          <option value={2}>2 pro Reihe</option>
          <option value={3}>3 pro Reihe</option>
          <option value={4}>4 pro Reihe</option>
        </select>
        <select aria-label="Bildformat" value={block.crop ? "crop" : "original"} onChange={(e) => onChange({ crop: e.target.value === "crop" })}>
          <option value="crop">Quadratisch zuschneiden</option>
          <option value="original">Originalformat</option>
        </select>
      </div>
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

// A link target field that suggests the site's own pages.
function LinkTarget({ id, label, value, pages, onChange }: { id: string; label: string; value: string; pages: NavItem[]; onChange: (href: string) => void }) {
  const listId = `theta-pages-${id}`;
  return (
    <label>
      {label}
      <input value={value} list={listId} placeholder="Eine Seite wie /kontakt, https://… oder mailto:…" onChange={(e) => onChange(e.target.value)} />
      <datalist id={listId}>
        {pages.map((page) => (
          <option key={page.slug} value={page.href ?? publicPath(page.slug)}>
            {page.title}
          </option>
        ))}
      </datalist>
    </label>
  );
}

function HeroSettings({ block, onChange, pages }: Props<HeroBlock>) {
  const setHref = (index: number, href: string) =>
    onChange({ buttons: block.buttons.map((button, i) => (i === index ? { ...button, href } : button)) });
  return (
    <div className="theta-settings">
      {block.layout !== "profile" && <label>Inhaltsbreite des Titelbilds<select value={block.width ?? "content"} onChange={(event) => onChange({ width: event.target.value as HeroBlock["width"] })}><option value="content">Textbreite</option><option value="wide">Breit</option><option value="full">Ganze Fensterbreite</option></select></label>}
      <label>Darstellung<select value={block.layout ?? "banner"} onChange={(e) => onChange({ layout: e.target.value as HeroBlock["layout"] })}><option value="banner">Großes Titelbild</option><option value="profile">Profil mit Porträt</option></select></label>
      {block.layout === "profile" && <>
        <label>Kurzbezeichnung<input value={block.eyebrow ?? ""} onChange={(e) => onChange({ eyebrow: e.target.value })} /></label>
        <label>Hervorgehobener Text im Titel<input value={block.highlight ?? ""} onChange={(e) => onChange({ highlight: e.target.value })} /></label>
        {(block.links ?? []).map((link, i) => <fieldset key={i}><legend>Profil-Link {i + 1}</legend>
          <label>Beschriftung<input value={link.label} onChange={(e) => onChange({ links: block.links!.map((item, n) => n === i ? { ...item, label: e.target.value } : item) })} /></label>
          <LinkTarget id={`${block.id}-social-${i}`} label="Ziel" value={link.href} pages={pages} onChange={(href) => onChange({ links: block.links!.map((item, n) => n === i ? { ...item, href } : item) })} />
          <button className="theta-button" onClick={() => onChange({ links: block.links!.filter((_, n) => n !== i) })}>Link entfernen</button>
        </fieldset>)}
        <button className="theta-button" disabled={(block.links?.length ?? 0) >= 8} onClick={() => onChange({ links: [...(block.links ?? []), emptyHeroButton()] })}>+ Profil-Link</button>
      </>}
      <div className="theta-inline">
        <MediaPicker label={block.src ? "Anderes Bild wählen" : block.layout === "profile" ? "Porträt wählen oder hochladen" : "Hintergrundbild wählen oder hochladen"} onSelect={([item]) => onChange({ src: item!.url })} />
        {block.src && (
          <button className="theta-button" onClick={() => onChange({ src: "", alt: "" })}>
            {block.layout === "profile" ? "Porträt entfernen" : "Ohne Bild, in Akzentfarbe"}
          </button>
        )}
      </div>
      {block.src && (
        <label>
          Bildbeschreibung
          <input value={block.alt} placeholder="Was ist auf dem Bild zu sehen?" onChange={(e) => onChange({ alt: e.target.value })} />
        </label>
      )}
      <AltHint src={block.src} alt={block.alt} />
      <FocalPointPicker image={block} onChange={(focal) => onChange({ focal })} />
      {block.buttons.map((button, i) => (
        <LinkTarget key={i} id={`${block.id}-${i}`} label={i === 0 ? "Ziel des ersten Buttons" : "Ziel des zweiten Buttons"} value={button.href} pages={pages} onChange={(href) => setHref(i, href)} />
      ))}
      <div className="theta-inline">
        {block.buttons.length < MAX_HERO_BUTTONS && (
          <button className="theta-button" onClick={() => onChange({ buttons: [...block.buttons, emptyHeroButton()] })}>
            + Button
          </button>
        )}
        {block.buttons.length > 0 && (
          <button className="theta-button" onClick={() => onChange({ buttons: block.buttons.slice(0, -1) })}>
            − Letzten Button entfernen
          </button>
        )}
      </div>
    </div>
  );
}

function ButtonSettings({ block, onChange, pages }: Props<ButtonBlock>) {
  return (
    <div className="theta-settings">
      <LinkTarget id={block.id} label="Ziel" value={block.href} pages={pages} onChange={(href) => onChange({ href })} />
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

function ColumnsSettings({ block, onChange, pages }: Props<ColumnsBlock>) {
  const update = (index: number, patch: Partial<Column>) =>
    onChange({ items: block.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  return (
    <div className="theta-settings">
      <div className="theta-inline">
        <select aria-label="Darstellung der Spalten" value={block.style} onChange={(e) => onChange({ style: e.target.value as ColumnsBlock["style"] })}>
          <option value="cards">Karten mit Bild</option>
          <option value="plain">Nur Text</option>
          <option value="list">Karten untereinander</option>
          <option value="timeline">Zeitlicher Verlauf</option>
        </select>
        <span>{block.items.length} Spalten</span>
        <button className="theta-button" disabled={block.items.length >= MAX_COLUMNS} onClick={() => onChange({ items: [...block.items, emptyColumn()] })}>
          + Spalte
        </button>
        <button className="theta-button" disabled={block.items.length <= 1} onClick={() => onChange({ items: block.items.slice(0, -1) })}>
          − Letzte Spalte entfernen
        </button>
      </div>
      {(block.style === "list" || block.style === "timeline") && <>
        <label>Überschrift<input value={block.heading ?? ""} onChange={(e) => onChange({ heading: e.target.value })} /></label>
        <label>Link-Beschriftung<input value={block.linkLabel ?? ""} onChange={(e) => onChange({ linkLabel: e.target.value })} /></label>
        <LinkTarget id={`${block.id}-all`} label="Ziel des Überschrift-Links" value={block.href ?? ""} pages={pages} onChange={(href) => onChange({ href })} />
      </>}
      {block.style !== "plain" &&
        block.items.map((item, i) => (
          <fieldset key={i} className="theta-card-settings">
            <legend>Karte {i + 1}</legend>
            {(block.style === "list" || block.style === "timeline") && <>
              <label>Datum oder Zeitraum<input value={item.meta ?? ""} onChange={(e) => update(i, { meta: e.target.value })} /></label>
              <label>Tags (mit Komma trennen)<TagsInput tags={item.tags ?? []} onChange={(tags) => update(i, { tags })} /></label>
            </>}
            {block.style === "cards" && <><div className="theta-inline">
              <MediaPicker label={item.src ? "Anderes Bild" : "Bild wählen"} onSelect={([picked]) => update(i, { src: picked!.url })} />
              {item.src && (
                <button className="theta-button" onClick={() => update(i, { src: "", alt: "" })}>
                  Bild entfernen
                </button>
              )}
            </div>
            {item.src && (
              <input value={item.alt} placeholder="Bildbeschreibung" aria-label={`Karte ${i + 1}: Bildbeschreibung`} onChange={(e) => update(i, { alt: e.target.value })} />
            )}
            <AltHint src={item.src} alt={item.alt} />
            <FocalPointPicker image={item} onChange={(focal) => update(i, { focal })} /></>}
            <LinkTarget id={`${block.id}-${i}`} label="Link (optional)" value={item.href} pages={pages} onChange={(href) => update(i, { href })} />
          </fieldset>
        ))}
    </div>
  );
}

// Keep the raw input while typing: normalizing a trailing comma on every render
// would remove it before a second tag can be entered. The block still gets clean tags.
function TagsInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [raw, setRaw] = useState(tags.join(", "));
  const sent = useRef(JSON.stringify(tags));
  useEffect(() => {
    const key = JSON.stringify(tags);
    if (key !== sent.current) { sent.current = key; setRaw(tags.join(", ")); }
  }, [tags]);
  return <input value={raw} onChange={(event) => {
    setRaw(event.target.value);
    const next = event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean);
    sent.current = JSON.stringify(next);
    onChange(next);
  }} />;
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

type ListProps<T> = {
  items: T[];
  onChange: (items: T[]) => void;
  make: () => T;
  max: number;
  // "Eintrag", "Frage", … and the name shown for an entry in the list.
  noun: string;
  name: (item: T) => string;
  // Extra settings for one entry, e.g. its picture.
  details?: (item: T, update: (patch: Partial<T>) => void, index: number) => ReactNode;
};

// Adds, removes and reorders the entries of list blocks; their words are edited on the page.
function ListSettings<T>({ items, onChange, make, max, noun, name, details }: ListProps<T>) {
  const move = (from: number, to: number) => {
    const copy = [...items];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item!);
    onChange(copy);
  };
  return (
    <div className="theta-settings">
      {items.map((item, i) => (
        <fieldset key={i} className="theta-card-settings">
          <div className="theta-inline">
            <span className="theta-list-name">{name(item).trim() || `${noun} ${i + 1}`}</span>
            <button className="theta-button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`${noun} ${i + 1} nach oben`}>
              ↑
            </button>
            <button className="theta-button" onClick={() => move(i, i + 1)} disabled={i === items.length - 1} aria-label={`${noun} ${i + 1} nach unten`}>
              ↓
            </button>
            <button className="theta-button" onClick={() => onChange(items.filter((_, j) => j !== i))} disabled={items.length <= 1}>
              Entfernen
            </button>
          </div>
          {details?.(item, (patch) => onChange(items.map((other, j) => (j === i ? { ...other, ...patch } : other))), i)}
        </fieldset>
      ))}
      <div className="theta-inline">
        <button className="theta-button" disabled={items.length >= max} onClick={() => onChange([...items, make()])}>
          + {noun}
        </button>
      </div>
    </div>
  );
}

function PricesSettings({ block, onChange }: Props<PricesBlock>) {
  return (
    <ListSettings items={block.items} onChange={(items) => onChange({ items })} make={emptyPriceItem} max={MAX_LIST_ITEMS} noun="Eintrag" name={(item) => item.name} />
  );
}

function FaqSettings({ block, onChange }: Props<FaqBlock>) {
  return (
    <ListSettings items={block.items} onChange={(items) => onChange({ items })} make={emptyFaqItem} max={MAX_LIST_ITEMS} noun="Frage" name={(item) => item.question} />
  );
}

function HoursSettings({ block, onChange }: Props<HoursBlock>) {
  return <ListSettings items={block.rows} onChange={(rows) => onChange({ rows })} make={emptyHoursRow} max={MAX_HOURS_ROWS} noun="Zeile" name={(row) => row.days} />;
}

function TeamSettings({ block, onChange }: Props<TeamBlock>) {
  const photo = (member: TeamMember, update: (patch: Partial<TeamMember>) => void, i: number) => (
    <>
      <div className="theta-inline">
        <MediaPicker label={member.src ? "Anderes Foto" : "Foto wählen"} onSelect={([picked]) => update({ src: picked!.url })} />
        {member.src && (
          <button className="theta-button" onClick={() => update({ src: "", alt: "" })}>
            Foto entfernen
          </button>
        )}
      </div>
      {member.src && (
        <input value={member.alt} placeholder="Bildbeschreibung" aria-label={`Person ${i + 1}: Bildbeschreibung`} onChange={(e) => update({ alt: e.target.value })} />
      )}
      <AltHint src={member.src} alt={member.alt} />
    </>
  );
  return (
    <ListSettings
      items={block.members}
      onChange={(members) => onChange({ members })}
      make={emptyTeamMember}
      max={MAX_TEAM}
      noun="Person"
      name={(member) => member.name}
      details={photo}
    />
  );
}

function SectionSettings({ block, onChange }: Props<SectionBlock>) {
  return <div className="theta-settings">
    <label>Inhaltsbreite<select value={block.width ?? "content"} onChange={(e) => onChange({ width: e.target.value as SectionBlock["width"] })}>
      <option value="content">Textbreite</option><option value="wide">Breit</option><option value="full">Volle Breite</option>
    </select></label>
    <label>Abstand<select value={block.spacing ?? "normal"} onChange={(e) => onChange({ spacing: e.target.value as SectionBlock["spacing"] })}>
      <option value="compact">Kompakt</option><option value="normal">Normal</option><option value="spacious">Großzügig</option>
    </select></label>
    <label>Ausrichtung<select value={block.align ?? "left"} onChange={(e) => onChange({ align: e.target.value as SectionBlock["align"] })}>
      <option value="left">Links</option><option value="center">Zentriert</option>
    </select></label>
    <p className="theta-note">Verschieben, Verdoppeln und Löschen wirken auf den ganzen Abschnitt bis zum nächsten Abschnitt.</p>
  </div>;
}

function FormSettings({ block, onChange }: Props<FormBlock>) {
  return (
    <div className="theta-settings">
      <label className="theta-check">
        <input type="checkbox" checked={block.phone} onChange={(e) => onChange({ phone: e.target.checked })} />
        Feld für eine Telefonnummer (optional für Besucher)
      </label>
      <label>
        Bestätigung nach dem Absenden
        <textarea value={block.success} maxLength={500} rows={2} onChange={(e) => onChange({ success: e.target.value })} />
      </label>
      <p className="theta-note">
        Nachrichten landen unter Verwaltung → Nachrichten. Dort kannst du auch eine Weiterleitung per E-Mail einrichten. Besucher können das Formular
        ausfüllen, sobald die Seite veröffentlicht ist.
      </p>
    </div>
  );
}

type Place = { lat: number; lon: number; name: string };

const zoomLevels: [number, string][] = [
  [18, "Sehr nah (Hauseingang)"],
  [16, "Straße"],
  [14, "Viertel"],
  [12, "Stadt"],
];

function MapSettings({ block, onChange }: Props<MapBlock>) {
  const [query, setQuery] = useState(block.label);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const search = async () => {
    setBusy(true);
    setMessage("");
    setPlaces(null);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
      const result = (await response.json().catch(() => ({}))) as Place[] | { error?: string };
      if (!response.ok || !Array.isArray(result)) setMessage(("error" in result && result.error) || "Die Suche hat nicht geklappt.");
      else if (result.length === 0) setMessage("Nichts gefunden. Versuche es mit Straße, Hausnummer und Ort, oder füge einen Kartenlink ein.");
      else setPlaces(result);
    } catch {
      setMessage("Keine Verbindung zum Server. Bitte versuche es noch einmal.");
    } finally {
      setBusy(false);
    }
  };

  const choose = (place: Place) => {
    // What the owner typed usually reads better than OpenStreetMap's long name.
    onChange({ lat: place.lat, lon: place.lon, label: block.label.trim() || query.trim() || place.name });
    setPlaces(null);
  };

  const applyLink = (value: string) => {
    setLink(value);
    if (!value.trim()) return setMessage("");
    const place = parseLocation(value);
    if (!place) return setMessage("In diesem Link stehen keine Koordinaten. Kopiere den Link aus der Adresszeile der Karte oder nutze die Suche.");
    onChange({
      lat: place.lat,
      lon: place.lon,
      ...(place.zoom && { zoom: Math.min(Math.max(place.zoom, 12), 18) }),
      ...(!block.label.trim() && query.trim() && { label: query.trim() }),
    });
    setMessage("Ort aus dem Link übernommen.");
  };

  return (
    <div className="theta-settings">
      <form
        className="theta-settings"
        onSubmit={(event) => {
          event.preventDefault();
          if (query.trim().length >= 3) void search();
        }}
      >
        <label>
          Ort suchen
          <input value={query} placeholder="Straße Hausnummer, Ort" maxLength={200} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button className="theta-button" disabled={busy || query.trim().length < 3}>
          {busy ? "Sucht …" : "Suchen"}
        </button>
      </form>
      {places && (
        <ul className="theta-places">
          {places.map((place) => (
            <li key={`${place.lat},${place.lon}`}>
              <button type="button" className="theta-button" onClick={() => choose(place)}>
                {place.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <label>
        Oder Kartenlink einfügen
        <input value={link} placeholder="Link von OpenStreetMap, Google Maps oder Koordinaten" onChange={(e) => applyLink(e.target.value)} />
      </label>
      {message && (
        <p className="theta-note" role="status">
          {message}
        </p>
      )}
      <label>
        Ausschnitt
        <select value={block.zoom} onChange={(e) => onChange({ zoom: Number(e.target.value) })}>
          {!zoomLevels.some(([zoom]) => zoom === block.zoom) && <option value={block.zoom}>Aus dem Link (Stufe {block.zoom})</option>}
          {zoomLevels.map(([zoom, label]) => (
            <option key={zoom} value={zoom}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {block.lat !== null && block.lon !== null && (
        <p className="theta-note">
          Gewählt: {block.lat.toFixed(5)}, {block.lon.toFixed(5)} ·{" "}
          <a href={mapLink({ lat: block.lat, lon: block.lon }, block.zoom)} target="_blank" rel="noopener">
            prüfen
          </a>
        </p>
      )}
      <p className="theta-note">
        Die Karte lädt erst, wenn Besucher darauf klicken; vorher werden keine Daten an OpenStreetMap übertragen. Die Suche fragt den Ortsdienst von OpenStreetMap.
      </p>
    </div>
  );
}
