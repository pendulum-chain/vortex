import { useTranslation } from "react-i18next";
import { useMoneriumKycActor, useRampActor } from "../../../contexts/rampState";
import { cn } from "../../../helpers/cn";

interface MoneriumRedirectStepProps {
  className?: string;
}

export function MoneriumRedirectStep({ className }: MoneriumRedirectStepProps) {
  const { t } = useTranslation();
  const moneriumKycActor = useMoneriumKycActor();
  const rampActor = useRampActor();

  if (!moneriumKycActor) {
    return <div />;
  }

  const onCancelClick = () => {
    // Reset the ramp state and go back to the home page
    const cleanUrl = window.location.origin;
    window.history.replaceState({}, "", cleanUrl);

    rampActor.send({ type: "RESET_RAMP" });
  };

  return (
    <div className="flex grow-1 flex-col justify-center">
      <div className="flex flex-grow items-center justify-center text-center">
        <p>{t("components.moneriumRedirect.description")}</p>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-4">
        <button className={cn("btn-vortex-danger btn w-full rounded-xl", className)} onClick={onCancelClick}>
          {t("components.moneriumRedirect.cancel")}
        </button>
        <button
          className={cn("btn-vortex-primary btn w-full rounded-xl", className)}
          onClick={() => moneriumKycActor.send({ type: "RETRY_REDIRECT" })}
        >
          {t("components.moneriumRedirect.goToPartner")}
        </button>
      </div>
    </div>
  );
}
