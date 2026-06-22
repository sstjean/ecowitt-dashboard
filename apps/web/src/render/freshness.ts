import { el, svgEl } from "./dom.ts";

/**
 * Build a neutral, value-less ring (track only, no temperature gradient) for a
 * panel that has no data to show. The caller fills `.ring-center`.
 */
export function buildMissingRing(doc: Document): {
  wrap: HTMLElement;
  center: HTMLElement;
} {
  const svg = svgEl(
    doc,
    "svg",
    { class: "ring full missing", viewBox: "0 0 200 200" },
    svgEl(doc, "circle", { class: "track", cx: "100", cy: "100", r: "86" }),
  );
  const center = el(doc, "div", { class: "ring-center" });
  const wrap = el(doc, "div", { class: "ring-wrap" }, svg, center);
  return { wrap, center };
}

/**
 * Render every gauge host in its Missing state: an em-dash (`—`) on a neutral
 * gauge, never a fabricated `0`. Used when the API reports `no-data`.
 */
export function renderMissingState(root: HTMLElement): void {
  const doc = root.ownerDocument;
  for (const host of root.querySelectorAll<HTMLElement>("[data-ring]")) {
    const { wrap, center } = buildMissingRing(doc);
    center.append(el(doc, "div", { class: "big" }, el(doc, "span", { class: "missing" }, "—")));
    host.replaceChildren(wrap);
  }
}
