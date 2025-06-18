import { ExclamationCircleIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { Box } from "../../components/Box";
import { EmailForm } from "../../components/EmailForm";
import { TransactionInfo } from "../../components/TransactionInfo";
import { config } from "../../config";
import { useRampSubmission } from "../../hooks/ramp/useRampSubmission";
import { useRampState } from "../../stores/rampStore";

const ErrorIcon = () => (
  <div className="flex h-20 w-20 items-center justify-center rounded-full border border-orange-200 bg-orange-50">
    <ExclamationCircleIcon className="w-10 text-orange-500" />
  </div>
);

export const FailurePage = () => {
  const { t } = useTranslation();
  const { finishOfframping } = useRampSubmission();
  const rampState = useRampState();
  const transactionId = rampState?.ramp?.id || "N/A";

  return (
    <main>
      <Box className="mx-auto mt-12 flex max-w-2xl flex-col items-center justify-center">
        <ErrorIcon />
        <h1 className="mt-6 px-4 font-bold text-2xl text-gray-800 md:px-8">{t("pages.failure.title")}</h1>

        <div className="mt-6 mb-6 max-w-lg space-y-3 px-4 text-gray-600 md:px-8">
          <p className="leading-relaxed">{t("pages.failure.recoverable.description")}</p>
          <p className="leading-relaxed">{t("pages.failure.recoverable.cta")}</p>
        </div>

        <div className="mb-6 w-full max-w-md rounded-lg border border-blue-100 bg-blue-50 p-4">
          <div className="flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-700">Transaction ID:</span>
              <TransactionInfo transactionId={transactionId} />
            </div>

            <div className="flex flex-col space-y-2">
              <a
                href={config.supportUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full rounded-md bg-blue-600 px-4 py-2 text-center font-medium text-white transition-colors hover:bg-blue-700"
              >
                {t("pages.failure.contactSupport.url")}
              </a>

              <button
                className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-center font-medium text-gray-700 transition-colors hover:bg-gray-50"
                onClick={finishOfframping}
              >
                {t("pages.failure.resetAndRestart")}
              </button>
            </div>
          </div>
        </div>

        <EmailForm transactionId={transactionId} transactionSuccess={false} />
      </Box>
    </main>
  );
};
