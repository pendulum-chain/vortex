import { useSelector } from "@xstate/react";
import { useEffect, useRef } from "react";
import type { ActorRefFrom } from "xstate";
import type { rampMachine } from "../machines/ramp.machine";
import { PartnerAttributionService } from "../services/api/partner-attribution.service";
import { useApiKey } from "../stores/partnerStore";

/**
 * Claims partner pricing attribution for the signed-in user when the widget was opened
 * with a partner's public API key (`apiKey` URL parameter). The backend resolves the
 * partner from the key's credential and never replaces an existing assignment, so this is
 * safe to fire once per session; failures are non-fatal and retried on the next auth change.
 */
export function usePartnerAttributionClaim(actorRef: ActorRefFrom<typeof rampMachine>) {
  const isAuthenticated = useSelector(actorRef, state => state.context.isAuthenticated);
  const apiKey = useApiKey();
  const claimedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !apiKey || claimedKeyRef.current === apiKey) return;
    claimedKeyRef.current = apiKey;
    PartnerAttributionService.claim(apiKey).catch(error => {
      claimedKeyRef.current = null;
      console.warn("Partner attribution claim failed:", error);
    });
  }, [isAuthenticated, apiKey]);
}
