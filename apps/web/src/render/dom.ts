/** Tiny DOM builders shared by the render modules. */

type Child = Node | string;

function append(node: Element, children: readonly Child[]): void {
  for (const child of children) {
    node.append(child);
  }
}

/** Create an HTML element with attributes and children. */
export function el(
  doc: Document,
  tag: string,
  attrs: Readonly<Record<string, string>> = {},
  ...children: readonly Child[]
): HTMLElement {
  const node = doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  append(node, children);
  return node;
}

/** Create an SVG element (correct namespace) with attributes and children. */
export function svgEl(
  doc: Document,
  tag: string,
  attrs: Readonly<Record<string, string>> = {},
  ...children: readonly Child[]
): SVGElement {
  const node = doc.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  append(node, children);
  return node;
}
