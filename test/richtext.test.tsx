import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { escapeRich, parseInline, parseRich, plainText } from "../src/richtext";
import { RichText } from "../src/theme/fields";

const html = (value: string) => renderToStaticMarkup(<RichText value={value} />);

describe("formatted text", () => {
  test("bold, italic and links", () => {
    expect(html("Frisch **gebacken** und *warm*, siehe [Karte](/speisekarte).")).toBe(
      '<p><span>Frisch <strong>gebacken</strong> und <em>warm</em>, siehe <a href="/speisekarte">Karte</a>.</span></p>',
    );
    expect(html("[Instagram](https://instagram.com/cafe)")).toBe('<p><span><a href="https://instagram.com/cafe" rel="noopener">Instagram</a></span></p>');
  });

  test("lists, paragraphs and line breaks", () => {
    expect(html("Geöffnet:\nMo bis Fr\n\n- Kaffee\n- **Kuchen**\n\n1. Bestellen\n2. Genießen")).toBe(
      "<p><span>Geöffnet:</span><span><br/>Mo bis Fr</span></p>" +
        "<ul><li>Kaffee</li><li><strong>Kuchen</strong></li></ul><ol><li>Bestellen</li><li>Genießen</li></ol>",
    );
  });

  test("never lets markup or unsafe links through", () => {
    expect(html("<script>alert(1)</script>")).toBe("<p><span>&lt;script&gt;alert(1)&lt;/script&gt;</span></p>");
    expect(html("[klick](javascript:alert(1))")).not.toContain("<a");
  });

  test("escaped characters stay literal", () => {
    const text = `${escapeRich("5 * 3 = 15, [Hinweis]")} und **fett**`;
    expect(parseInline(text)).toEqual([{ kind: "text", text: "5 * 3 = 15, [Hinweis] und " }, { kind: "bold", children: [{ kind: "text", text: "fett" }] }]);
  });

  test("plain text for teasers and feeds", () => {
    expect(plainText("**Neu:** unser [Brot](/brot)\n\n- Dinkel\n- Roggen")).toBe("Neu: unser Brot Dinkel Roggen");
  });

  test("text saved before formatting existed looks the same", () => {
    expect(parseRich("Erster Absatz\nzweite Zeile\n\nZweiter Absatz")).toHaveLength(2);
    expect(html("Preis: 3,50 € - frisch")).toBe("<p><span>Preis: 3,50 € - frisch</span></p>");
  });
});
