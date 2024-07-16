import { TokenType } from '../constants/tokenConfig';

export interface SwapOptions {
  assetIn: string;
  minAmountOut?: Big;
}

export enum OperationStatus {
  Idle,
  Sep10Completed,
  SepCompleted, // Sep6 or Sep24 completed. Ready to transfer funds.
  BridgeExecuted, // Confirmation that the bridge (squid for now) transaction went through
  PendulumEphemeralReady, // Confirmation that the ephemeral received both the expected tokens and the native balance
  NablaSwapApproved, // Confirmation that the tokens where approved
  NablaSwapPerformed, // Confirmation that the swap went through
  StellarEphemeralFunded, // Ephemeral account was created and funded
  StellarEphemeralReady, // Operations for transfer and cleaning were created and saved
  Redeemed, // Confirmation that the redeem tx went through
  Offramped, // Confirmation that stellar transaction to offramp went through
  StellarCleaned, // Confirmation that the stellar account was merged
  Error,
}

export interface ExecutionInput {
  assetToOfframp: TokenType;
  amountIn: Big;
  swapOptions: SwapOptions | undefined; // undefined means direct offramp
}
