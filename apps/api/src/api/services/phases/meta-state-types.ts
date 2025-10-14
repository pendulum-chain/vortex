import { ExtrinsicOptions, IbanPaymentData, StellarTokenDetails } from "@packages/shared";

export interface StateMetadata {
  nablaSoftMinimumOutputRaw: string;
  // Only used in offramp
  squidRouterReceiverId: string;
  squidRouterReceiverHash: string;
  // Only used in offramp - eurc & ars route
  stellarEphemeralAccountId: string;
  stellarTarget: {
    stellarTargetAccountId: string;
    stellarTokenDetails: StellarTokenDetails;
  };
  executeSpacewalkNonce: number;
  // Only used in onramp - brla
  aveniaTicketId: string;
  taxId: string;
  pixDestination: string;
  brlaEvmAddress: string;
  moneriumWalletAddress: string | undefined;
  walletAddress: string | undefined;
  destinationAddress: string;
  receiverTaxId: string;
  evmEphemeralAddress: string;
  substrateEphemeralAddress: string;
  moonbeamEphemeralAccount: { secret: string; address: string };
  finalUserAddress: string;
  nabla: {
    approveExtrinsicOptions: ExtrinsicOptions;
    swapExtrinsicOptions: ExtrinsicOptions;
  };
  assethubToPendulumHash: string;
  hydrationToAssethubXcmHash?: string;
  pendulumToAssethubXcmHash?: string;
  pendulumToHydrationXcmHash?: string;
  pendulumToMoonbeamXcmHash?: string;
  moonbeamXcmTransactionHash: string;
  hydrationSwapHash?: string;
  squidRouterApproveHash: string;
  squidRouterSwapHash: string;
  squidRouterPayTxHash: string;
  unhandledPaymentAlertSent: boolean;
  depositQrCode: string | undefined;
  payOutTicketId: string | undefined;
  // Only used in onramp, offramp - monerium
  ibanPaymentData: IbanPaymentData;
  squidRouterQuoteId: string;
}
