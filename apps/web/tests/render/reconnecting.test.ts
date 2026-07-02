import { describe, it, expect } from "vitest";
import { createReconnectingCue } from "../../src/render/reconnecting.ts";

/**
 * Unit contract for the reconnecting cue (013 US1, FR-001..FR-006/FR-009).
 * Pure DOM factory: a hidden cue that shows a dot + fixed "Reconnecting…" label
 * on `set(true)`, hides on `set(false)`, is idempotent, and renders no time.
 */
describe("createReconnectingCue", () => {
  it("is hidden on creation — never shown before a failure (FR-003/SC-004)", () => {
    // Arrange
    const cue = createReconnectingCue(document);

    // Act — no set() call

    // Assert
    expect(cue.element.hidden).toBe(true);
  });

  it("set(true) reveals a pulsing dot AND a fixed 'Reconnecting…' label (FR-001/FR-006)", () => {
    // Arrange
    const cue = createReconnectingCue(document);

    // Act
    cue.set(true);

    // Assert
    expect(cue.element.hidden).toBe(false);
    expect(cue.element.querySelector(".rc-dot")).not.toBeNull();
    const label = cue.element.querySelector(".rc-label");
    expect(label?.textContent).toBe("Reconnecting…");
  });

  it("set(false) hides the cue again (FR-002/SC-002)", () => {
    // Arrange
    const cue = createReconnectingCue(document);
    cue.set(true);

    // Act
    cue.set(false);

    // Assert
    expect(cue.element.hidden).toBe(true);
  });

  it("is idempotent — set(true) twice keeps a single steady cue, no re-insert (FR-005/SC-005)", () => {
    // Arrange
    const cue = createReconnectingCue(document);
    cue.set(true);
    const dotBefore = cue.element.querySelector(".rc-dot");
    const childCountBefore = cue.element.childElementCount;

    // Act
    cue.set(true);

    // Assert — same nodes, not re-created (no animation restart)
    expect(cue.element.querySelector(".rc-dot")).toBe(dotBefore);
    expect(cue.element.childElementCount).toBe(childCountBefore);
    expect(cue.element.hidden).toBe(false);
  });

  it("stays hidden when only set(false) is ever called (FR-003/SC-004)", () => {
    // Arrange
    const cue = createReconnectingCue(document);

    // Act
    cue.set(false);

    // Assert
    expect(cue.element.hidden).toBe(true);
  });

  it("renders a fixed label with NO time value (FR-009)", () => {
    // Arrange
    const cue = createReconnectingCue(document);

    // Act
    cue.set(true);

    // Assert — no HH:MM style time anywhere in the cue
    expect(cue.element.textContent).toBe("Reconnecting…");
    expect(cue.element.textContent ?? "").not.toMatch(/\d{1,2}:\d{2}/);
  });
});
