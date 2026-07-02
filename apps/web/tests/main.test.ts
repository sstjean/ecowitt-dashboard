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

  it("keeps ticking forever after a failure and recovers on a later success (FR-011/012)", async () => {
    const fetchSnapshot = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValue(snapshot);
    const render = vi.fn();
    const onError = vi.fn();

    const stop = startPollLoop({ fetchSnapshot, render, onError });
    await vi.advanceTimersByTimeAsync(0); // tick 1 fails
    expect(render).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000); // tick 2 recovers
    expect(render).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000); // still ticking
    expect(render).toHaveBeenCalledTimes(2);
    stop();
  });

  it("signals reconnecting(true) on the first failure and reconnecting(false) on the next success (FR-012/013)", async () => {
    const fetchSnapshot = vi
      .fn()
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValue(snapshot);
    const render = vi.fn();
    const onError = vi.fn();
    const onReconnectingChange = vi.fn();

    const stop = startPollLoop({
      fetchSnapshot,
      render,
      onError,
      onReconnectingChange,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(onReconnectingChange).toHaveBeenNthCalledWith(1, true);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(onReconnectingChange).toHaveBeenNthCalledWith(2, false);
    stop();
  });

  it("signals reconnecting(true) only once across consecutive failures (edge-triggered)", async () => {
    const fetchSnapshot = vi.fn().mockRejectedValue(new Error("down"));
    const onReconnectingChange = vi.fn();

    const stop = startPollLoop({
      fetchSnapshot,
      render: vi.fn(),
      onError: vi.fn(),
      onReconnectingChange,
    });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(onReconnectingChange).toHaveBeenCalledTimes(1);
    expect(onReconnectingChange).toHaveBeenCalledWith(true);
    stop();
  });

  it("never signals reconnecting when the loop only ever succeeds", async () => {
    const fetchSnapshot = vi.fn().mockResolvedValue(snapshot);
    const onReconnectingChange = vi.fn();

    const stop = startPollLoop({
      fetchSnapshot,
      render: vi.fn(),
      onError: vi.fn(),
      onReconnectingChange,
    });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(onReconnectingChange).not.toHaveBeenCalled();
    stop();
  });

  it("does not render or clear last-known values on a failed tick (FR-014)", async () => {
    const fetchSnapshot = vi
      .fn()
      .mockResolvedValueOnce(snapshot)
      .mockRejectedValue(new Error("down"));
    const render = vi.fn();
    const onReconnectingChange = vi.fn();

    const stop = startPollLoop({
      fetchSnapshot,
      render,
      onError: vi.fn(),
      onReconnectingChange,
    });
    await vi.advanceTimersByTimeAsync(0); // success → renders once
    expect(render).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000); // failure → no extra render
    expect(render).toHaveBeenCalledTimes(1);
    expect(onReconnectingChange).toHaveBeenCalledWith(true);
    stop();
  });
});
