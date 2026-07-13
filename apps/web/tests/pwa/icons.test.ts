import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { decodePng } from "./png.ts";

const publicDir = resolve(process.cwd(), "public");
const generator = resolve(process.cwd(), "scripts", "make-icons.py");

const FIELD: [number, number, number] = [61, 59, 58]; // #3d3b3a
const CORAL: [number, number, number] = [253, 142, 161]; // #fd8ea1

const ICONS: Array<{ file: string; size: number }> = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "icon-512-maskable.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
];

describe("PWA icon assets", () => {
  it("has the committed generator that produces them (FR-010)", () => {
    // Arrange + Act + Assert
    expect(existsSync(generator)).toBe(true);
  });

  it("commits favicon.ico", () => {
    // Arrange + Act + Assert
    expect(readFileSync(resolve(publicDir, "favicon.ico")).length).toBeGreaterThan(0);
  });

  it.each(ICONS)("$file is a valid PNG at $size×$size and fully opaque", ({ file, size }) => {
    // Arrange
    const png = decodePng(readFileSync(resolve(publicDir, file)));

    // Act
    let opaque = true;
    if (png.hasAlpha) {
      for (let y = 0; y < png.height && opaque; y++) {
        for (let x = 0; x < png.width; x++) {
          if (png.pixel(x, y)[3] !== 255) {
            opaque = false;
            break;
          }
        }
      }
    }

    // Assert
    expect(png.width).toBe(size);
    expect(png.height).toBe(size);
    expect(opaque).toBe(true);
  });

  it("renders the Clawpilot palette — dark field with a coral glyph (FR-011)", () => {
    // Arrange
    const png = decodePng(readFileSync(resolve(publicDir, "icon-512.png")));

    // Act: the corner is the full-bleed field; scan for the coral accent anywhere.
    const corner = png.pixel(2, 2);
    let coralFound = false;
    for (let y = 0; y < png.height && !coralFound; y++) {
      for (let x = 0; x < png.width; x++) {
        const [r, g, b] = png.pixel(x, y);
        if (r === CORAL[0] && g === CORAL[1] && b === CORAL[2]) {
          coralFound = true;
          break;
        }
      }
    }

    // Assert
    expect([corner[0], corner[1], corner[2]]).toEqual(FIELD);
    expect(coralFound).toBe(true);
  });
});
