import { RampContext } from "./types";

export const initialRampContext: RampContext = {
  apiKey: undefined,
  authToken: undefined,
  callbackUrl: undefined,
  chainId: undefined,
  connectedWalletAddress: undefined,
  enteredViaForm: undefined,
  errorMessage: undefined,
  executionInput: undefined,
  externalSessionId: undefined,
  getMessageSignature: undefined,
  initializeFailedMessage: undefined,
  isAuthenticated: false,
  isQuoteExpired: false,
  isSep24Redo: false,
  partnerId: undefined,
  paymentData: undefined,
  postAuthTarget: undefined,
  quote: undefined,
  quoteId: undefined,
  quoteLocked: undefined,
  rampDirection: undefined,
  rampPaymentConfirmed: false,
  rampSigningPhase: undefined,
  rampSigningPhaseCurrent: undefined,
  rampSigningPhaseMax: undefined,
  rampState: undefined,
  substrateWalletAccount: undefined,
  userEmail: undefined,
  userId: undefined,
  walletLocked: undefined
};

export function createResetRampContext(context: RampContext): RampContext {
  return {
    ...initialRampContext,
    apiKey: context.apiKey,
    callbackUrl: context.callbackUrl,
    connectedWalletAddress: context.connectedWalletAddress,
    externalSessionId: context.externalSessionId,
    initializeFailedMessage: context.initializeFailedMessage,
    isAuthenticated: context.isAuthenticated,
    partnerId: context.partnerId,
    userEmail: context.userEmail,
    userId: context.userId,
    walletLocked: context.walletLocked
  };
}
