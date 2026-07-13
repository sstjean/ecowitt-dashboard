import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

// Vitest runs with CWD = apps/web; resolve edge assets from there.
const publicDir = resolve(process.cwd(), "public");

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}
interface Manifest {
  name?: string;
  short_name?: string;
  display?: string;
  start_url?: string;
  theme_color?: string;
  background_color?: string;
  icons?: ManifestIcon[];
}

function loadManifest(): Manifest {
  const raw = readFileSync(resolve(publicDir, "manifest.webmanifest"), "utf8");
  return JSON.parse(raw) as Manifest;
}

describe("PWA web app manifest", () => {
  it("is valid JSON with the required install fields", () => {
    // Arrange + Act
    const m = loadManifest();

    // Assert
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.theme_color).toBe("#3d3b3a");
    expect(m.background_color).toBe("#3d3b3a");
    expect(typeof m.name).toBe("string");
    expect((m.name ?? "").length).toBeGreaterThan(0);
    expect(typeof m.short_name).toBe("string");
    expect((m.short_name ?? "").length).toBeGreaterThan(0);
  });

  it("declares 192, 512, and 512-maskable png icons that resolve to committed files", () => {
    // Arrange
    const m = loadManifest();
    const icons = m.icons ?? [];

    // Act
    const has = (size: string, maskable: boolean) =>
      icons.some(
        (i) =>
          i.sizes === size &&
          i.type === "image/png" &&
          (maskable ? (i.purpose ?? "").includes("maskable") : true),
      );

    // Assert
    expect(has("192x192", false)).toBe(true);
    expect(has("512x512", false)).toBe(true);
    expect(has("512x512", true)).toBe(true);
    for (const icon of icons) {
      const rel = icon.src.replace(/^\//, "");
      expect(
        readFileSync(resolve(publicDir, rel)).length,
        `icon src ${icon.src} must resolve under public/`,
      ).toBeGreaterThan(0);
    }
  });
});
