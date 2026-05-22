import { createActorContext, useSelector } from "@xstate/react";
import React, { PropsWithChildren, useEffect } from "react";
import type { AnyActorRef } from "xstate";
import { AlfredpayKycContext, AveniaKycContext, MoneriumKycContext, MykoboKycContext } from "../machines/kyc.states";
import { rampMachine } from "../machines/ramp.machine";
import {
  AlfredpayKycActorRef,
  AveniaKycActorRef,
  MoneriumKycActorRef,
  MykoboKycActorRef,
  RampMachineSnapshot,
  SelectedAlfredpayData,
  SelectedAveniaData,
  SelectedMoneriumData,
  SelectedMykoboData
} from "../machines/types";

const RAMP_STATE_STORAGE_KEY = "rampState";

const restoredStateJSON = localStorage.getItem(RAMP_STATE_STORAGE_KEY);
let restoredState = restoredStateJSON ? JSON.parse(restoredStateJSON) : undefined;
restoredState = restoredState?.status === "error" ? undefined : restoredState;

export const RampStateContext = createActorContext(rampMachine, {
  snapshot: restoredState
});

export const useRampActor = RampStateContext.useActorRef;
export const useRampStateSelector = RampStateContext.useSelector;

// XState's `snapshot.children` is typed against the machine's declared invokes, but child KYC actors
// are invoked dynamically via the kycStateNode lookup table so they don't appear in that type. Cast
// to a plain id->ref map here and let each caller specialize via the generic — that keeps the unsafe
// access in one place instead of repeating `(snapshot.children as any).<id>` throughout the file.
const getChildActor = <T,>(snapshot: RampMachineSnapshot, id: string): T | undefined =>
  (snapshot.children as Record<string, unknown>)[id] as T | undefined;

// Each KYC selector hook below produces the same `{ stateValue, context }` projection with the same
// shallow equality fn. This helper collapses that boilerplate; callers supply the snapshot/context
// types since the underlying child actor refs aren't statically inferable (see `getChildActor`).
function useKycSnapshotProjection<TActor extends AnyActorRef, TContext>(
  actor: TActor | undefined
): { stateValue: ReturnType<TActor["getSnapshot"]>["value"]; context: TContext } | undefined {
  return useSelector(
    actor,
    snapshot => {
      if (!snapshot) return undefined;
      return {
        context: snapshot.context as TContext,
        stateValue: snapshot.value as ReturnType<TActor["getSnapshot"]>["value"]
      };
    },
    (prev, next) => {
      if (!prev || !next) return prev === next;
      return prev.stateValue === next.stateValue && prev.context === next.context;
    }
  );
}

const PersistenceEffect = () => {
  const rampActor = useRampActor();

  const moneriumActor = useSelector(rampActor, snapshot => getChildActor<MoneriumKycActorRef>(snapshot, "moneriumKyc"));
  const aveniaActor = useSelector(rampActor, snapshot => getChildActor<AveniaKycActorRef>(snapshot, "aveniaKyc"));

  const { rampContext, rampState, isQuoteExpired, quote } = useSelector(rampActor, state => ({
    isQuoteExpired: state?.context.isQuoteExpired,
    quote: state?.context.quote,
    rampContext: state?.context,
    rampState: state?.value
  }));

  const { moneriumState } = useSelector(moneriumActor, state => ({
    moneriumState: state?.value
  }));

  const { aveniaState } = useSelector(aveniaActor, state => ({
    aveniaState: state?.value
  }));

  // biome-ignore lint/correctness/useExhaustiveDependencies: persistence triggers on context/state changes and on quote/expiry transitions; `rampActor` is stable.
  useEffect(() => {
    const persistedSnapshot = rampActor.getPersistedSnapshot();
    localStorage.setItem("rampState", JSON.stringify(persistedSnapshot));
  }, [rampContext, rampState, moneriumState, aveniaState, isQuoteExpired, quote]);

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

export function useMoneriumKycActor(): MoneriumKycActorRef | undefined {
  const rampActor = useRampActor();

  return useSelector(rampActor, snapshot => getChildActor<MoneriumKycActorRef>(snapshot, "moneriumKyc"));
}

export function useMoneriumKycSelector(): SelectedMoneriumData | undefined {
  const actor = useMoneriumKycActor();
  return useKycSnapshotProjection<MoneriumKycActorRef, MoneriumKycContext>(actor);
}

export function useMykoboKycActor(): MykoboKycActorRef | undefined {
  const rampActor = useRampActor();

  return useSelector(rampActor, snapshot => getChildActor<MykoboKycActorRef>(snapshot, "mykoboKyc"));
}

export function useMykoboKycSelector(): SelectedMykoboData | undefined {
  const actor = useMykoboKycActor();
  return useKycSnapshotProjection<MykoboKycActorRef, MykoboKycContext>(actor);
}

export function useAveniaKycActor(): AveniaKycActorRef | undefined {
  const rampActor = useRampActor();

  return useSelector(rampActor, snapshot => getChildActor<AveniaKycActorRef>(snapshot, "aveniaKyc"));
}

export function useAveniaKycSelector(): SelectedAveniaData | undefined {
  const actor = useAveniaKycActor();
  return useKycSnapshotProjection<AveniaKycActorRef, AveniaKycContext>(actor);
}

export function useAlfredpayKycActor(): AlfredpayKycActorRef | undefined {
  const rampActor = useRampActor();

  return useSelector(rampActor, snapshot => getChildActor<AlfredpayKycActorRef>(snapshot, "alfredpayKyc"));
}

export function useAlfredpayKycSelector(): SelectedAlfredpayData | undefined {
  const actor = useAlfredpayKycActor();
  return useKycSnapshotProjection<AlfredpayKycActorRef, AlfredpayKycContext>(actor);
}
