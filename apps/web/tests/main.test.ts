import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { LatestSnapshot } from "@ecowitt/shared";
import { startPollLoop } from "../src/main.ts";

const snapshot = {} as LatestSnapshot;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("startPollLoop", () => {
  it("fetches + renders immediately, then on each default 10s tick", async () => {
    const fetchSnapshot = vi.fn().mockResolvedValue(snapshot);
    const render = vi.fn();
    const onError = vi.fn();

    const stop = startPollLoop({ fetchSnapshot, render, onError });

    await vi.advanceTimersByTimeAsync(0);
    expect(render).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(render).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(render).toHaveBeenCalledTimes(4);

    stop();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(render).toHaveBeenCalledTimes(4);
    expect(onError).not.toHaveBeenCalled();
  });

  it("honours a custom refresh interval", async () => {
    const fetchSnapshot = vi.fn().mockResolvedValue(snapshot);
    const render = vi.fn();
    const onError = vi.fn();

    const stop = startPollLoop({ fetchSnapshot, render, onError, intervalMs: 5_000 });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(render).toHaveBeenCalledTimes(2);
    stop();
  });

  it("routes a fetch failure to onError without rendering", async () => {
    const fetchSnapshot = vi.fn().mockRejectedValue(new Error("network down"));
    const render = vi.fn();
    const onError = vi.fn();

    const stop = startPollLoop({ fetchSnapshot, render, onError });
    await vi.advanceTimersByTimeAsync(0);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
    stop();
  });
});
