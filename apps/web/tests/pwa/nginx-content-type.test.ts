import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

function loadNginxConf(): string {
  return readFileSync(resolve(process.cwd(), "nginx.conf"), "utf8");
}

describe("nginx manifest content-type", () => {
  it("serves /manifest.webmanifest as application/manifest+json", () => {
    // Arrange
    const conf = loadNginxConf();

    // Act: isolate the exact-match manifest location block.
    const block = conf.match(/location\s*=\s*\/manifest\.webmanifest\s*\{[^}]*\}/);

    // Assert
    expect(block, "expected a `location = /manifest.webmanifest` block").not.toBeNull();
    expect(block?.[0]).toMatch(/default_type\s+application\/manifest\+json\s*;/);
    expect(block?.[0]).toMatch(/try_files\s+\$uri\s+=404\s*;/);
  });

  it("leaves the existing SPA fallback and API proxy blocks intact", () => {
    // Arrange
    const conf = loadNginxConf();

    // Act + Assert
    expect(conf).toMatch(/location\s+\/api\/\s*\{/);
    expect(conf).toMatch(/proxy_pass\s+http:\/\/api:8080\s*;/);
    expect(conf).toMatch(/try_files\s+\$uri\s+\$uri\/\s+\/index\.html\s*;/);
  });
});
