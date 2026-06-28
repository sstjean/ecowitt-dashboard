import { test, expect, type Page } from "@playwright/test";
import { latestSnapshot } from "./fixtures";

/**
 * The wall-mounted kiosk is a Surface Pro 3 at its native 2160×1440 (3:2),
 * viewed from ~3 m. These checks guard the distance-legibility contract:
 * the bundled font resolves cross-platform, the primary readouts/icon scale
 * up at the kiosk tier, and the fixed viewport still contains everything.
 */
test.describe("wall kiosk legibility @ 2160x1440", () => {
  test.use({ viewport: { width: 2160, height: 1440 } });

  test.beforeEach(async ({ page }: { page: Page }) => {
    await page.route("**/api/v1/latest", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(latestSnapshot),
      }),
    );
    await page.goto("/");
    await expect(page.locator("[data-out-temp]")).toBeVisible();
  });

  test("renders the bundled Inter face, not a generic fallback", async ({
    page,
  }) => {
    const family = await page.evaluate(
      () => getComputedStyle(document.body).fontFamily,
    );
    expect(family).toMatch(/Inter/i);
  });

  test("loads the font asset same-origin", async ({ page }) => {
    const fontUrl = await page.evaluate(() => {
      const entry = performance
        .getEntriesByType("resource")
        .find((r) => /inter[^/]*\.woff2/i.test(r.name));
      return entry?.name ?? null;
    });
    expect(fontUrl).not.toBeNull();
    expect(new URL(fontUrl!).host).toBe(new URL(page.url()).host);
  });

  test("enlarges the primary ring readout beyond the desktop ceiling", async ({
    page,
  }) => {
    const px = await page
      .locator(".ring-center .big")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(px).toBeGreaterThan(58);
  });

  test("enlarges the condition icon to at least 1.3x the desktop ceiling", async ({
    page,
  }) => {
    const px = await page
      .locator(".cond-glyph")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(px).toBeGreaterThanOrEqual(72 * 1.3);
  });

  test("fits the fixed viewport with no vertical scroll", async ({ page }) => {
    const overflow = await page.evaluate(() => {
      const el = document.scrollingElement!;
      return el.scrollHeight - el.clientHeight;
    });
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
