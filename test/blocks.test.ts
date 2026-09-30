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
      { id: "a", type: "heading", text: "Hallo" },
      { id: "b", type: "text", text: "Absatz" },
      { id: "c", type: "image", src: "/media/theta.svg", alt: "Theta" },
    ]);
  });

  test.each([
    ["no list", { id: "a" }],
    ["unknown type", [{ id: "a", type: "video" }]],
    ["missing text", [{ id: "a", type: "heading" }]],
    ["duplicate ids", [{ id: "a", type: "text", text: "" }, { id: "a", type: "text", text: "" }]],
    ["javascript url", [{ id: "a", type: "image", src: "javascript:alert(1)", alt: "" }]],
    ["protocol-relative url", [{ id: "a", type: "image", src: "//evil.example/x.png", alt: "" }]],
  ])("rejects %s", (_, input) => {
    expect(() => parseBlocks(input)).toThrow(ValidationError);
  });
});
