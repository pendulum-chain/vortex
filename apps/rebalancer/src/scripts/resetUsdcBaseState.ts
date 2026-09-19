// Resets a stuck USDC->BRLA->USDC (Base) rebalance state back to Idle, keeping history.
// Dry-run by default: prints the persisted state. Pass --confirm to overwrite it.
// Usage: bun run reset:usdc-base-state [--confirm]
import { createUsdcBaseRebalanceState, UsdcBaseRebalancePhase, UsdcBaseStateManager } from "../services/stateManager.ts";

const confirm = process.argv.includes("--confirm");
const stateManager = new UsdcBaseStateManager();
const state = await stateManager.getState();

console.log("Current USDC->BRLA->USDC (Base) state:", JSON.stringify(state, null, 2));

if (!state || state.currentPhase === UsdcBaseRebalancePhase.Idle) {
  console.log("State is already idle. Nothing to reset.");
  process.exit(0);
}

if (!confirm) {
  console.log(`State is stuck at phase "${state.currentPhase}". Re-run with --confirm to reset it to idle.`);
  process.exit(0);
}

await stateManager.saveState(createUsdcBaseRebalanceState(null, UsdcBaseRebalancePhase.Idle));
console.log("State reset to idle. Reconcile the abandoned run's funds manually using the state printed above.");
