import { useSelector } from "@xstate/react";
import { Trans } from "react-i18next";
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
          <div className="relative overflow-hidden bg-[radial-gradient(at_74%_98%,theme(colors.blue.900),theme(colors.blue.950),theme(colors.blue.950))] pb-4">
            <div className="flex grow-1 flex-col items-center justify-evenly md:flex-row">
              <div className="pt-8 text-center font-semibold text-2xl text-white md:pt-0 md:text-3xl lg:text-end lg:text-4xl">
                <Trans
                  components={{
                    1: <span className="text-[rgb(238,201,115)]" />,
                    br: <br />
                  }}
                  i18nKey="pages.main.hero.title"
                />
              </div>
              <Quote />
            </div>
          </div>
          <MainSections />
        </>
      ) : (
        <Ramp />
      )}
    </main>
  );

  return <BaseLayout main={main} />;
};
