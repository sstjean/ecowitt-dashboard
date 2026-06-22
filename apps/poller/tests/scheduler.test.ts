import { describe, it, expect, vi, afterEach } from "vitest";
import { startScheduler } from "../src/scheduler.ts";

afterEach(() => {
  vi.useRealTimers();
});

describe("startScheduler", () => {
  it("fires immediately and then once per cadence", () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    const stop = startScheduler(30, onTick);

    expect(onTick).toHaveBeenCalledTimes(1); // immediate

    vi.advanceTimersByTime(30_000);
    expect(onTick).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(60_000);
    expect(onTick).toHaveBeenCalledTimes(4);

    stop();
    vi.advanceTimersByTime(120_000);
    expect(onTick).toHaveBeenCalledTimes(4); // stopped
  });
});
