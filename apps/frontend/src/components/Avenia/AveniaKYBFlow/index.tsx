import { useAveniaKycSelector } from "../../../contexts/rampState";
import { MenuButtons } from "../../MenuButtons";
import { AveniaKYBVerificationStatus } from "./AveniaKYBVerificationStatus";
import { AveniaKYBVerifyCompany } from "./AveniaKYBVerifyCompany";
import { AveniaKYBVerifyCompanyRepresentative } from "./AveniaKYBVerifyCompanyRepresentative";

export const AveniaKYBFlow = () => {
  const aveniaState = useAveniaKycSelector();

  if (!aveniaState) return null;

  let content;
  if (aveniaState.context.kybStep === "representative") {
    content = <AveniaKYBVerifyCompanyRepresentative />;
  } else if (aveniaState.context.kybStep === "verification") {
    content = <AveniaKYBVerificationStatus />;
  } else {
    content = <AveniaKYBVerifyCompany />;
  }

  return (
    <div className="relative">
      <MenuButtons />
      {content}
    </div>
  );
};
