import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  return [...text.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]!);
}

const webFiles = sourceFiles(join(REPO_ROOT, "apps/web/src"));
const allSrc = [
  ...webFiles,
  ...sourceFiles(join(REPO_ROOT, "apps/api/src")),
  ...sourceFiles(join(REPO_ROOT, "apps/poller/src")),
];

describe("architectural import boundaries", () => {
  it("keeps the gateway client a poller-only dependency (FR-044)", () => {
    const offenders = allSrc.filter(
      (file) =>
        importsOf(file).some((spec) => spec.includes("gatewayClient")) &&
        !file.includes(join("apps", "poller", "src")),
    );
    expect(offenders).toEqual([]);
  });

  it("lets the web reach data only via api.ts — never the store or gateway (FR-036)", () => {
    const offenders = webFiles.filter((file) =>
      importsOf(file).some(
        (spec) =>
          spec.includes("gatewayClient") ||
          spec.includes("better-sqlite3") ||
          /(^|\/)store(\.ts)?$/.test(spec) ||
          spec.startsWith("@ecowitt/api") ||
          spec.startsWith("@ecowitt/poller"),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("scoped the scan to real source (sanity: files were found)", () => {
    expect(webFiles.length).toBeGreaterThan(0);
  });
});
