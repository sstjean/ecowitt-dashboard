/// <reference types="node" />
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHeader } from "../src/render/header.ts";

const css = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");

describe("accessibility", () => {
  it("provides a visible focus indicator for keyboard users", () => {
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:[^}]*/);
  });

  it("sizes interactive controls for touch (≥44px targets)", () => {
    expect(css).toMatch(/\.nav-item\s*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.hamburger\s*\{[^}]*height:\s*46px/);
  });

  it("renders headline dials at glance-readable scale", () => {
    expect(css).toMatch(/\.ring-center\s+\.big\s*\{[^}]*font-size:\s*clamp\(/);
  });

  it("exposes the menu and nav entries as focusable buttons", () => {
    const { element } = createHeader(document);
    document.body.append(element);

    const hamburger = element.querySelector(".hamburger");
    expect(hamburger?.tagName).toBe("BUTTON");
    expect(hamburger?.getAttribute("aria-label")).toBe("Open menu");

    const navButtons = [...element.querySelectorAll(".nav-item")];
    expect(navButtons).toHaveLength(5);
    expect(navButtons.every((b) => b.tagName === "BUTTON")).toBe(true);
    expect(navButtons[0]?.getAttribute("aria-current")).toBe("page");
  });
});
