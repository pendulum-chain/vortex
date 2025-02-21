import { AnimatePresence, motion } from 'motion/react';
import { Dispatch, SetStateAction } from 'react';

interface TermsAndConditionsProps {
  toggleTermsChecked: () => void;
  setTermsError: Dispatch<SetStateAction<boolean>>;
  setTermsAccepted: (accepted: boolean) => void;
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
  setTermsAccepted,
}: TermsAndConditionsProps) => (
  <motion.div key="terms-conditions" exit={fadeOutAnimation}>
    <div className="mb-5 text-sm" />
    <div className="flex text-sm">
      <input
        type="checkbox"
        className="checkbox checkbox-primary checkbox-sm"
        checked={termsChecked}
        onChange={() => {
          setTermsAccepted(true);
          toggleTermsChecked();
          setTermsError(false);
        }}
      />
      <TermsText error={termsError} />
    </div>
  </motion.div>
);

const TermsText = ({ error }: { error: boolean }) => (
  <motion.span
    className={`pl-2 ${error ? 'text-red-600' : ''}`}
    animate={{ scale: [1, 1.02, 1], transition: { duration: 0.2 } }}
  >
    I have read and accept the{' '}
    <a
      href="https://www.vortexfinance.co/terms-conditions"
      className={`link link-accent transition-all duration-300 ${error ? 'text-red-600 font-bold' : ''}`}
      target="_blank"
      rel="noreferrer"
      style={{ textDecoration: 'underline' }}
    >
      Terms and Conditions
    </a>
  </motion.span>
);
