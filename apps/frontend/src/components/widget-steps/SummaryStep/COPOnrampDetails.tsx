import { useSelector } from "@xstate/react";
import { FC } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useRampActor } from "../../../contexts/rampState";
import { CopyButton } from "../../CopyButton";
import { InfoBox } from "../../InfoBox";

export const COPOnrampDetails: FC = () => {
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

  const accountNumber = achPaymentData.accountNumber ? String(achPaymentData.accountNumber) : undefined;
  const bankName = achPaymentData.bankName ? String(achPaymentData.bankName) : undefined;
  const accountHolderName = achPaymentData.accountHolderName ? String(achPaymentData.accountHolderName) : undefined;
  const reference = achPaymentData.reference ? String(achPaymentData.reference) : undefined;
  const expirationDate = achPaymentData.expirationDate ? String(achPaymentData.expirationDate) : undefined;

  return (
    <>
      <hr className="my-5" />
      <h2 className="text-center font-bold text-lg">{t("components.SummaryPage.COPOnrampDetails.title")}</h2>
      <p className="pt-2 text-center">{t("components.SummaryPage.COPOnrampDetails.instruction")}</p>
      <div className="mt-4 mb-4 flex flex-col items-center rounded-lg bg-blue-50 p-4">
        <p className="text-center">
          <Trans key="components.SummaryPage.COPOnrampDetails.qrCodeDescription">
            Once done, please click on <strong>"I have made the payment"</strong>
          </Trans>
        </p>
      </div>
      <div className="my-4 flex justify-center">
        <InfoBox>
          {accountNumber && <p className="font-mono font-semibold">{accountNumber}</p>}
          {bankName && <p>{bankName}</p>}
          {accountHolderName && <p>{accountHolderName}</p>}
          {reference && (
            <p>
              {t("components.SummaryPage.COPOnrampDetails.reference")}: {reference}
            </p>
          )}
          {expirationDate && (
            <p>
              {t("components.SummaryPage.COPOnrampDetails.expiresAt")}: {expirationDate}
            </p>
          )}
        </InfoBox>
      </div>
      {accountNumber && <CopyButton className="mt-2 mb-4 w-full py-10" text={accountNumber} />}
    </>
  );
};
