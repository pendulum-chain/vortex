export interface XcmFees {
  destination: {
    amountRaw: string;
    currency: string;
  };
  origin: {
    amountRaw: string;
    currency: string;
  };
}
