import { FiatToken, RampDirection } from "@packages/shared";
import { AnimatePresence, type MotionProps, motion } from "motion/react";
import type { FC } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useFiatToken } from "../../../stores/quote/useQuoteFormStore";
import { useRampDirection } from "../../../stores/rampDirectionStore";
import { BrlaField, StandardBrlaFieldOptions } from "../BrlaField";

const containerAnimation: MotionProps = {
  animate: { height: "auto", opacity: 1 },
  exit: { height: 0, opacity: 0 },
  initial: { height: 0, opacity: 0 },
  transition: { duration: 0.3 }
};

const OFFRAMP_FIELDS = [
  { id: StandardBrlaFieldOptions.TAX_ID, index: 0, label: "cpfOrCnpj" },
  { id: StandardBrlaFieldOptions.PIX_ID, index: 1, label: "pixKey" }
];

const ONRAMP_FIELDS = [
  { id: StandardBrlaFieldOptions.TAX_ID, index: 0, label: "cpfOrCnpj" },
  { id: StandardBrlaFieldOptions.WALLET_ADDRESS, index: 1, label: "walletAddress" }
];

/**
 * BrlaSwapFields component
 *
 * Renders PIX payment details form fields when Brazilian Real (BRL) is selected
 * as the destination currency in the Swap form. Collects necessary information
 * for processing PIX transfers to Brazilian bank accounts.
 */

export const BrlaSwapFields: FC = () => {
  const { t } = useTranslation();

  const rampDirection = useRampDirection();
  const isOnramp = rampDirection === RampDirection.BUY;

  const FIELDS = isOnramp ? ONRAMP_FIELDS : OFFRAMP_FIELDS;

  return (
    <AnimatePresence>
      <motion.div {...containerAnimation}>
        {FIELDS.map(field => (
          <BrlaField
            className="mt-2"
            id={field.id}
            index={field.index}
            key={field.id}
            label={t(`components.brlaSwapField.${field.label}`)}
            placeholder={t("components.brlaSwapField.placeholder", {
              label: t(`components.brlaSwapField.${field.label}`)
            })}
          />
        ))}
        <div className="mt-2">
          {isOnramp ? (
            <Trans i18nKey="components.brlaSwapField.disclaimerOnramp">
              CPF must belong to <b>you</b>.
            </Trans>
          ) : (
            <Trans i18nKey="components.brlaSwapField.disclaimerOfframp">
              CPF and Pix key need to belong to the <b>same person</b>.
            </Trans>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
