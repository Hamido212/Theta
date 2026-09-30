import type { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import sharp, { type Metadata, type Sharp } from "sharp";
import { type ImageInfo, ValidationError } from "./blocks";

// Uploaded images. Every upload is rotated upright, stripped of metadata such as GPS
// positions, limited in size and stored with smaller WebP copies, so pages stay fast
// without anyone having to prepare images by hand.

export type MediaItem = {
  id: string;
  filename: string;
  url: string;
  // A small copy for previews.
  thumb: string;
  width: number;
  height: number;
  size: number;
  createdAt: string;
};

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_DIMENSION = 2560;
const VARIANT_WIDTHS = [480, 960, 1600];

type MediaRow = {
  id: string;
  filename: string;
  file: string;
  width: number;
  height: number;
  size: number;
  variants: string;
  created_at: string;
};

const OUTPUT: Record<string, { ext: string; encode: (image: Sharp) => Sharp }> = {
  jpeg: { ext: "jpg", encode: (image) => image.jpeg({ quality: 82, mozjpeg: true }) },
  png: { ext: "png", encode: (image) => image.png({ compressionLevel: 9, palette: true, quality: 90 }) },
  webp: { ext: "webp", encode: (image) => image.webp({ quality: 82 }) },
  avif: { ext: "avif", encode: (image) => image.avif({ quality: 60 }) },
};

export class MediaStore {
  constructor(
    private db: Database,
    private dir: string,
  ) {
    mkdirSync(dir, { recursive: true });
  }

  async add(file: File): Promise<MediaItem> {
    if (file.size > MAX_UPLOAD_BYTES) throw new ValidationError(`${file.name} ist größer als 20 MB`);
    const input = Buffer.from(await file.arrayBuffer());

    let meta: Metadata;
    try {
      meta = await sharp(input).metadata();
    } catch {
      throw new ValidationError(`${file.name} ist kein Bild, das Theta lesen kann`);
    }
    if (meta.format === "heif") throw new ValidationError(`${file.name}: HEIC-Fotos bitte als JPG exportieren`);

    const id = Buffer.from(crypto.getRandomValues(new Uint8Array(9))).toString("base64url");
    const folder = join(this.dir, id);
    mkdirSync(folder, { recursive: true });

    try {
      let name: string;
      let width: number;
      let height: number;
      let variants: number[] = [];

      if (meta.format === "gif") {
        // Keep GIFs as they are so animations survive.
        name = "original.gif";
        await Bun.write(join(folder, name), input);
        width = meta.width ?? 0;
        height = meta.height ?? 0;
      } else {
        const output = OUTPUT[meta.format ?? ""];
        if (!output) throw new ValidationError(`${file.name}: nur JPG, PNG, WebP, AVIF und GIF werden unterstützt`);
        name = `original.${output.ext}`;
        // rotate() applies the camera orientation; sharp drops all other metadata by default.
        const base = sharp(input).rotate().resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true });
        const info = await output.encode(base.clone()).toFile(join(folder, name));
        width = info.width;
        height = info.height;
        variants = VARIANT_WIDTHS.filter((w) => w < width);
        for (const w of variants) {
          await base.clone().resize({ width: w }).webp({ quality: 80 }).toFile(join(folder, `${w}.webp`));
        }
      }

      const size = Bun.file(join(folder, name)).size;
      this.db
        .query("INSERT INTO media (id, filename, file, width, height, size, variants, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, cleanFilename(file.name), name, width, height, size, JSON.stringify(variants), new Date().toISOString());
      return this.get(id)!;
    } catch (err) {
      rmSync(folder, { recursive: true, force: true });
      throw err;
    }
  }

  get(id: string): MediaItem | null {
    const row = this.row(id);
    return row ? toItem(row) : null;
  }

  list(): MediaItem[] {
    return this.db.query<MediaRow, []>("SELECT * FROM media ORDER BY created_at DESC, rowid DESC").all().map(toItem);
  }

  delete(id: string) {
    if (!this.row(id)) return;
    this.db.query("DELETE FROM media WHERE id = ?").run(id);
    rmSync(join(this.dir, id), { recursive: true, force: true });
  }

  // Path on disk for /media/<id>/<name>, or null if there is no such file.
  path(id: string, name: string): string | null {
    const row = this.row(id);
    if (!row) return null;
    const allowed = [row.file, ...parseVariants(row.variants).map((w) => `${w}.webp`)];
    return allowed.includes(name) ? join(this.dir, id, name) : null;
  }

  // Size and responsive sources for an uploaded image address, e.g. /media/abc/original.jpg.
  info(src: string): ImageInfo | null {
    const match = src.match(/^\/media\/([\w-]+)\/([\w.]+)$/);
    const row = match ? this.row(match[1]!) : null;
    if (!row || match![2] !== row.file) return null;
    const sources = parseVariants(row.variants).map((w) => `/media/${row.id}/${w}.webp ${w}w`);
    return { width: row.width, height: row.height, srcset: [...sources, `${src} ${row.width}w`].join(", ") };
  }

  private row(id: string): MediaRow | null {
    return this.db.query<MediaRow, [string]>("SELECT * FROM media WHERE id = ?").get(id);
  }
}

function toItem(row: MediaRow): MediaItem {
  const variants = parseVariants(row.variants);
  const url = `/media/${row.id}/${row.file}`;
  return {
    id: row.id,
    filename: row.filename,
    url,
    thumb: variants[0] ? `/media/${row.id}/${variants[0]}.webp` : url,
    width: row.width,
    height: row.height,
    size: row.size,
    createdAt: row.created_at,
  };
}

const parseVariants = (json: string) => JSON.parse(json) as number[];

function cleanFilename(name: string): string {
  return name.replace(/[\u0000-\u001f]/g, "").slice(0, 200) || "Bild";
}

// Files that ship with Theta itself (logo, favicon), served at /media/<name>.
export function builtinMedia(name: string): string | null {
  if (!/^[\w.-]+$/.test(name) || name.startsWith(".")) return null;
  const path = Bun.fileURLToPath(new URL(`../media/${name}`, import.meta.url));
  return Bun.file(path).size > 0 ? path : null;
}
