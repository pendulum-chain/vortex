import { EphemeralAccount } from "@vortexfi/shared";
import { createActorContext, useSelector } from "@xstate/react";
import React, { PropsWithChildren, useEffect } from "react";
import { AnyActorRef, Snapshot } from "xstate";
import { AlfredpayKycContext, AveniaKycContext, MykoboKycContext } from "../machines/kyc.states";
import { rampMachine } from "../machines/ramp.machine";
import {
  AlfredpayKycActorRef,
  AveniaKycActorRef,
  MykoboKycActorRef,
  SelectedAlfredpayData,
  SelectedAveniaData,
  SelectedMykoboData
} from "../machines/types";
import { AuthService } from "../services/auth";
import { RampExecutionInput } from "../types/phases";

const RAMP_STATE_STORAGE_KEY = "rampState";
const RAMP_EPHEMERALS_STORAGE_KEY = "rampEphemerals";
const MAX_RAMP_EPHEMERALS = 50;
const TOKEN_REFRESH_SKEW_MS = 60 * 1000; // refresh 60s before expiry
const TOKEN_REFRESH_RETRY_MS = 30 * 1000; // retry after a transient failure

type RampEphemeralEntry = {
  substrateEphemeral: EphemeralAccount;
  evmEphemeral: EphemeralAccount;
  timestamp?: number;
};
type RampEphemeralsMap = Record<string, RampEphemeralEntry>;

export function updateRampEphemeral(rampId: string, ephemerals: RampExecutionInput["ephemerals"]): void {
  try {
    const existing = readRampEphemerals();
    existing[rampId] = { ...ephemerals, timestamp: Date.now() };

    const keys = Object.keys(existing);
    if (keys.length > MAX_RAMP_EPHEMERALS) {
      const sorted = keys.sort((a, b) => (existing[a]?.timestamp ?? 0) - (existing[b]?.timestamp ?? 0));
      const toRemove = sorted.slice(0, sorted.length - MAX_RAMP_EPHEMERALS);
      for (const key of toRemove) {
        delete existing[key];
      }
    }

    localStorage.setItem(RAMP_EPHEMERALS_STORAGE_KEY, JSON.stringify(existing));
  } catch {
    // localStorage may be full or unavailable — non-critical backup
  }
}

