import { AssetHubToken, FiatToken, Networks, QuoteResponse, RampDirection } from "@packages/shared";
import type { Meta, StoryObj } from "@storybook/react";
import { QuoteSummary } from "../components/QuoteSummary";

const meta: Meta<typeof QuoteSummary> = {
  argTypes: {
    quote: {
      control: "object",
      description: "Quote data object"
    }
  },
  component: QuoteSummary,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  title: "Components/QuoteSummary"
};

export default meta;
type Story = StoryObj<typeof meta>;

// Sample quote data
const sampleQuote: QuoteResponse = {
  anchorFeeFiat: "0.5",
  anchorFeeUsd: "0.5",
  expiresAt: new Date("2024-12-31T23:59:59Z"),
  feeCurrency: AssetHubToken.USDC,
  from: Networks.Stellar,
  id: "quote_1234567890abcdef",
  inputAmount: "100.00",
  inputCurrency: AssetHubToken.USDC,
  networkFeeFiat: "0.1",
  networkFeeUsd: "0.1",
  outputAmount: "99.20",
  outputCurrency: FiatToken.BRL,
  partnerFeeFiat: "0.2",
  partnerFeeUsd: "0.2",
  processingFeeFiat: "0.5",
  processingFeeUsd: "0.5",
  rampType: RampDirection.SELL,
  to: "pix",
  totalFeeFiat: "0.8",
  totalFeeUsd: "0.8",
  vortexFeeFiat: "0.0",
  vortexFeeUsd: "0.0"
};

const cryptoToFiatQuote: QuoteResponse = {
  anchorFeeFiat: "1.2",
  anchorFeeUsd: "1.2",
  expiresAt: new Date("2024-12-31T23:59:59Z"),
  feeCurrency: AssetHubToken.USDC,
  from: Networks.Ethereum,
  id: "quote_eth_to_eur_987654321",
  inputAmount: "0.5",
  inputCurrency: AssetHubToken.USDC,
  networkFeeFiat: "0.05",
  networkFeeUsd: "0.05",
  outputAmount: "1,234.56",
  outputCurrency: FiatToken.EURC,
  partnerFeeFiat: "0.0",
  partnerFeeUsd: "0.0",
  processingFeeFiat: "1.2",
  processingFeeUsd: "1.2",
  rampType: RampDirection.SELL,
  to: "sepa",
  totalFeeFiat: "1.25",
  totalFeeUsd: "1.25",
  vortexFeeFiat: "0.0",
  vortexFeeUsd: "0.0"
};

const fiatToCryptoQuote: QuoteResponse = {
  anchorFeeFiat: "2.50",
  anchorFeeUsd: "2.50",
  expiresAt: new Date("2024-12-31T23:59:59Z"),
  feeCurrency: FiatToken.BRL,
  from: "pix",
  id: "quote_brl_to_usdc_abcdef123456",
  inputAmount: "500.00",
  inputCurrency: FiatToken.BRL,
  networkFeeFiat: "0.0",
  networkFeeUsd: "0.0",
  outputAmount: "95.45",
  outputCurrency: AssetHubToken.USDC,
  partnerFeeFiat: "1.0",
  partnerFeeUsd: "1.0",
  processingFeeFiat: "2.50",
  processingFeeUsd: "2.50",
  rampType: RampDirection.BUY,
  to: Networks.Stellar,
  totalFeeFiat: "3.50",
  totalFeeUsd: "3.50",
  vortexFeeFiat: "0.0",
  vortexFeeUsd: "0.0"
};

const largeAmountQuote: QuoteResponse = {
  anchorFeeFiat: "15.0",
  anchorFeeUsd: "15.0",
  expiresAt: new Date("2024-12-31T23:59:59Z"),
  feeCurrency: AssetHubToken.USDC,
  from: Networks.Polygon,
  id: "quote_large_amount_xyz789",
  inputAmount: "10,000.00",
  inputCurrency: AssetHubToken.USDC,
  networkFeeFiat: "2.5",
  networkFeeUsd: "2.5",
  outputAmount: "9,977.50",
  outputCurrency: FiatToken.EURC,
  partnerFeeFiat: "5.0",
  partnerFeeUsd: "5.0",
  processingFeeFiat: "15.0",
  processingFeeUsd: "15.0",
  rampType: RampDirection.SELL,
  to: "sepa",
  totalFeeFiat: "22.5",
  totalFeeUsd: "22.5",
  vortexFeeFiat: "0.0",
  vortexFeeUsd: "0.0"
};

export const Default: Story = {
  args: {
    quote: sampleQuote
  }
};

export const CryptoToFiat: Story = {
  args: {
    quote: cryptoToFiatQuote
  }
};

export const FiatToCrypto: Story = {
  args: {
    quote: fiatToCryptoQuote
  }
};

export const LargeAmount: Story = {
  args: {
    quote: largeAmountQuote
  }
};

export const LongTransactionId: Story = {
  args: {
    quote: {
      ...sampleQuote,
      id: "quote_very_long_transaction_id_that_should_wrap_properly_in_the_ui_component_1234567890abcdef"
    }
  }
};

export const SmallAmount: Story = {
  args: {
    quote: {
      ...sampleQuote,
      inputAmount: "1.00",
      outputAmount: "0.99"
    }
  }
};
