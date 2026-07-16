import { zodResolver } from "@hookform/resolvers/zod";
import {
  type KybQuestionnaireData,
  type KybQuestionnaireValues,
  kybQuestionnaireSchema,
  mapKybQuestionnaireValues
} from "@vortexfi/kyc";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { MenuButtons } from "../MenuButtons";

interface KybQuestionnaireScreenProps {
  /** Answers already given, so stepping back from the documents does not blank the form. */
  defaults?: KybQuestionnaireData;
  onBack: () => void;
  onSubmit: (data: KybQuestionnaireData) => void;
}

/**
 * Alfredpay's compliance questionnaire. Every question is one Alfredpay requires before it accepts
 * the submission (GET …/penny/kybRequirements?country=). The conditionals mirror its `requiredIf`,
 * and declaring regulated activities adds two documents to the upload step.
 */
export function KybQuestionnaireScreen({ defaults, onBack, onSubmit }: KybQuestionnaireScreenProps) {
  const { t } = useTranslation();

  const {
    formState: { errors },
    handleSubmit,
    register,
    watch
  } = useForm<KybQuestionnaireValues>({
    defaultValues: {
      ...defaults,
      conductsComplianceScreening: defaults?.conductsComplianceScreening ?? false,
      isRegulatedBusiness: defaults?.isRegulatedBusiness ?? false,
      operatesInSanctionedCountries: defaults?.operatesInSanctionedCountries ?? false,
      transmitsCustomerFunds: defaults?.transmitsCustomerFunds ?? false
    },
    resolver: zodResolver(kybQuestionnaireSchema)
  });

  const transmitsCustomerFunds = watch("transmitsCustomerFunds");
  const conductsComplianceScreening = watch("conductsComplianceScreening");

  const inputClass = (hasError: boolean) =>
    `input-vortex-primary input-ghost w-full rounded-lg border p-2 text-base ${hasError ? "border-error" : "border-neutral-300"}`;

  return (
    <div className="flex grow-1 flex-col">
      <MenuButtons />
      <h1 className="mt-4 mb-2 text-center font-bold text-2xl text-primary">{t("components.kybQuestionnaire.title")}</h1>
      <p className="mb-4 text-center text-gray-500 text-sm">{t("components.kybQuestionnaire.subtitle")}</p>

      <form
        className="flex grow-1 flex-col space-y-3 overflow-y-auto px-1 pb-4"
        onSubmit={handleSubmit(fields => onSubmit(mapKybQuestionnaireValues(fields)))}
      >
        <div>
          <label className="mb-1 block text-sm" htmlFor="kyb-sourceOfFunds">
            {t("components.kybQuestionnaire.sourceOfFunds")}
          </label>
          <p className="mb-1 text-gray-400 text-xs">{t("components.kybQuestionnaire.sourceOfFundsHint")}</p>
          <input
            className={inputClass(!!errors.sourceOfFunds)}
            id="kyb-sourceOfFunds"
            type="text"
            {...register("sourceOfFunds")}
          />
          {errors.sourceOfFunds && <span className="mt-1 block text-error text-xs">{errors.sourceOfFunds.message}</span>}
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="kyb-businessActivities">
            {t("components.kybQuestionnaire.businessActivities")}
          </label>
          <input
            className={inputClass(!!errors.businessActivities)}
            id="kyb-businessActivities"
            type="text"
            {...register("businessActivities")}
          />
          {errors.businessActivities && (
            <span className="mt-1 block text-error text-xs">{errors.businessActivities.message}</span>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="kyb-accountPurpose">
            {t("components.kybQuestionnaire.accountPurpose")}
          </label>
          <input
            className={inputClass(!!errors.accountPurpose)}
            id="kyb-accountPurpose"
            type="text"
            {...register("accountPurpose")}
          />
          {errors.accountPurpose && <span className="mt-1 block text-error text-xs">{errors.accountPurpose.message}</span>}
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="kyb-walletAddresses">
            {t("components.kybQuestionnaire.walletAddresses")}
          </label>
          <p className="mb-1 text-gray-400 text-xs">{t("components.kybQuestionnaire.walletAddressesHint")}</p>
          <input
            className={inputClass(!!errors.walletAddresses)}
            id="kyb-walletAddresses"
            type="text"
            {...register("walletAddresses")}
          />
          {errors.walletAddresses && <span className="mt-1 block text-error text-xs">{errors.walletAddresses.message}</span>}
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="kyb-expectedMonthlyVolumeUsd">
            {t("components.kybQuestionnaire.expectedMonthlyVolumeUsd")}
          </label>
          <input
            className={inputClass(!!errors.expectedMonthlyVolumeUsd)}
            id="kyb-expectedMonthlyVolumeUsd"
            min={0}
            type="number"
            {...register("expectedMonthlyVolumeUsd", { valueAsNumber: true })}
          />
          {errors.expectedMonthlyVolumeUsd && (
            <span className="mt-1 block text-error text-xs">{errors.expectedMonthlyVolumeUsd.message}</span>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm" htmlFor="kyb-expectedMonthlyTransactions">
            {t("components.kybQuestionnaire.expectedMonthlyTransactions")}
          </label>
          <input
            className={inputClass(!!errors.expectedMonthlyTransactions)}
            id="kyb-expectedMonthlyTransactions"
            min={0}
            type="number"
            {...register("expectedMonthlyTransactions", { valueAsNumber: true })}
          />
          {errors.expectedMonthlyTransactions && (
            <span className="mt-1 block text-error text-xs">{errors.expectedMonthlyTransactions.message}</span>
          )}
        </div>

        <h2 className="pt-2 font-bold text-primary">{t("components.kybQuestionnaire.declarationsTitle")}</h2>
        <p className="text-gray-500 text-xs">{t("components.kybQuestionnaire.declarationsSubtitle")}</p>

        <label className="flex items-start gap-2 text-sm" htmlFor="kyb-transmitsCustomerFunds">
          <input
            className="checkbox mt-0.5"
            id="kyb-transmitsCustomerFunds"
            type="checkbox"
            {...register("transmitsCustomerFunds")}
          />
          <span>{t("components.kybQuestionnaire.transmitsCustomerFunds")}</span>
        </label>

        {transmitsCustomerFunds && (
          <label className="flex items-start gap-2 text-sm" htmlFor="kyb-conductsComplianceScreening">
            <input
              className="checkbox mt-0.5"
              id="kyb-conductsComplianceScreening"
              type="checkbox"
              {...register("conductsComplianceScreening")}
            />
            <span>{t("components.kybQuestionnaire.conductsComplianceScreening")}</span>
          </label>
        )}

        {transmitsCustomerFunds && conductsComplianceScreening && (
          <div>
            <label className="mb-1 block text-sm" htmlFor="kyb-complianceScreeningDescription">
              {t("components.kybQuestionnaire.complianceScreeningDescription")}
            </label>
            <input
              className={inputClass(!!errors.complianceScreeningDescription)}
              id="kyb-complianceScreeningDescription"
              type="text"
              {...register("complianceScreeningDescription")}
            />
            {errors.complianceScreeningDescription && (
              <span className="mt-1 block text-error text-xs">{errors.complianceScreeningDescription.message}</span>
            )}
          </div>
        )}

        <label className="flex items-start gap-2 text-sm" htmlFor="kyb-operatesInSanctionedCountries">
          <input
            className="checkbox mt-0.5"
            id="kyb-operatesInSanctionedCountries"
            type="checkbox"
            {...register("operatesInSanctionedCountries")}
          />
          <span>{t("components.kybQuestionnaire.operatesInSanctionedCountries")}</span>
        </label>

        <label className="flex items-start gap-2 text-sm" htmlFor="kyb-isRegulatedBusiness">
          <input
            className="checkbox mt-0.5"
            id="kyb-isRegulatedBusiness"
            type="checkbox"
            {...register("isRegulatedBusiness")}
          />
          <span>
            {t("components.kybQuestionnaire.isRegulatedBusiness")}
            <span className="block text-gray-400 text-xs">{t("components.kybQuestionnaire.isRegulatedBusinessHint")}</span>
          </span>
        </label>

        <button className="btn btn-vortex-primary w-full" type="submit">
          {t("components.kybQuestionnaire.submit")}
        </button>
        <button className="btn btn-vortex-accent w-full" onClick={onBack} type="button">
          {t("components.alfredpayKycFlow.cancel")}
        </button>
      </form>
    </div>
  );
}
