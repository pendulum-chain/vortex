export const LEGACY_REBALANCER_DISABLED_MESSAGE =
  "The legacy Pendulum/Moonbeam rebalancing flow is disabled because Moonbeam is unavailable.";

export function assertLegacyRebalancerDisabled(args: readonly string[]): void {
  if (args.includes("--legacy")) {
    throw new Error(LEGACY_REBALANCER_DISABLED_MESSAGE);
  }
}
