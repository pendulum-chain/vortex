import { RampDirection } from "@packages/shared";
import { AnimatePresence, type MotionProps, motion } from "motion/react";
import type { FC } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useRampDirection } from "../../../stores/rampDirectionStore";
import { AveniaField, StandardAveniaFieldOptions } from "../AveniaField";

const containerAnimation: MotionProps = {
  animate: { height: "auto", opacity: 1 },
  exit: { height: 0, opacity: 0 },
  initial: { height: 0, opacity: 0 },
  transition: { duration: 0.3 }
};

const OFFRAMP_FIELDS = [
  { id: StandardAveniaFieldOptions.TAX_ID, index: 0, label: "cpfOrCnpj" },
  { id: StandardAveniaFieldOptions.PIX_ID, index: 1, label: "pixKey" }
];

const ONRAMP_FIELDS = [
  { id: StandardAveniaFieldOptions.TAX_ID, index: 0, label: "cpfOrCnpj" },
  { id: StandardAveniaFieldOptions.WALLET_ADDRESS, index: 1, label: "walletAddress" }
];

/**
 * AveniaKycEligibilityFields
 *
 * Renders PIX payment details form fields when Brazilian Real (BRL) is selected
 * as the destination currency in the Swap form. Collects necessary information
 * for processing PIX transfers to Brazilian bank accounts.
 */

export const AveniaKycEligibilityFields: FC<{ isWalletAddressDisabled?: boolean }> = ({ isWalletAddressDisabled }) => {
  const { t } = useTranslation();
  const rampDirection = useRampDirection();
  const isOnramp = rampDirection === RampDirection.BUY;

  const FIELDS = isOnramp ? ONRAMP_FIELDS : OFFRAMP_FIELDS;

  return (
    <AnimatePresence>
      <motion.div {...containerAnimation}>
        {FIELDS.map(field => (
          <AveniaField
            className="mt-2"
            disabled={field.id === StandardAveniaFieldOptions.WALLET_ADDRESS && isWalletAddressDisabled}
            id={field.id}
            index={field.index}
            key={field.id}
            label={t(`components.aveniaSwapField.${field.label}`)}
            placeholder={t("components.aveniaSwapField.placeholder", {
              label: t(`components.aveniaSwapField.${field.label}`)
            })}
          />
        ))}
        <div className="mt-2">
          {isOnramp ? (
            <Trans i18nKey="components.aveniaSwapField.disclaimerOnramp">
              CPF must belong to <b>you</b>.
            </Trans>
          ) : (
            <Trans i18nKey="components.aveniaSwapField.disclaimerOfframp">
              CPF and Pix key need to belong to the <b>same person</b>.
            </Trans>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
