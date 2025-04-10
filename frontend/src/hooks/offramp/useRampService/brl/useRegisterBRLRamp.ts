import { useRampStore } from '../../../../stores/offrampStore';
import { useVortexAccount } from '../../../useVortexAccount';
import { RampService } from '../../../../services/api';
import { AccountMeta, getAddressForFormat, Networks, signUnsignedTransactions } from 'shared';
import { useMoonbeamNode, usePendulumNode } from '../../../../contexts/polkadotNode';
import { RampExecutionInput } from '../../../../types/phases';

export const useRegisterBRLRamp = () => {
  const {
    rampRegistered,
    actions: { setRampRegistered, setRampState },
  } = useRampStore();

  const { address } = useVortexAccount();
  const { chainId } = useVortexAccount();
  const { apiComponents: pendulumApiComponents } = usePendulumNode();
  const { apiComponents: moonbeamApiComponents } = useMoonbeamNode();

  const registerBRLOnramp = async (rampExecutionInput: RampExecutionInput) => {
    if (!rampExecutionInput) {
      throw new Error('Missing execution input');
    }

    if (!rampExecutionInput.taxId) {
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

    const quoteId = rampExecutionInput.quote.id;
    const signingAccounts: AccountMeta[] = [
      { address: rampExecutionInput.ephemerals.stellarEphemeral.address, network: Networks.Stellar },
      { address: rampExecutionInput.ephemerals.moonbeamEphemeral.address, network: Networks.Moonbeam },
      { address: rampExecutionInput.ephemerals.pendulumEphemeral.address, network: Networks.Pendulum },
    ];

    const additionalData = {
      destinationAddress: address,
      pixDestination: rampExecutionInput.pixId,
      receiverTaxId: rampExecutionInput.taxId,
      taxId: rampExecutionInput.taxId,
    };
    const rampProcess = await RampService.registerRamp(quoteId, signingAccounts, additionalData);

    console.log('registerRamp: rampProcess', rampProcess);

    const ephemeralTxs = rampProcess.unsignedTxs.filter((tx) => {
      if (!address) {
        return true;
      }

      return chainId < 0 && (tx.network === 'pendulum' || tx.network === 'assethub')
        ? getAddressForFormat(tx.signer, 0) !== getAddressForFormat(address, 0)
        : tx.signer.toLowerCase() !== address.toLowerCase();
    });

    const signedTransactions = await signUnsignedTransactions(
      ephemeralTxs,
      rampExecutionInput.ephemerals,
      pendulumApiComponents.api,
      moonbeamApiComponents.api,
    );

    setRampRegistered(true);

    setRampState({
      quote: rampExecutionInput.quote,
      ramp: rampProcess,
      signedTransactions,
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
