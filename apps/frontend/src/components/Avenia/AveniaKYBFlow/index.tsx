import { useAveniaKycSelector } from "../../../contexts/rampState";
import { AveniaKYBVerificationStatus } from "./AveniaKYBVerificationStatus";
import { AveniaKYBVerifyCompany } from "./AveniaKYBVerifyCompany";
import { AveniaKYBVerifyCompanyRepresentative } from "./AveniaKYBVerifyCompanyRepresentative";

export const AveniaKYBFlow = () => {
  const aveniaState = useAveniaKycSelector();

  if (!aveniaState) return null;

  if (aveniaState.context.kybStep === "company") {
    return <AveniaKYBVerifyCompany />;
  } else if (aveniaState.context.kybStep === "representative") {
    return <AveniaKYBVerifyCompanyRepresentative />;
  } else if (aveniaState.context.kybStep === "verification") {
    return <AveniaKYBVerificationStatus />;
  }

  return <AveniaKYBVerifyCompany />;
};
