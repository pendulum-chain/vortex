import { InputTokenDetails } from '../../constants/tokenConfig';
import { getInputTokenBalance, useInputTokenBalance } from '../../hooks/useInputTokenBalance';
import { useVortexAccount } from '../../hooks/useVortexAccount';
import wallet from '../../assets/wallet-bifold-outline.svg';

interface UserBalanceProps {
  token: InputTokenDetails;
  onClick?: (amount: string) => void;
  showSymbol?: boolean;
  showMaxButton?: boolean;
  showWalletIcon?: boolean;
  className?: string;
}

const SimpleBalance = ({ token, className }: { token: InputTokenDetails; className?: string }) => {
  const balanceRaw = useInputTokenBalance({ fromToken: token });
  const balance = getInputTokenBalance(balanceRaw);

  return (
    <p className={className}>
      {balance} {token.assetSymbol}
    </p>
  );
};

const FullBalance = ({ token, onClick }: { token: InputTokenDetails; onClick: (amount: string) => void }) => {
  const balanceRaw = useInputTokenBalance({ fromToken: token });
  const balance = getInputTokenBalance(balanceRaw);

  const hasBalance = balance !== undefined && Number(balance) !== 0;

  if (!hasBalance) return null;
  return (
    <div className="flex items-center justify-end mt-1 mr-0.5">
      <img src={wallet} alt="Available" className="w-5 h-5 mr-0.5" />
      <p>
        {balance} {token.assetSymbol}
      </p>
      <button
        className="px-1 ml-1 bg-blue-100 rounded-md text-primary hover:underline"
        type="button"
        onClick={() => onClick(balance)}
      >
        Max
      </button>
    </div>
  );
};

export const UserBalance = ({ token, onClick, className }: UserBalanceProps) => {
  const { isDisconnected } = useVortexAccount();

  if (isDisconnected) return null;
  return onClick ? (
    <FullBalance token={token} onClick={onClick} />
  ) : (
    <SimpleBalance token={token} className={className} />
  );
};
