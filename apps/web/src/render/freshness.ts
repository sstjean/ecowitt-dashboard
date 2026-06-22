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

/**
 * Display-side poll cadence (seconds). A reading older than 3× this cadence is
 * Stale (spec clarification). Matches the poller default; the gateway cadence is
 * clamped to 30–60 s, so 30 s is the conservative display threshold.
 */
export const POLL_CADENCE_SECONDS = 30;

/**
 * Dim a panel that still holds a value but whose reading has aged into Stale:
 * add the `stale` class (CSS dims it) and stamp a `STALE` badge over the last
 * value — the value is never blanked.
 */
export function markPanelStale(host: HTMLElement): void {
  const doc = host.ownerDocument;
  host.classList.add("stale");
  host.append(el(doc, "span", { class: "stale-badge", "data-stale": "" }, "STALE"));
}
