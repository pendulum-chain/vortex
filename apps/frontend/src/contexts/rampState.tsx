import { createActorContext, useSelector } from "@xstate/react";
import { ActorRefFrom, SnapshotFrom } from "xstate";
import { MoneriumKycContext, StellarKycContext } from "../machines/kyc.states";
import { moneriumKycMachine } from "../machines/moneriumKyc.machine";
import { rampMachine } from "../machines/ramp.machine";
import { stellarKycMachine } from "../machines/stellarKyc.machine";

const restoredState = localStorage.getItem("moneriumKycState")
  ? JSON.parse(localStorage.getItem("moneriumKycState")!)
  : undefined;
console.log("Restored state:", restoredState);
export const RampStateContext = createActorContext(rampMachine, { snapshot: restoredState });

export const RampStateProvider = RampStateContext.Provider;
export const useRampActor = RampStateContext.useActorRef;
export const useRampStateSelector = RampStateContext.useSelector;

type RampMachineSnapshot = SnapshotFrom<typeof rampMachine>;

type StellarKycActorRef = ActorRefFrom<typeof stellarKycMachine>;
type StellarKycSnapshot = SnapshotFrom<typeof stellarKycMachine>;

type MoneriumKycActorRef = ActorRefFrom<typeof moneriumKycMachine>;
type MoneriumKycSnapshot = SnapshotFrom<typeof moneriumKycMachine>;

type SelectedStellarData = {
  stateValue: StellarKycSnapshot["value"];
  context: StellarKycContext;
};

type SelectedMoneriumData = {
  stateValue: MoneriumKycSnapshot["value"];
  context: MoneriumKycContext;
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
