import { InputTokenDetails } from '../../constants/tokenConfig';
import { useInputTokenBalance } from '../../hooks/useInputTokenBalance';

interface UserBalanceProps {
  token: InputTokenDetails;
  onClick: (amount: string) => void;
}

export const UserBalance = ({ token, onClick }: UserBalanceProps) => {
  const inputTokenBalance = useInputTokenBalance({ fromToken: token });

  if (inputTokenBalance === undefined) {
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
