import { ExtrinsicOptions, IbanPaymentData, PendulumTokenDetails, RampCurrency, StellarTokenDetails } from "@packages/shared";

export interface StateMetadata {
  inputCurrency: RampCurrency;
  outputCurrency: RampCurrency;
  inputTokenPendulumDetails: PendulumTokenDetails;
  outputTokenPendulumDetails: PendulumTokenDetails;
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
  taxId: string;
  pixDestination: string;
  brlaEvmAddress: string;
  walletAddress: string | undefined;
  destinationAddress: string;
  receiverTaxId: string;
  moonbeamEphemeralAddress: string;
  pendulumEphemeralAddress: string;
  polygonEphemeralAddress: string;
  moonbeamEphemeralAccount: { secret: string; address: string };
  finalUserAddress: string;
  nabla: {
    approveExtrinsicOptions: ExtrinsicOptions;
    swapExtrinsicOptions: ExtrinsicOptions;
  };
  assetHubToPendulumHash: string;
  pendulumToAssethubXcmHash?: string;
  pendulumToMoonbeamXcmHash?: string;
  moonbeamXcmTransactionHash: string;
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
