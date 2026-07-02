import { test, expect } from "@playwright/test";
import { latestSnapshot } from "./fixtures";

/**
 * Reconnecting affordance (013 US1) end-to-end, against the REAL `vite preview`
 * build. Drives a genuine outage → recovery by flipping the stubbed
 * `/api/v1/latest` response, and asserts the subtle cue appears then clears while
 * the last-known value stays on screen. Timing is bound to the poll `intervalMs`
 * (~10 s default), not the 30 s staleness threshold — hence the generous waits.
 */
test.describe("reconnecting cue — outage → recover", () => {
  test("appears on failure and clears on recovery while values persist", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    // Arrange — /api/v1/latest succeeds first; a mutable flag flips it to fail
    // then back. version.json is left unstubbed (real marker == baked id → the
    // self-heal check never reloads and cannot interfere).
    let mode: "ok" | "fail" = "ok";
    await page.route("**/api/v1/latest", (route) => {
      if (mode === "fail") {
        return route.fulfill({
          status: 500,
          contentType: "text/plain",
          body: "boom",
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(latestSnapshot),
      });
    });

    const cue = page.locator(".reconnecting-cue");
    const outTemp = page.locator("[data-out-temp]");

    // Act 1 — healthy first paint: value shown, no cue
    await page.goto("/");
    await expect(outTemp).toBeVisible();
    const knownValue = (await outTemp.textContent()) ?? "";
    expect(knownValue).not.toBe("");
    await expect(cue).toBeHidden();

    // Act 2 — outage begins → cue appears within ~one poll interval (SC-001)
    mode = "fail";
    await expect(cue).toBeVisible({ timeout: 15_000 });
    // FR-004/SC-003: last-known value is NOT blanked while disconnected
    await expect(outTemp).toHaveText(knownValue);

    // Act 3 — data recovers → cue clears on its own within ~one interval (SC-002)
    mode = "ok";
    await expect(cue).toBeHidden({ timeout: 15_000 });
    await expect(outTemp).toHaveText(knownValue);
  });
});
