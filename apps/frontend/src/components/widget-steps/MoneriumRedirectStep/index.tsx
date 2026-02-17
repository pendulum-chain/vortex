import { useParams, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useMoneriumKycActor, useRampActor } from "../../../contexts/rampState";
import { cn } from "../../../helpers/cn";
import { navigateToCleanOrigin } from "../../../lib/navigation";

interface MoneriumRedirectStepProps {
  className?: string;
}

export function MoneriumRedirectStep({ className }: MoneriumRedirectStepProps) {
  const { t } = useTranslation();
  const moneriumKycActor = useMoneriumKycActor();
  const rampActor = useRampActor();
  const router = useRouter();
  const params = useParams({ strict: false });

  if (!moneriumKycActor) {
    return <div />;
  }

  const onCancelClick = () => {
    navigateToCleanOrigin(router, params);
    rampActor.send({ type: "RESET_RAMP" });
  };

  return (
    <div className="relative flex grow-1 flex-col justify-center">
      <div className="flex flex-grow items-center justify-center pb-20 text-center">
        <p>{t("components.moneriumRedirect.description")}</p>
      </div>
      <div className="absolute right-0 bottom-2 left-0 z-[5] grid grid-cols-2 gap-4">
        <button className={cn("btn-vortex-secondary btn w-full rounded-xl", className)} onClick={onCancelClick}>
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
