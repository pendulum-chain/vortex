import { InputTokenDetails } from '../../constants/tokenConfig';
import { useUSDCBalance } from '../../hooks/useUSDCBalance';

interface UserBalanceProps {
  token?: InputTokenDetails;
}

export const UserBalance = ({ token }: UserBalanceProps) => {
  const usdBalance = useUSDCBalance({ fromToken: token });

  if (!token) return <></>;

  return (
    <p className="mb-2">
      Available: <span className="bold">{usdBalance}</span> {token.assetSymbol}
    </p>
  );
};
