import BusinessCheck from "../../../assets/business-check-business.svg";
import { useAveniaKycActor, useAveniaKycSelector } from "../../../contexts/rampState";
import { AveniaKYBVerifyStep } from "./AveniaKYBVerifyStep";

export const AveniaKYBVerifyCompany = () => {
  const aveniaKycActor = useAveniaKycActor();
  const aveniaState = useAveniaKycSelector();

  if (!aveniaState || !aveniaKycActor) return null;

  const { kybUrls, companyVerificationStarted } = aveniaState.context;

  if (!kybUrls) return null;

  return (
    <AveniaKYBVerifyStep
      imageSrc={BusinessCheck}
      isVerificationStarted={companyVerificationStarted ?? false}
      onCancel={() => aveniaKycActor.send({ type: "CANCEL" })}
      onVerificationDone={() => aveniaKycActor.send({ type: "KYB_COMPANY_DONE" })}
      onVerificationStart={() => aveniaKycActor.send({ type: "COMPANY_VERIFICATION_STARTED" })}
      titleKey="components.aveniaKYB.title.company"
      verificationUrl={kybUrls.basicCompanyDataUrl}
      verifyButtonKey="components.aveniaKYB.verifyCompany"
    />
  );
};
