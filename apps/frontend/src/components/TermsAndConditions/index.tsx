import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Dispatch } from "react";
import { useTranslation } from "react-i18next";
import { durations, easings } from "../../constants/animations";
import { cn } from "../../helpers/cn";

interface TermsAndConditionsProps {
  toggleTermsChecked: () => void;
  setTermsError: Dispatch<boolean>;
  termsChecked: boolean;
  termsAccepted: boolean;
  termsError: boolean;
}

const fadeOutAnimation = {
  opacity: [1, 1, 0],
  scale: [1, 1.05, 0],
  transition: { duration: durations.slow, ease: easings.easeOutCubic }
};

export const TermsAndConditions = (props: TermsAndConditionsProps) => {
  const { termsAccepted } = props;

  return <AnimatePresence mode="wait">{!termsAccepted && <TermsAndConditionsContent {...props} />}</AnimatePresence>;
};

const TermsAndConditionsContent = ({
  toggleTermsChecked,
  setTermsError,
  termsChecked,
  termsError
}: TermsAndConditionsProps) => (
  <motion.div exit={fadeOutAnimation} key="terms-conditions">
    <div className="mb-5 text-sm" />
    <div className="flex text-sm">
      <input
        checked={termsChecked}
        className="checkbox checkbox-primary checkbox-sm"
        onChange={() => {
          toggleTermsChecked();
          setTermsError(false);
        }}
        type="checkbox"
      />
      <TermsText error={termsError} />
    </div>
  </motion.div>
);

const TermsText = ({ error }: { error: boolean }) => {
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.span
      animate={shouldReduceMotion ? {} : { scale: [1, 1.02, 1], transition: { duration: durations.normal } }}
      className={cn("pl-2", error && "text-red-800")}
    >
      {t("components.termsAndConditions.text")}{" "}
      <a
        className={cn(
          "link link-accent transition-colors duration-150 motion-reduce:transition-none",
          error && "font-bold text-red-800"
        )}
        href="https://www.vortexfinance.co/terms-conditions"
        rel="noreferrer"
        style={{ textDecoration: "underline" }}
        target="_blank"
      >
        {t("components.termsAndConditions.link")}
      </a>
    </motion.span>
  );
};
