import { OnChainTokenDetails } from 'shared';
import { useOnchainTokenBalance } from '../../hooks/useOnchainTokenBalance';
import { useVortexAccount } from '../../hooks/useVortexAccount';
import wallet from '../../assets/wallet-bifold-outline.svg';

interface UserBalanceProps {
  token: OnChainTokenDetails;
  onClick: (amount: string) => void;
}

export const UserBalance = ({ token, onClick }: UserBalanceProps) => {
  const { isDisconnected } = useVortexAccount();
  const onchainTokenBalance = useOnchainTokenBalance({ token });

  if (isDisconnected || onchainTokenBalance === undefined) {
    return <div className="h-6 mt-1" />;
  }

  const showMaxButton = Number(onchainTokenBalance) !== 0;

  return (
    <div className="flex items-center justify-end mt-1 mr-0.5">
      <img src={wallet} alt="Available" className="w-5 h-5 mr-0.5" />
      <p>
        {onchainTokenBalance.balance} {token.assetSymbol}
      </p>
      {showMaxButton && (
        <button
          className="px-1 ml-1 bg-blue-100 rounded-md text-primary hover:underline"
          type="button"
          onClick={() => onClick(onchainTokenBalance.balance)}
        >
          Max
        </button>
      )}
    </div>
  );
};
