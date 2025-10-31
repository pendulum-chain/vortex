import { RampDirection } from "@packages/shared";
import { motion } from "motion/react";
import { TokenSelectionMenu } from "../../components/menus/TokenSelectionMenu";
import { PoweredBy } from "../../components/PoweredBy";
import { Offramp } from "../../components/Ramp/Offramp";
import { Onramp } from "../../components/Ramp/Onramp";
import { RampToggle } from "../../components/RampToggle";
import { useRampDirection, useRampDirectionToggle } from "../../stores/rampDirectionStore";

export const Quote = () => {
  return (
    <main>
      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        className="relative mx-4 mt-8 mb-4 overflow-hidden rounded-lg bg-white px-4 pt-4 pb-2 shadow-custom md:mx-auto md:w-96"
        initial={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3 }}
      >
        <QuoteContent />
      </motion.div>
    </main>
  );
};

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
