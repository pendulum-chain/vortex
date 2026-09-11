// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePartnerStore } from "../stores/partnerStore";
import { usePartnerAttributionClaim } from "./usePartnerAttributionClaim";

vi.mock("../services/api/partner-attribution.service", () => ({
  PartnerAttributionService: { claim: vi.fn().mockResolvedValue({ outcome: "created" }) }
}));

import { PartnerAttributionService } from "../services/api/partner-attribution.service";

const API_KEY = `pk_test_${"a".repeat(32)}`;

function fakeRampActor(isAuthenticated: boolean) {
  const snapshot = { context: { isAuthenticated } };
  return {
    getSnapshot: () => snapshot,
    subscribe: () => ({ unsubscribe: () => undefined })
  } as unknown as Parameters<typeof usePartnerAttributionClaim>[0];
}

describe("usePartnerAttributionClaim", () => {
  beforeEach(() => {
    vi.mocked(PartnerAttributionService.claim).mockClear();
    usePartnerStore.setState({ apiKey: undefined, partnerId: undefined });
  });

  it("does not claim while unauthenticated or without an apiKey", () => {
    usePartnerStore.setState({ apiKey: API_KEY });
    renderHook(() => usePartnerAttributionClaim(fakeRampActor(false)));

    usePartnerStore.setState({ apiKey: null });
    renderHook(() => usePartnerAttributionClaim(fakeRampActor(true)));

    expect(PartnerAttributionService.claim).not.toHaveBeenCalled();
  });

  it("claims exactly once per apiKey after sign-in", () => {
    usePartnerStore.setState({ apiKey: API_KEY });
    const { rerender } = renderHook(() => usePartnerAttributionClaim(fakeRampActor(true)));
    rerender();

    expect(PartnerAttributionService.claim).toHaveBeenCalledTimes(1);
    expect(PartnerAttributionService.claim).toHaveBeenCalledWith(API_KEY);
  });
});
