import type { QuoteResponse } from "@vortexfi/shared";
import { ConnectKitButton } from "connectkit";
import { Check, Wallet } from "lucide-react";
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
 *
 * Submitting is gated off for now: the button below is commented out and accounts are enabled
 * on request. `quote`, `submitting` and `onSubmit` stay on the props so restoring it is an
 * uncomment plus `const { quote, submitting, onSubmit } = _props`.
 */
export function FundingMethods(_props: FundingMethodsProps) {
  const { address, isConnected } = useAccount();

  if (!isConnected || !address) {
    return (
      <div className="grid gap-3">
        <span className="font-medium text-sm">How you'll fund this</span>
        <div className="grid gap-3 rounded-lg border border-dashed p-4 text-center">
          <p className="text-muted-foreground text-sm">Connect your wallet to send the payin directly.</p>
          <ConnectKitButton.Custom>
            {({ show }) => (
              <Button className="mx-auto" onClick={show} type="button">
                <Wallet className="size-4" />
                Connect wallet
              </Button>
            )}
          </ConnectKitButton.Custom>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <span className="font-medium text-sm">How you'll fund this</span>
      <div className="surface-raised grid gap-3 rounded-lg p-4">
        <div className="flex items-center gap-2 text-sm">
          <Check className="size-4 text-success" />
          <span className="text-muted-foreground">Connected</span>
          <code className="ml-auto font-mono text-xs">{shortenAddress(address)}</code>
        </div>
        {/*
        <Button disabled={submitting} onClick={() => onSubmit({ destAddress: address, label: "Connected wallet", source: "wallet" })} type="button">
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Send ≈ <span className="tabular-nums">{quote.inputAmount}</span> USDC
        </Button>
        */}
        <p className="text-pretty text-center text-muted-foreground text-sm">
          To enable this feature on your account, please reach out to{" "}
          <a className="underline" href="mailto:support@vortexfinance.co">
            support@vortexfinance.co
          </a>
        </p>
      </div>
    </div>
  );
}
