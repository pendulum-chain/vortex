import { RampDirection } from "@vortexfi/shared";
import { TokenSelectionMenu } from "../../components/menus/TokenSelectionMenu";
import { PoweredBy } from "../../components/PoweredBy";
import { Offramp } from "../../components/Ramp/Offramp";
import { Onramp } from "../../components/Ramp/Onramp";
import { RampToggle } from "../../components/RampToggle";
import { useRampDirection, useRampDirectionToggle } from "../../stores/rampDirectionStore";

export const Quote = () => (
  <main className="relative mx-4 mt-8 mb-4 animate-appear overflow-hidden rounded-lg bg-white px-4 pt-4 pb-2 shadow-custom md:mx-auto md:w-96">
    <QuoteContent />
  </main>
);

export const QuoteContent = () => {
  const activeSwapDirection = useRampDirection();
  const onSwapDirectionToggle = useRampDirectionToggle();

  return (
    <>
      <RampToggle activeDirection={activeSwapDirection} onToggle={onSwapDirectionToggle} />
      {activeSwapDirection === RampDirection.BUY ? <Onramp /> : <Offramp />}
      <div className="mb-16" />
      <PoweredBy />
      <TokenSelectionMenu />
    </>
  );
};
