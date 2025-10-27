export interface XcmFees {
  destination: {
    amount: string;
    amountRaw: string;
    currency: string;
  };
  origin: {
    amount: string;
    amountRaw: string;
    currency: string;
  };
}
