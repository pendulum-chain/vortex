import { createActorContext, useSelector } from "@xstate/react";
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

const restoredState = localStorage.getItem("moneriumKycState")
  ? JSON.parse(localStorage.getItem("moneriumKycState")!)
  : undefined;
console.log("Restored state:", restoredState);
export const RampStateContext = createActorContext(rampMachine, { snapshot: restoredState });

export const RampStateProvider = RampStateContext.Provider;
export const useRampActor = RampStateContext.useActorRef;
export const useRampStateSelector = RampStateContext.useSelector;

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
