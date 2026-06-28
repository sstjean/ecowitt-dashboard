// Self-hosted variable Inter (latin loads via unicode-range) so every OS —
// notably the Ubuntu kiosk — renders the same face instead of a generic
// fallback. font-display: swap ships in the bundled @font-face rules.
import "@fontsource-variable/inter/wght.css";
import { fetchLatest } from "./api.ts";
import { startPollLoop } from "./main.ts";
import { mountDashboard } from "./render/index.ts";

const UI_REFRESH_SECONDS = Number(
  import.meta.env.VITE_UI_REFRESH_SECONDS ?? "10",
);

const root = document.getElementById("app")!;
const dashboard = mountDashboard(root);

startPollLoop({
  fetchSnapshot: () => fetchLatest(),
  render: (snapshot) => dashboard.update(snapshot),
  onError: (error) => console.error("snapshot poll failed", error),
  intervalMs: UI_REFRESH_SECONDS * 1000,
});
