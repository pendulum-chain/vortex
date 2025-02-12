import { ApiPromise } from '@polkadot/api';
import { ISubmittableResult, Signer } from '@polkadot/types/types';
import { u8aToHex } from '@polkadot/util';
import { decodeAddress } from '@polkadot/util-crypto';
import Big from 'big.js';

import { ExecutionContext, OfframpingState } from '../../../offrampingFlow';
import { waitUntilTrue } from '../../../../helpers/function';
import { getRawInputBalance } from '../ephemeral';
import { SubmittableExtrinsic } from '@polkadot/api-base/types';
import { parseEventXcmSent, XcmSentEvent } from '../eventParsers';
import { WalletAccount } from '@talismn/connect-wallets';

export async function executePendulumToMoonbeamXCM(
  state: OfframpingState,
  context: ExecutionContext,
): Promise<OfframpingState> {
  const { assetHubNode, walletAccount, setOfframpSigningPhase } = context;
  const { pendulumEphemeralAddress } = state;

  //TODO implement but need to extract common logic from other xcm send

  return { ...state, phase: 'subsidizePreSwap' };
}
