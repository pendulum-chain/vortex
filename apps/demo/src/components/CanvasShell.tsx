import type { PropsWithChildren } from "react";

import { WalletButton } from "./WalletButton";

export function CanvasShell({ children }: PropsWithChildren) {
  return (
    <div className="canvas-shell">
      <header className="top-nav">
        <a aria-label="Vortex demo home" className="brand" href="/">
          <span aria-hidden="true" className="brand__mark" />
          <span>Vortex</span>
          <span className="brand__label">Demo</span>
        </a>

        <div className="top-nav__actions">
          <span className="network-badge">
            <span aria-hidden="true" className="network-badge__dot" />
            BSC
          </span>
          <WalletButton />
        </div>
      </header>

      <main className="canvas">{children}</main>
    </div>
  );
}
