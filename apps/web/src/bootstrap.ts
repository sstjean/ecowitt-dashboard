// Self-hosted variable Inter (latin loads via unicode-range) so every OS —
// notably the Ubuntu kiosk — renders the same face instead of a generic
// fallback. font-display: swap ships in the bundled @font-face rules.
import "@fontsource-variable/inter/wght.css";
import { fetchLatest } from "./api.ts";
import { startPollLoop } from "./main.ts";
import { mountDashboard } from "./render/index.ts";
import { checkForUpdate } from "./selfHeal.ts";

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

// Self-heal on deploy (US1): poll the served /version.json on the same cadence as
// the UI refresh and reload once when the deployed build id differs from the baked
// __BUILD_ID__. Wiring only — the reload DECISION lives in the covered selfHeal.ts.
const selfHealDeps = {
  fetchImpl: (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(input, init),
  reload: () => location.reload(),
  getRunning: () => __BUILD_ID__,
};
void checkForUpdate(selfHealDeps);
setInterval(() => {
  void checkForUpdate(selfHealDeps);
}, UI_REFRESH_SECONDS * 1000);
