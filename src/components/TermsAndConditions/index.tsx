import { AnimatePresence, motion } from 'motion/react';
import { Dispatch } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '../../helpers/cn';

interface TermsAndConditionsProps {
  toggleTermsChecked: () => void;
  setTermsError: Dispatch<boolean>;
  termsChecked: boolean;
  termsAccepted: boolean;
  termsError: boolean;
}

const fadeOutAnimation = {
  scale: [1, 1.05, 0],
  opacity: [1, 1, 0],
  transition: { duration: 0.3 },
};

export const TermsAndConditions = (props: TermsAndConditionsProps) => {
  const { termsAccepted } = props;

  return <AnimatePresence mode="wait">{!termsAccepted && <TermsAndConditionsContent {...props} />}</AnimatePresence>;
};

const TermsAndConditionsContent = ({
  toggleTermsChecked,
  setTermsError,
  termsChecked,
  termsError,
}: TermsAndConditionsProps) => (
  <motion.div key="terms-conditions" exit={fadeOutAnimation}>
    <div className="mb-5 text-sm" />
    <div className="flex text-sm">
      <input
        type="checkbox"
        className="checkbox checkbox-primary checkbox-sm"
        checked={termsChecked}
        onChange={() => {
          toggleTermsChecked();
          setTermsError(false);
        }}
      />
      <TermsText error={termsError} />
    </div>
  </motion.div>
);

const TermsText = ({ error }: { error: boolean }) => {
  const { t } = useTranslation();

  return (
    <motion.span
      className={cn('pl-2', error && 'text-red-600')}
      animate={{ scale: [1, 1.02, 1], transition: { duration: 0.2 } }}
    >
      {t('components.termsAndConditions.text')}{' '}
      <a
        href="https://www.vortexfinance.co/terms-conditions"
        className={cn('link link-accent transition-all duration-300', error && 'text-red-600 font-bold')}
        target="_blank"
        rel="noreferrer"
        style={{ textDecoration: 'underline' }}
      >
        {t('components.termsAndConditions.link')}
      </a>
    </motion.span>
  );
};
