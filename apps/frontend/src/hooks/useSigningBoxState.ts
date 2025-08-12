import { isNetworkEVM } from "@packages/shared";
import { useSelector } from "@xstate/react";
import { useEffect, useState } from "react";
import { useNetwork } from "../contexts/network";
import { useRampActor } from "../contexts/rampState";
import { useSigningRejected } from "../stores/rampStore";
import { useSafeWalletSignatureStore } from "../stores/safeWalletSignaturesStore";
import { RampSigningPhase } from "../types/phases";

const PROGRESS_CONFIGS: Record<"EVM" | "NON_EVM", Record<RampSigningPhase, number>> = {
  EVM: {
    approved: 50,
    finished: 100,
    login: 15,
    signed: 75,
    started: 25
  },
  NON_EVM: {
    approved: 0,
    finished: 100,
    login: 15,
    signed: 0,
    started: 33
  }
};

const getSignatureDetails = (step: RampSigningPhase, isEVM: boolean) => {
  if (!isEVM) return { current: 1, max: 1 };
  if (step === "login") return { current: 1, max: 1 };
  if (step === "started") return { current: 1, max: 2 };
  return { current: 2, max: 2 };
};

const isValidStep = (step: RampSigningPhase | undefined, isEVM: boolean): step is RampSigningPhase => {
  if (!step) return false;
  if (step === "finished" || step === "login") return true;
  if (!isEVM && (step === "approved" || step === "signed")) return false;
  return true;
};

export const useSigningBoxState = (autoHideDelay = 2500, displayDelay = 100) => {
  const rampActor = useRampActor();
  const { step } = useSelector(rampActor, state => ({
    step: state.context.rampSigningPhase
  }));
  const { selectedNetwork } = useNetwork();
  const isEVM = isNetworkEVM(selectedNetwork);
  const progressConfig = isEVM ? PROGRESS_CONFIGS.EVM : PROGRESS_CONFIGS.NON_EVM;
  const { confirmations } = useSafeWalletSignatureStore();

  const [progress, setProgress] = useState(0);
  const [signatureState, setSignatureState] = useState({ current: 0, max: 0 });
  const [shouldExit, setShouldExit] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [shouldDisplay, setShouldDisplay] = useState(false);

  useEffect(() => {
    if (!isValidStep(step, isEVM)) {
      setIsVisible(false);
      return;
    }

    setIsVisible(true);

    if (step !== "finished" && shouldExit) {
      setShouldExit(false);
    }

    if (step === "finished") {
      setProgress(100);
      setTimeout(() => {
        setShouldExit(true);
        setIsVisible(false);
      }, autoHideDelay);
      return;
    }

    setProgress(progressConfig[step]);
    setSignatureState(getSignatureDetails(step, isEVM));
  }, [step, isEVM, progressConfig, shouldExit, autoHideDelay]);

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
    confirmations,
    isValidStep: (s: RampSigningPhase | undefined) => isValidStep(s, isEVM),
    isVisible,
    progress,
    shouldDisplay,
    signatureState
  };
};
