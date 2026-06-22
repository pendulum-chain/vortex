import type { Decorator, Meta, StoryObj } from "@storybook/react";
import { EPaymentMethod, EvmToken, FiatToken, Networks, QuoteResponse, RampDirection } from "@vortexfi/shared";
import { RampFeeCollapse } from "../components/RampFeeCollapse";
import { useQuoteFormStore } from "../stores/quote/useQuoteFormStore";
import { useQuoteStore } from "../stores/quote/useQuoteStore";
import { useRampDirectionStore } from "../stores/rampDirectionStore";

const subsidizedQuote: QuoteResponse = {
  anchorFeeFiat: "2.50",
  anchorFeeUsd: "0.50",
  createdAt: new Date(),
  discountCurrency: FiatToken.BRL,
  discountFiat: "5.00",
  discountUsd: "1.000000",
  expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  feeCurrency: FiatToken.BRL,
  from: EPaymentMethod.PIX,
  id: "quote_subsidized_brl_to_usdc",
  inputAmount: "500.00",
  inputCurrency: FiatToken.BRL,
  network: Networks.Base,
  networkFeeFiat: "0.00",
  networkFeeUsd: "0.00",
  outputAmount: "96.45",
  outputCurrency: EvmToken.USDC,
  partnerFeeFiat: "1.00",
  partnerFeeUsd: "0.20",
  paymentMethod: EPaymentMethod.PIX,
  processingFeeFiat: "2.50",
  processingFeeUsd: "0.50",
  rampType: RampDirection.BUY,
  to: Networks.Base,
  totalFeeFiat: "3.50",
  totalFeeUsd: "0.70",
  vortexFeeFiat: "0.00",
  vortexFeeUsd: "0.00"
};

const withQuoteState =
  (quote: QuoteResponse): Decorator =>
  (Story, context) => {
    useRampDirectionStore.getState().onToggle(quote.rampType);
    useQuoteFormStore.getState().actions.setFiatToken(quote.inputCurrency as FiatToken);
    useQuoteFormStore.getState().actions.setOnChainToken(quote.outputCurrency as EvmToken);
    useQuoteStore.getState().actions.forceSetQuote(quote);
    return Story(context);
  };

const meta: Meta<typeof RampFeeCollapse> = {
  component: RampFeeCollapse,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  title: "Components/RampFeeCollapse"
};

export default meta;
type Story = StoryObj<typeof meta>;

export const SubsidizedQuote: Story = {
  decorators: [withQuoteState(subsidizedQuote)]
};
