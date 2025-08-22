import { RampDirection } from "@packages/shared";
import { motion } from "motion/react";
import { PoolSelectorModal } from "../../components/InputKeys/SelectionModal";
import { PoweredBy } from "../../components/PoweredBy";
import { Offramp } from "../../components/Ramp/Offramp";
import { Onramp } from "../../components/Ramp/Onramp";
import { RampToggle } from "../../components/RampToggle";
import { useSetRampUrlParams } from "../../hooks/useRampUrlParams";
import { useRampDirection, useRampDirectionToggle } from "../../stores/rampDirectionStore";

export const QuoteForm = () => {
  const activeSwapDirection = useRampDirection();
  const onSwapDirectionToggle = useRampDirectionToggle();
  useSetRampUrlParams();

  return (
    <main>
      <PoolSelectorModal />
      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        className="relative mx-4 mt-8 mb-4 overflow-hidden rounded-lg px-4 pt-4 pb-2 shadow-custom md:mx-auto md:w-96"
        initial={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3 }}
      >
        <RampToggle activeDirection={activeSwapDirection} onToggle={onSwapDirectionToggle} />
        {activeSwapDirection === RampDirection.BUY ? <Onramp /> : <Offramp />}
        <div className="mb-16" />
        <PoweredBy />
      </motion.div>
    </main>
  );
};
