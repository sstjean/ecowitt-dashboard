import { fetchLatest } from "./api.ts";
import { startPollLoop } from "./main.ts";
import { renderSnapshot } from "./render/index.ts";

const UI_REFRESH_SECONDS = Number(
  import.meta.env.VITE_UI_REFRESH_SECONDS ?? "10",
);

const root = document.getElementById("app")!;

startPollLoop({
  fetchSnapshot: () => fetchLatest(),
  render: (snapshot) => renderSnapshot(snapshot, root),
  onError: (error) => console.error("snapshot poll failed", error),
  intervalMs: UI_REFRESH_SECONDS * 1000,
});
