import { lazy, Suspense } from "react";
import { USDC_SIMULATION } from "../lib/config.js";
import LiveUsdcFlow from "./LiveUsdcFlow.jsx";
const SimulatedUsdcFlow = USDC_SIMULATION ? lazy(() => import("./SimulatedUsdcFlow.jsx")) : null;
export default function UsdcFlow(props) {
  return SimulatedUsdcFlow && props.runtime.usdc?.simulated !== false
    ? <Suspense fallback={<p role="status">Preparing checkout…</p>}><SimulatedUsdcFlow {...props} /></Suspense>
    : <LiveUsdcFlow {...props} />;
}
