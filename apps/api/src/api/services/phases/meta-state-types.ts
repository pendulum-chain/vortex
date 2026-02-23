import {
  AlfredpayFiatPaymentInstructions,
  ExtrinsicOptions,
  IbanPaymentData,
  PermitSignature,
  StellarTokenDetails
} from "@vortexfi/shared";

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
  distributeFeeHash: string;
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
  moonbeamXcmTransactionHash: `0x${string}`;
  hydrationSwapHash?: string;
  squidRouterApproveHash: string;
  squidRouterSwapHash: string;
  squidRouterPayTxHash: string;
  unhandledPaymentAlertSent: boolean;
  depositQrCode: string | undefined;
  payOutTicketId: string | undefined;
  // Only used in onramp, offramp - monerium
  moneriumOnrampPermit?: PermitSignature;
  permitTxHash?: string;
  ibanPaymentData: IbanPaymentData;
  // Used for webhook notifications
  sessionId?: string;
  squidRouterQuoteId: string;
  // Final transaction hash and explorer link (computed once when ramp is complete)
  finalTransactionHash?: string;
  finalTransactionExplorerLink?: string;
  // Alfredpay
  alfredpayUserId?: string;
  alfredpayTransactionId?: string;
  alfredpayOnrampMintTxHash?: string;
  fiatPaymentInstructions?: AlfredpayFiatPaymentInstructions;
  fiatAccountId?: string;
  destinationTransferTxHash?: string;
  finalSettlementSubsidyTxHash?: string;
}
