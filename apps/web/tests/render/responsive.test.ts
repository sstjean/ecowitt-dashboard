/// <reference types="node" />
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");
const html = readFileSync(join(process.cwd(), "index.html"), "utf8");

/** Extract the body of the first `@media (max-width: 900px) { ... }` block. */
function phoneBlock(source: string): string {
  const start = source.indexOf("@media (max-width: 900px)");
  expect(start).toBeGreaterThanOrEqual(0);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error("unterminated media block");
}

describe("responsive layout", () => {
  it("lays the stage out as side-by-side columns at desktop width", () => {
    expect(css).toMatch(/\.stage\s*\{[^}]*display:\s*flex/);
    expect(css).toMatch(/\.col-left\s*\{[^}]*flex:/);
    expect(css).toMatch(/\.col-right\s*\{[^}]*flex:/);
  });

  it("stacks into a single scrolling column below 900px", () => {
    const phone = phoneBlock(css);
    expect(phone).toMatch(/\.stage\s*\{[^}]*flex-direction:\s*column/);
    expect(phone).toMatch(/#app\s*\{[^}]*overflow:\s*visible/);
  });

  it("orders the stacked panels Outdoors → Solar → Indoors → Rainfall → Barometer", () => {
    const order = [...html.matchAll(/data-panel="([^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(["outdoor", "solar", "indoor", "rain", "baro"]);
  });
});
