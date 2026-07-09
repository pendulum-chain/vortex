import { create } from "zustand";
import type { CorridorId, OnboardingStatus } from "@/domain/types";

interface OnboardingOverrideState {
  /** Corridors whose status the mocked wizard has advanced this session. */
  statuses: Partial<Record<CorridorId, OnboardingStatus>>;
  set: (corridorId: CorridorId, status: OnboardingStatus) => void;
  clear: () => void;
}

/**
 * Session-only overlay for the mocked sender onboarding wizard. The wizard submits nothing,
 * so `GET /v1/onboarding/status` never reflects it — this holds what the user just clicked
 * through so the corridor card advances. Deliberately not persisted: a reload drops back to
 * the real provider status. Disappears once the wizard drives the real KYC machine.
 */
export const useOnboardingOverrideStore = create<OnboardingOverrideState>(set => ({
  clear: () => set({ statuses: {} }),
  set: (corridorId, status) => set(state => ({ statuses: { ...state.statuses, [corridorId]: status } })),
  statuses: {}
}));
