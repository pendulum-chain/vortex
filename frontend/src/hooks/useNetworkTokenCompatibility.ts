import { Networks } from 'shared';
import { useNetwork } from '../contexts/network';
import { useRampFormStore } from '../stores/ramp/useRampFormStore';

export function useNetworkTokenCompatibility() {
  const {
    actions: { handleNetworkChange },
  } = useRampFormStore();
  const { setSelectedNetwork } = useNetwork();

  const handleNetworkSelect = async (network: Networks, resetState = true) => {
    // First update the network in the context
    await setSelectedNetwork(network, resetState);

    // Then check and update token compatibility
    handleNetworkChange(network);
  };

  return { handleNetworkSelect };
}
