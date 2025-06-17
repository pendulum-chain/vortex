import { OnChainTokenDetails } from "@packages/shared";
import wallet from "../../assets/wallet-bifold-outline.svg";
import { useOnchainTokenBalance } from "../../hooks/useOnchainTokenBalance";
import { useVortexAccount } from "../../hooks/useVortexAccount";

interface UserBalanceProps {
  token: OnChainTokenDetails;
  onClick?: (amount: string) => void;
  className?: string;
}

const SimpleBalance = ({
  token,
  className
}: {
  token: OnChainTokenDetails;
  className?: string;
}) => {
  const onchainTokenBalanceRaw = useOnchainTokenBalance({ token });
  const onchainTokenBalance = onchainTokenBalanceRaw?.balance || "0";

  return (
    <p className={className}>
      {onchainTokenBalance} {token.assetSymbol}
    </p>
  );
};

const FullBalance = ({
  token,
  onClick
}: {
  token: OnChainTokenDetails;
  onClick: (amount: string) => void;
}) => {
  const onchainTokenBalanceRaw = useOnchainTokenBalance({ token });
  const onchainTokenBalance = onchainTokenBalanceRaw?.balance || "0";

  const hasBalance = onchainTokenBalance !== undefined && Number(onchainTokenBalance) !== 0;

  if (!hasBalance) return null;
  return (
    <div className="mt-1 mr-0.5 flex items-center justify-end">
      <img src={wallet} alt="Available" className="mr-0.5 h-5 w-5" />
      <p>
        {onchainTokenBalance} {token.assetSymbol}
      </p>
      <button
        className="ml-1 rounded-md bg-blue-100 px-1 text-primary hover:underline"
        type="button"
        onClick={() => onClick(onchainTokenBalance)}
      >
        Max
      </button>
    </div>
  );
};

export const UserBalance = ({ token, onClick, className }: UserBalanceProps) => {
  const { isDisconnected } = useVortexAccount();

  if (isDisconnected) return null;
  return onClick ? <FullBalance token={token} onClick={onClick} /> : <SimpleBalance token={token} className={className} />;
};
