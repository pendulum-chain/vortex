import assert from "node:assert/strict";
import test from "node:test";
import { assertMaintenanceAvailable, createMaintenanceReader } from "../src/lib/maintenance.js";

test("maintenance uses the existing public status endpoint and validates active windows", async () => {
  const calls = [];
  let reply = { is_maintenance_active: false, maintenance_details: null };
  const read = createMaintenanceReader({ api: async (...args) => { calls.push(args); return reply; } });
  assert.deepEqual(await read(), { active: false, details: null });
  assert.deepEqual(calls[0], ["/v1/maintenance/status", { method: "GET" }]);
  reply = { is_maintenance_active: true, maintenance_details: { title: "Test maintenance", end_datetime: "2026-11-04T23:00:00Z" } };
  assert.equal((await read()).active, true);
  await assert.rejects(assertMaintenanceAvailable(read), { code: "MAINTENANCE_ACTIVE" });
});

test("unavailable or malformed maintenance status fails closed before payment or signing", async () => {
  for (const reply of [null, {}, { is_maintenance_active: "false" }, { is_maintenance_active: true, maintenance_details: null }, { is_maintenance_active: true, maintenance_details: { end_datetime: "unknown" } }]) {
    const read = createMaintenanceReader({ api: async () => reply });
    await assert.rejects(assertMaintenanceAvailable(read), { code: "MAINTENANCE_STATUS_UNAVAILABLE" });
  }
  const read = createMaintenanceReader({ api: async () => { throw new Error("network unavailable"); } });
  await assert.rejects(read(), { code: "MAINTENANCE_STATUS_UNAVAILABLE" });
});
