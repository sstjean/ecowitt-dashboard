import { el, svgEl } from "./dom.ts";
import { formatEasternDate, formatEasternClock } from "../format/eastern.ts";

export interface HeaderHandle {
  /** The `<header>` element to mount. */
  element: HTMLElement;
  /** Repaint the date + clock for a given instant. */
  update(date: Date): void;
  /** Start the 1-second clock tick; returns a stop function. */
  start(now?: () => Date): () => void;
}

/** Build the three-zone header: menu button, centred date, right-aligned clock. */
export function createHeader(doc: Document): HeaderHandle {
  const menuIcon = svgEl(
    doc,
    "svg",
    { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2" },
    svgEl(doc, "path", { d: "M4 7h16M4 12h16M4 17h16" }),
  );
  const hamburger = el(
    doc,
    "button",
    { class: "hamburger", "aria-label": "Open menu", "aria-expanded": "false" },
    menuIcon,
  );
  const date = el(doc, "div", { class: "h-date" }, "—");
  const time = el(doc, "div", { class: "h-time" }, "--:--:--");
  const element = el(doc, "header", { class: "header" }, hamburger, date, time);

  function update(at: Date): void {
    date.textContent = formatEasternDate(at);
    time.textContent = formatEasternClock(at);
  }

  function start(now: () => Date = () => new Date()): () => void {
    update(now());
    const handle = setInterval(() => update(now()), 1000);
    return () => clearInterval(handle);
  }

  return { element, update, start };
}
