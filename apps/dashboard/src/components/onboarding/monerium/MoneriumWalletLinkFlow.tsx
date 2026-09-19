import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createMoneriumKycApi, MoneriumAuthorizationRequiredError, type MoneriumCustomerType } from "@vortexfi/kyc";
import { AlertTriangle, CheckCircle2, Loader2, Wallet } from "lucide-react";
import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { ConnectWalletButton } from "@/components/layout/ConnectWalletButton";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { shortenAddress } from "@/domain/transfer";
import type { OnboardingStatus } from "@/domain/types";
import { ONBOARDING_STATUS_QUERY_KEY } from "@/hooks/useApprovedCorridors";
import { apiClient } from "@/services/api/api-client";
import { signMoneriumWalletLinkMessage } from "@/services/transactions/userSigning";
import { MONERIUM_STATUS_MAX_POLLS, moneriumStatusPollInterval, moneriumWalletStep } from "./walletStep";

const api = createMoneriumKycApi(apiClient);
export const MONERIUM_STATUS_QUERY_KEY = ["monerium-status"] as const;

interface MoneriumWalletLinkFlowProps {
  customerType: MoneriumCustomerType;
  onClose: () => void;
  onSettled: (status: OnboardingStatus) => void;
}

/**
 * Second step of EU onboarding: EUR pay-ins mint to a wallet linked to the approved Monerium
 * profile and need that wallet's permit, so the sender links the wallet they will pay in with
 * and Vortex requests (or moves) the profile's IBAN to it. Readiness comes from
 * GET /v1/monerium/status and is polled until the IBAN is provisioned.
 */
