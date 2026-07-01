import { describe, it, expect } from "vitest";
import mergedFixture from "./fixtures/sensorHealth/merged.json" with { type: "json" };
import garbageFixture from "./fixtures/sensorHealth/garbage.json" with { type: "json" };
import {
  normalizeSensorHealth,
  SENSOR_HEALTH_DEFAULTS,
  type SensorHealthEntry,
} from "../src/schema.ts";

const CAPTURED_AT = "2026-06-30T14:05:00Z";

/** Build a raw `get_sensors_info` payload (a bare array) from inline entries. */
function raw(sensors: Array<Record<string, string>>): unknown {
  return sensors;
}

function ws90(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    img: "wh90",
    type: "48",
    name: "WS90",
    id: "1242D",
    batt: "5",
    rssi: "-74",
    signal: "4",
    idst: "1",
    ...overrides,
  };
}

/** First entry, asserting it exists (keeps noUncheckedIndexedAccess happy). */
function first(entries: SensorHealthEntry[]): SensorHealthEntry {
  const entry = entries[0];
  if (entry === undefined) throw new Error("expected at least one entry");
  return entry;
}

function byId(entries: SensorHealthEntry[], id: string): SensorHealthEntry {
  const found = entries.find((e) => e.id === id);
  if (found === undefined) throw new Error(`no entry ${id}`);
  return found;
}

describe("normalizeSensorHealth — merged capture (SC-001)", () => {
  it("yields exactly one record per registered sensor; placeholders excluded", () => {
    const entries = normalizeSensorHealth(mergedFixture, CAPTURED_AT);
    expect(entries.map((e) => e.id).sort()).toEqual(["1242D", "A0"]);
    expect(entries).toHaveLength(2);
    for (const e of entries) {
      expect(e.registered).toBe(true);
      expect(e.lastSeenUtc).toBe(CAPTURED_AT);
    }
  });

  it("projects the live WS90 (type 48) exactly", () => {
    const entries = normalizeSensorHealth(mergedFixture, CAPTURED_AT);
    expect(byId(entries, "1242D")).toEqual({
      id: "1242D",
      img: "wh90",
      type: 48,
      name: "Temp & Humidity & Solar & Wind & Rain",
      battery: "OK",
      batteryRaw: 5,
      signalBars: 4,
      rssiDbm: -76,
      registered: true,
      lastSeenUtc: CAPTURED_AT,
    });
  });

  it("returns [] for a non-array payload (whole-payload guard, SC-005)", () => {
    expect(normalizeSensorHealth(garbageFixture, CAPTURED_AT)).toEqual([]);
  });

  it("returns [] for structurally-broken (non-array) shapes", () => {
    expect(normalizeSensorHealth(null, CAPTURED_AT)).toEqual([]);
    expect(normalizeSensorHealth(undefined, CAPTURED_AT)).toEqual([]);
    expect(normalizeSensorHealth({ command: [{ sensor: [] }] }, CAPTURED_AT)).toEqual([]);
    expect(normalizeSensorHealth("not-an-array", CAPTURED_AT)).toEqual([]);
    expect(normalizeSensorHealth(42, CAPTURED_AT)).toEqual([]);
  });
});

