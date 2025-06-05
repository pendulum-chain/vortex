import { useEffect, useState } from 'react';
import { isNetworkEVM } from 'shared';
import { useNetwork } from '../contexts/network';
import { useRampSigningPhase, useSigningRejected } from '../stores/rampStore';
import { useSafeWalletSignatureStore } from '../stores/safeWalletSignaturesStore';
import { RampSigningPhase } from '../types/phases';

const PROGRESS_CONFIGS: Record<'EVM' | 'NON_EVM', Record<RampSigningPhase, number>> = {
  EVM: {
    started: 25,
    approved: 50,
    signed: 75,
    finished: 100,
    login: 15,
  },
  NON_EVM: {
    started: 33,
    finished: 100,
    signed: 0,
    approved: 0,
    login: 15,
  },
};

const getSignatureDetails = (step: RampSigningPhase, isEVM: boolean) => {
  if (!isEVM) return { max: 1, current: 1 };
  if (step === 'login') return { max: 1, current: 1 };
  if (step === 'started') return { max: 2, current: 1 };
  return { max: 2, current: 2 };
};

const isValidStep = (step: RampSigningPhase | undefined, isEVM: boolean): step is RampSigningPhase => {
  if (!step) return false;
  if (step === 'finished' || step === 'login') return true;
  if (!isEVM && (step === 'approved' || step === 'signed')) return false;
  return true;
};

export const useSigningBoxState = (autoHideDelay = 2500, displayDelay = 100) => {
  const step = useRampSigningPhase();
  const { selectedNetwork } = useNetwork();
  const isEVM = isNetworkEVM(selectedNetwork);
  const progressConfig = isEVM ? PROGRESS_CONFIGS.EVM : PROGRESS_CONFIGS.NON_EVM;
  const { confirmations } = useSafeWalletSignatureStore();
  const signingRejected = useSigningRejected();

  const [progress, setProgress] = useState(0);
  const [signatureState, setSignatureState] = useState({ max: 0, current: 0 });
  const [shouldExit, setShouldExit] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [shouldDisplay, setShouldDisplay] = useState(false);

  useEffect(() => {
    if (!isValidStep(step, isEVM) || signingRejected) {
      setIsVisible(false);
      return;
    }

    setIsVisible(true);

    if (step !== 'finished' && shouldExit) {
      setShouldExit(false);
    }

    if (step === 'finished') {
      setProgress(100);
      setTimeout(() => {
        setShouldExit(true);
        setIsVisible(false);
      }, autoHideDelay);
      return;
    }

    setProgress(progressConfig[step]);
    setSignatureState(getSignatureDetails(step, isEVM));
  }, [step, isEVM, progressConfig, shouldExit, signingRejected, autoHideDelay]);

  useEffect(() => {
    let timeoutId: number;

    if (isVisible) {
      timeoutId = window.setTimeout(() => {
        setShouldDisplay(true);
      }, displayDelay);
    } else {
      setShouldDisplay(false);
    }

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [isVisible, displayDelay]);

  return {
    isVisible,
    shouldDisplay,
    progress,
    signatureState,
    confirmations,
    isValidStep: (s: RampSigningPhase | undefined) => isValidStep(s, isEVM),
  };
};
