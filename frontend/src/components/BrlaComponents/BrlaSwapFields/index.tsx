import { FC } from 'react';
import { AnimatePresence, motion, MotionProps } from 'motion/react';
import { Trans, useTranslation } from 'react-i18next';

import { FiatToken } from 'shared';
import { BrlaField, StandardBrlaFieldOptions } from '../BrlaField';
import { useFiatToken } from '../../../stores/ramp/useRampFormStore';

const containerAnimation: MotionProps = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.3 },
};

const STANDARD_FIELDS = [{ id: StandardBrlaFieldOptions.TAX_ID, label: 'CPF', index: 0 }];

/**
 * BrlaSwapFields component
 *
 * Renders PIX payment details form fields when Brazilian Real (BRL) is selected
 * as the destination currency in the Swap form. Collects necessary information
 * for processing PIX transfers to Brazilian bank accounts.
 */

export const BrlaSwapFields: FC = () => {
  const { t } = useTranslation();

  const fiatToken = useFiatToken();

  return (
    <AnimatePresence>
      {fiatToken === FiatToken.BRL && (
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
              CPF must belong to <b>you</b>.
            </Trans>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
