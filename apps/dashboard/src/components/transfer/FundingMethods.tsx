import { useAppKit, useAppKitAccount } from "@reown/appkit/react";
import type { QuoteResponse } from "@vortexfi/shared";
import { Check, Loader2, TriangleAlert, Wallet } from "lucide-react";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import type { RampTokenOption } from "@/domain/onramp";
import { shortenAddress } from "@/domain/transfer";
import { useTokenPortfolio } from "@/hooks/useTokenPortfolio";
import { CRYPTO_DISPLAY_DECIMALS, formatAmount, formatCurrencyAmount } from "@/lib/amount";
import { getTokenBalance, hasSufficientTokenBalance } from "@/services/balance.service";

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
  const { address } = useAccount();
  const { isConnected } = useAppKitAccount();
  const { open } = useAppKit();
  const portfolioQuery = useTokenPortfolio(address, token.network);
  const balance = portfolioQuery.data ? getTokenBalance(portfolioQuery.data, token.token) : undefined;
  const hasEnoughBalance = balance ? hasSufficientTokenBalance(balance, quote.inputAmount) : false;
  const checkingBalance = portfolioQuery.isPending || portfolioQuery.isFetching;

  if (!isConnected || !address) {
    return (
      <div className="grid gap-3">
        <div className="grid gap-3 rounded-lg border border-dashed p-4 text-center">
          <p className="text-muted-foreground text-sm">Connect your wallet.</p>
          <Button className="mx-auto" onClick={() => open({ view: "Connect" })} type="button">
            <Wallet className="size-4" />
            Connect wallet
          </Button>
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
                {formatAmount(balance.formatted, CRYPTO_DISPLAY_DECIMALS)} {token.label}
              </span>{" "}
              on {token.networkLabel}
            </p>
            {!hasEnoughBalance && (
              <p className="text-destructive" role="alert">
                Insufficient {token.label} balance. You need {formatCurrencyAmount(quote.inputAmount, token.label)}{" "}
                {token.label} on {token.networkLabel}.
              </p>
            )}
          </div>
        ) : null}
        <Button
          disabled={disabled || checkingBalance || !!portfolioQuery.error || !hasEnoughBalance}
          onClick={() => {
            if (hasEnoughBalance) {
              onSubmit({ destAddress: address, label: "Connected wallet", source: "wallet" });
            }
          }}
          type="button"
        >
          {submitting || checkingBalance ? <Loader2 className="size-4 animate-spin" /> : null}
          Send ≈ <span className="tabular-nums">{formatCurrencyAmount(quote.inputAmount, token.label)}</span> {token.label}
        </Button>
      </div>
    </div>
  );
}
