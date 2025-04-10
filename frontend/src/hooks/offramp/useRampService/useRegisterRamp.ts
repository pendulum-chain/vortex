import { useRampExecutionInput, useRampStore } from '../../../stores/offrampStore';
import { useVortexAccount } from '../../useVortexAccount';
import { RampService } from '../../../services/api';
import { AccountMeta, Networks, signUnsignedTransactions } from 'shared';
import { useMoonbeamNode, usePendulumNode } from '../../../contexts/polkadotNode';

// For Offramp EUR/ARS we trigger it after returning from anchor window
// For Offramp/Onramp BRL we trigger it while clicking Continue in the ramp form

export const useRegisterRamp = () => {
  const {
    rampRegistered,
    actions: { setRampRegistered, setRampState },
  } = useRampStore();

  const { address } = useVortexAccount();
  const { chainId } = useVortexAccount();
  const { apiComponents: pendulumApiComponents } = usePendulumNode();
  const { apiComponents: moonbeamApiComponents } = useMoonbeamNode();

  const executionInput = useRampExecutionInput();

  const registerRamp = async () => {
    if (!executionInput) {
      throw new Error('Missing execution input');
    }

    if (!executionInput.taxId) {
      throw new Error('Missing Tax Id');
    }

    if (!chainId) {
      throw new Error('Missing chainId');
    }

    if (!pendulumApiComponents?.api) {
      throw new Error('Missing pendulumApiComponents');
    }

    if (!moonbeamApiComponents?.api) {
      throw new Error('Missing moonbeamApiComponents');
    }

    const quoteId = executionInput.quote.id;
    const signingAccounts: AccountMeta[] = [
      { address: executionInput.ephemerals.stellarEphemeral.address, network: Networks.Stellar },
      { address: executionInput.ephemerals.moonbeamEphemeral.address, network: Networks.Moonbeam },
      { address: executionInput.ephemerals.pendulumEphemeral.address, network: Networks.Pendulum },
    ];

    // DATA IS ONRAMP ONLY NOW
    const onrampAdditionalData = {
      destinationAddress: address,
      pixDestination: executionInput.pixId,
      taxId: executionInput.taxId,
    };

    const rampProcess = await RampService.registerRamp(quoteId, signingAccounts, onrampAdditionalData);

    await signUnsignedTransactions(rampProcess.unsignedTxs, executionInput.ephemerals, pendulumApiComponents.api, moonbeamApiComponents.api);

    setRampRegistered(true);
    setRampState({
      quote: executionInput.quote,
      ramp: rampProcess,
      signedTransactions: [],
      requiredUserActionsCompleted: false,
      userSigningMeta: {
        squidRouterApproveHash: undefined,
        squidRouterSwapHash: undefined,
        assetHubToPendulumHash: undefined,
      },
    });
  };

  return {
    registerRamp,
    rampRegistered,
  };
};
