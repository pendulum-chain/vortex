import { ConnectKitButton } from "connectkit";
import { ArrowDownToLine, Check, Copy, Loader2, TriangleAlert, Wallet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mockPayinAddress, shortenAddress } from "@/domain/transfer";
import type { Recipient } from "@/domain/types";
import { cn } from "@/lib/cn";
import type { QuoteResponse } from "@/services/api/types";

export type FundingSource = "wallet" | "crypto";
type WalletDestination = "embedded" | "self";

export interface FundingSubmit {
  source: FundingSource;
  label: string;
  destAddress: string;
}

interface FundingMethodsProps {
  quote: QuoteResponse;
  recipient: Recipient;
  network: string;
  networkLabel: string;
  submitting: boolean;
  onSubmit: (submit: FundingSubmit) => void;
}

export function FundingMethods({ quote, recipient, network, networkLabel, submitting, onSubmit }: FundingMethodsProps) {
  const { address, isConnected } = useAccount();

  const embeddedAddress = mockPayinAddress(`${recipient.id}-${network}-embedded`);
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
            connectedAddress={address}
            embeddedAddress={embeddedAddress}
            isConnected={isConnected}
            networkLabel={networkLabel}
            onConfirm={destAddress =>
              onSubmit({
                destAddress,
                label: destAddress === embeddedAddress ? "Embedded wallet deposit" : "Self-custodial deposit",
                source: "crypto"
              })
            }
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

function DestinationToggle({ value, onChange }: { value: WalletDestination; onChange: (value: WalletDestination) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["embedded", "self"] as const).map(option => (
        <button
          className={cn(
            "rounded-md border p-2 text-left text-sm transition-colors",
            value === option ? "border-primary bg-primary/5" : "hover:bg-muted/50"
          )}
          key={option}
          onClick={() => onChange(option)}
          type="button"
        >
          <span className="font-medium">{option === "embedded" ? "Embedded wallet" : "Self-custodial"}</span>
          <span className="block text-muted-foreground text-xs">
            {option === "embedded" ? "Vortex-secured (Privy)" : "Your own wallet"}
          </span>
        </button>
      ))}
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
  embeddedAddress,
  connectedAddress,
  isConnected,
  networkLabel,
  usdcAmount,
  submitting,
  onConfirm
}: {
  embeddedAddress: string;
  connectedAddress?: string;
  isConnected: boolean;
  networkLabel: string;
  usdcAmount: string;
  submitting: boolean;
  onConfirm: (destAddress: string) => void;
}) {
  return (
    <TabWithDestination
      connectedAddress={connectedAddress}
      embeddedAddress={embeddedAddress}
      isConnected={isConnected}
      onConfirm={onConfirm}
      submitting={submitting}
    >
      {(destination, destAddress) => (
        <>
          <div className="rounded-md border border-primary/30 bg-primary/5 p-4">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">What to do</p>
            <p className="mt-1 text-pretty font-semibold text-lg leading-snug">
              Send ≈ <span className="tabular-nums">{usdcAmount}</span> USDC on {networkLabel} to your{" "}
              {destination === "embedded" ? "embedded" : "self-custodial"} wallet.
            </p>
          </div>
          <AddressCard
            address={destAddress}
            label={`Send on ${networkLabel} to`}
            onCopy={() => {
              navigator.clipboard?.writeText(destAddress);
              toast.success("Address copied");
            }}
          />
          <p className="flex items-start gap-2 text-pretty text-muted-foreground text-xs">
            <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning-foreground" />
            Crypto transfers are irreversible. Confirm the network and address before sending.
          </p>
        </>
      )}
    </TabWithDestination>
  );
}

/** Shared shell for the crypto tab: destination toggle → content → confirm (with connect gate). */
function TabWithDestination({
  embeddedAddress,
  connectedAddress,
  isConnected,
  submitting,
  confirmLabel = "Confirm — I've sent it",
  onConfirm,
  children
}: {
  embeddedAddress: string;
  connectedAddress?: string;
  isConnected: boolean;
  submitting: boolean;
  confirmLabel?: string;
  onConfirm: (destAddress: string) => void;
  children: (destination: WalletDestination, destAddress: string) => React.ReactNode;
}) {
  const [destination, setDestination] = useState<WalletDestination>("embedded");
  const destAddress = destination === "embedded" ? embeddedAddress : (connectedAddress ?? "");
  const needsConnect = destination === "self" && !isConnected;

  return (
    <div className="surface-raised grid gap-3 rounded-lg p-4">
      <DestinationToggle onChange={setDestination} value={destination} />
      {needsConnect ? (
        <div className="grid gap-3 rounded-md border border-dashed p-4 text-center">
          <p className="text-muted-foreground text-sm">Connect your self-custodial wallet to use it as the destination.</p>
          <ConnectKitButton.Custom>
            {({ show }) => (
              <Button className="mx-auto" onClick={show} type="button" variant="outline">
                <Wallet className="size-4" />
                Connect wallet
              </Button>
            )}
          </ConnectKitButton.Custom>
        </div>
      ) : (
        <>
          {children(destination, destAddress)}
          <Button disabled={submitting || !destAddress} onClick={() => onConfirm(destAddress)} type="button">
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </>
      )}
    </div>
  );
}
