import { latestSnapshotSchema, type LatestSnapshot } from "@ecowitt/shared";

/**
 * Fetch and validate the current snapshot from `/api/v1/latest`.
 * `baseUrl` defaults to a same-origin request.
 */
export async function fetchLatest(baseUrl = ""): Promise<LatestSnapshot> {
  const res = await fetch(`${baseUrl}/api/v1/latest`);
  if (!res.ok) {
    throw new Error(`GET /api/v1/latest failed: ${res.status}`);
  }
  const json: unknown = await res.json();
  return latestSnapshotSchema.parse(json);
}
