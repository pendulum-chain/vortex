import { useSetRampUrlParams } from "../../hooks/useRampUrlParams";
import { useWidgetMode } from "../../hooks/useWidgetMode";
import { BaseLayout } from "../../layouts";
import { Ramp } from "../ramp";
import MainSections from "./MainSections";

export const Main = () => {
  const isWidgetMode = useWidgetMode();
  useSetRampUrlParams();

  const main = (
    <main>
      {!isWidgetMode ? (
        <>
          <MainSections />
        </>
      ) : (
        <Ramp />
      )}
    </main>
  );

  return <BaseLayout main={main} />;
};
