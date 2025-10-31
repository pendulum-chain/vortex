import { Networks } from "@vortexfi/shared";
import { useNetwork } from "../contexts/network";
import { useQuoteFormStore } from "../stores/quote/useQuoteFormStore";

export function useNetworkTokenCompatibility() {
  const {
    actions: { handleNetworkChange }
  } = useQuoteFormStore();
  const { setSelectedNetwork } = useNetwork();

  const handleNetworkSelect = async (network: Networks, resetState = true) => {
    // First update the network in the context
    await setSelectedNetwork(network, resetState);

    // Then check and update token compatibility
    handleNetworkChange(network);
  };

  return { handleNetworkSelect };
}
