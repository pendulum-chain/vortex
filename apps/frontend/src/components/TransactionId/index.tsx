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
  label = "Transaction ID",
  variant = "shorter",
  inline = true,
  wrap = true,
  className = ""
}: TransactionIdProps) => {
  return (
    <div className={className}>
      <div className="text-gray-500 text-sm">{label}</div>
      <CopyablePublicKey inline={inline} publicKey={id} variant={variant} wrap={wrap} />
    </div>
  );
};
