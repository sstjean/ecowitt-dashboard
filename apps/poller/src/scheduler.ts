/**
 * Drive a callback on the poll cadence: fire once immediately, then every
 * `cadenceSeconds`. Each invocation is guarded so an unexpected throw is
 * reported via `onError` rather than crashing the process — the next cadence
 * still fires. Returns a stop function that clears the timer.
 */
export function startScheduler(
  cadenceSeconds: number,
  onTick: () => void,
  onError: (error: unknown) => void,
): () => void {
  const tick = (): void => {
    try {
      onTick();
    } catch (err) {
      onError(err);
    }
  };
  tick();
  const handle = setInterval(tick, cadenceSeconds * 1000);
  return () => clearInterval(handle);
}
