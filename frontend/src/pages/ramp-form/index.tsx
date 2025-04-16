import { SigningBox } from '../../components/SigningBox';
import { RampSummaryDialog } from '../../components/RampSummaryDialog';
import { PIXKYCForm } from '../../components/BrlaComponents/BrlaExtendedForm';
import { Offramp } from '../../components/Ramp/Offramp';
import { motion } from 'motion/react';
import { useRampKycStarted } from '../../stores/rampStore';
import { PoolSelectorModal } from '../../components/InputKeys/SelectionModal';
import { useRampDirection, useRampDirectionToggle } from '../../stores/rampDirectionStore';
import { RampDirection, RampToggle } from '../../components/RampToggle';
import { PoweredBy } from '../../components/PoweredBy';
import { Onramp } from '../../components/Ramp/Onramp';

export const RampForm = () => {
  const activeSwapDirection = useRampDirection();
  const onSwapDirectionToggle = useRampDirectionToggle();
  const offrampKycStarted = useRampKycStarted();

  return (
    <main>
      <PoolSelectorModal />
      <RampSummaryDialog />
      <SigningBox />
      {offrampKycStarted ? (
        <PIXKYCForm />
      ) : (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="px-4 pt-4 pb-2 mx-4 mt-8 mb-4 rounded-lg shadow-custom md:mx-auto md:w-96"
        >
          <RampToggle activeDirection={activeSwapDirection} onToggle={onSwapDirectionToggle} />

          {activeSwapDirection === RampDirection.ONRAMP ? <Onramp /> : <Offramp />}

          <div className="mb-16" />
          <PoweredBy />
        </motion.div>
      )}
    </main>
  );
};
