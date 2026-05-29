import { useSelector } from "@xstate/react";
import { FC } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useRampActor } from "../../../contexts/rampState";
import { CopyButton } from "../../CopyButton";
import { InfoBox } from "../../InfoBox";

export const ARSOnrampDetails: FC = () => {
  const { t } = useTranslation();
  const rampActor = useRampActor();
  const { isQuoteExpired } = useSelector(rampActor, state => ({
    isQuoteExpired: state.context.isQuoteExpired
  }));
  const { rampState } = useSelector(rampActor, state => ({
    rampState: state.context.rampState
  }));

  const achPaymentData = rampState?.ramp?.achPaymentData;
  if (!achPaymentData) return null;
  if (isQuoteExpired) return null;

  const cvu = achPaymentData.cvu ? String(achPaymentData.cvu) : undefined;
  const alias = achPaymentData.alias ? String(achPaymentData.alias) : undefined;
  const reference = achPaymentData.reference ? String(achPaymentData.reference) : undefined;
  const expirationDate = achPaymentData.expirationDate ? String(achPaymentData.expirationDate) : undefined;

  return (
    <>
      <hr className="my-5" />
      <h2 className="text-center font-bold text-lg">{t("components.SummaryPage.ARSOnrampDetails.title")}</h2>
      <p className="pt-2 text-center">{t("components.SummaryPage.ARSOnrampDetails.instruction")}</p>
      <div className="mt-4 mb-4 flex flex-col items-center rounded-lg bg-blue-50 p-4">
        <p className="text-center">
          <Trans i18nKey="components.SummaryPage.ARSOnrampDetails.qrCodeDescription">
            Once done, please click on <strong>"I have made the payment"</strong>
          </Trans>
        </p>
      </div>
      <div className="my-4 flex justify-center">
        <InfoBox>
          {cvu && (
            <p className="font-mono font-semibold">
              {t("components.SummaryPage.ARSOnrampDetails.cvuLabel")}: {cvu}
            </p>
          )}
          {alias && (
            <p>
              {t("components.SummaryPage.ARSOnrampDetails.aliasLabel")}: {alias}
            </p>
          )}
          {reference && (
            <p>
              {t("components.SummaryPage.ARSOnrampDetails.reference")}: {reference}
            </p>
          )}
          {expirationDate && (
            <p>
              {t("components.SummaryPage.ARSOnrampDetails.expiresAt")}: {expirationDate}
            </p>
          )}
        </InfoBox>
      </div>
      <div className="mb-4 flex flex-col gap-3">
        {cvu && (
          <div className="flex items-center justify-between">
            <span className="text-gray-600 text-sm">{t("components.SummaryPage.ARSOnrampDetails.cvuLabel")}</span>
            <CopyButton className="py-10" hideText={false} iconPosition="right" text={cvu} />
          </div>
        )}
        {alias && (
          <div className="flex items-center justify-between">
            <span className="text-gray-600 text-sm">{t("components.SummaryPage.ARSOnrampDetails.aliasLabel")}</span>
            <CopyButton className="py-10" hideText={false} iconPosition="right" text={alias} />
          </div>
        )}
      </div>
    </>
  );
};
