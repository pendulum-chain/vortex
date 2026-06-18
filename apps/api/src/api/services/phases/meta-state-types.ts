import { AlfredpayFiatPaymentInstructions, ExtrinsicOptions, IbanPaymentData } from "@vortexfi/shared";

export interface StateMetadata {
  nablaSoftMinimumOutputRaw: string;
  // Only used in offramp
  squidRouterReceiverId: string;
  squidRouterReceiverHash: string;
  distributeFeeHash: string;
  // Only used in onramp - brla
  aveniaTicketId: string;
  onHold?: boolean;
  taxId: string;
  pixDestination: string;
  brlaEvmAddress: string;
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
  // Set to true once update-time validation gate passes (all presigned txs valid + complete,
  // ramp state data complete). Until then, depositQrCode/ibanPaymentData are withheld from
  // the integrator even though they exist in state.
  presignChecksPass?: boolean;
  payOutTicketId: string | undefined;
  brlaPayoutTxHash?: `0x${string}`;
  permitTxHash?: string;
  moneriumOnrampSelfTransferHash?: string;
  ibanPaymentData: IbanPaymentData;
  // Used for webhook notifications
  sessionId?: string;
  squidRouterQuoteId: string;
  // Final transaction hash and explorer link (computed once when ramp is complete)
  finalTransactionHash?: string;
  finalTransactionExplorerLink?: string;
  finalTransactionHashV2?: string;
  finalTransactionExplorerLinkV2?: string;
  // Alfredpay
  alfredpayUserId?: string;
  alfredpayTransactionId?: string;
  alfredpayOnrampMintTxHash?: string;
  fiatPaymentInstructions?: AlfredpayFiatPaymentInstructions;
  fiatAccountId?: string;
  destinationTransferTxHash?: string;
  finalSettlementSubsidyTxHash?: string;
  alfredpayOfframpTransferTxHash?: string;
  squidRouterPermitExecutionHash?: string;
  squidRouterPermitExecutionValue?: string;
  nablaSwapTxHash?: string;
  isDirectTransfer?: boolean;
  // Snapshot of destination-token raw balance on the ephemeral, recorded immediately before squidRouterPay so finalSettlementSubsidy can compute actual bridge delivery rather than total balance (which may include leftover dust from prior phases).
  preSettlementBalance?: string;
  // Fallback path used when input ERC20 does not support EIP-2612 permit.
  // The user submits the substituting transaction(s) from their own wallet and
  // reports back the resulting tx hashes via UpdateRampRequest.additionalData.
  isNoPermitFallback?: boolean;
  squidRouterNoPermitTransferHash?: string;
  squidRouterNoPermitApproveHash?: string;
  squidRouterNoPermitSwapHash?: string;
  // Mykobo - EUR offramp on Base
  mykoboEmail?: string;
  mykoboTransactionId?: string;
  mykoboReceivablesAddress?: string;
  mykoboPayoutTxHash?: `0x${string}`;
  mykoboTransactionReference?: string;
}
