import { describe, expect, test } from "bun:test";
import { ValidationError, parseBlocks } from "../src/blocks";

describe("parseBlocks", () => {
  test("accepts the three block types and drops unknown properties", () => {
    const blocks = parseBlocks([
      { id: "a", type: "heading", text: "Hallo", color: "red" },
      { id: "b", type: "text", text: "Absatz" },
      { id: "c", type: "image", src: " /media/theta.svg ", alt: "Theta" },
    ]);
    expect(blocks).toEqual([
      { id: "a", type: "heading", text: "Hallo", level: 1 },
      { id: "b", type: "text", text: "Absatz" },
      { id: "c", type: "image", src: "/media/theta.svg", alt: "Theta", caption: "", width: "normal" },
    ]);
  });

  test("headings saved before levels existed: the first is the title, the rest are section headings", () => {
    const blocks = parseBlocks([
      { id: "a", type: "heading", text: "Speisekarte" },
      { id: "b", type: "heading", text: "Frühstück" },
      { id: "c", type: "heading", text: "Getränke", level: 3 },
    ]);
    expect(blocks.map((block) => block.type === "heading" && block.level)).toEqual([1, 2, 3]);
  });

  test("image width falls back to normal", () => {
    const [block] = parseBlocks([{ id: "a", type: "image", src: "/a.png", alt: "", caption: "Unser Laden", width: "huge" }]);
    expect(block).toMatchObject({ caption: "Unser Laden", width: "normal" });
  });

  test.each([
    ["no list", { id: "a" }],
    ["unknown type", [{ id: "a", type: "video" }]],
    ["missing text", [{ id: "a", type: "heading" }]],
    ["unknown heading level", [{ id: "a", type: "heading", text: "", level: 4 }]],
    ["duplicate ids", [{ id: "a", type: "text", text: "" }, { id: "a", type: "text", text: "" }]],
    ["javascript url", [{ id: "a", type: "image", src: "javascript:alert(1)", alt: "" }]],
    ["protocol-relative url", [{ id: "a", type: "image", src: "//evil.example/x.png", alt: "" }]],
  ])("rejects %s", (_, input) => {
    expect(() => parseBlocks(input)).toThrow(ValidationError);
  });
});
