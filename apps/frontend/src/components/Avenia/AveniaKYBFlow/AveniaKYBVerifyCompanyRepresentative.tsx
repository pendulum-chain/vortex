import BusinessCheckRepresentative from "../../../assets/business-check-representative.svg";
import { useAveniaKycActor, useAveniaKycSelector } from "../../../contexts/rampState";
import { AveniaKYBVerifyStep } from "./AveniaKYBVerifyStep";

export const AveniaKYBVerifyCompanyRepresentative = () => {
  const aveniaKycActor = useAveniaKycActor();
  const aveniaState = useAveniaKycSelector();

  if (!aveniaState || !aveniaKycActor) return null;

  const { kybUrls, representativeVerificationStarted } = aveniaState.context;

  if (!kybUrls) return null;

  return (
    <AveniaKYBVerifyStep
      imageSrc={BusinessCheckRepresentative}
      instructionsKey="components.aveniaKYB.aveniaKYBVerifyCompanyRepresentative.instructions"
      isVerificationStarted={representativeVerificationStarted ?? false}
      onCancel={() => aveniaKycActor.send({ type: "KYB_COMPANY_BACK" })}
      onVerificationDone={() => aveniaKycActor.send({ type: "KYB_REPRESENTATIVE_DONE" })}
      onVerificationStart={() => aveniaKycActor.send({ type: "REPRESENTATIVE_VERIFICATION_STARTED" })}
      titleKey="components.aveniaKYB.title.representative"
      verificationUrl={kybUrls.authorizedRepresentativeUrl}
      verifyButtonKey="components.aveniaKYB.verifyCompanyRepresentative"
    />
  );
};
