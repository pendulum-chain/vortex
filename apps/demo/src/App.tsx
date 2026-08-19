import { CanvasShell } from "./components/CanvasShell";

export default function App() {
  return (
    <CanvasShell>
      <div className="demo-launcher">
        <p className="demo-launcher__eyebrow">BRAZIL ONRAMP DEMO</p>
        <h1>Buy USDC with PIX</h1>
        <p>A browser-only Vortex integration for USDC on BNB Smart Chain.</p>
        <small>This prototype expects a user whose Brazilian corridor is already approved.</small>
        <button className="demo-launcher__button" type="button">
          Open Vortex
        </button>
      </div>
    </CanvasShell>
  );
}
