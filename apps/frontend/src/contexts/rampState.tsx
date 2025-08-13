import { createActorContext, useSelector } from "@xstate/react";
import React, { PropsWithChildren, use, useEffect } from "react";
import { MoneriumKycContext, StellarKycContext } from "../machines/kyc.states";
import { rampMachine } from "../machines/ramp.machine";
import {
  MoneriumKycActorRef,
  MoneriumKycSnapshot,
  RampMachineSnapshot,
  SelectedMoneriumData,
  SelectedStellarData,
  StellarKycActorRef,
  StellarKycSnapshot
} from "../machines/types";

const RAMP_STATE_STORAGE_KEY = "rampState";

const restoredStateJSON = localStorage.getItem(RAMP_STATE_STORAGE_KEY);
let restoredState = restoredStateJSON ? JSON.parse(restoredStateJSON) : undefined;
console.log("restored state: ", restoredState);
// invalidate restored state if the machine is with error status.
restoredState = restoredState?.status === "error" ? undefined : restoredState;

export const RampStateContext = createActorContext(rampMachine, {
  snapshot: restoredState
});

export const useRampActor = RampStateContext.useActorRef;
export const useRampStateSelector = RampStateContext.useSelector;

const PersistenceEffect = () => {
  const rampActor = useRampActor();

  const stellarActor = useSelector(rampActor, (snapshot: RampMachineSnapshot) => (snapshot.children as any).stellarKyc) as
    | StellarKycActorRef
    | undefined;

  const moneriumActor = useSelector(rampActor, (snapshot: RampMachineSnapshot) => (snapshot.children as any).moneriumKyc) as
    | MoneriumKycActorRef
    | undefined;

  const { rampState } = useSelector(rampActor, state => ({
    rampState: state?.value
  }));

  const { moneriumState } = useSelector(moneriumActor, state => ({
    moneriumState: state?.value
  }));

  const { stellarState } = useSelector(stellarActor, state => ({
    stellarState: state?.value
  }));

  useEffect(() => {
    const persistedSnapshot = rampActor.getPersistedSnapshot();
    localStorage.setItem("rampState", JSON.stringify(persistedSnapshot));
  }, [rampState, moneriumState, stellarState]);

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

export function useStellarKycSelector(): SelectedStellarData | undefined {
  const rampActor = useRampActor();

  const stellarActor = useSelector(rampActor, (snapshot: RampMachineSnapshot) => (snapshot.children as any).stellarKyc) as
    | StellarKycActorRef
    | undefined;

  return useSelector(
    stellarActor,
    (snapshot: StellarKycSnapshot | undefined) => {
      if (!snapshot) {
        return undefined;
      }
      return {
        context: snapshot.context as StellarKycContext,
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

export function useMoneriumKycActor(): MoneriumKycActorRef | undefined {
  const rampActor = useRampActor();

  return useSelector(rampActor, (snapshot: RampMachineSnapshot) => (snapshot.children as any).moneriumKyc) as
    | MoneriumKycActorRef
    | undefined;
}

export function useMoneriumKycSelector(): SelectedMoneriumData | undefined {
  const rampActor = useRampActor();

  const moneriumActor = useSelector(rampActor, (snapshot: RampMachineSnapshot) => (snapshot.children as any).moneriumKyc) as
    | MoneriumKycActorRef
    | undefined;

  return useSelector(
    moneriumActor,
    (snapshot: MoneriumKycSnapshot | undefined) => {
      if (!snapshot) {
        return undefined;
      }
      return {
        context: snapshot.context as MoneriumKycContext,
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
