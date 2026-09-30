import { createContext, useContext } from "react";
import type { ImageInfo } from "../blocks";

// Looks up size and smaller copies of uploaded images. The server provides it when rendering
// public pages; elsewhere images simply render without srcset.
export type ImageLookup = (src: string) => ImageInfo | null;
export const ImageLookupContext = createContext<ImageLookup>(() => null);

export function Img({ src, alt, sizes }: { src: string; alt: string; sizes: string }) {
  const info = useContext(ImageLookupContext)(src);
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      {...(info && { srcSet: info.srcset, sizes, width: info.width, height: info.height })}
    />
  );
}
