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
import { RampExecutionInput } from "../types/phases";

const RAMP_STATE_STORAGE_KEY = "rampState";
const RAMP_EPHEMERALS_STORAGE_KEY = "rampEphemerals";

type RampEphemeralsMap = Record<string, { substrateEphemeral: EphemeralAccount; evmEphemeral: EphemeralAccount }>;

export function updateRampEphemeral(rampId: string, ephemerals: RampExecutionInput["ephemerals"]): void {
  try {
    const existing = readRampEphemerals();
    existing[rampId] = ephemerals;
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

export const PersistentRampStateProvider: React.FC<PropsWithChildren> = ({ children }) => {
  return (
    <RampStateContext.Provider>
      <PersistenceEffect />
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
