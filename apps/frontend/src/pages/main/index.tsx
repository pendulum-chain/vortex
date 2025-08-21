import { useSelector } from "@xstate/react";
import { useRampActor } from "../../contexts/rampState";
import { BaseLayout } from "../../layouts";
import { Quote } from "../quote";
import { Ramp } from "../ramp";
import MainSections from "./MainSections";

export const Main = () => {
  const rampActor = useRampActor();
  const { machineState } = useSelector(rampActor, state => ({
    machineState: state.value
  }));

  const main = (
    <main>
      {machineState === "Idle" ? (
        <>
          <Quote />
          <MainSections />
        </>
      ) : (
        <Ramp />
      )}
    </main>
  );

  return <BaseLayout main={main} />;
};
