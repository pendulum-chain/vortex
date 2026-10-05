// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useMaintenanceStore } from "../stores/maintenanceStore";
import { useMaintenanceStatus } from "./useMaintenanceStatus";

const { getMaintenanceStatus } = vi.hoisted(() => ({ getMaintenanceStatus: vi.fn() }));
vi.mock("../services/api/maintenance.service", () => ({ getMaintenanceStatus }));

afterEach(() => {
  vi.useRealTimers();
  useMaintenanceStore.setState({ error: null, isLoading: false, lastFetched: null, maintenanceStatus: null });
});

it("refetches on every 5-minute poll and stops after unmount", async () => {
  vi.useFakeTimers();
  // Real responses take time; the store only records lastFetched once they arrive.
  getMaintenanceStatus.mockImplementation(
    () => new Promise(resolve => setTimeout(() => resolve({ is_maintenance_active: false, maintenance_details: null }), 200))
  );

  const { unmount } = renderHook(() => useMaintenanceStatus());
  expect(getMaintenanceStatus).toHaveBeenCalledTimes(1);

  await act(() => vi.advanceTimersByTimeAsync(5 * 60 * 1000));
  expect(getMaintenanceStatus).toHaveBeenCalledTimes(2);

  unmount();
  await act(() => vi.advanceTimersByTimeAsync(10 * 60 * 1000));
  expect(getMaintenanceStatus).toHaveBeenCalledTimes(2);
});
