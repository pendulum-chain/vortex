import type { PropsWithChildren } from "react";

export function CanvasShell({ children }: PropsWithChildren) {
  return (
    <div className="canvas-shell">
      <header className="top-nav">
        <a aria-label="Vortex demo home" className="brand" href="/">
          <span aria-hidden="true" className="brand__mark" />
          <span>Vortex</span>
          <span className="brand__label">Demo</span>
        </a>

        <span className="network-badge">
          <span aria-hidden="true" className="network-badge__dot" />
          BSC
        </span>
      </header>

      <main className="canvas">{children}</main>
    </div>
  );
}