export function MoneriumWalletLinkFlow({ customerType, onClose, onSettled }: MoneriumWalletLinkFlowProps) {
  const queryClient = useQueryClient();
  const { address } = useAccount();
  const statusQueryKey = [...MONERIUM_STATUS_QUERY_KEY, customerType];
  const status = useQuery({
    queryFn: () => api.getStatus(customerType),
    queryKey: statusQueryKey,
    refetchInterval: query =>
      moneriumStatusPollInterval({
        address,
        error: query.state.error,
        polls: query.state.dataUpdateCount,
        ramp: query.state.data?.ramp
      }),
    retry: false
  });
  const ramp = status.data?.ramp;
  const pollsExhausted = (queryClient.getQueryState(statusQueryKey)?.dataUpdateCount ?? 0) >= MONERIUM_STATUS_MAX_POLLS;

  function refresh() {
    queryClient.invalidateQueries({ queryKey: MONERIUM_STATUS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ONBOARDING_STATUS_QUERY_KEY });
  }

  const link = useMutation({
    mutationFn: async () => {
      if (!address || !ramp) throw new Error("Connect a wallet first");
      const signature = await signMoneriumWalletLinkMessage();
      return api.linkWallet({ address, chain: ramp.chain, customerType, signature });
    },
    onSuccess: refresh
  });
  const move = useMutation({
    mutationFn: async () => {
      if (!address || !ramp) throw new Error("Connect a wallet first");
      return api.moveIban({ address, chain: ramp.chain, customerType });
    },
    onSuccess: refresh
  });
  const reauthorize = useMutation({
    mutationFn: () => api.startOAuth(customerType),
    onSuccess: ({ authorizationUrl }) => requestAnimationFrame(() => window.location.assign(authorizationUrl))
  });
  const step = ramp ? moneriumWalletStep(ramp, address, link.data) : "link";
  const reported = useRef(false);

  useEffect(() => {
    if (step === "ready" && !reported.current) {
      reported.current = true;
      onSettled("approved");
    }
  }, [onSettled, step]);

  if (status.isPending) {
    return (
      <Centered>
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="font-medium">Checking your Monerium wallet</p>
      </Centered>
    );
  }

  if (status.error instanceof MoneriumAuthorizationRequiredError || status.data?.rampError) {
    return (
      <>
        <Centered>
          <AlertTriangle className="size-10 text-warning" />
          <div>
            <p className="font-medium">Reconnect Monerium</p>
            <p className="max-w-sm text-muted-foreground text-sm">
              Your Monerium session has expired. Reconnect to check the wallet and IBAN for EUR pay-ins.
            </p>
          </div>
        </Centered>
        <DialogFooter>
          <Button onClick={onClose} variant="ghost">
            Cancel
          </Button>
          <Button disabled={reauthorize.isPending} onClick={() => reauthorize.mutate()}>
            Reconnect Monerium
          </Button>
        </DialogFooter>
      </>
    );
  }

  if (status.error || !ramp) {
    return (
      <>
        <Centered>
          <AlertTriangle className="size-10 text-destructive" />
          <div>
            <p className="font-medium">Could not read your Monerium status</p>
            <p className="text-muted-foreground text-sm">{status.error?.message ?? "Finish Monerium verification first."}</p>
          </div>
        </Centered>
        <DialogFooter>
          <Button onClick={onClose} variant="ghost">
            Close
          </Button>
          <Button onClick={() => status.refetch()}>Try again</Button>
        </DialogFooter>
      </>
    );
  }

  if (step === "ready" && ramp.linkedAddress) {
    return (
      <>
        <Centered>
          <CheckCircle2 className="size-10 text-success" />
          <div>
            <p className="font-medium">Ready for EUR pay-ins</p>
            <p className="max-w-sm text-muted-foreground text-sm">
              {shortenAddress(ramp.linkedAddress)} is linked to your Monerium profile and your IBAN points to it. Pay in from
              the transfer page with that wallet connected.
            </p>
          </div>
        </Centered>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </>
    );
  }

  const isLinked =
    !!address &&
    (ramp.linkedAddress?.toLowerCase() === address.toLowerCase() || link.data?.address.toLowerCase() === address.toLowerCase());
  const needsMove = step === "move";
  const busy = link.isPending || move.isPending;
  const failure = link.error ?? move.error;
  const requested = link.data?.iban === "pending";
  const moveSubmitted = !!address && move.data?.address.toLowerCase() === address.toLowerCase();

  return (
    <>
      <Centered>
        <Wallet className="size-10 text-primary" />
        <div className="grid gap-2">
          <p className="font-medium">Link the wallet you will pay in with</p>
          <p className="max-w-sm text-muted-foreground text-sm">
            Your EUR arrives as EURe in this wallet and is swapped from there, so it must be a regular wallet you control (no
            smart-contract wallet). Signing proves ownership; it costs no gas.
          </p>
          {needsMove && address && (
            <div className="max-w-sm rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
              <p className="font-medium">Do you want to change where your Monerium IBAN sends EUR?</p>
              <p className="mt-1">
                Moving it to {shortenAddress(address)} changes the wallet that receives future deposits to this IBAN. Other
                services using the same IBAN, such as Gnosis Pay, may depend on its current wallet. Check those services before
                you confirm.
              </p>
            </div>
          )}
          {requested && !needsMove && (
            <p className="max-w-sm text-muted-foreground text-sm">
              IBAN requested. Monerium is provisioning it; this usually takes a moment.
            </p>
          )}
          {moveSubmitted && needsMove && (
            <p className="max-w-sm text-muted-foreground text-sm">Waiting for Monerium to update this IBAN’s destination…</p>
          )}
          {failure && <p className="max-w-sm text-destructive text-sm">{failure.message}</p>}
          {pollsExhausted && (
            <p className="max-w-sm text-muted-foreground text-sm">
              Monerium is taking longer than usual.{" "}
              <button className="underline" onClick={() => status.refetch()} type="button">
                Check again
              </button>
            </p>
          )}
        </div>
      </Centered>
      <DialogFooter>
        <Button onClick={onClose} variant="ghost">
          Cancel
        </Button>
        {!address ? (
          <ConnectWalletButton />
        ) : needsMove ? (
          <Button disabled={busy || moveSubmitted} onClick={() => move.mutate()}>
            {move.isPending ? "Moving IBAN…" : moveSubmitted ? "Waiting for Monerium…" : "Yes, move IBAN to this wallet"}
          </Button>
        ) : (
          <Button disabled={busy || (requested && isLinked)} onClick={() => link.mutate()}>
            {link.isPending ? "Waiting for signature…" : `Link ${shortenAddress(address)}`}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 py-8 text-center">{children}</div>;
}
