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

/** A single nav entry. The active page is current; the rest are placeholders. */
function navItem(doc: Document, label: string, active: boolean): HTMLElement {
  const attrs = active
    ? { class: "nav-item active", "aria-current": "page" }
    : { class: "nav-item", "aria-disabled": "true" };
  return el(doc, "button", attrs, label);
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

  // In-app navigation: Live is the active page; History/Trends/Records/Settings
  // are placeholders until their views land. Collapsed behind the hamburger.
  const nav = el(
    doc,
    "nav",
    { class: "h-nav", hidden: "" },
    navItem(doc, "Live", true),
    navItem(doc, "History", false),
    navItem(doc, "Trends", false),
    navItem(doc, "Records", false),
    navItem(doc, "Settings", false),
  );
  hamburger.addEventListener("click", () => {
    nav.hidden = !nav.hidden;
    hamburger.setAttribute("aria-expanded", String(!nav.hidden));
  });

  const element = el(doc, "header", { class: "header" }, hamburger, date, time, nav);

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
