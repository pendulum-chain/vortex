import { useRampStore } from '../../../../stores/offrampStore';
import { useVortexAccount } from '../../../useVortexAccount';
import { RampService } from '../../../../services/api';
import { AccountMeta, Networks, signUnsignedTransactions } from 'shared';
import { usePendulumNode } from '../../../../contexts/polkadotNode';
import { RampExecutionInput } from '../../../../types/phases';

export const useRegisterBRLRamp = () => {
  const {
    rampRegistered,
    actions: { setRampRegistered, setRampState },
  } = useRampStore();

  const { address } = useVortexAccount();
  const { chainId } = useVortexAccount();
  const { apiComponents: pendulumApiComponents } = usePendulumNode();

  const registerBRLOnramp = async (executionInput: RampExecutionInput) => {
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

    const quoteId = executionInput.quote.id;
    const signingAccounts: AccountMeta[] = [
      { address: executionInput.ephemerals.stellarEphemeral.address, network: Networks.Stellar },
      { address: executionInput.ephemerals.moonbeamEphemeral.address, network: Networks.Moonbeam },
      { address: executionInput.ephemerals.pendulumEphemeral.address, network: Networks.Pendulum },
    ];

    const additionalData = {
      destinationAddress: address,
      pixDestination: executionInput.pixId,
      receiverTaxId: executionInput.taxId,
      taxId: executionInput.taxId,
    };
    const rampProcess = await RampService.registerRamp(quoteId, signingAccounts, additionalData);

    console.log('registerRamp: rampProcess', rampProcess);

    await signUnsignedTransactions(rampProcess.unsignedTxs, executionInput.ephemerals, pendulumApiComponents.api);

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
    registerBRLOnramp,
    rampRegistered,
  };
};
