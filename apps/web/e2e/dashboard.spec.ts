import { test, expect, type Page, type Locator } from "@playwright/test";
import {
  latestSnapshot,
  noDataSnapshot,
  rainingSnapshot,
  faultSnapshot,
  longReasonFaultSnapshot,
} from "./fixtures";

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
    await expect(page.locator("[data-sunrise]")).toHaveText("6:27 am");
    await expect(page.locator("[data-sunset]")).toHaveText("8:25 pm");

    // The header clock is live wall-time; assert its Eastern 12-hour shape.
    await expect(page.locator(".h-time")).toHaveText(
      /^\d{1,2}:\d{2}:\d{2}\s(am|pm)$/,
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

/**
 * Rainfall-cue layout containment at the wall-kiosk viewport (Feature 010). The
 * original overflow was invisible to DOM-presence unit tests: the text was in
 * the DOM but the cue escaped the fixed-height `overflow:hidden` card. These
 * guards render the REAL built artifact at 2160×1440 and assert nothing clips
 * and the card never grows.
 */
test.describe("rainfall cue layout @ 2160x1440", () => {
  test.use({ viewport: { width: 2160, height: 1440 } });

  /** Card must not grow past its fixed box (±1px sub-pixel tolerance). */
  async function expectCardDoesNotGrow(card: Locator, label: string): Promise<void> {
    const grew = await card.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(grew, `${label}: card must not grow (scrollHeight ≤ clientHeight + 1)`)
      .toBeLessThanOrEqual(1);
  }

  test("State A — 'Raining now' nests above Daily Rain and nothing clips", async ({
    page,
  }) => {
    // Baseline: same reading but dry, so the banner is hidden. Used to prove the
    // banner's ONLY layout effect is to push Daily Rain down (the droplet, grid,
    // and Yearly total must NOT move, unlike the old full-width card banner).
    const drySnapshot = {
      ...rainingSnapshot,
      reading: { ...rainingSnapshot.reading, isRaining: false },
    };

    await mockLatest(page, drySnapshot);
    await page.goto("/");
    await expect(page.locator("[data-rain-daily]")).toBeVisible();
    const dryDrop = (await page.locator('[data-panel="rain"] .drop-wrap').boundingBox())!;
    const dryYearly = (await page.locator("[data-rain-yearly]").boundingBox())!;
    const dryDaily = (await page.locator("[data-rain-daily]").boundingBox())!;

    // Now route the raining snapshot and reload.
    await mockLatest(page, rainingSnapshot);
    await page.reload();
    const card = page.locator('[data-panel="rain"]');
    await expect(card).toBeVisible();
    await expect(page.locator("[data-rain-now]")).toBeVisible();

    // The banner is nested inside .rain-main and precedes the Daily Rain value.
    const bannerInMain = page.locator('[data-panel="rain"] .rain-main [data-rain-now]');
    await expect(bannerInMain).toHaveCount(1);
    const bannerBox = (await bannerInMain.boundingBox())!;
    const dailyBox = (await page.locator("[data-rain-daily]").boundingBox())!;
    expect(bannerBox.y, "banner sits above Daily Rain").toBeLessThan(dailyBox.y);

    // Containment: droplet, totals grid, and Yearly stay within the card box.
    await expectContained(card.locator(".drop-wrap"), card, "raining .drop-wrap");
    await expectContained(card.locator(".rain-grid"), card, "raining .rain-grid");
    await expectContained(page.locator("[data-rain-yearly]"), card, "raining Yearly");

    // Only Daily Rain shifts down; the droplet and Yearly total stay put.
    const wetDrop = (await card.locator(".drop-wrap").boundingBox())!;
    const wetYearly = (await page.locator("[data-rain-yearly]").boundingBox())!;
    expect(Math.abs(wetDrop.y - dryDrop.y), "droplet must not move").toBeLessThanOrEqual(1.5);
    expect(Math.abs(wetYearly.y - dryYearly.y), "Yearly must not move").toBeLessThanOrEqual(1.5);
    expect(dailyBox.y, "Daily Rain shifts down when raining").toBeGreaterThan(dryDaily.y + 1);

    // Card does not grow, and the cue meets the FR-008 legibility floor.
    await expectCardDoesNotGrow(card, "State A");
    const fontPx = await page
      .locator(".rain-now-text")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontPx, "'Raining now' font-size ≥ 13px").toBeGreaterThanOrEqual(13);
  });

  test("State B — sensor-fault overlay is centered, dims the body, and nothing clips", async ({
    page,
  }) => {
    await mockLatest(page, faultSnapshot);
    await page.goto("/");
    const card = page.locator('[data-panel="rain"]');
    await expect(card).toBeVisible();

    // Exactly one overlay, and it dims the card body behind it.
    const overlay = page.locator(".rain-fault-overlay[data-rain-fault]");
    await expect(overlay).toHaveCount(1);
    await expect(overlay).toBeVisible();
    await expect(page.locator('[data-panel="rain"] .rain-body.dimmed')).toHaveCount(1);
    // The "Raining now" banner must not be visible in the fault state.
    await expect(page.locator("[data-rain-now]")).toBeHidden();

    // The overlay is centered over the card and fully contained.
    const cardBox = (await card.boundingBox())!;
    const ov = (await overlay.boundingBox())!;
    const ovMidX = ov.x + ov.width / 2;
    const ovMidY = ov.y + ov.height / 2;
    expect(Math.abs(ovMidX - (cardBox.x + cardBox.width / 2)), "overlay mid-x centered")
      .toBeLessThan(cardBox.width * 0.15);
    expect(Math.abs(ovMidY - (cardBox.y + cardBox.height / 2)), "overlay mid-y centered")
      .toBeLessThan(cardBox.height * 0.15);
    await expectContained(overlay, card, "fault overlay");

    // Card does not grow, and the title meets the FR-008 legibility floor.
    await expectCardDoesNotGrow(card, "State B");
    const titlePx = await page
      .locator(".rain-fault-title")
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(titlePx, "fault title font-size ≥ 13px").toBeGreaterThanOrEqual(13);
  });

  test("State B (long reason) — overlay wraps/clips inside itself, card does not grow", async ({
    page,
  }) => {
    await mockLatest(page, longReasonFaultSnapshot);
    await page.goto("/");
    const card = page.locator('[data-panel="rain"]');
    const overlay = page.locator(".rain-fault-overlay[data-rain-fault]");
    await expect(overlay).toBeVisible();

    // Even with a long multi-clause reason, the overlay stays within the card
    // box and the card does not grow (the reason wraps/clips inside the overlay).
    await expectContained(overlay, card, "long-reason overlay");
    await expectCardDoesNotGrow(card, "State B long-reason");
  });

  test("State C — neither cue: dry + trusted shows no banner, no overlay, no dim", async ({
    page,
  }) => {
    const drySnapshot = {
      ...rainingSnapshot,
      reading: { ...rainingSnapshot.reading, isRaining: false },
      rainSensorSuspect: false,
      rainSensorReason: null,
    };
    await mockLatest(page, drySnapshot);
    await page.goto("/");
    const card = page.locator('[data-panel="rain"]');
    await expect(card).toBeVisible();

    await expect(page.locator("[data-rain-now]")).toBeHidden();
    await expect(page.locator(".rain-fault-overlay")).toHaveCount(0);
    await expect(page.locator('[data-panel="rain"] .rain-body.dimmed')).toHaveCount(0);
    await expectContained(card.locator(".rain-grid"), card, "State C .rain-grid");
    await expectCardDoesNotGrow(card, "State C");
  });

  test("mutual exclusivity — a suspect gauge suppresses 'Raining now' even while raining", async ({
    page,
  }) => {
    const suspectAndRaining = {
      ...faultSnapshot,
      reading: { ...faultSnapshot.reading, isRaining: true },
    };
    await mockLatest(page, suspectAndRaining);
    await page.goto("/");
    // The overlay is shown and the banner must not be visible.
    await expect(page.locator(".rain-fault-overlay[data-rain-fault]")).toBeVisible();
    await expect(page.locator("[data-rain-now]")).toBeHidden();
  });
});

