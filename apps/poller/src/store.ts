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

export interface WriteStore {
  /** Persist one validated reading. Throws on duplicate observed_at. */
  insertReading(observedAt: string, metrics: FullMetricMap): void;
  /**
   * Upsert the single-row sensor-health snapshot (id=1). Current state only —
   * a second call updates captured_at/sensors_json in place (not a history table).
   */
  upsertSensorHealth(capturedAtUtc: string, sensors: SensorHealthEntry[]): void;
  close(): void;
}

/**
 * Open the single-writer SQLite store: WAL journaling, schema bootstrap, and a
 * prepared insert. The poller is the only process that writes here.
 */
export function openWriteStore(path: string): WriteStore {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(BOOTSTRAP_SQL);

  const insert = db.prepare(
    "INSERT INTO readings (observed_at, metrics_json) VALUES (?, ?)",
  );
  const upsertHealth = db.prepare(
    `INSERT INTO sensor_health (id, captured_at, sensors_json) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       captured_at = excluded.captured_at,
       sensors_json = excluded.sensors_json`,
  );

  return {
    insertReading(observedAt, metrics) {
      const validated = fullMetricMapSchema.parse(metrics);
      insert.run(observedAt, JSON.stringify(validated));
    },
    upsertSensorHealth(capturedAtUtc, sensors) {
      upsertHealth.run(capturedAtUtc, JSON.stringify(sensors));
    },
    close() {
      db.close();
    },
  };
}
