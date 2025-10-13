import { SigningBoxContent } from "../../SigningBox/SigningBoxContent";
import { AveniaFormStep } from "../AveniaFormStep";
import { MoneriumFormStep } from "../MoneriumFormStep";
import { SigningState } from "./index";

export interface DetailsStepFormProps {
  isBrazilLanding: boolean;
  signingState: SigningState;
  className?: string;
  isWalletAddressDisabled?: boolean;
  showWalletAddressField?: boolean;
}

export const DetailsStepForm = ({
  isBrazilLanding,
  signingState,
  className,
  isWalletAddressDisabled,
  showWalletAddressField
}: DetailsStepFormProps) => {
  const { shouldDisplay: signingBoxVisible, progress } = signingState;

  return (
    <>
      <div className={`mt-8 grid flex-grow gap-3 ${className || ""}`}>
        {isBrazilLanding && <AveniaFormStep isWalletAddressDisabled={isWalletAddressDisabled} />}
        {showWalletAddressField && <MoneriumFormStep />}
      </div>

      {signingBoxVisible && (
        <div className="mx-auto mt-6 max-w-[320px]">
          <SigningBoxContent progress={progress} />
        </div>
      )}
    </>
  );
};
