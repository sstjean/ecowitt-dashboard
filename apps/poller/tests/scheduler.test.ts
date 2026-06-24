import { describe, it, expect, vi, afterEach } from "vitest";
import { startScheduler } from "../src/scheduler.ts";

afterEach(() => {
  vi.useRealTimers();
});

describe("startScheduler", () => {
  it("fires immediately and then once per cadence", () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    const onError = vi.fn();
    const stop = startScheduler(30, onTick, onError);

    expect(onTick).toHaveBeenCalledTimes(1); // immediate

    vi.advanceTimersByTime(30_000);
    expect(onTick).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(60_000);
    expect(onTick).toHaveBeenCalledTimes(4);

    stop();
    vi.advanceTimersByTime(120_000);
    expect(onTick).toHaveBeenCalledTimes(4); // stopped
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not crash when a tick throws and retries on the next cadence", () => {
    vi.useFakeTimers();
    let calls = 0;
    const onError = vi.fn();
    const onTick = vi.fn(() => {
      calls += 1;
      if (calls === 1) {
        throw new Error("gateway timeout");
      }
    });

    const stop = startScheduler(30, onTick, onError);

    // The immediate tick threw but was caught, not propagated.
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);

    // The next cadence still fires and this time succeeds.
    vi.advanceTimersByTime(30_000);
    expect(onTick).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);

    stop();
  });
});