describe("normalizeSensorHealth — per-type battery rules + boundaries", () => {
  const { WS90_BATTERY_LOW_MAX } = SENSOR_HEALTH_DEFAULTS;

  it(`WS90 batt ${WS90_BATTERY_LOW_MAX} ⇒ Low, batt 2 ⇒ OK (boundary)`, () => {
    const low = normalizeSensorHealth(raw([ws90({ batt: "1" })]), CAPTURED_AT);
    const ok = normalizeSensorHealth(raw([ws90({ batt: "2" })]), CAPTURED_AT);
    expect(first(low).battery).toBe("Low");
    expect(first(ok).battery).toBe("OK");
  });

  it("wh31 (type 7) batt 0 ⇒ OK, batt 1 ⇒ Low (flag polarity, never 0% empty)", () => {
    const base = { img: "wh31", type: "7", name: "CH2", id: "A0", signal: "4", rssi: "-90", idst: "1" };
    const ok = normalizeSensorHealth(raw([{ ...base, batt: "0" }]), CAPTURED_AT);
    const low = normalizeSensorHealth(raw([{ ...base, batt: "1" }]), CAPTURED_AT);
    expect(first(ok).battery).toBe("OK");
    expect(first(ok).batteryRaw).toBe(0);
    expect(first(low).battery).toBe("Low");
  });

  it("wh25 wired (type 4, no signal/rssi) ⇒ N/A battery, null bars/rssi", () => {
    const entries = normalizeSensorHealth(
      raw([{ img: "wh25", type: "4", name: "WH25", id: "C7", batt: "0", idst: "1" }]),
      CAPTURED_AT,
    );
    expect(first(entries).battery).toBe("N/A");
    expect(first(entries).signalBars).toBeNull();
    expect(first(entries).rssiDbm).toBeNull();
  });

  it("unknown type with batt 3 ⇒ Unknown (never fabricate a level)", () => {
    const entries = normalizeSensorHealth(
      raw([{ img: "wh99", type: "99", name: "X", id: "D4", batt: "3", signal: "3", rssi: "-80", idst: "1" }]),
      CAPTURED_AT,
    );
    expect(first(entries).battery).toBe("Unknown");
  });

  it("missing batt ⇒ batteryRaw null + rule (Unknown for level types)", () => {
    const wh31NoBatt = { img: "wh31", type: "7", name: "CH2", id: "A0", signal: "4", rssi: "-90", idst: "1" };
    const entries = normalizeSensorHealth(raw([wh31NoBatt]), CAPTURED_AT);
    expect(first(entries).batteryRaw).toBeNull();
    expect(first(entries).battery).toBe("Unknown");
  });

  it("WS90 missing batt ⇒ Unknown", () => {
    const noBatt = ws90();
    delete (noBatt as Record<string, string>).batt;
    const entries = normalizeSensorHealth(raw([noBatt]), CAPTURED_AT);
    expect(first(entries).batteryRaw).toBeNull();
    expect(first(entries).battery).toBe("Unknown");
  });

  it("signal '9' (out of range) clamped to 4", () => {
    const entries = normalizeSensorHealth(raw([ws90({ signal: "9" })]), CAPTURED_AT);
    expect(first(entries).signalBars).toBe(4);
  });

  it("absent signal/rssi on a radio sensor ⇒ null bars/rssi", () => {
    const noRadio = ws90();
    delete (noRadio as Record<string, string>).signal;
    delete (noRadio as Record<string, string>).rssi;
    const entries = normalizeSensorHealth(raw([noRadio]), CAPTURED_AT);
    expect(first(entries).signalBars).toBeNull();
    expect(first(entries).rssiDbm).toBeNull();
  });
});

describe("normalizeSensorHealth — exclusion + per-entry salvage (FR-003/FR-012)", () => {
  it("excludes placeholder ids FFFFFFFF / FFFFFFFE", () => {
    const entries = normalizeSensorHealth(
      raw([
        ws90(),
        { img: "x", type: "18", name: "P1", id: "FFFFFFFE", batt: "0", idst: "0" },
        { img: "x", type: "16", name: "P2", id: "FFFFFFFF", batt: "0", idst: "0" },
      ]),
      CAPTURED_AT,
    );
    expect(entries.map((e) => e.id)).toEqual(["1242D"]);
  });

  it("excludes an unregistered entry (idst !== '1')", () => {
    const entries = normalizeSensorHealth(
      raw([ws90(), ws90({ id: "AB", idst: "0" })]),
      CAPTURED_AT,
    );
    expect(entries.map((e) => e.id)).toEqual(["1242D"]);
  });

  it("excludes an entry with a missing/empty id", () => {
    const noId = ws90();
    delete (noId as Record<string, string>).id;
    const entries = normalizeSensorHealth(
      raw([noId, ws90({ id: "" }), ws90({ id: "1242D" })]),
      CAPTURED_AT,
    );
    expect(entries.map((e) => e.id)).toEqual(["1242D"]);
  });

  it("skips a malformed entry (non-finite type) but keeps valid siblings", () => {
    const entries = normalizeSensorHealth(
      raw([
        { img: "wh31", type: "abc", name: "CH3", id: "B1", batt: "0", signal: "4", rssi: "-90", idst: "1" },
        ws90(),
      ]),
      CAPTURED_AT,
    );
    expect(entries.map((e) => e.id)).toEqual(["1242D"]);
  });
});
