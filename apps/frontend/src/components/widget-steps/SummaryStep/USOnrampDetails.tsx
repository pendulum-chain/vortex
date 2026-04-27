import { roundDownToTwoDecimals } from "@vortexfi/shared";
import { useSelector } from "@xstate/react";
import Big from "big.js";
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
  if (!rampState?.ramp || !achPaymentData) return null;

  const fallbackValue = t("components.SummaryPage.USOnrampDetails.notAvailable", "Not available");

  const paymentAmount = roundDownToTwoDecimals(new Big(rampState.ramp.inputAmount));

  const paymentDescription =
    typeof achPaymentData?.paymentDescription === "string" ? achPaymentData.paymentDescription : undefined;
  const paymentReference = extractReferenceNumber(paymentDescription, fallbackValue);

  const bankDetails = [
    {
      copyable: true,
      id: "beneficiary-name",
      label: t("components.SummaryPage.USOnrampDetails.beneficiaryName", "Beneficiary Eame"),
      value: achPaymentData?.bankBeneficiaryName
    },
    {
      copyable: true,
      id: "routing-number",
      label: t("components.SummaryPage.USOnrampDetails.routingNumber", "Routing Number (ACH)"),
      value: achPaymentData?.bankRoutingNumber
    },
    {
      copyable: true,
      id: "account-number",
      label: t("components.SummaryPage.USOnrampDetails.accountNumber", "Bank Account Number"),
      value: achPaymentData?.bankAccountNumber
    },
    {
      copyable: true,
      id: "account-type",
      label: t("components.SummaryPage.USOnrampDetails.accountType", "Account Type"),
      value: "Checking"
    },
    {
      copyable: true,
      id: "amount",
      label: t("components.SummaryPage.USOnrampDetails.amount", "Amount"),
      value: paymentAmount
    },
    {
      copyable: true,
      id: "payment-reference",
      label: t("components.SummaryPage.USOnrampDetails.paymentReference", "Payment Reference"),
      value: paymentReference
    }
  ];

  return (
    <>
      <hr className="my-6" />
      <div className="space-y-3 text-center">
        <h2 className="font-bold text-lg">{t("components.SummaryPage.USOnrampDetails.title")}</h2>
        <p>
          {t("components.SummaryPage.USOnrampDetails.instruction", "Use these bank details to complete your ACH transfer.")}
        </p>
      </div>
      <div className="my-4 rounded-lg bg-blue-50 px-4 py-3">
        <div className="text-center">
          <Trans key="components.SummaryPage.USOnrampDetails.paymentDescription">Once done, please click on</Trans>
          <Trans>
            <p>
              <strong>"I have made the payment"</strong>
            </p>
          </Trans>
        </div>
      </div>

      <div className="mt-2">
        <InfoBox className="w-full min-w-0">
          {bankDetails.map(({ id, label, value, copyable }) => {
            const display = displayValue(value, fallbackValue);
            return (
              <div
                className="flex items-center justify-between space-y-1 border-gray-100 border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
                key={id}
              >
                <div>
                  <p className="text-gray-500 text-xs">{label}</p>
                  <p className="mt-0.5 min-w-0 flex-1 font-mono text-gray-600 text-sm [overflow-wrap:anywhere]">{display}</p>
                </div>
                {copyable && display !== fallbackValue && (
                  <CopyButton className="rounded-full p-2" hideText noBorder text={display} />
                )}
              </div>
            );
          })}
        </InfoBox>
      </div>
    </>
  );
};
