import { describe, it, expect, vi } from "vitest";
import { decideReload } from "../src/selfHeal.ts";

/**
 * Load a FRESH instance of the module so the module-level `hasReloaded` latch
 * starts `false` for every effect-runner test — no shared state between tests.
 */
async function freshCheckForUpdate(): Promise<
  (typeof import("../src/selfHeal.ts"))["checkForUpdate"]
> {
  vi.resetModules();
  const mod = await import("../src/selfHeal.ts");
  return mod.checkForUpdate;
}

function versionResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("decideReload (pure decision table)", () => {
  it("row 1: null served id (fetch/parse unknown) → no reload", () => {
    // Arrange
    const runningId = "build-abc";

    // Act
    const result = decideReload(runningId, null);

    // Assert
    expect(result).toBe(false);
  });

  it("row 2: served id equals running id → no reload", () => {
    // Arrange
    const id = "build-abc";

    // Act
    const result = decideReload(id, id);

    // Assert
    expect(result).toBe(false);
  });

  it("row 3: served id differs from running id → reload", () => {
    // Arrange
    const runningId = "build-abc";
    const servedId = "build-xyz";

    // Act
    const result = decideReload(runningId, servedId);

    // Assert
    expect(result).toBe(true);
  });

  it("row 4: blank/whitespace served id → no reload", () => {
    // Arrange
    const runningId = "build-abc";

    // Act
    const blank = decideReload(runningId, "");
    const whitespace = decideReload(runningId, "   ");

    // Assert
    expect(blank).toBe(false);
    expect(whitespace).toBe(false);
  });
});

describe("checkForUpdate (effect runner)", () => {
  it("fetches /version.json with cache: 'no-store' (FR-006)", async () => {
    // Arrange
    const checkForUpdate = await freshCheckForUpdate();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(versionResponse({ buildId: "build-abc" }));
    const reload = vi.fn();

    // Act
    await checkForUpdate({ fetchImpl, reload, getRunning: () => "build-abc" });

    // Assert
    expect(fetchImpl).toHaveBeenCalledWith("/version.json", {
      cache: "no-store",
    });
  });

  it("reloads exactly once when the served id changed (FR-007)", async () => {
    // Arrange
    const checkForUpdate = await freshCheckForUpdate();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(versionResponse({ buildId: "build-new" }));
    const reload = vi.fn();

    // Act
    await checkForUpdate({ fetchImpl, reload, getRunning: () => "build-old" });

    // Assert
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload when the served id equals the running id (FR-008)", async () => {
    // Arrange
    const checkForUpdate = await freshCheckForUpdate();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(versionResponse({ buildId: "build-same" }));
    const reload = vi.fn();

    // Act
    await checkForUpdate({ fetchImpl, reload, getRunning: () => "build-same" });

    // Assert
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload when the fetch rejects (network error, FR-009)", async () => {
    // Arrange
    const checkForUpdate = await freshCheckForUpdate();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const reload = vi.fn();

    // Act
    await checkForUpdate({ fetchImpl, reload, getRunning: () => "build-old" });

    // Assert
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload on a non-ok HTTP status (FR-009)", async () => {
    // Arrange
    const checkForUpdate = await freshCheckForUpdate();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(versionResponse({ buildId: "build-new" }, false));
    const reload = vi.fn();

    // Act
    await checkForUpdate({ fetchImpl, reload, getRunning: () => "build-old" });

    // Assert
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload when the body is not JSON (FR-009)", async () => {
    // Arrange
    const checkForUpdate = await freshCheckForUpdate();
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new SyntaxError("bad json")),
    } as unknown as Response);
    const reload = vi.fn();

    // Act
    await checkForUpdate({ fetchImpl, reload, getRunning: () => "build-old" });

    // Assert
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload when buildId is missing from the payload (FR-009)", async () => {
    // Arrange
    const checkForUpdate = await freshCheckForUpdate();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(versionResponse({ notBuildId: "x" }));
    const reload = vi.fn();

    // Act
    await checkForUpdate({ fetchImpl, reload, getRunning: () => "build-old" });

    // Assert
    expect(reload).not.toHaveBeenCalled();
  });

  it("latches after one reload so a second check cannot reload again (loop guard, FR-010)", async () => {
    // Arrange
    const checkForUpdate = await freshCheckForUpdate();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(versionResponse({ buildId: "build-new" }));
    const reload = vi.fn();
    const deps = { fetchImpl, reload, getRunning: () => "build-old" };

    // Act
    await checkForUpdate(deps);
    await checkForUpdate(deps);

    // Assert
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
