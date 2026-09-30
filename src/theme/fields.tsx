import { type Ref, useLayoutEffect, useRef } from "react";

// Theme components render text through <TextField>. On the public site it is plain
// HTML; in the editor (when onChange is given) the same spot becomes editable in place.

type TextFieldProps = {
  value: string;
  onChange?: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
};

export function TextField({ value, onChange, multiline = false, placeholder }: TextFieldProps) {
  if (onChange) {
    return <EditableText value={value} onChange={onChange} multiline={multiline} placeholder={placeholder} />;
  }
  if (!multiline) return <>{value}</>;
  return <>{paragraphs(value).map((lines, i) => <p key={i}>{withLineBreaks(lines)}</p>)}</>;
}

// Blank lines separate paragraphs, single line breaks stay line breaks.
export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

function withLineBreaks(text: string) {
  return text.split("\n").map((line, i) => (
    <span key={i}>
      {i > 0 && <br />}
      {line}
    </span>
  ));
}

type EditableTextProps = Required<Omit<TextFieldProps, "placeholder">> & { placeholder?: string };

function EditableText({ value, onChange, multiline, placeholder }: EditableTextProps) {
  const ref = useRef<HTMLElement>(null);

  // The element is uncontrolled while typing; only sync when the value changed from outside.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && el.innerText !== value) el.innerText = value;
  }, [value]);

  // A <span> stays valid inside headings; multiline text needs a block element.
  const Tag = multiline ? "div" : "span";
  return (
    <Tag
      ref={ref as Ref<HTMLDivElement & HTMLSpanElement>}
      className={multiline ? "theta-editable theta-editable-multiline" : "theta-editable"}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      aria-multiline={multiline}
      data-placeholder={placeholder}
      onInput={(event) => onChange(event.currentTarget.innerText)}
      onKeyDown={(event) => {
        if (!multiline && event.key === "Enter") event.preventDefault();
      }}
    />
  );
}
