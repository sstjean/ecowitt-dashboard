import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { relativeLuminance, contrastRatio } from "../src/lib/contrast.ts";

const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

/** Pull a hex value for a CSS custom property out of the real stylesheet. */
function token(name: string): string {
  const value = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`))?.[1];
  if (value === undefined) {
    throw new Error(`token ${name} not found in styles.css`);
  }
  return value;
}

describe("contrast helper (WCAG)", () => {
  it("computes 21:1 for black on white", () => {
    // Arrange / Act
    const ratio = contrastRatio("#000000", "#ffffff");
    // Assert
    expect(ratio).toBeCloseTo(21, 0);
  });

  it("computes 1:1 for two identical colors", () => {
    // Arrange / Act
    const ratio = contrastRatio("#3d3b3a", "#3d3b3a");
    // Assert
    expect(ratio).toBeCloseTo(1, 5);
  });

  it("is order-independent", () => {
    // Arrange / Act / Assert
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(
      contrastRatio("#000000", "#ffffff"),
      5,
    );
  });

  it("supports 3-digit shorthand hex", () => {
    // Arrange / Act / Assert
    expect(relativeLuminance("#fff")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000")).toBeCloseTo(0, 5);
  });
});

describe("kiosk legibility — token contrast vs --cp-bg", () => {
  const bg = token("--cp-bg");

  it("muted text meets WCAG AA body contrast (>= 4.5:1)", () => {
    expect(contrastRatio(token("--cp-text-muted"), bg)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it("soft text meets WCAG AA body contrast (>= 4.5:1)", () => {
    expect(contrastRatio(token("--cp-text-soft"), bg)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it("the meaningful outline token reads at distance (>= 4.5:1)", () => {
    expect(contrastRatio(token("--cp-outline"), bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("strong borders meet WCAG AA non-text contrast (>= 3:1)", () => {
    expect(
      contrastRatio(token("--cp-border-strong"), bg),
    ).toBeGreaterThanOrEqual(3);
  });

  it("preserves the brand accent color", () => {
    expect(token("--cp-accent").toLowerCase()).toBe("#fd8ea1");
  });
});
