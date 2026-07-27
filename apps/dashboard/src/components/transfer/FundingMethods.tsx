import type { QuoteResponse } from "@vortexfi/shared";
import { Check, KeyRound, Loader2, TriangleAlert, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RampTokenOption } from "@/domain/onramp";
import { shortenAddress } from "@/domain/transfer";
import { useTokenPortfolio } from "@/hooks/useTokenPortfolio";
import { getTokenBalance, hasSufficientTokenBalance } from "@/services/balance.service";
import { useWalletExperience } from "@/wallets/WalletExperienceContext";

export type FundingSource = "wallet";

export interface FundingSubmit {
  source: FundingSource;
  label: string;
  destAddress: string;
}

interface FundingMethodsProps {
  disabled: boolean;
  quote: QuoteResponse;
  token: RampTokenOption;
  submitting: boolean;
  onSubmit: (submit: FundingSubmit) => void;
}

/**
 * The ramp is signed by the connected wallet, which is the only funding path — self-custodial
 * crypto deposits are not supported.
 */
export function FundingMethods({ disabled, quote, submitting, token, onSubmit }: FundingMethodsProps) {
  const wallet = useWalletExperience();
  const address = wallet.address;
  const portfolioQuery = useTokenPortfolio(address, token.network);
  const balance = portfolioQuery.data ? getTokenBalance(portfolioQuery.data, token.token) : undefined;
  const hasEnoughBalance = balance ? hasSufficientTokenBalance(balance, quote.inputAmount) : false;
  const checkingBalance = portfolioQuery.isPending || portfolioQuery.isFetching;

  if (wallet.mode === "privy_embedded" && !wallet.canSignOfframp) {
    return (
      <div className="grid gap-3 rounded-lg border border-dashed p-4 text-center">
        <p className="text-muted-foreground text-sm">Embedded-wallet payouts are not enabled in this environment.</p>
        <Button onClick={() => void wallet.switchToExternalWallet()} type="button" variant="outline">
          <Wallet className="size-4" />
          Use an existing wallet
        </Button>
      </div>
    );
  }

  if (!wallet.connected || !address) {
    return (
      <div className="grid gap-3">
        <div className="grid gap-3 rounded-lg border border-dashed p-4 text-center">
          <p className="text-muted-foreground text-sm">Choose a wallet to authorize this payout.</p>
          <Button className="mx-auto" onClick={() => void wallet.connectExternalWallet()} type="button" variant="outline">
            <Wallet className="size-4" />
            Connect existing wallet
          </Button>
          {wallet.canUseEmbeddedWallet && (
            <Button className="mx-auto" onClick={() => void wallet.createEmbeddedWallet()} type="button">
              <KeyRound className="size-4" />
              Create embedded wallet
            </Button>
          )}
          {wallet.error && <p className="text-destructive text-xs">{wallet.error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="surface-raised grid gap-3 rounded-lg p-4">
        <div className="flex items-center gap-2 text-sm">
          <Check className="size-4 text-success" />
          <span className="text-muted-foreground">Connected</span>
          <code className="ml-auto font-mono text-xs">{shortenAddress(address)}</code>
        </div>
        {checkingBalance ? (
          <p className="text-muted-foreground text-sm">
            Checking {token.label} balance on {token.networkLabel}…
          </p>
        ) : portfolioQuery.error ? (
          <div className="flex items-start gap-2 text-destructive text-sm" role="alert">
            <TriangleAlert className="mt-px size-4 shrink-0" />
            <div className="grid gap-2">
              <p>
                Could not verify your {token.label} balance on {token.networkLabel}.
              </p>
              <Button className="w-fit" onClick={() => portfolioQuery.refetch()} size="sm" type="button" variant="outline">
                Retry balance check
              </Button>
            </div>
          </div>
        ) : balance ? (
          <div className="grid gap-1 text-sm">
            <p className="text-muted-foreground">
              Available:{" "}
              <span className="font-medium text-foreground tabular-nums">
                {balance.formatted} {token.label}
              </span>{" "}
              on {token.networkLabel}
            </p>
            {!hasEnoughBalance && (
              <p className="text-destructive" role="alert">
                Insufficient {token.label} balance. You need {quote.inputAmount} {token.label} on {token.networkLabel}.
              </p>
            )}
          </div>
        ) : null}
        <Button
          disabled={disabled || checkingBalance || !!portfolioQuery.error || !hasEnoughBalance}
          onClick={() => {
            if (hasEnoughBalance) {
              wallet.activateSigner();
              onSubmit({
                destAddress: address,
                label: wallet.mode === "privy_embedded" ? "Embedded wallet" : "Connected wallet",
                source: "wallet"
              });
            }
          }}
          type="button"
        >
          {submitting || checkingBalance ? <Loader2 className="size-4 animate-spin" /> : null}
          Send ≈ <span className="tabular-nums">{quote.inputAmount}</span> {token.label}
        </Button>
      </div>
    </div>
  );
}
