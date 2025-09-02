import { useTranslation } from "react-i18next";
import { useMoneriumKycActor } from "../../contexts/rampState";
import { cn } from "../../helpers/cn";

interface MoneriumRedirectComponentProps {
  className?: string;
}

export function MoneriumRedirectComponent({ className }: MoneriumRedirectComponentProps) {
  const { t } = useTranslation();
  const moneriumKycActor = useMoneriumKycActor();

  if (!moneriumKycActor) {
    return <div />;
  }

  return (
    <div className="flex grow-1 flex-col justify-center">
      <div className="flex-grow flex items-center justify-center text-center">
        <p>{t("components.moneriumRedirect.description")}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <button
          className={cn("btn-vortex-danger btn w-full rounded-xl", className)}
          onClick={() => moneriumKycActor.send({ type: "CANCEL" })}
        >
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
