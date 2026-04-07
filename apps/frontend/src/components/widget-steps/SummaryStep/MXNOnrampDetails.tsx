import { useSelector } from "@xstate/react";
import { FC } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useRampActor } from "../../../contexts/rampState";
import { CopyButton } from "../../CopyButton";
import { InfoBox } from "../../InfoBox";

export const MXNOnrampDetails: FC = () => {
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

  const clabe = achPaymentData.clabe ? String(achPaymentData.clabe) : undefined;
  const reference = achPaymentData.reference ? String(achPaymentData.reference) : undefined;
  const bankName = achPaymentData.bankName ? String(achPaymentData.bankName) : undefined;
  const accountHolderName = achPaymentData.accountHolderName ? String(achPaymentData.accountHolderName) : undefined;
  const expirationDate = achPaymentData.expirationDate ? String(achPaymentData.expirationDate) : undefined;

  return (
    <>
      <hr className="my-5" />
      <h2 className="text-center font-bold text-lg">{t("components.SummaryPage.MXNOnrampDetails.title")}</h2>
      <p className="pt-2 text-center">{t("components.SummaryPage.MXNOnrampDetails.instruction")}</p>
      <div className="mt-4 mb-4 flex flex-col items-center rounded-lg bg-blue-50 p-4">
        <p className="text-center">
          <Trans key="components.SummaryPage.MXNOnrampDetails.qrCodeDescription">
            Once done, please click on <strong>"I have made the payment"</strong>
          </Trans>
        </p>
      </div>
      <div className="my-4 flex justify-center">
        <InfoBox>
          {clabe && <p className="font-mono font-semibold">{clabe}</p>}
          {bankName && <p>{bankName}</p>}
          {accountHolderName && <p>{accountHolderName}</p>}
          {reference && (
            <p>
              {t("components.SummaryPage.MXNOnrampDetails.reference")}: {reference}
            </p>
          )}
          {expirationDate && (
            <p>
              {t("components.SummaryPage.MXNOnrampDetails.expiresAt")}: {expirationDate}
            </p>
          )}
        </InfoBox>
      </div>
      {clabe && <CopyButton className="mt-2 mb-4 w-full py-10" text={clabe} />}
    </>
  );
};
