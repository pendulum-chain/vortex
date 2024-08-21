import { InputTokenDetails } from '../../constants/tokenConfig';
import { useInputTokenBalance } from '../../hooks/useInputTokenBalance';

interface UserBalanceProps {
  token: InputTokenDetails;
}

export const UserBalance = ({ token }: UserBalanceProps) => {
  const inputTokenBalance = useInputTokenBalance({ fromToken: token });

  return (
    <p className="mt-1 text-right">
      Available:{' '}
      {inputTokenBalance === undefined ? (
        'N/A'
      ) : (
        <>
          <span className="bold">{inputTokenBalance}</span> {token.assetSymbol}
        </>
      )}
    </p>
  );
};
