import { InputTokenDetails } from '../../constants/tokenConfig';
import { useInputTokenBalance } from '../../hooks/useInputTokenBalance';
import { useVortexAccount } from '../../hooks/useVortexAccount';
import wallet from '../../assets/wallet.svg';

interface UserBalanceProps {
  token: InputTokenDetails;
  onClick: (amount: string) => void;
}

export const UserBalance = ({ token, onClick }: UserBalanceProps) => {
  const { isDisconnected } = useVortexAccount();
  const inputTokenBalance = useInputTokenBalance({ fromToken: token });

  if (isDisconnected || inputTokenBalance === undefined) {
    return <></>;
  }

  return (
    <p className="flex items-end justify-end mt-1">
      <>
        <div
          className="flex align-center font-medium transition cursor-pointer hover:underline hover:text-black"
          onClick={() => onClick(inputTokenBalance)}
        >
          <img src={wallet} alt="Available" className="w-5 h-5 mr-1" />
          <span>
            {inputTokenBalance} {token.assetSymbol}
          </span>
        </div>
      </>
    </p>
  );
};
