import type { FocalPoint, ImageContent } from "../blocks";

const clamp = (n: number) => Math.max(0, Math.min(1, Math.round(n * 100) / 100));

export function FocalPointPicker({ image, onChange }: { image: ImageContent; onChange: (focal: FocalPoint) => void }) {
  if (!image.src) return null;
  const point = image.focal ?? { x: 0.5, y: 0.5 };
  return <fieldset className="theta-focal"><legend>Wichtiges Motiv</legend>
    <p>Klicke auf das Motiv, das beim Zuschneiden sichtbar bleiben soll.</p>
    <button type="button" className="theta-focal-target" aria-label="Bild-Fokuspunkt wählen; mit Pfeiltasten verschieben"
      onClick={(event) => {
        if (event.detail === 0) return;
        const rect = event.currentTarget.getBoundingClientRect();
        onChange({ x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) });
      }}
      onKeyDown={(event) => {
        const moves: Record<string, [number, number]> = { ArrowLeft: [-0.05, 0], ArrowRight: [0.05, 0], ArrowUp: [0, -0.05], ArrowDown: [0, 0.05] };
        const move = moves[event.key];
        if (move) { event.preventDefault(); onChange({ x: clamp(point.x + move[0]), y: clamp(point.y + move[1]) }); }
      }}>
      <img src={image.src} alt={image.alt || "Bild für den Fokuspunkt"} />
      <span style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} aria-hidden="true" />
    </button>
    <div className="theta-focal-previews">{["Hochformat", "Quadrat", "Querformat"].map((label, i) => <figure key={label}>
      <img src={image.src} alt="" style={{ aspectRatio: ["4/5", "1", "16/9"][i], objectPosition: `${point.x * 100}% ${point.y * 100}%` }} /><figcaption>{label}</figcaption>
    </figure>)}</div>
    <output aria-live="polite">Horizontal {Math.round(point.x * 100)} %, vertikal {Math.round(point.y * 100)} %</output>
    <button className="theta-button" type="button" onClick={() => onChange({ x: 0.5, y: 0.5 })}>Zentrieren</button>
  </fieldset>;
}
