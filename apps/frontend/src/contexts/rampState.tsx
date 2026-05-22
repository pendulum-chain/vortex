import { createActorContext, useSelector } from "@xstate/react";
import React, { PropsWithChildren, useEffect } from "react";
import { AlfredpayKycContext, AveniaKycContext, MykoboKycContext } from "../machines/kyc.states";
import { rampMachine } from "../machines/ramp.machine";
import {
  AlfredpayKycActorRef,
  AlfredpayKycSnapshot,
  AveniaKycActorRef,
  AveniaKycSnapshot,
  MykoboKycActorRef,
  MykoboKycSnapshot,
  RampMachineSnapshot,
  SelectedAlfredpayData,
  SelectedAveniaData,
  SelectedMykoboData
} from "../machines/types";

const RAMP_STATE_STORAGE_KEY = "rampState";

const restoredStateJSON = localStorage.getItem(RAMP_STATE_STORAGE_KEY);
let restoredState = restoredStateJSON ? JSON.parse(restoredStateJSON) : undefined;
// invalidate restored state if the machine is with error status.
restoredState = restoredState?.status === "error" ? undefined : restoredState;

export const RampStateContext = createActorContext(rampMachine, {
  snapshot: restoredState
});

export const useRampActor = RampStateContext.useActorRef;
export const useRampStateSelector = RampStateContext.useSelector;

const PersistenceEffect = () => {
  const rampActor = useRampActor();

  const aveniaActor = useSelector(rampActor, snapshot => (snapshot.children as Record<string, unknown>).aveniaKyc) as
    | AveniaKycActorRef
    | undefined;

  const mykoboActor = useSelector(rampActor, snapshot => (snapshot.children as Record<string, unknown>).mykoboKyc) as
    | MykoboKycActorRef
    | undefined;

  const { rampContext, rampState, isQuoteExpired, quote } = useSelector(rampActor, state => ({
    isQuoteExpired: state?.context.isQuoteExpired,
    quote: state?.context.quote,
    rampContext: state?.context,
    rampState: state?.value
  }));

  const { aveniaState } = useSelector(aveniaActor, state => ({
    aveniaState: state?.value
  }));

  const { mykoboState } = useSelector(mykoboActor, state => ({
    mykoboState: state?.value
  }));

  // biome-ignore lint/correctness/useExhaustiveDependencies: run when selected snapshot pieces change
  useEffect(() => {
    const persistedSnapshot = rampActor.getPersistedSnapshot();
    localStorage.setItem("rampState", JSON.stringify(persistedSnapshot));
    // It's important to have `isQuoteExpired` and `quote` here in the deps array to persist them when they change
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
  const rampActor = useRampActor();

  return useSelector(rampActor, snapshot => (snapshot.children as Record<string, unknown>).aveniaKyc) as
    | AveniaKycActorRef
    | undefined;
}

export function useAveniaKycSelector(): SelectedAveniaData | undefined {
  const rampActor = useRampActor();

  const aveniaActor = useSelector(rampActor, snapshot => (snapshot.children as Record<string, unknown>).aveniaKyc) as
    | AveniaKycActorRef
    | undefined;

  return useSelector(
    aveniaActor,
    (snapshot: AveniaKycSnapshot | undefined) => {
      if (!snapshot) {
        return undefined;
      }
      return {
        context: snapshot.context as AveniaKycContext,
        stateValue: snapshot.value
      };
    },
    (prev, next) => {
      if (!prev || !next) {
        return prev === next;
      }
      return prev.stateValue === next.stateValue && prev.context === next.context;
    }
  );
}

export function useMykoboKycActor(): MykoboKycActorRef | undefined {
  const rampActor = useRampActor();

  return useSelector(rampActor, snapshot => (snapshot.children as Record<string, unknown>).mykoboKyc) as
    | MykoboKycActorRef
    | undefined;
}

export function useMykoboKycSelector(): SelectedMykoboData | undefined {
  const rampActor = useRampActor();

  const mykoboActor = useSelector(rampActor, snapshot => (snapshot.children as Record<string, unknown>).mykoboKyc) as
    | MykoboKycActorRef
    | undefined;

  return useSelector(
    mykoboActor,
    (snapshot: MykoboKycSnapshot | undefined) => {
      if (!snapshot) {
        return undefined;
      }
      return {
        context: snapshot.context as MykoboKycContext,
        stateValue: snapshot.value
      };
    },
    (prev, next) => {
      if (!prev || !next) {
        return prev === next;
      }
      return prev.stateValue === next.stateValue && prev.context === next.context;
    }
  );
}

export function useAlfredpayKycActor(): AlfredpayKycActorRef | undefined {
  const rampActor = useRampActor();

  return useSelector(rampActor, snapshot => (snapshot.children as Record<string, unknown>).alfredpayKyc) as
    | AlfredpayKycActorRef
    | undefined;
}

export function useAlfredpayKycSelector(): SelectedAlfredpayData | undefined {
  const rampActor = useRampActor();

  const alfredpayActor = useSelector(rampActor, snapshot => (snapshot.children as Record<string, unknown>).alfredpayKyc) as
    | AlfredpayKycActorRef
    | undefined;

  return useSelector(
    alfredpayActor,
    (snapshot: AlfredpayKycSnapshot | undefined) => {
      if (!snapshot) {
        return undefined;
      }
      return {
        context: snapshot.context as AlfredpayKycContext,
        stateValue: snapshot.value
      };
    },
    (prev, next) => {
      if (!prev || !next) {
        return prev === next;
      }
      return prev.stateValue === next.stateValue && prev.context === next.context;
    }
  );
}
