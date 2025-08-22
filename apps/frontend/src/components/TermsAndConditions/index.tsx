import { AnimatePresence, motion } from "motion/react";
import { Dispatch } from "react";
import { useTranslation } from "react-i18next";
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
  transition: { duration: 0.3 }
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

  return (
    <motion.span
      animate={{ scale: [1, 1.02, 1], transition: { duration: 0.2 } }}
      className={cn("pl-2", error && "text-red-600")}
    >
      {t("components.termsAndConditions.text")}{" "}
      <a
        className={cn("link link-accent transition-all duration-150", error && "font-bold text-red-600")}
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
