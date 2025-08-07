import { createActorContext, useSelector } from "@xstate/react";
import { ActorRefFrom, SnapshotFrom } from "xstate";
import { StellarKycContext } from "../machines/kyc.states";
import { rampMachine } from "../machines/ramp.machine";
import { stellarKycMachine } from "../machines/stellarKyc.machine";

export const RampStateContext = createActorContext(rampMachine);

export const RampStateProvider = RampStateContext.Provider;
export const useRampActor = RampStateContext.useActorRef;
export const useRampStateSelector = RampStateContext.useSelector;

type RampMachineSnapshot = SnapshotFrom<typeof rampMachine>;

type StellarKycActorRef = ActorRefFrom<typeof stellarKycMachine>;
type StellarKycSnapshot = SnapshotFrom<typeof stellarKycMachine>;

type SelectedStellarData = {
  stateValue: StellarKycSnapshot["value"];
  context: StellarKycContext;
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