/**
 * Sensor battery & signal health (Feature 007). The health set rides the same
 * `/latest` envelope, so no second web call is made. These guards render the
 * REAL built artifact and assert the per-card indicators (US2) and the dedicated
 * overlay reached via the header "Sensors" item (US3).
 */
test.describe("sensor health — per-card indicators (US2)", () => {
  test.beforeEach(async ({ page }) => {
    await mockLatest(page, latestSnapshot);
    await page.goto("/");
    await expect(page.locator("[data-out-temp]")).toBeVisible();
  });

  test("shows 4 bars + OK on each WS90-backed card and no indicator on the wired cards", async ({
    page,
  }) => {
    // The single WS90 (1242D) backs outdoor/solar/rain — all reflect one record.
    for (const panel of ["outdoor", "solar", "rain"]) {
      const ind = page.locator(`[data-panel="${panel}"] > .sensor-indicator`);
      await expect(ind, `${panel} indicator`).toBeVisible();
      await expect(ind).toHaveAttribute("data-sensor-indicator", "1242D");
      await expect(ind.locator(".sig-bars")).toHaveAttribute("data-signal-bars", "4");
      await expect(ind.locator(".sig-bar.on")).toHaveCount(4);
      await expect(ind.locator(".batt-badge")).toHaveAttribute("data-battery", "OK");
    }
    // Indoor/baro have no backing get_sensors_info radio (the wired wh25 is
    // reported only in get_livedata_info) → no indicator at all, honest absence.
    for (const panel of ["indoor", "baro"]) {
      await expect(page.locator(`[data-panel="${panel}"] > .sensor-indicator`)).toHaveCount(0);
    }
  });
});

test.describe("sensor health — dedicated overlay (US3)", () => {
  test.beforeEach(async ({ page }) => {
    await mockLatest(page, latestSnapshot);
    await page.goto("/");
    await expect(page.locator("[data-out-temp]")).toBeVisible();
  });

  test("is hidden until 'Sensors' is chosen, then lists every registered sensor (Eastern last-seen)", async ({
    page,
  }) => {
    const overlay = page.locator("[data-sensor-health-overlay]");
    await expect(overlay).toBeHidden();

    await page.locator(".hamburger").click();
    await page.getByRole("button", { name: "Sensors" }).click();
    await expect(overlay).toBeVisible();

    await expect(overlay.locator(".sh-row")).toHaveCount(2);
    await expect(overlay.locator('.sh-row[data-sensor-id="1242D"]')).toContainText("WS90");
    await expect(overlay.locator('.sh-row[data-sensor-id="A0"]')).toContainText("CH2");
    // No fabricated wired wh25 (C7) row is served or rendered.
    await expect(overlay.locator('.sh-row[data-sensor-id="C7"]')).toHaveCount(0);
    // Last-seen renders in America/New_York: 20:19Z → 4:19 pm EDT (SC-007).
    await expect(
      overlay.locator('.sh-row[data-sensor-id="1242D"] .sh-lastseen'),
    ).toContainText("4:19 pm");

    // Closing restores the kiosk view.
    await overlay.locator(".sh-close").click();
    await expect(overlay).toBeHidden();
  });
});
