import { EPaymentMethod, Networks } from "@vortexfi/shared";

const MOONBEAM_DEPENDENT_FLOW_IDS = new Set(["BrlOnrampAssethubUsdc", "BrlOfframpAssethubUsdc"]);

interface MoonbeamRuntimeDescriptor {
  flowId?: string;
  from: unknown;
  to: unknown;
  transactionNetworks?: readonly unknown[];
}

interface PersistedMoonbeamRuntimeState {
  from: unknown;
  state?: { flow?: { id?: string } };
  to: unknown;
  unsignedTxs?: readonly { network: unknown }[];
}

export function isMoonbeamRuntimeDisabled({ flowId, from, to, transactionNetworks = [] }: MoonbeamRuntimeDescriptor): boolean {
  const usesMoonbeamInternally =
    (from === EPaymentMethod.PIX && to === Networks.AssetHub) || (from === Networks.AssetHub && to === EPaymentMethod.PIX);

  return (
    from === Networks.Moonbeam ||
    to === Networks.Moonbeam ||
    usesMoonbeamInternally ||
    (flowId !== undefined && MOONBEAM_DEPENDENT_FLOW_IDS.has(flowId)) ||
    transactionNetworks.includes(Networks.Moonbeam)
  );
}

export function isMoonbeamRuntimeDisabledForState(state: PersistedMoonbeamRuntimeState): boolean {
  return isMoonbeamRuntimeDisabled({
    flowId: state.state?.flow?.id,
    from: state.from,
    to: state.to,
    transactionNetworks: state.unsignedTxs?.map(transaction => transaction.network)
  });
}
