import { FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { AnimatePresence, motion, MotionProps } from 'motion/react';

import { OutputTokenType, OutputTokenTypes } from '../../../constants/tokenConfig';
import { BrlaField, StandardBrlaFieldOptions } from '../BrlaField';

interface BrlaSwapFieldsProps {
  toToken: OutputTokenType;
}

const containerAnimation: MotionProps = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.3 },
};

const STANDARD_FIELDS = [
  { id: StandardBrlaFieldOptions.TAX_ID, label: 'Tax ID', index: 0 },
  { id: StandardBrlaFieldOptions.PIX_ID, label: 'Pix Key', index: 1 },
];

/**
 * BrlaSwapFields component
 *
 * Renders PIX payment details form fields when Brazilian Real (BRL) is selected
 * as the destination currency in the Swap form. Collects necessary information
 * for processing PIX transfers to Brazilian bank accounts.
 */

export const BrlaSwapFields: FC<BrlaSwapFieldsProps> = ({ toToken }) => {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      {toToken === OutputTokenTypes.BRL && (
        <motion.div {...containerAnimation}>
          {STANDARD_FIELDS.map((field) => (
            <BrlaField
              className="mt-2"
              key={field.id}
              id={field.id}
              label={field.label}
              index={field.index}
              placeholder={t(`components.brlaSwapField.placeholder`, { label: field.label })}
            />
          ))}
          <div className="mt-2">
            <Trans i18nKey="components.brlaSwapField.disclaimer">
              Tax ID and Pix key need to belong to the <b>same person</b>.
            </Trans>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
