import { useEffect } from "react";
import { useRampActor } from "../../contexts/rampState";
import { QuoteForm } from "../quote-form";

export const Quote = () => {
  // If this is visible, reset the rampState machine because it's not needed on the quote page
  const rampActor = useRampActor();

  useEffect(() => {
    rampActor.send({
      type: "RESET_RAMP"
    });
  }, [rampActor.send]);

  return <QuoteForm />;
};
