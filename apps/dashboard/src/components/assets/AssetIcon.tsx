import type { Networks } from "@vortexfi/shared";
import { useState } from "react";
import { fiatIconFor, networkIconFor, PLACEHOLDER_ICON } from "@/lib/assetIcons";
import { cn } from "@/lib/cn";

/**
 * Currency and chain marks, sharing the fiat/chain artwork with the widget app. Every mark keeps
 * a fixed box and a muted disc underneath so a slow or missing image never shifts the layout.
 */

// The ring keeps light third-party logos from bleeding into a white card edge.
const MARK = "size-6 shrink-0 rounded-full bg-muted object-contain ring-1 ring-black/10";

export function FiatIcon({ className, currency }: { className?: string; currency: string }) {
  return <img alt="" aria-hidden className={cn(MARK, className)} decoding="async" src={fiatIconFor(currency)} />;
}

export function NetworkIcon({ className, network }: { className?: string; network: Networks }) {
  return <img alt="" aria-hidden className={cn(MARK, className)} decoding="async" src={networkIconFor(network)} />;
}

interface TokenIconProps {
  className?: string;
  /** Mirror URL some token lists ship alongside the primary logo. */
  fallbackLogoURI?: string;
  logoURI?: string;
  /** Renders the chain the token lives on as a corner badge. */
  network?: Networks;
}

export function TokenIcon({ className, fallbackLogoURI, logoURI, network }: TokenIconProps) {
  // Token-list logos are third-party URLs and either one can 404, so each failure is recorded and
  // the next candidate takes over. Entries for tokens no longer shown are inert, so no reset is needed.
  const [broken, setBroken] = useState<string[]>([]);
  const src = [logoURI, fallbackLogoURI].find(candidate => candidate && !broken.includes(candidate)) ?? PLACEHOLDER_ICON;

  return (
    <span className={cn("relative inline-flex size-6 shrink-0", className)}>
      <img
        alt=""
        aria-hidden
        className={cn(MARK, "size-full")}
        decoding="async"
        onError={() => setBroken(list => [...list, src])}
        src={src}
      />
      {network && <NetworkIcon className="-right-0.5 -bottom-0.5 absolute size-3 ring-2 ring-card" network={network} />}
    </span>
  );
}
