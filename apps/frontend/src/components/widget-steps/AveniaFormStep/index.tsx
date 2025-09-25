import { cn } from "../../../helpers/cn";
import { AveniaKycEligibilityFields } from "../../BrlaComponents/AveniaKycEligibilityFields";

export interface BrazilDetailsFormProps {
  className?: string;
}

export const AveniaFormStep = ({ className }: BrazilDetailsFormProps) => (
  <div className={cn("mx-auto flex h-full w-full flex-col justify-center", className)}>
    <AveniaKycEligibilityFields />
  </div>
);
