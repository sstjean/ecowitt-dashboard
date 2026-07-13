import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

function loadIndexHtml(): string {
  return readFileSync(resolve(process.cwd(), "index.html"), "utf8");
}

describe("index.html PWA <head> tags", () => {
  it("adds the six additive PWA tags plus a favicon link", () => {
    // Arrange
    const html = loadIndexHtml();

    // Act + Assert
    expect(html).toMatch(/<link\s+rel="manifest"\s+href="\/manifest\.webmanifest"\s*\/?>/);
    expect(html).toMatch(/<meta\s+name="theme-color"\s+content="#3d3b3a"\s*\/?>/);
    expect(html).toMatch(/<meta\s+name="apple-mobile-web-app-capable"\s+content="yes"\s*\/?>/);
    expect(html).toMatch(
      /<meta\s+name="apple-mobile-web-app-status-bar-style"\s+content="[^"]+"\s*\/?>/,
    );
    expect(html).toMatch(/<meta\s+name="apple-mobile-web-app-title"\s+content="[^"]+"\s*\/?>/);
    expect(html).toMatch(/<link\s+rel="apple-touch-icon"\s+href="\/apple-touch-icon\.png"\s*\/?>/);
    expect(html).toMatch(/<link\s+rel="icon"\s+href="\/favicon\.ico"[^>]*>/);
  });

  it("leaves the pre-existing SPA shell unchanged (additive-only guard)", () => {
    // Arrange
    const html = loadIndexHtml();

    // Act + Assert
    expect(html).toContain('<div id="app">');
    expect(html).toContain('<script type="module" src="/src/bootstrap.ts"></script>');
    expect(html).toContain('<link rel="stylesheet" href="/src/styles.css" />');
    expect(html).toMatch(/<meta\s+name="viewport"\s+content="width=device-width/);
    expect(html).toContain("<title>");
  });
});
