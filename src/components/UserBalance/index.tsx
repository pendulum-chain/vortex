import { InputTokenDetails } from '../../constants/tokenConfig';
import { usePolkadotWalletState } from '../../contexts/polkadotWallet';
import { useInputTokenBalance } from '../../hooks/useInputTokenBalance';

interface UserBalanceProps {
  token: InputTokenDetails;
  onClick: (amount: string) => void;
}

export const UserBalance = ({ token, onClick }: UserBalanceProps) => {
  const { walletAccount } = usePolkadotWalletState();
  const inputTokenBalance = useInputTokenBalance({ fromToken: token });

  if (!walletAccount || inputTokenBalance === undefined) {
    return <></>;
  }

  return (
    <p className="flex items-end justify-end mt-1">
      <>
        <p className="mr-0.5">Available:</p>
        <div
          className="font-medium transition cursor-pointer hover:underline hover:text-black"
          onClick={() => onClick(inputTokenBalance)}
        >
          {inputTokenBalance} {token.assetSymbol}
        </div>
      </>
    </p>
  );
};
