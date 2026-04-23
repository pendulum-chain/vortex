import { useSelector } from "@xstate/react";
import { FC } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useRampActor } from "../../../contexts/rampState";
import { CopyButton } from "../../CopyButton";
import { InfoBox } from "../../InfoBox";

// paymentDescription from Alfredpay is in the format "Deposit the payment with the following reference number: XXXXXXXXXXXXXXXX"
// and we want to show only the reference number in the transaction details
const MIN_REFERENCE_LENGTH = 8;
const extractReferenceNumber = (description: string | undefined, fallbackValue: string): string => {
  if (!description) return fallbackValue;
  const match = description.match(/:\s*([A-Z0-9]+)\s*$/i);
  const candidate = match?.[1]?.trim() ?? "";
  return candidate.length >= MIN_REFERENCE_LENGTH ? candidate : description;
};

const displayValue = (value: unknown, fallbackValue: string): string => {
  const trimmed = typeof value === "string" ? value.trim() : value ? String(value).trim() : "";
  return trimmed || fallbackValue;
};

export const USOnrampDetails: FC = () => {
  const { t } = useTranslation();
  const rampActor = useRampActor();
  const { isQuoteExpired, rampState } = useSelector(rampActor, state => state.context);

  const achPaymentData = rampState?.ramp?.achPaymentData;
  if (!achPaymentData || isQuoteExpired) return null;

  const fallbackValue = t("components.SummaryPage.USOnrampDetails.notAvailable", "Not available");

  const paymentDescription =
    typeof achPaymentData?.paymentDescription === "string" ? achPaymentData.paymentDescription : undefined;
  const paymentReference = extractReferenceNumber(paymentDescription, fallbackValue);

  const bankDetails = [
    {
      copyable: true,
      id: "account-number",
      label: t("components.SummaryPage.USOnrampDetails.accountNumber", "Account number"),
      value: achPaymentData?.bankAccountNumber
    },
    {
      copyable: true,
      id: "routing-number",
      label: t("components.SummaryPage.USOnrampDetails.routingNumber", "Routing number (ACH)"),
      value: achPaymentData?.bankRoutingNumber
    },
    {
      copyable: true,
      id: "beneficiary-name",
      label: t("components.SummaryPage.USOnrampDetails.beneficiaryName", "Beneficiary name"),
      value: achPaymentData?.bankBeneficiaryName
    },
    {
      copyable: true,
      id: "beneficiary-address",
      label: t("components.SummaryPage.USOnrampDetails.beneficiaryAddress", "Beneficiary address"),
      value: achPaymentData?.bankBeneficiaryAddress
    },
    {
      copyable: true,
      id: "payment-reference",
      label: t("components.SummaryPage.USOnrampDetails.paymentReference", "Payment reference"),
      value: paymentReference
    }
  ];

  return (
    <>
      <hr className="my-6" />
      <div className="space-y-3 text-center">
        <h2 className="text-lg font-bold">{t("components.SummaryPage.USOnrampDetails.title")}</h2>
        <p>
          {t("components.SummaryPage.USOnrampDetails.instruction", "Use these bank details to complete your ACH transfer.")}
        </p>
      </div>
      <div className="my-4 rounded-lg bg-blue-50 px-4 py-3">
        <p className="text-center">
          <Trans key="components.SummaryPage.USOnrampDetails.paymentDescription">Once done, please click on</Trans>
          <Trans>
            <p>
              <strong>"I have made the payment"</strong>
            </p>
          </Trans>
        </p>
      </div>

      <div className="mt-2 pb-24">
        <InfoBox className="w-full min-w-0">
          {bankDetails.map(({ id, label, value, copyable }) => {
            const display = displayValue(value, fallbackValue);
            return (
              <div
                className="space-y-1 border-b border-gray-100 py-3 last:border-b-0 last:pb-0 first:pt-0 flex items-center justify-between"
                key={id}
              >
                <div>
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="min-w-0 mt-0.5 flex-1 font-mono text-sm text-gray-600 [overflow-wrap:anywhere]">{display}</p>
                </div>
                {copyable && display !== fallbackValue && (
                  <CopyButton className="p-2 rounded-full" hideText noBorder text={display} />
                )}
              </div>
            );
          })}
        </InfoBox>
      </div>
    </>
  );
};
