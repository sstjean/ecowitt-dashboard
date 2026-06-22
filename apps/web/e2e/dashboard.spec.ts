import { test, expect, type Page, type Locator } from "@playwright/test";
import { latestSnapshot, noDataSnapshot } from "./fixtures";

/** Stub `/api/v1/latest` so the dashboard renders a deterministic snapshot. */
async function mockLatest(page: Page, body: unknown): Promise<void> {
  await page.route("**/api/v1/latest", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

/**
 * Assert a panel's inner content stays within its card's box. This is the guard
 * the DOM unit tests cannot give us: the live regression had all the right text
 * in the DOM, but the overlays escaped their `overflow:hidden` card and were
 * clipped (rendered ~400px below the card). Containment catches exactly that.
 */
async function expectContained(
  child: Locator,
  card: Locator,
  label: string,
): Promise<void> {
  const c = await child.boundingBox();
  const p = await card.boundingBox();
  expect(c, `${label}: expected a layout box`).not.toBeNull();
  expect(p, `${label}: expected the card to have a layout box`).not.toBeNull();
  const tol = 1.5;
  expect(c!.x, `${label}: left edge inside card`).toBeGreaterThanOrEqual(p!.x - tol);
  expect(c!.y, `${label}: top edge inside card`).toBeGreaterThanOrEqual(p!.y - tol);
  expect(
    c!.x + c!.width,
    `${label}: right edge inside card`,
  ).toBeLessThanOrEqual(p!.x + p!.width + tol);
  expect(
    c!.y + c!.height,
    `${label}: bottom edge inside card`,
  ).toBeLessThanOrEqual(p!.y + p!.height + tol);
}

test.describe("live dashboard — populated", () => {
  let consoleErrors: string[];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));

    await mockLatest(page, latestSnapshot);
    await page.goto("/");
    // First paint is driven by the immediate poll; wait for real data.
    await expect(page.locator("[data-out-temp]")).toBeVisible();
  });

  test("renders every curated reading value", async ({ page }) => {
    // Outdoor
    await expect(page.locator("[data-out-temp]")).toHaveText("89");
    await expect(page.locator("[data-out-hi]")).toHaveText("91");
    await expect(page.locator("[data-out-lo]")).toHaveText("74");
    await expect(page.locator("[data-feels]")).toHaveText("97");
    await expect(page.locator("[data-out-dew]")).toHaveText("73");
    await expect(page.locator("[data-out-hum]")).toHaveText("62");

    // Wind
    await expect(page.locator("[data-wind-speed]")).toHaveText("6.5");
    await expect(page.locator("[data-wind-dir]")).toHaveText("SE");
    await expect(page.locator("[data-wind-deg]")).toHaveText("135");
    await expect(page.locator("[data-wind-gust]")).toHaveText("12.0");
    await expect(page.locator("[data-wind-avg]")).toHaveText("SE 6.5");
    await expect(page.locator("[data-wind-maxgust]")).toHaveText("SE 18.0");

    // Solar & Sky
    await expect(page.locator("[data-solar]")).toHaveText("720");
    await expect(page.locator("[data-uv]")).toHaveText("7");
    await expect(page.locator("[data-moon-phase]")).toHaveText("First Quarter");

    // Indoor
    await expect(page.locator("[data-in-temp]")).toHaveText("75");
    await expect(page.locator("[data-in-hum]")).toHaveText("51");

    // Rainfall
    await expect(page.locator("[data-rain-daily]")).toHaveText("0.35");
    await expect(page.locator("[data-rain-rate]")).toHaveText("0.08");
    await expect(page.locator("[data-rain-event]")).toHaveText("0.12 in");
    await expect(page.locator("[data-rain-hourly]")).toHaveText("0.05 in");
    await expect(page.locator("[data-rain-weekly]")).toHaveText("1.20 in");
    await expect(page.locator("[data-rain-monthly]")).toHaveText("3.40 in");
    await expect(page.locator("[data-rain-yearly]")).toHaveText("24.60 in");
    await expect(page.locator("[data-rain-now]")).toBeVisible();

    // Barometer
    await expect(page.locator("[data-press]")).toHaveText("1014.2");
    await expect(page.locator("[data-baro-trend]")).toHaveText("↗");
    await expect(page.locator("[data-baro-delta]")).toHaveText("1.2");
    await expect(page.locator("[data-cond-icon]")).toHaveAttribute(
      "data-cond-icon",
      "partly-cloudy",
    );
  });

  test("renders sun times and the clock in Eastern time", async ({ page }) => {
    // 10:27Z → 6:27 AM EDT, 00:25Z(+1d) → 8:25 PM EDT: proves America/New_York.
    await expect(page.locator("[data-sunrise]")).toHaveText("6:27 AM");
    await expect(page.locator("[data-sunset]")).toHaveText("8:25 PM");

    // The header clock is live wall-time; assert its Eastern 12-hour shape.
    await expect(page.locator(".h-time")).toHaveText(
      /^\d{1,2}:\d{2}:\d{2}\s(AM|PM)$/,
    );
    await expect(page.locator(".h-date")).toHaveText(
      /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), [A-Z][a-z]+ \d{1,2}(st|nd|rd|th), \d{4}$/,
    );
  });

  test("keeps every panel's content inside its card", async ({ page }) => {
    const checks: Array<[string, string[]]> = [
      ["outdoor", [".wind-center", ".out-metrics", ".out-metrics .divider"]],
      ["solar", [".astro-center", ".astro-times", ".moon"]],
      ["rain", [".rain-main", ".rain-grid", ".drop-wrap"]],
      ["indoor", [".out-gauges"]],
      ["baro", [".baro-info", ".cond-icon"]],
    ];
    for (const [panel, children] of checks) {
      const card = page.locator(`[data-panel="${panel}"]`);
      await expect(card).toBeVisible();
      for (const sel of children) {
        const child = card.locator(sel).first();
        await expect(child, `${panel} ${sel} should be visible`).toBeVisible();
        await expectContained(child, card, `${panel} ${sel}`);
      }
    }
  });

  test("centres the Solar & Sky readouts over the dome", async ({ page }) => {
    // The overlay must sit in the dome's upper half, not stack below the card.
    const card = page.locator('[data-panel="solar"]');
    const cardBox = (await card.boundingBox())!;
    const centerBox = (await card.locator(".astro-center").boundingBox())!;
    const centerMidY = centerBox.y + centerBox.height / 2;
    expect(centerMidY).toBeLessThan(cardBox.y + cardBox.height * 0.75);
    expect(centerMidY).toBeGreaterThan(cardBox.y);
  });

  test("logs no console or page errors", async () => {
    expect(consoleErrors).toEqual([]);
  });
});

test.describe("live dashboard — no data", () => {
  test("falls back to the Missing em-dash, never a fabricated 0", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(String(err)));

    await mockLatest(page, noDataSnapshot);
    await page.goto("/");

    const dashes = page.locator(".ring-center .missing");
    await expect(dashes.first()).toBeVisible();
    await expect(dashes.first()).toHaveText("—");
    // No fabricated readings should appear.
    await expect(page.locator("[data-out-temp]")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
