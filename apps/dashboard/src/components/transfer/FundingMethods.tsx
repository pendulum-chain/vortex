import { ConnectKitButton } from "connectkit";
import { ArrowDownToLine, Check, Copy, Loader2, TriangleAlert, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { shortenAddress } from "@/domain/transfer";
import type { QuoteResponse } from "@/services/api/types";

export type FundingSource = "wallet" | "crypto";

export interface FundingSubmit {
  source: FundingSource;
  label: string;
  destAddress: string;
}

interface FundingMethodsProps {
  quote: QuoteResponse;
  network: string;
  networkLabel: string;
  submitting: boolean;
  onSubmit: (submit: FundingSubmit) => void;
}

/**
 * The ramp is signed by the connected wallet, so both funding paths resolve to that
 * address — "Connect wallet" signs in-app; "Send crypto" deposits to it manually.
 */
export function FundingMethods({ quote, networkLabel, submitting, onSubmit }: FundingMethodsProps) {
  const { address, isConnected } = useAccount();
  const usdcAmount = quote.inputAmount;

  return (
    <div className="grid gap-3">
      <span className="font-medium text-sm">How you'll fund this</span>
      <Tabs defaultValue="wallet">
        <TabsList className="w-full">
          <TabsTrigger className="flex-1" value="wallet">
            <Wallet className="size-4" />
            Connect wallet
          </TabsTrigger>
          <TabsTrigger className="flex-1" value="crypto">
            <ArrowDownToLine className="size-4" />
            Send crypto
          </TabsTrigger>
        </TabsList>

        <TabsContent value="wallet">
          <ConnectTab
            address={address}
            isConnected={isConnected}
            onSend={() => address && onSubmit({ destAddress: address, label: "Connected wallet", source: "wallet" })}
            submitting={submitting}
            usdcAmount={usdcAmount}
          />
        </TabsContent>

        <TabsContent value="crypto">
          <CryptoTab
            address={address}
            isConnected={isConnected}
            networkLabel={networkLabel}
            onConfirm={() => address && onSubmit({ destAddress: address, label: "Self-custodial deposit", source: "crypto" })}
            submitting={submitting}
            usdcAmount={usdcAmount}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ConnectTab({
  address,
  isConnected,
  usdcAmount,
  submitting,
  onSend
}: {
  address?: string;
  isConnected: boolean;
  usdcAmount: string;
  submitting: boolean;
  onSend: () => void;
}) {
  if (!isConnected || !address) {
    return (
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
    );
  }
  return (
    <div className="surface-raised grid gap-3 rounded-lg p-4">
      <div className="flex items-center gap-2 text-sm">
        <Check className="size-4 text-success" />
        <span className="text-muted-foreground">Connected</span>
        <code className="ml-auto font-mono text-xs">{shortenAddress(address)}</code>
      </div>
      <Button disabled={submitting} onClick={onSend} type="button">
        {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
        Send ≈ <span className="tabular-nums">{usdcAmount}</span> USDC
      </Button>
    </div>
  );
}

function AddressCard({ address, label, onCopy }: { address: string; label: string; onCopy: () => void }) {
  return (
    <div className="grid gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="flex items-center gap-2 rounded-md border bg-background p-2">
        <code className="flex-1 truncate font-mono text-xs">{address}</code>
        <Button onClick={onCopy} size="sm" type="button" variant="ghost">
          <Copy />
          Copy
        </Button>
      </div>
    </div>
  );
}

function CryptoTab({
  address,
  isConnected,
  networkLabel,
  usdcAmount,
  submitting,
  onConfirm
}: {
  address?: string;
  isConnected: boolean;
  networkLabel: string;
  usdcAmount: string;
  submitting: boolean;
  onConfirm: () => void;
}) {
  if (!isConnected || !address) {
    return (
      <div className="grid gap-3 rounded-lg border border-dashed p-4 text-center">
        <p className="text-muted-foreground text-sm">Connect your wallet to use it as the deposit destination.</p>
        <ConnectKitButton.Custom>
          {({ show }) => (
            <Button className="mx-auto" onClick={show} type="button" variant="outline">
              <Wallet className="size-4" />
              Connect wallet
            </Button>
          )}
        </ConnectKitButton.Custom>
      </div>
    );
  }
  return (
    <div className="surface-raised grid gap-3 rounded-lg p-4">
      <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
        <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">What to do</p>
        <p className="mt-1 text-pretty font-semibold text-lg leading-snug">
          Send ≈ <span className="tabular-nums">{usdcAmount}</span> USDC on {networkLabel} to your wallet.
        </p>
      </div>
      <AddressCard
        address={address}
        label={`Send on ${networkLabel} to`}
        onCopy={() => {
          navigator.clipboard?.writeText(address);
          toast.success("Address copied");
        }}
      />
      <p className="flex items-start gap-2 text-pretty text-muted-foreground text-xs">
        <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning-foreground" />
        Crypto transfers are irreversible. Confirm the network and address before sending.
      </p>
      <Button disabled={submitting} onClick={onConfirm} type="button">
        {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
        Confirm — I've sent it
      </Button>
    </div>
  );
}
