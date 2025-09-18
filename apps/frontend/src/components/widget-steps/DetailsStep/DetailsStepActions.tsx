import { useVortexAccount } from "../../../hooks/useVortexAccount";
import { ConnectWalletSection } from "../../ConnectWalletSection";
import { RampSubmitButton } from "../../RampSubmitButton/RampSubmitButton";
import { SigningBoxButton } from "../../SigningBox/SigningBoxContent";
import { SigningState } from "./index";

export interface DetailsStepActionsProps {
  signingState: SigningState;
  requiresConnection: boolean;
  className?: string;
}

export const DetailsStepActions = ({ signingState, className, requiresConnection }: DetailsStepActionsProps) => {
  const { shouldDisplay: signingBoxVisible, signatureState, confirmations } = signingState;
  const { isConnected } = useVortexAccount();

  if (signingBoxVisible) {
    return (
      <div className={`flex grow text-center ${className || ""}`}>
        <SigningBoxButton confirmations={confirmations} signatureState={signatureState} />
      </div>
    );
  }
  const displayRampSubmitButton = requiresConnection ? isConnected : true;

  return (
    <div className={className}>
      {requiresConnection && <ConnectWalletSection />}
      {displayRampSubmitButton && <RampSubmitButton className="mb-4" />}
    </div>
  );
};
