import { BaseLayout } from "../../layouts";
import { useProvidedQuoteId } from "../../stores/quote/useQuoteStore";
import { Quote } from "../quote";
import { Ramp } from "../ramp";
import MainSections from "./MainSections";

export const Main = () => {
  const providedQuoteId = useProvidedQuoteId();

  const main = (
    <main>
      {providedQuoteId ? (
        <Ramp />
      ) : (
        <>
          <Quote />
          <MainSections />
        </>
      )}
    </main>
  );

  return <BaseLayout main={main} />;
};
