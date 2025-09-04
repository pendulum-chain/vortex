import { RampDirection } from "@packages/shared";
import { motion } from "motion/react";
import { PoweredBy } from "../../components/PoweredBy";
import { Offramp } from "../../components/Ramp/Offramp";
import { Onramp } from "../../components/Ramp/Onramp";
import { RampHistory } from "../../components/RampHistory";
import { RampHistoryButton } from "../../components/RampHistory/RampHistoryButton";
import { RampToggle } from "../../components/RampToggle";
import { useSetRampUrlParams } from "../../hooks/useRampUrlParams";
import { useRampDirection, useRampDirectionToggle } from "../../stores/rampDirectionStore";
import { TokenSelectionPage } from "../token-selection";

export const QuoteForm = () => {
  const activeSwapDirection = useRampDirection();
  const onSwapDirectionToggle = useRampDirectionToggle();
  useSetRampUrlParams();

  return (
    <main>
      <motion.div
        animate={{ opacity: 1, scale: 1 }}
        className="relative mx-4 mt-8 mb-4 overflow-hidden rounded-lg bg-white px-4 pt-4 pb-2 shadow-custom md:mx-auto md:w-96"
        initial={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3 }}
      >
        <RampHistory />
        <RampToggle activeDirection={activeSwapDirection} onToggle={onSwapDirectionToggle} />
        {activeSwapDirection === RampDirection.BUY ? <Onramp /> : <Offramp />}
        <div className="mb-16" />
        <PoweredBy />
        <TokenSelectionPage />
      </motion.div>
    </main>
  );
};
