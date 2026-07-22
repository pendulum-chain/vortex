import { useAppKit, useAppKitAccount } from "@reown/appkit/react";
import type { QuoteResponse } from "@vortexfi/shared";
import { Check, Loader2, Wallet } from "lucide-react";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { shortenAddress } from "@/domain/transfer";

export type FundingSource = "wallet";

export interface FundingSubmit {
  source: FundingSource;
  label: string;
  destAddress: string;
}

interface FundingMethodsProps {
  quote: QuoteResponse;
  network: string;
  submitting: boolean;
  onSubmit: (submit: FundingSubmit) => void;
}

/**
 * The ramp is signed by the connected wallet, which is the only funding path — self-custodial
 * crypto deposits are not supported.
 */
export function FundingMethods({ quote, submitting, onSubmit }: FundingMethodsProps) {
  const { address } = useAccount();
  const { isConnected } = useAppKitAccount();
  const { open } = useAppKit();

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
        <Button
          disabled={submitting}
          onClick={() => onSubmit({ destAddress: address, label: "Connected wallet", source: "wallet" })}
          type="button"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Send ≈ <span className="tabular-nums">{quote.inputAmount}</span> USDC
        </Button>
      </div>
    </div>
  );
}
