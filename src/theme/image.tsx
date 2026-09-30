import { createContext, useContext } from "react";
import type { ImageInfo } from "../blocks";

// Looks up size and smaller copies of uploaded images. The server provides it when rendering
// public pages; elsewhere images simply render without srcset.
export type ImageLookup = (src: string) => ImageInfo | null;
export const ImageLookupContext = createContext<ImageLookup>(() => null);

// eager is for pictures at the very top of the page, which should not wait for lazy loading.
export function Img({ src, alt, sizes, eager = false }: { src: string; alt: string; sizes: string; eager?: boolean }) {
  const info = useContext(ImageLookupContext)(src);
  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      {...(info && { srcSet: info.srcset, sizes, width: info.width, height: info.height })}
    />
  );
}
