import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MaintenanceStatusResponse } from "@/services/api/maintenance.service";
import { maintenanceRefetchInterval } from "./useActiveMaintenance";

const NOW = Date.parse("2026-10-05T10:00:00.000Z");
const MINUTE = 60 * 1000;

function activeUntil(endDatetime: string): MaintenanceStatusResponse {
  return {
    is_maintenance_active: true,
    maintenance_details: {
      end_datetime: endDatetime,
      message: "Ramps are paused while we upgrade.",
      start_datetime: "2026-10-05T09:00:00.000Z",
      title: "Scheduled maintenance"
    }
  };
}

describe("maintenanceRefetchInterval", () => {
  it("polls every 5 minutes without an active window", () => {
    assert.equal(maintenanceRefetchInterval(undefined, NOW), 5 * MINUTE);
    assert.equal(maintenanceRefetchInterval({ is_maintenance_active: false, maintenance_details: null }, NOW), 5 * MINUTE);
  });

  it("refetches just after a window that ends before the next poll", () => {
    assert.equal(maintenanceRefetchInterval(activeUntil("2026-10-05T10:02:00.000Z"), NOW), 2 * MINUTE + 15_000);
  });

  it("keeps the 5-minute poll for a window that ends later", () => {
    assert.equal(maintenanceRefetchInterval(activeUntil("2026-10-05T11:00:00.000Z"), NOW), 5 * MINUTE);
  });

  it("rechecks shortly when the API still reports a window past its end", () => {
    assert.equal(maintenanceRefetchInterval(activeUntil("2026-10-05T09:59:00.000Z"), NOW), 15_000);
  });

  it("falls back to the 5-minute poll for an unparseable end", () => {
    assert.equal(maintenanceRefetchInterval(activeUntil("not a date"), NOW), 5 * MINUTE);
    assert.equal(maintenanceRefetchInterval({ is_maintenance_active: true, maintenance_details: null }, NOW), 5 * MINUTE);
  });
});
