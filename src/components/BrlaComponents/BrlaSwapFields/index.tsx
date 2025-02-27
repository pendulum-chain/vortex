import { FC } from 'react';
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
  { id: StandardBrlaFieldOptions.PIX_ID, label: 'PIX ID', index: 1 },
];

/**
 * BrlaStandardInputs component
 *
 * Renders PIX payment details form fields when Brazilian Real (BRL) is selected
 * as the destination currency in the Swap form. Collects necessary information
 * for processing PIX transfers to Brazilian bank accounts.
 */

export const BrlaSwapFields: FC<BrlaSwapFieldsProps> = ({ toToken }) => (
  <AnimatePresence>
    {toToken === OutputTokenTypes.BRL && (
      <motion.div {...containerAnimation}>
        <motion.h2
          className="mb-2 text-2xl font-bold text-center text-blue-700"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.4,
            delay: 0.1,
            type: 'spring',
            stiffness: 300,
            damping: 15,
          }}
        >
          PIX Details
        </motion.h2>
        <motion.p
          className="text-gray-400 mb-4"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.4,
            delay: 0.2,
            type: 'spring',
            stiffness: 300,
            damping: 15,
          }}
        >
          Which bank account should we send the funds to?
        </motion.p>
        {STANDARD_FIELDS.map((field) => (
          <BrlaField key={field.id} id={field.id} label={field.label} index={field.index} />
        ))}
      </motion.div>
    )}
  </AnimatePresence>
);
