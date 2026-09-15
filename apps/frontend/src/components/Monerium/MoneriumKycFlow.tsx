import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useMoneriumKycActor, useMoneriumKycSelector, useRampActor } from "../../contexts/rampState";
import { DoneScreen } from "../DoneScreen";
import { Spinner } from "../Spinner";

const LoadingPanel = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center gap-2 p-6">
    <p className="mb-12 text-center text-body">{message}</p>
    <Spinner size="lg" theme="dark" />
  </div>
);

interface ActionPanelProps {
  title: string;
  description: string;
  /** Plain link rendered above the buttons; a user gesture on it is never popup-blocked. */
  link?: { href: string; label: string };
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
}

const ActionPanel = ({ title, description, link, primaryLabel, onPrimary, secondaryLabel, onSecondary }: ActionPanelProps) => (
  <div className="flex flex-col items-center gap-4 p-6">
    <p className="text-center font-medium text-body">{title}</p>
    <p className="text-center text-sm">{description}</p>
    {link && (
      <a className="text-center text-sm underline" href={link.href} rel="noopener noreferrer" target="_blank">
        {link.label}
      </a>
    )}
    <button className="btn-vortex-primary btn w-full rounded-xl" onClick={onPrimary} type="button">
      {primaryLabel}
    </button>
    <button className="btn-vortex-secondary btn w-full rounded-xl" onClick={onSecondary} type="button">
      {secondaryLabel}
    </button>
  </div>
);

/** EUR verification through Monerium's hosted OAuth flow, driven by the shared Monerium machine. */
export const MoneriumKycFlow = () => {
  const { t } = useTranslation();
  const actor = useMoneriumKycActor();
  const rampActor = useRampActor();
  const state = useMoneriumKycSelector();

  const startOAuth = useCallback(() => actor?.send({ type: "START_OAUTH" }), [actor]);
  const refresh = useCallback(() => actor?.send({ type: "REFRESH" }), [actor]);
  const retry = useCallback(() => actor?.send({ type: "RETRY" }), [actor]);
  const close = useCallback(() => actor?.send({ type: "CLOSE" }), [actor]);
  const startOver = useCallback(() => rampActor.send({ type: "RESET_RAMP" }), [rampActor]);

  if (!actor || !state) return null;

  const { stateValue, context } = state;

  if (
    stateValue === "Routing" ||
    stateValue === "CheckingStatus" ||
    stateValue === "StartingAuthorization" ||
    stateValue === "CompletingAuthorization"
  ) {
    return <LoadingPanel message={t("components.moneriumKycFlow.checkingStatus")} />;
  }

  if (stateValue === "Ready") {
    // An approved profile whose backend OAuth session is gone lands here too; it needs a reconnect, not a first verification.
    const copy = context.rampError ? "reconnect" : "ready";
    return (
      <ActionPanel
        description={t(`components.moneriumKycFlow.${copy}.description`)}
        onPrimary={startOAuth}
        onSecondary={close}
        primaryLabel={t("components.moneriumKycFlow.ready.continue")}
        secondaryLabel={t("components.moneriumKycFlow.ready.cancel")}
        title={t(`components.moneriumKycFlow.${copy}.title`)}
      />
    );
  }

  if (stateValue === "Redirecting") {
    return (
      <ActionPanel
        description={t("components.moneriumKycFlow.redirecting.description")}
        link={
          context.authorizationUrl
            ? { href: context.authorizationUrl, label: t("components.moneriumKycFlow.redirecting.open") }
            : undefined
        }
        onPrimary={refresh}
        onSecondary={close}
        primaryLabel={t("components.moneriumKycFlow.redirecting.refresh")}
        secondaryLabel={t("components.moneriumKycFlow.redirecting.cancel")}
        title={t("components.moneriumKycFlow.redirecting.title")}
      />
    );
  }

  if (stateValue === "InReview") {
    return (
      <ActionPanel
        description={t("components.moneriumKycFlow.inReview.description")}
        onPrimary={refresh}
        onSecondary={close}
        primaryLabel={t("components.moneriumKycFlow.inReview.refresh")}
        secondaryLabel={t("components.moneriumKycFlow.inReview.later")}
        title={t("components.moneriumKycFlow.inReview.title")}
      />
    );
  }

  if (stateValue === "Approved" || stateValue === "Done") {
    return <DoneScreen kycOrKyb="KYC" onContinue={stateValue === "Approved" ? close : undefined} />;
  }

  if (stateValue === "Rejected" || stateValue === "Failure") {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <p className="text-center text-body text-red-800">
          {stateValue === "Rejected" ? t("components.moneriumKycFlow.rejected") : t("components.moneriumKycFlow.failure")}
        </p>
        {context.error?.message && <p className="text-sm">{context.error.message}</p>}
        <button className="btn-vortex-primary btn w-full rounded-xl" onClick={retry} type="button">
          {t("components.moneriumKycFlow.retry")}
        </button>
        <button className="btn-vortex-secondary btn w-full rounded-xl" onClick={startOver} type="button">
          {t("components.moneriumKycFlow.startOver")}
        </button>
      </div>
    );
  }

  return null;
};
