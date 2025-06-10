import { motion } from 'motion/react';
import { PIXKYCForm } from '../../components/BrlaComponents/BrlaExtendedForm';
import { PoolSelectorModal } from '../../components/InputKeys/SelectionModal';
import { PoweredBy } from '../../components/PoweredBy';
import { Offramp } from '../../components/Ramp/Offramp';
import { Onramp } from '../../components/Ramp/Onramp';
import { RampHistory } from '../../components/RampHistory';
import { RampHistoryButton } from '../../components/RampHistory/RampHistoryButton';
import { RampSummaryDialog } from '../../components/RampSummaryDialog';
import { RampDirection, RampToggle } from '../../components/RampToggle';

import { useSetRampUrlParams } from '../../hooks/useRampUrlParams';
import { useRampDirection, useRampDirectionToggle } from '../../stores/rampDirectionStore';
import { useRampKycLevel2Started, useRampKycStarted } from '../../stores/rampStore';

export const RampForm = () => {
  const activeSwapDirection = useRampDirection();
  const onSwapDirectionToggle = useRampDirectionToggle();
  const rampKycStarted = useRampKycStarted();
  const rampKycLevel2Started = useRampKycLevel2Started();

  useSetRampUrlParams();

  return (
    <main>
      <PoolSelectorModal />
      <RampSummaryDialog />
      {rampKycStarted || rampKycLevel2Started ? (
        <PIXKYCForm />
      ) : (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="px-4 pt-4 pb-2 mx-4 mt-8 mb-4 rounded-lg shadow-custom md:mx-auto md:w-96 relative overflow-hidden"
        >
          <RampHistory />
          <section className="w-full pb-1 flex justify-end">
            <RampHistoryButton />
          </section>
          <RampToggle activeDirection={activeSwapDirection} onToggle={onSwapDirectionToggle} />

          {activeSwapDirection === RampDirection.ONRAMP ? <Onramp /> : <Offramp />}
          <div className="mb-16" />
          <PoweredBy />
        </motion.div>
      )}
    </main>
  );
};
