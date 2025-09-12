import { useVortexAccount } from "../../../hooks/useVortexAccount";
import { ConnectWalletSection } from "../../ConnectWalletSection";
import { RampSubmitButton } from "../../RampSubmitButton/RampSubmitButton";
import { SigningBoxButton } from "../../SigningBox/SigningBoxContent";
import { SigningState } from "./index";

export interface DetailsStepActionsProps {
  signingState: SigningState;
  className?: string;
}

export const DetailsStepActions = ({ signingState, className }: DetailsStepActionsProps) => {
  const { shouldDisplay: signingBoxVisible, signatureState, confirmations } = signingState;
  const { isConnected } = useVortexAccount();

  if (signingBoxVisible) {
    return (
      <div className={`flex grow text-center ${className || ""}`}>
        <SigningBoxButton confirmations={confirmations} signatureState={signatureState} />
      </div>
    );
  }

  return (
    <div className={className}>
      <ConnectWalletSection />
      {isConnected && <RampSubmitButton className="mb-4" />}
    </div>
  );
};
