import { lazy, Suspense, useState } from "react";

import { CanvasShell } from "./components/CanvasShell";
import { useBscWallet } from "./hooks/useBscWallet";

const apiBaseUrl = import.meta.env.VITE_VORTEX_API_URL?.trim() || "https://api-sandbox.vortexfinance.co";
const VortexModal = lazy(() => import("./features/vortex").then(module => ({ default: module.VortexModal })));

export default function App() {
  const [modalOpen, setModalOpen] = useState(false);
  const { destinationAddress } = useBscWallet();

  return (
    <CanvasShell>
      <div className="demo-launcher">
        <p className="demo-launcher__eyebrow">BRAZIL ONRAMP DEMO</p>
        <h1>Buy USDC with PIX</h1>
        <p>A browser-only Vortex integration for USDC on BNB Smart Chain.</p>
        <small>This prototype expects a user whose Brazilian corridor is already approved.</small>
        <button className="demo-launcher__button" onClick={() => setModalOpen(true)} type="button">
          Open Vortex
        </button>
      </div>

      {modalOpen && (
        <Suspense fallback={null}>
          <VortexModal
            apiBaseUrl={apiBaseUrl}
            destinationAddress={destinationAddress ?? ""}
            onClose={() => setModalOpen(false)}
            open={modalOpen}
          />
        </Suspense>
      )}
    </CanvasShell>
  );
}