export function readRampEphemerals(): RampEphemeralsMap {
  try {
    const raw = localStorage.getItem(RAMP_EPHEMERALS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function removeRampEphemeral(rampId: string): void {
  try {
    const existing = readRampEphemerals();
    delete existing[rampId];
    localStorage.setItem(RAMP_EPHEMERALS_STORAGE_KEY, JSON.stringify(existing));
  } catch {
    // non-critical
  }
}

function readPersistedRampState(): Snapshot<unknown> | undefined {
  try {
    const raw = localStorage.getItem(RAMP_STATE_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    return parsed?.status === "error" ? undefined : parsed;
  } catch {
    localStorage.removeItem(RAMP_STATE_STORAGE_KEY);
    return undefined;
  }
}

const restoredState = readPersistedRampState();

export const RampStateContext = createActorContext(rampMachine, {
  snapshot: restoredState
});

export const useRampActor = RampStateContext.useActorRef;
export const useRampStateSelector = RampStateContext.useSelector;

type SelectableActorRef = Pick<AnyActorRef, "getSnapshot" | "subscribe">;
type ActorSnapshot<TActor extends SelectableActorRef> = TActor extends { getSnapshot(): infer TSnapshot } ? TSnapshot : never;
type SelectedKycData = { stateValue: unknown; context: unknown };

function useKycChildActor<T extends SelectableActorRef>(id: "aveniaKyc" | "mykoboKyc" | "alfredpayKyc"): T | undefined {
  const rampActor = useRampActor();
  return useSelector(rampActor, snapshot => (snapshot.children as Record<string, unknown>)[id]) as T | undefined;
}

function selectedKycDataEqual(prev: SelectedKycData | undefined, next: SelectedKycData | undefined) {
  if (!prev || !next) return prev === next;
  return prev.stateValue === next.stateValue && prev.context === next.context;
}

function useKycChildSelector<TActor extends SelectableActorRef, TSelected extends SelectedKycData>(
  actor: TActor | undefined,
  build: (snapshot: ActorSnapshot<TActor>) => TSelected
): TSelected | undefined {
  return useSelector(actor, snapshot => (snapshot === undefined ? undefined : build(snapshot)), selectedKycDataEqual);
}

const PersistenceEffect = () => {
  const rampActor = useRampActor();
  const aveniaActor = useKycChildActor<AveniaKycActorRef>("aveniaKyc");
  const mykoboActor = useKycChildActor<MykoboKycActorRef>("mykoboKyc");

  const { rampContext, rampState, isQuoteExpired, quote } = useSelector(rampActor, state => ({
    isQuoteExpired: state?.context.isQuoteExpired,
    quote: state?.context.quote,
    rampContext: state?.context,
    rampState: state?.value
  }));

  const aveniaState = useSelector(aveniaActor, state => state?.value);
  const mykoboState = useSelector(mykoboActor, state => state?.value);

  // biome-ignore lint/correctness/useExhaustiveDependencies: run when selected snapshot pieces change; isQuoteExpired/quote must persist
  useEffect(() => {
    const persistedSnapshot = rampActor.getPersistedSnapshot();
    localStorage.setItem(RAMP_STATE_STORAGE_KEY, JSON.stringify(persistedSnapshot));

    const rampId = rampContext.rampState?.ramp?.id;
    const ephemerals = (rampContext.executionInput as RampExecutionInput | undefined)?.ephemerals;
    if (rampId && ephemerals) {
      updateRampEphemeral(rampId, ephemerals);
    }
  }, [rampContext, rampState, aveniaState, mykoboState, isQuoteExpired, quote, rampActor.getPersistedSnapshot]);

  return null;
};

// Single app-wide token refresher: schedules a refresh just before the access token's real
// expiry (decoded from the JWT), reschedules off each new token, and retries transient
// failures without dropping the session.
const TokenRefreshEffect = () => {
  const rampActor = useRampActor();
  const isAuthenticated = useSelector(rampActor, state => state?.context.isAuthenticated ?? false);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scheduleNext = () => {
      const expiryMs = AuthService.getAccessTokenExpiryMs();
      if (expiryMs === null) {
        return;
      }
      const delay = Math.max(expiryMs - Date.now() - TOKEN_REFRESH_SKEW_MS, 0);
      timer = setTimeout(async () => {
        if (cancelled) return;
        try {
          const refreshed = await AuthService.refreshAccessToken();
          if (cancelled) return;
          if (refreshed) {
            // refreshAccessToken() has already persisted the new token, so this reads the fresh expiry.
            scheduleNext();
          } else {
            // Refresh token confirmed invalid: the session is over.
            rampActor.send({ type: "LOGOUT" });
          }
        } catch {
          // Transient failure: retry soon without touching the session.
          if (!cancelled) {
            timer = setTimeout(scheduleNext, TOKEN_REFRESH_RETRY_MS);
          }
        }
      }, delay);
    };

    scheduleNext();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [isAuthenticated, rampActor]);

  return null;
};

export const PersistentRampStateProvider: React.FC<PropsWithChildren> = ({ children }) => {
  return (
    <RampStateContext.Provider>
      <PersistenceEffect />
      <TokenRefreshEffect />
      {children}
    </RampStateContext.Provider>
  );
};

export function useAveniaKycActor(): AveniaKycActorRef | undefined {
  return useKycChildActor<AveniaKycActorRef>("aveniaKyc");
}

export function useAveniaKycSelector(): SelectedAveniaData | undefined {
  const actor = useAveniaKycActor();
  return useKycChildSelector<AveniaKycActorRef, SelectedAveniaData>(actor, snapshot => ({
    context: snapshot.context as AveniaKycContext,
    stateValue: snapshot.value
  }));
}

export function useMykoboKycActor(): MykoboKycActorRef | undefined {
  return useKycChildActor<MykoboKycActorRef>("mykoboKyc");
}

export function useMykoboKycSelector(): SelectedMykoboData | undefined {
  const actor = useMykoboKycActor();
  return useKycChildSelector<MykoboKycActorRef, SelectedMykoboData>(actor, snapshot => ({
    context: snapshot.context as MykoboKycContext,
    stateValue: snapshot.value
  }));
}

export function useAlfredpayKycActor(): AlfredpayKycActorRef | undefined {
  return useKycChildActor<AlfredpayKycActorRef>("alfredpayKyc");
}

export function useAlfredpayKycSelector(): SelectedAlfredpayData | undefined {
  const actor = useAlfredpayKycActor();
  return useKycChildSelector<AlfredpayKycActorRef, SelectedAlfredpayData>(actor, snapshot => ({
    context: snapshot.context as AlfredpayKycContext,
    stateValue: snapshot.value
  }));
}
