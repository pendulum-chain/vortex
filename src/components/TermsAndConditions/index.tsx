import { AnimatePresence, motion } from 'framer-motion';
import { Checkbox, Link } from 'react-daisyui';

interface TermsAndConditionsProps {
  toggleTermsChecked: (accepted: boolean) => void;
  termsChecked: boolean;
  termsAccepted: boolean;
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

const TermsAndConditionsContent = ({ toggleTermsChecked, termsChecked }: TermsAndConditionsProps) => (
  <motion.div
    key="terms-conditions"
    initial={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={fadeOutAnimation}
  >
    <div className="mb-5 text-sm" />
    <div className="flex text-sm">
      <Checkbox checked={termsChecked} onClick={toggleTermsChecked} color="primary" size="sm" />
      <TermsText />
    </div>
  </motion.div>
);

const TermsText = () => (
  <span className="pl-2">
    I have read and accept the{' '}
    <Link
      href="https://www.vortexfinance.co/terms-conditions"
      color="accent"
      target="_blank"
      rel="noreferrer"
      style={{ textDecoration: 'underline' }}
    >
      Terms and Conditions
    </Link>
  </span>
);
