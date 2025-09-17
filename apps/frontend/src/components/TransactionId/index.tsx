import { useTranslation } from "react-i18next";
import { CopyablePublicKey } from "../PublicKey/CopyablePublicKey";

interface TransactionIdProps {
  id: string;
  label?: string;
  variant?: "full" | "shorter";
  inline?: boolean;
  wrap?: boolean;
  className?: string;
}

export const TransactionId = ({
  id,
  label,
  variant = "shorter",
  inline = true,
  wrap = true,
  className = ""
}: TransactionIdProps) => {
  const { t } = useTranslation();
  const displayLabel = label || t("components.transactionId.label");

  return (
    <div className={className}>
      <div className="text-gray-500 text-sm">{displayLabel}</div>
      <CopyablePublicKey inline={inline} publicKey={id} variant={variant} wrap={wrap} />
    </div>
  );
};
