import { test, expect, type Page } from "@playwright/test";
import { latestSnapshot } from "./fixtures";

/**
 * Self-heal on deploy (US1). Runs against the REAL `vite preview` build so an
 * actually-emitted `dist/version.json` is served. Rather than stubbing the exotic
 * `window.location` object (whose `reload` cannot be reliably overridden in
 * Chromium), we let a genuine reload happen and COUNT main-frame navigations. To
 * avoid a reload loop, the changed-id route serves a blank id after the first
 * check, which the running page treats as "unknown" (no reload) — mirroring the
 * real world where the reloaded build's id now matches the served id.
 */
async function stubData(page: Page): Promise<void> {
  await page.route("**/api/v1/latest", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(latestSnapshot),
    }),
  );
}

/** Count main-frame navigations (the initial load plus any self-heal reload). */
function trackMainNavs(page: Page): () => number {
  let navs = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      navs += 1;
    }
  });
  return () => navs;
}

test.describe("self-heal on deploy — version.json", () => {
  test("reloads exactly once when the served build id differs", async ({
    page,
  }) => {
    // Arrange — first version check reports a DIFFERENT id (→ one reload); every
    // later check reports a blank id (→ "unknown", no reload) so the reloaded
    // page settles instead of looping.
    await stubData(page);
    let versionHits = 0;
    await page.route("**/version.json", (route) => {
      versionHits += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          buildId: versionHits === 1 ? "different-build-id-000" : "",
        }),
      });
    });
    const mainNavs = trackMainNavs(page);

    // Act
    await page.goto("/"); // navigation #1 (initial load)
    await expect(page.locator("[data-out-temp]")).toBeVisible();

    // Assert — exactly one self-heal reload (navigation #2), then it settles
    await expect.poll(mainNavs).toBe(2);
    await page.waitForTimeout(1000);
    expect(mainNavs()).toBe(2);
  });

  test("does not reload when the served build id equals the running build", async ({
    page,
  }) => {
    // Arrange — no version.json route: the real emitted marker (== baked id) serves
    await stubData(page);
    const mainNavs = trackMainNavs(page);

    // Act
    await page.goto("/");
    await expect(page.locator("[data-out-temp]")).toBeVisible();
    await page.waitForTimeout(1000);

    // Assert — only the initial load; no self-heal reload
    expect(mainNavs()).toBe(1);
  });

  test("does not reload when the version.json fetch fails", async ({ page }) => {
    // Arrange — version.json returns 500, so the served id is "unknown" (null)
    await stubData(page);
    await page.route("**/version.json", (route) =>
      route.fulfill({ status: 500, contentType: "text/plain", body: "boom" }),
    );
    const mainNavs = trackMainNavs(page);

    // Act
    await page.goto("/");
    await expect(page.locator("[data-out-temp]")).toBeVisible();
    await page.waitForTimeout(1000);

    // Assert — only the initial load; a failed check never reloads
    expect(mainNavs()).toBe(1);
  });
});
