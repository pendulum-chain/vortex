import { Networks } from "@vortexfi/shared";
import { useFormContext } from "react-hook-form";
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
  isBrazilLanding: boolean;
}

export const DetailsStepActions = ({
  signingState,
  className,
  requiresConnection,
  forceNetwork,
  isBrazilLanding
}: DetailsStepActionsProps) => {
  const { shouldDisplay: signingBoxVisible, signatureState, confirmations } = signingState;
  const { isConnected } = useVortexAccount(forceNetwork);

  const {
    formState: { errors },
    watch
  } = useFormContext<RampFormValues>();
  const formValues = watch();

  const hasFormErrors = Object.keys(errors).length > 0;

  let hasEmptyForm = false;

  if (isBrazilLanding) {
    const allRelevantFieldsEmpty = !formValues.taxId || !formValues.walletAddress;
    hasEmptyForm = allRelevantFieldsEmpty;
  } else {
    hasEmptyForm = !formValues.walletAddress;
  }

  const hasValidationErrors = hasFormErrors || hasEmptyForm;

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
      {displayRampSubmitButton && <RampSubmitButton hasValidationErrors={hasValidationErrors} />}
    </div>
  );
};
