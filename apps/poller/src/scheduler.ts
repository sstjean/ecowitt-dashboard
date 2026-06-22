/**
 * Drive a callback on the poll cadence: fire once immediately, then every
 * `cadenceSeconds`. Returns a stop function that clears the timer.
 */
export function startScheduler(
  cadenceSeconds: number,
  onTick: () => void,
): () => void {
  onTick();
  const handle = setInterval(onTick, cadenceSeconds * 1000);
  return () => clearInterval(handle);
}
