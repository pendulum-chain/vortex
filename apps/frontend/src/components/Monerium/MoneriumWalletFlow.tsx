import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useMoneriumWalletActor, useMoneriumWalletSelector } from "../../contexts/rampState";
import { Spinner } from "../Spinner";

const LoadingPanel = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center gap-2 p-6">
    <p className="mb-12 text-center text-body">{message}</p>
    <Spinner size="lg" theme="dark" />
  </div>
);

function shorten(address: string | undefined): string {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
}

/** Links the connected wallet to the approved Monerium profile and waits for its IBAN. */
export const MoneriumWalletFlow = () => {
  const { t } = useTranslation();
  const actor = useMoneriumWalletActor();
  const state = useMoneriumWalletSelector();

  const confirmMove = useCallback(() => actor?.send({ type: "CONFIRM_MOVE" }), [actor]);
  const retry = useCallback(() => actor?.send({ type: "RETRY" }), [actor]);
  const cancel = useCallback(() => actor?.send({ type: "CANCEL" }), [actor]);

  if (!actor || !state) return null;

  const { stateValue, context } = state;

  if (stateValue === "Guard" || stateValue === "Checking") {
    return <LoadingPanel message={t("components.moneriumWalletFlow.checking")} />;
  }
  if (stateValue === "Linking") {
    return <LoadingPanel message={t("components.moneriumWalletFlow.linking")} />;
  }
  if (stateValue === "Waiting") {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <p className="text-center text-body">{t("components.moneriumWalletFlow.waiting")}</p>
        <Spinner size="lg" theme="dark" />
        <button className="btn-vortex-secondary btn w-full rounded-xl" onClick={cancel} type="button">
          {t("components.moneriumWalletFlow.cancel")}
        </button>
      </div>
    );
  }
  if (stateValue === "Moving") {
    return <LoadingPanel message={t("components.moneriumWalletFlow.moving")} />;
  }

  if (stateValue === "NeedsMove") {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <p className="text-center font-medium text-body">{t("components.moneriumWalletFlow.needsMove.title")}</p>
        <p className="text-center text-sm">
          {t("components.moneriumWalletFlow.needsMove.description", { address: shorten(context.address) })}
        </p>
        <button className="btn-vortex-primary btn w-full rounded-xl" onClick={confirmMove} type="button">
          {t("components.moneriumWalletFlow.needsMove.confirm")}
        </button>
        <button className="btn-vortex-secondary btn w-full rounded-xl" onClick={cancel} type="button">
          {t("components.moneriumWalletFlow.needsMove.cancel")}
        </button>
      </div>
    );
  }

  if (stateValue === "Failure") {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <p className="text-center text-body text-red-800">{t("components.moneriumWalletFlow.failure")}</p>
        {context.error && <p className="text-sm">{context.error}</p>}
        <button className="btn-vortex-primary btn w-full rounded-xl" onClick={retry} type="button">
          {t("components.moneriumWalletFlow.retry")}
        </button>
        <button className="btn-vortex-secondary btn w-full rounded-xl" onClick={cancel} type="button">
          {t("components.moneriumWalletFlow.cancel")}
        </button>
      </div>
    );
  }

  return null;
};
