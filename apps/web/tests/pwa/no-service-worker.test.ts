import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const webRoot = process.cwd();
const SCAN_DIRS = ["src", "public"];

function walk(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

describe("no service worker (LAN HTTP, deliberate — FR-008)", () => {
  it("registers no service worker and ships no sw.js anywhere", () => {
    // Arrange: gather index.html plus every file under src/ and public/.
    const files = [resolve(webRoot, "index.html")];
    for (const sub of SCAN_DIRS) {
      files.push(...walk(resolve(webRoot, sub)));
    }

    // Act
    const swFiles = files.filter((f) => /(?:^|\/)(sw|service-worker)\.js$/.test(f));
    const registrations = files.filter((f) => {
      if (!/\.(ts|js|html)$/.test(f)) return false;
      return /serviceWorker\s*\.\s*register\s*\(/.test(readFileSync(f, "utf8"));
    });

    // Assert
    expect(swFiles).toEqual([]);
    expect(registrations).toEqual([]);
  });
});
