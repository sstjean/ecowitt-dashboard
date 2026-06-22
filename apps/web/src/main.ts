import type { LatestSnapshot } from "@ecowitt/shared";

export interface PollLoopDeps {
  fetchSnapshot: () => Promise<LatestSnapshot>;
  render: (snapshot: LatestSnapshot) => void;
  onError: (error: unknown) => void;
  intervalMs?: number;
}

/**
 * Drive the dashboard: fetch + render immediately, then on every UI-refresh
 * tick. A single interval (no thrash) is used; the returned function stops it.
 */
export function startPollLoop({
  fetchSnapshot,
  render,
  onError,
  intervalMs = 10_000,
}: PollLoopDeps): () => void {
  const tick = async (): Promise<void> => {
    try {
      render(await fetchSnapshot());
    } catch (error) {
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
