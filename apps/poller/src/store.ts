import Database from "better-sqlite3";
import { fullMetricMapSchema, type FullMetricMap } from "@ecowitt/shared";

const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS readings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  observed_at TEXT NOT NULL UNIQUE,
  metrics_json TEXT NOT NULL,
  pressure_hpa REAL GENERATED ALWAYS AS (json_extract(metrics_json, '$.pressureHpa')) STORED
);
CREATE INDEX IF NOT EXISTS idx_readings_observed_at ON readings (observed_at);
`;

export interface WriteStore {
  /** Persist one validated reading. Throws on duplicate observed_at. */
  insertReading(observedAt: string, metrics: FullMetricMap): void;
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

  return {
    insertReading(observedAt, metrics) {
      const validated = fullMetricMapSchema.parse(metrics);
      insert.run(observedAt, JSON.stringify(validated));
    },
    close() {
      db.close();
    },
  };
}
