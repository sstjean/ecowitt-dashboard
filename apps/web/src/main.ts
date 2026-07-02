import type { LatestSnapshot } from "@ecowitt/shared";

export interface PollLoopDeps {
  fetchSnapshot: () => Promise<LatestSnapshot>;
  render: (snapshot: LatestSnapshot) => void;
  onError: (error: unknown) => void;
  intervalMs?: number;
  /**
   * Optional edge-triggered reconnect signal (US2): called with `true` on the
   * first failed tick after a healthy one, and `false` on the first success
   * after a failure. Never re-fired on consecutive same-state ticks.
   */
  onReconnectingChange?: (active: boolean) => void;
}

/**
 * Drive the dashboard: fetch + render immediately, then on every UI-refresh
 * tick. A single interval (no thrash) is used; the returned function stops it.
 * The loop retries forever — a failed tick never clears the interval and never
 * blanks the last-rendered values (FR-011/FR-014); it only surfaces an optional
 * `reconnecting` state that clears on the next success (FR-012/FR-013).
 */
export function startPollLoop({
  fetchSnapshot,
  render,
  onError,
  intervalMs = 10_000,
  onReconnectingChange,
}: PollLoopDeps): () => void {
  let reconnecting = false;
  const setReconnecting = (active: boolean): void => {
    if (active === reconnecting) {
      return;
    }
    reconnecting = active;
    onReconnectingChange?.(active);
  };

  const tick = async (): Promise<void> => {
    try {
      const snapshot = await fetchSnapshot();
      render(snapshot);
      setReconnecting(false);
    } catch (error) {
      setReconnecting(true);
      onError(error);
    }
  };

  void tick();
  const handle = setInterval(() => {
    void tick();
  }, intervalMs);

  return () => {
    clearInterval(handle);
  };
}
