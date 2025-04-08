import { OnChainTokenDetails } from 'shared';
import { useOnchainTokenBalance } from '../../hooks/useOnchainTokenBalance';
import { useVortexAccount } from '../../hooks/useVortexAccount';
import wallet from '../../assets/wallet-bifold-outline.svg';

interface UserBalanceProps {
  token: OnChainTokenDetails;
  onClick: (amount: string) => void;
  className?: string;
}

const SimpleBalance = ({ token, className }: { token: OnChainTokenDetails; className?: string }) => {
  const onchainTokenBalanceRaw = useOnchainTokenBalance({ token });
  const onchainTokenBalance = onchainTokenBalanceRaw?.balance || '0';

  return (
    <p className={className}>
      {onchainTokenBalance} {token.assetSymbol}
    </p>
  );
};

const FullBalance = ({ token, onClick }: { token: OnChainTokenDetails; onClick: (amount: string) => void }) => {
  const onchainTokenBalanceRaw = useOnchainTokenBalance({ token });
  const onchainTokenBalance = onchainTokenBalanceRaw?.balance || '0';

  const hasBalance = onchainTokenBalance !== undefined && Number(onchainTokenBalance) !== 0;

  if (!hasBalance) return null;
  return (
    <div className="flex items-center justify-end mt-1 mr-0.5">
      <img src={wallet} alt="Available" className="w-5 h-5 mr-0.5" />
      <p>
        {onchainTokenBalance} {token.assetSymbol}
      </p>
      <button
        className="px-1 ml-1 bg-blue-100 rounded-md text-primary hover:underline"
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
  return onClick ? (
    <FullBalance token={token} onClick={onClick} />
  ) : (
    <SimpleBalance token={token} className={className} />
  );
};
