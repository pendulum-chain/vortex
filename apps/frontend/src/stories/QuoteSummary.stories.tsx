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
  expiresAt: new Date("2024-12-31T23:59:59Z"),
  fee: {
    anchor: "0.5",
    currency: AssetHubToken.USDC,
    network: "0.1",
    partnerMarkup: "0.2",
    total: "0.8",
    vortex: "0.0"
  },
  from: Networks.Stellar,
  id: "quote_1234567890abcdef",
  inputAmount: "100.00",
  inputCurrency: AssetHubToken.USDC,
  outputAmount: "99.20",
  outputCurrency: FiatToken.BRL,
  rampType: RampDirection.SELL,
  to: "pix"
};

const cryptoToFiatQuote: QuoteResponse = {
  expiresAt: new Date("2024-12-31T23:59:59Z"),
  fee: {
    anchor: "1.2",
    currency: AssetHubToken.USDC,
    network: "0.05",
    partnerMarkup: "0.0",
    total: "1.25",
    vortex: "0.0"
  },
  from: Networks.Ethereum,
  id: "quote_eth_to_eur_987654321",
  inputAmount: "0.5",
  inputCurrency: AssetHubToken.USDC,
  outputAmount: "1,234.56",
  outputCurrency: FiatToken.EURC,
  rampType: RampDirection.SELL,
  to: "sepa"
};

const fiatToCryptoQuote: QuoteResponse = {
  expiresAt: new Date("2024-12-31T23:59:59Z"),
  fee: {
    anchor: "2.50",
    currency: FiatToken.BRL,
    network: "0.0",
    partnerMarkup: "1.0",
    total: "3.50",
    vortex: "0.0"
  },
  from: "pix",
  id: "quote_brl_to_usdc_abcdef123456",
  inputAmount: "500.00",
  inputCurrency: FiatToken.BRL,
  outputAmount: "95.45",
  outputCurrency: AssetHubToken.USDC,
  rampType: RampDirection.BUY,
  to: Networks.Stellar
};

const largeAmountQuote: QuoteResponse = {
  expiresAt: new Date("2024-12-31T23:59:59Z"),
  fee: {
    anchor: "15.0",
    currency: AssetHubToken.USDC,
    network: "2.5",
    partnerMarkup: "5.0",
    total: "22.5",
    vortex: "0.0"
  },
  from: Networks.Polygon,
  id: "quote_large_amount_xyz789",
  inputAmount: "10,000.00",
  inputCurrency: AssetHubToken.USDC,
  outputAmount: "9,977.50",
  outputCurrency: FiatToken.EURC,
  rampType: RampDirection.SELL,
  to: "sepa"
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
