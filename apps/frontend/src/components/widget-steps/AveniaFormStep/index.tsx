import { cn } from "../../../helpers/cn";
import { AveniaKycEligibilityFields } from "../../Avenia/AveniaKycEligibilityFields";

export interface BrazilDetailsFormProps {
  className?: string;
  isWalletAddressDisabled?: boolean;
}

export const AveniaFormStep = ({ className, isWalletAddressDisabled }: BrazilDetailsFormProps) => (
  <div className={cn("mx-auto flex h-full w-full flex-col justify-center", className)}>
    <AveniaKycEligibilityFields isWalletAddressDisabled={isWalletAddressDisabled} />
  </div>
);
