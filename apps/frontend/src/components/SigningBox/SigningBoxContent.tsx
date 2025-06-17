import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import accountBalanceWalletIcon from "../../assets/account-balance-wallet-blue.svg";
import { Spinner } from "../Spinner";

interface SigningBoxButtonProps {
  signatureState: { max: number; current: number };
  confirmations: { required: number; current: number };
}

export const SigningBoxButton = ({ signatureState, confirmations }: SigningBoxButtonProps) => {
  const { t } = useTranslation();

  return (
    <button className="btn-vortex-primary btn rounded-xl" disabled style={{ flex: "1 1 calc(50% - 0.75rem/2)" }}>
      <Spinner />
      <p className="my-2 ml-2.5 text-xs">
        {t("components.signingBox.waitingForSignature")} {signatureState.current}/{signatureState.max}
        {confirmations.required > 0
          ? `. (${t("components.signingBox.signatures")} ${confirmations.current}/${confirmations.required})`
          : ""}
      </p>
    </button>
  );
};
interface SigningBoxContentProps {
  progress: number;
  className?: string;
}

export const SigningBoxContent: React.FC<SigningBoxContentProps> = ({ progress, className = "" }) => {
  const { t } = useTranslation();

  return (
    <div className={className}>
      <main className="bg-white px-8">
        <motion.div className="flex items-center justify-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-primary">
            <img src={accountBalanceWalletIcon} alt="wallet account button" />
          </div>
          <div className="mx-4 my-5 text-black text-xs">
            <p>{t("components.signingBox.pleaseSignTransaction")}</p>
            <p>{t("components.signingBox.yourConnectedWallet")}</p>
          </div>
        </motion.div>

        <motion.div className="w-full pb-2.5">
          <div className="h-4 w-full overflow-hidden rounded-full border border-primary bg-white">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: "linear" }}
            />
          </div>
        </motion.div>
      </main>
    </div>
  );
};
