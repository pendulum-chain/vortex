import { OnChainTokenDetails } from "@vortexfi/shared";
import { useAccount } from "wagmi";

import wallet from "../../assets/wallet-bifold-outline.svg";
import { usePolkadotWalletState } from "../../contexts/polkadotWallet";
import { useOnchainTokenBalance } from "../../hooks/useOnchainTokenBalance";
import { useVortexAccount } from "../../hooks/useVortexAccount";

interface UserBalanceProps {
  token: OnChainTokenDetails;
  onClick?: (amount: string) => void;
  className?: string;
}

const SimpleBalance = ({ token, className }: { token: OnChainTokenDetails; className?: string }) => {
  const onchainTokenBalanceRaw = useOnchainTokenBalance({ token });
  const onchainTokenBalance = onchainTokenBalanceRaw?.balance || "0";

  return (
    <p className={className}>
      {onchainTokenBalance} {token.assetSymbol}
    </p>
  );
};

const FullBalance = ({ token, onClick }: { token: OnChainTokenDetails; onClick: (amount: string) => void }) => {
  const onchainTokenBalanceRaw = useOnchainTokenBalance({ token });
  const onchainTokenBalance = onchainTokenBalanceRaw?.balance || "0";

  const hasBalance = onchainTokenBalance !== undefined;

  if (!hasBalance) return null;
  return (
    <div className="mt-1 mr-0.5 flex items-center justify-end">
      <img alt="Available" className="mr-0.5 h-5 w-5" src={wallet} />
      <p>
        {onchainTokenBalance} {token.assetSymbol}
      </p>
      <button
        className="ml-1 cursor-pointer rounded-md bg-blue-100 px-1 text-primary hover:underline"
        onClick={() => onClick(onchainTokenBalance)}
        type="button"
      >
        Max
      </button>
    </div>
  );
};

export const UserBalance = ({ token, onClick, className }: UserBalanceProps) => {
  const { isDisconnected } = useVortexAccount();
  const { address: evmAddress } = useAccount();
  const { walletAccount: polkadotWalletAccount } = usePolkadotWalletState();
  const hasNoWallets = !evmAddress && !polkadotWalletAccount;

  if (isDisconnected || hasNoWallets) return null;
  return onClick ? <FullBalance onClick={onClick} token={token} /> : <SimpleBalance className={className} token={token} />;
};
