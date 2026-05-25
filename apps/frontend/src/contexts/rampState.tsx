import { createActorContext, useSelector } from "@xstate/react";
import React, { PropsWithChildren, useEffect } from "react";
import { ActorRef, Snapshot } from "xstate";
import { AlfredpayKycContext, AveniaKycContext, MykoboKycContext } from "../machines/kyc.states";
import { rampMachine } from "../machines/ramp.machine";
import {
  AlfredpayKycActorRef,
  AlfredpayKycSnapshot,
  AveniaKycActorRef,
  AveniaKycSnapshot,
  MykoboKycActorRef,
  MykoboKycSnapshot,
  SelectedAlfredpayData,
  SelectedAveniaData,
  SelectedMykoboData
} from "../machines/types";

const RAMP_STATE_STORAGE_KEY = "rampState";

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

type AnyActorRef = ActorRef<Snapshot<unknown>, never>;

function useKycChildActor<T extends AnyActorRef>(id: "aveniaKyc" | "mykoboKyc" | "alfredpayKyc"): T | undefined {
  const rampActor = useRampActor();
  return useSelector(rampActor, snapshot => (snapshot.children as Record<string, unknown>)[id]) as T | undefined;
}

function useKycChildSelector<TActor extends AnyActorRef, TSnapshot extends { value: unknown; context: unknown }, TSelected>(
  actor: TActor | undefined,
  build: (snapshot: TSnapshot) => TSelected
): TSelected | undefined {
  return useSelector(
    actor,
    (snapshot: TSnapshot | undefined) => (snapshot ? build(snapshot) : undefined),
    (prev, next) => {
      if (!prev || !next) return prev === next;
      return (
        (prev as { stateValue: unknown; context: unknown }).stateValue ===
          (next as { stateValue: unknown; context: unknown }).stateValue &&
        (prev as { stateValue: unknown; context: unknown }).context ===
          (next as { stateValue: unknown; context: unknown }).context
      );
    }
  );
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
  return useKycChildSelector<AveniaKycActorRef, AveniaKycSnapshot, SelectedAveniaData>(actor, snapshot => ({
    context: snapshot.context as AveniaKycContext,
    stateValue: snapshot.value
  }));
}

export function useMykoboKycActor(): MykoboKycActorRef | undefined {
  return useKycChildActor<MykoboKycActorRef>("mykoboKyc");
}

export function useMykoboKycSelector(): SelectedMykoboData | undefined {
  const actor = useMykoboKycActor();
  return useKycChildSelector<MykoboKycActorRef, MykoboKycSnapshot, SelectedMykoboData>(actor, snapshot => ({
    context: snapshot.context as MykoboKycContext,
    stateValue: snapshot.value
  }));
}

export function useAlfredpayKycActor(): AlfredpayKycActorRef | undefined {
  return useKycChildActor<AlfredpayKycActorRef>("alfredpayKyc");
}

export function useAlfredpayKycSelector(): SelectedAlfredpayData | undefined {
  const actor = useAlfredpayKycActor();
  return useKycChildSelector<AlfredpayKycActorRef, AlfredpayKycSnapshot, SelectedAlfredpayData>(actor, snapshot => ({
    context: snapshot.context as AlfredpayKycContext,
    stateValue: snapshot.value
  }));
}
