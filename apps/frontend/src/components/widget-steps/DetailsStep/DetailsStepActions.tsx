import { Networks } from "@vortexfi/shared";
import { FieldErrors } from "react-hook-form";
import { RampFormValues } from "../../../hooks/ramp/schema";
import { useVortexAccount } from "../../../hooks/useVortexAccount";
import { ConnectWalletSection } from "../../ConnectWalletSection";
import { RampSubmitButton } from "../../RampSubmitButton/RampSubmitButton";
import { SigningBoxButton } from "../../SigningBox/SigningBoxContent";
import { SigningState } from "./index";

export interface DetailsStepActionsProps {
  signingState: SigningState;
  requiresConnection: boolean;
  className?: string;
  forceNetwork?: Networks;
  formErrors?: FieldErrors<RampFormValues>;
}

export const DetailsStepActions = ({
  signingState,
  className,
  requiresConnection,
  forceNetwork,
  formErrors
}: DetailsStepActionsProps) => {
  const { shouldDisplay: signingBoxVisible, signatureState, confirmations } = signingState;
  const { isConnected } = useVortexAccount(forceNetwork);

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
      {requiresConnection && <ConnectWalletSection forceNetwork={forceNetwork} />}
      {displayRampSubmitButton && (
        <RampSubmitButton className="mb-4" hasValidationErrors={!!formErrors && Object.keys(formErrors).length > 0} />
      )}
    </div>
  );
};
