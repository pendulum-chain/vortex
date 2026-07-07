export interface PaymentsRouteSummaryData {
  country: string;
  payoutCurrency: string;
  receiveCurrency: string;
  useCase: string;
  volume: string;
}

export function buildPaymentsInquiry(data: PaymentsRouteSummaryData) {
  const routeSummary = [
    `Monthly volume: ${data.volume}`,
    `Receive currency: ${data.receiveCurrency}`,
    `Payout currency: ${data.payoutCurrency}`,
    `Country: ${data.country}`,
    `Use case: ${data.useCase}`
  ].join("\n");

  return `Payments route comparison request\n\n${routeSummary}`;
}
