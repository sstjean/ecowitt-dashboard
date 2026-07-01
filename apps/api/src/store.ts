import Database from "better-sqlite3";
import { fullMetricMapSchema, type FullMetricMap } from "@ecowitt/shared";
import type { SensorHealthEntry } from "@ecowitt/shared";

const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  observed_at TEXT NOT NULL UNIQUE,
  metrics_json TEXT NOT NULL,
  pressure_hpa REAL GENERATED ALWAYS AS (json_extract(metrics_json, '$.pressureHpa')) STORED
);
CREATE INDEX IF NOT EXISTS idx_readings_observed_at ON readings (observed_at);
CREATE TABLE IF NOT EXISTS sensor_health (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  captured_at TEXT NOT NULL,
  sensors_json TEXT NOT NULL
);
`;

export interface StoredReading {
  observedAt: string;
  metrics: FullMetricMap;
}

/** The current sensor-health snapshot as read from the single-row cache. */
export interface StoredSensorHealth {
  capturedAt: string;
  sensors: SensorHealthEntry[];
}

export interface ReadStore {
  /** The most recently observed reading, or null when the store is empty. */
  getLatest(): StoredReading | null;
  /** All readings with observed_at >= sinceIso, oldest first. */
  getWindow(sinceIso: string): StoredReading[];
  /** The current sensor-health snapshot (id=1), or null when none is cached. */
  getSensorHealth(): StoredSensorHealth | null;
  close(): void;
}

function toReading(row: { observed_at: string; metrics_json: string }): StoredReading {
  return {
    observedAt: row.observed_at,
    metrics: fullMetricMapSchema.parse(JSON.parse(row.metrics_json)),
  };
}

/**
 * Open the read side of the SQLite store. The API only ever issues SELECTs; it
 * bootstraps the schema idempotently so a cold start before the poller's first
 * write still serves an empty (no-data) response.
 */
export function openReadStore(path: string): ReadStore {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(BOOTSTRAP_SQL);

  const latest = db.prepare(
    "SELECT observed_at, metrics_json FROM readings ORDER BY observed_at DESC LIMIT 1",
  );
  const window = db.prepare(
    "SELECT observed_at, metrics_json FROM readings WHERE observed_at >= ? ORDER BY observed_at ASC",
  );
  const sensorHealth = db.prepare(
    "SELECT captured_at, sensors_json FROM sensor_health WHERE id = 1",
  );

  return {
    getLatest() {
      const row = latest.get() as
        | { observed_at: string; metrics_json: string }
        | undefined;
      return row ? toReading(row) : null;
    },
    getWindow(sinceIso) {
      const rows = window.all(sinceIso) as Array<{
        observed_at: string;
        metrics_json: string;
      }>;
      return rows.map(toReading);
    },
    getSensorHealth() {
      const row = sensorHealth.get() as
        | { captured_at: string; sensors_json: string }
        | undefined;
      if (row === undefined) return null;
      return {
        capturedAt: row.captured_at,
        sensors: JSON.parse(row.sensors_json) as SensorHealthEntry[],
      };
    },
    close() {
      db.close();
    },
  };
}
