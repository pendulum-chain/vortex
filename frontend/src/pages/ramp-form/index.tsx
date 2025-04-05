import { useRef } from 'react';

import { SigningBox } from '../../components/SigningBox';
import { OfframpSummaryDialog } from '../../components/OfframpSummaryDialog';
import { PIXKYCForm } from '../../components/BrlaComponents/BrlaExtendedForm';
import { Swap } from '../../components/Swap';

import { useRampKycStarted } from '../../stores/offrampStore';
import { PoolSelectorModal } from '../../components/InputKeys/SelectionModal';

export const RampForm = () => {
  const offrampKycStarted = useRampKycStarted();

  return (
    <main>
      <PoolSelectorModal/>
      <OfframpSummaryDialog />
      <SigningBox />
      {offrampKycStarted ? (
        <PIXKYCForm />
      ) : (
        <Swap />
      )}
    </main>
  );
};