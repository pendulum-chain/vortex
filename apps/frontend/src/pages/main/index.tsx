import { useSelector } from "@xstate/react";
import { QuoteBackground } from "../../components/QuoteBackground";
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
          <QuoteBackground>
            <div className="flex flex-row items-center grow-1 justify-evenly">
              <div className="text-2xl font-semibold text-white text-end md:text-3xl lg:text-4xl">
                The <span className="text-[rgb(238,201,115)]">Lowest-Cost</span> On <br /> and Off Ramping <br /> Solution
              </div>
              <Quote />
            </div>
          </QuoteBackground>
          <MainSections />
        </>
      ) : (
        <Ramp />
      )}
    </main>
  );

  return <BaseLayout main={main} />;
};
