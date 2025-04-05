import { useRef } from 'react';

import { SigningBox } from '../../components/SigningBox';
import { OfframpSummaryDialog } from '../../components/OfframpSummaryDialog';
import { PIXKYCForm } from '../../components/BrlaComponents/BrlaExtendedForm';
import { Swap } from '../../components/Swap';
import { SuccessPage } from '../success';
import { FailurePage } from '../failure';
import { ProgressPage } from '../progress';

import { useRampSubmission } from '../../hooks/ramp/useRampSubmission';
import { useRampNavigation } from '../../hooks/ramp/useRampNavigation';

import { useRampActions, useRampExecutionInput, useRampSummaryVisible, useRampKycStarted } from '../../stores/offrampStore';

export const RampForm = () => {
  const formRef = useRef<HTMLDivElement | null>(null);
  const feeComparisonRef = useRef<HTMLDivElement | null>(null);

  const { handleOfframpSubmit } = useRampSubmission();
  const isOfframpSummaryDialogVisible = useRampSummaryVisible();
  const executionInput = useRampExecutionInput();
  const offrampKycStarted = useRampKycStarted();
  const { setRampSummaryVisible } = useRampActions();

  const { getCurrentComponent, currentPhase } = useRampNavigation(
    <SuccessPage
      finishOfframping={() => {}}
      transactionId={executionInput?.quote?.id}
      toToken={executionInput?.quote?.toToken}
    />,
    <FailurePage
      finishOfframping={() => {}}
      continueFailedFlow={() => {}}
      transactionId={executionInput?.quote?.id}
    />,
    <ProgressPage offrampingState={{ ramp: { currentPhase: 'executing' } }} />,
    null
  );

  if (currentPhase === 'complete' || currentPhase === 'failed' ||
      (currentPhase && currentPhase !== 'initial')) {
    return getCurrentComponent();
  }

  return (
    <main ref={formRef}>
      <OfframpSummaryDialog
        visible={isOfframpSummaryDialogVisible}
        executionInput={executionInput}
        onSubmit={handleOfframpSubmit}
        onClose={() => setRampSummaryVisible(false)}
      />
      <SigningBox />
      {offrampKycStarted ? (
        <PIXKYCForm feeComparisonRef={feeComparisonRef} />
      ) : (
        <Swap />
      )}
    </main>
  );
};