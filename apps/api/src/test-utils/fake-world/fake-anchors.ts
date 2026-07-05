import {
  AlfredpayApiService,
  type AlfredpayFee,
  type AlfredpayFiatPaymentInstructions,
  type AlfredpayOfframpQuote,
  AlfredpayOfframpStatus,
  type AlfredpayOfframpTransaction,
  type AlfredpayOnrampQuote,
  AlfredpayOnrampStatus,
  type AlfredpayOnrampStatusMetadata,
  type AlfredpayOnrampTransaction,
  AlfredpayPaymentMethodType,
  AveniaTicketStatus,
  BrlaApiService,
  type CreateAlfredpayOfframpQuoteRequest,
  type CreateAlfredpayOfframpRequest,
  type CreateAlfredpayOfframpResponse,
  type CreateAlfredpayOnrampQuoteRequest,
  type CreateAlfredpayOnrampRequest,
  type CreateAlfredpayOnrampResponse,
  type GetAlfredpayOnrampTransactionResponse,
  MykoboApiService,
  type MykoboCreateIntentRequest,
  type MykoboCreateIntentResponse,
  type MykoboFeeResponse,
  type MykoboGetTransactionResponse,
  type MykoboTransaction,
  MykoboTransactionStatus
} from "@vortexfi/shared";

function unimplementedProxy<T extends object>(impl: object, label: string): T {
  return new Proxy(impl, {
    get: (obj, prop) => {
      if (prop in obj) {
        return (obj as Record<string | symbol, unknown>)[prop];
      }
      if (prop === "then") {
        return undefined;
      }
      throw new Error(`${label}.${String(prop)} is not implemented — extend src/test-utils/fake-world/fake-anchors.ts.`);
    }
  }) as T;
}

/**
 * Fake Mykobo anchor. Creates deterministic transactions/intents in memory;
 * fees and per-call failures are scripted through the public fields.
 */
export class FakeMykobo {
  depositFeeTotal = "1.00";
  withdrawFeeTotal = "1.00";
  /** When set, the next createTransactionIntent call rejects with this error. */
  failNextIntent: Error | null = null;

  readonly intents: MykoboCreateIntentRequest[] = [];
  readonly transactions = new Map<string, MykoboTransaction>();
  private counter = 0;

  setTransactionStatus(id: string, status: MykoboTransactionStatus): void {
    const transaction = this.transactions.get(id);
    if (!transaction) {
      throw new Error(`FakeMykobo: unknown transaction ${id}`);
    }
    transaction.status = status;
  }

  private readonly impl = {
    createTransactionIntent: async (request: MykoboCreateIntentRequest): Promise<MykoboCreateIntentResponse> => {
      if (this.failNextIntent) {
        const error = this.failNextIntent;
        this.failNextIntent = null;
        throw error;
      }
      this.intents.push(request);
      this.counter += 1;
      const transaction: MykoboTransaction = {
        created_at: new Date().toISOString(),
        fee: this.depositFeeTotal,
        id: `mykobo-tx-${this.counter}`,
        incoming_currency: "EUR",
        network: "BASE",
        outgoing_currency: "EURC",
        reference: `TESTREF${this.counter}`,
        status: MykoboTransactionStatus.PENDING_PAYER,
        transaction_type: request.transaction_type,
        tx_hash: null,
        updated_at: new Date().toISOString(),
        value: request.value,
        wallet_address: request.wallet_address
      };
      this.transactions.set(transaction.id, transaction);
      return {
        instructions: { bank_account_name: "Vortex Test Account", iban: "DE89370400440532013000" },
        transaction
      };
    },
    defaultDepositFee: async (): Promise<MykoboFeeResponse> => ({ total: this.depositFeeTotal }),
    defaultWithdrawFee: async (): Promise<MykoboFeeResponse> => ({ total: this.withdrawFeeTotal }),
    getTransaction: async (transactionId: string): Promise<MykoboGetTransactionResponse> => {
      const transaction = this.transactions.get(transactionId);
      if (!transaction) {
        throw new Error(`FakeMykobo: unknown transaction ${transactionId}`);
      }
      return { transaction };
    },
    lookupFees: async (): Promise<MykoboFeeResponse> => ({ total: this.depositFeeTotal })
  };

  asService(): MykoboApiService {
    return unimplementedProxy<MykoboApiService>(this.impl, "FakeMykobo");
  }
}

/**
 * Fake BRLA/Avenia anchor with an in-memory subaccount and generous limits.
 * Quote responses apply a flat, scriptable BRL/USD-style rate.
 */
export class FakeBrla {
  /** outputAmount = inputAmount * payInRate for pay-in quotes. */
  payInRate = 1;
  payOutRate = 1;
  subaccountId = "test-subaccount-id";
  subaccountEvmWallet = "0x7ba99e99bc669b3508aff9cc0a898e869459f877";
  /** Internal Avenia subaccount balances served by getAccountBalance; script per test. */
  accountBalances = { BRLA: 0, USDC: 0, USDM: 0, USDT: 0 };
  /** Status reported for every pay-in ticket by getAveniaPayinTickets. */
  payinTicketStatus: AveniaTicketStatus = AveniaTicketStatus.PAID;
  /** Called after createPixOutputTicket succeeds; use it to apply the on-chain mint effect. */
  onPixOutputTicket?: (ticket: { id: string; walletAddress?: string }) => void;
  readonly pixInputTickets: Array<{ id: string; brCode: string }> = [];
  readonly pixOutputTickets: Array<{ id: string }> = [];
  private counter = 0;

  private readonly impl = {
    createPayInQuote: async (quoteParams: { inputAmount: string }) => ({
      appliedFees: [],
      basePrice: "1",
      inputAmount: quoteParams.inputAmount,
      inputCurrency: "BRL",
      inputPaymentMethod: "PIX",
      outputAmount: (Number(quoteParams.inputAmount) * this.payInRate).toString(),
      quoteToken: `payin-quote-token-${++this.counter}`
    }),
    createPayOutQuote: async (quoteParams: { outputAmount: string }) => ({
      appliedFees: [],
      basePrice: "1",
      inputAmount: (Number(quoteParams.outputAmount) / this.payOutRate).toString(),
      inputCurrency: "BRLA",
      inputPaymentMethod: "INTERNAL",
      outputAmount: quoteParams.outputAmount,
      quoteToken: `payout-quote-token-${++this.counter}`
    }),
    createPixInputTicket: async () => {
      const ticket = {
        brCode: `brcode-${++this.counter}`,
        expiration: new Date(Date.now() + 3600_000),
        id: `pix-in-${this.counter}`
      };
      this.pixInputTickets.push(ticket);
      return ticket;
    },
    createPixOutputTicket: async (payload?: { ticketBlockchainOutput?: { walletAddress?: string } }) => {
      const ticket = { id: `pix-out-${++this.counter}` };
      this.pixOutputTickets.push(ticket);
      this.onPixOutputTicket?.({ id: ticket.id, walletAddress: payload?.ticketBlockchainOutput?.walletAddress });
      return ticket;
    },
    getAccountBalance: async () => ({ balances: { ...this.accountBalances } }),
    getAveniaPayinTickets: async () => this.pixInputTickets.map(ticket => ({ id: ticket.id, status: this.payinTicketStatus })),
    getSubaccountUsedLimit: async () => ({
      limitInfo: {
        blocked: false,
        createdAt: new Date().toISOString(),
        limits: [
          {
            currency: "BRL",
            maxChainIn: "10000000",
            maxChainOut: "10000000",
            maxFiatIn: "10000000",
            maxFiatOut: "10000000",
            usedLimit: { usedChainIn: "0", usedChainOut: "0", usedFiatIn: "0", usedFiatOut: "0" }
          }
        ]
      }
    }),
    subaccountInfo: async () => ({
      accountInfo: {},
      brCode: "test-brcode",
      createdAt: new Date().toISOString(),
      id: this.subaccountId,
      pixKey: "test-pix-key",
      wallets: [{ chain: "EVM", id: "wallet-1", walletAddress: this.subaccountEvmWallet }]
    }),
    validatePixKey: async () => ({ bankName: "Test Bank", name: "Test Receiver", taxId: "12345678900" })
  };

  asService(): BrlaApiService {
    return unimplementedProxy<BrlaApiService>(this.impl, "FakeBrla");
  }
}

/**
 * Fake Alfredpay anchor. Onramp quotes apply a flat, scriptable rate; orders
 * and transaction polling run against in-memory state. The status served by
 * getOnrampTransaction is scripted through `onrampStatus`; the on-chain mint
 * effect belongs in the test via `onCreateOnramp` (mirroring FakeBrla's
 * onPixOutputTicket). Extend as Alfredpay corridors gain test coverage.
 */
export class FakeAlfredpay {
  /** toAmount = fromAmount * onrampRate for onramp quotes. */
  onrampRate = 1;
  /** Fees attached to every quote; the fee engine sums them per currency. */
  quoteFees: AlfredpayFee[] = [];
  /** Status reported for every order by getOnrampTransaction. */
  onrampStatus: AlfredpayOnrampStatus = AlfredpayOnrampStatus.TRADE_COMPLETED;
  onrampStatusMetadata: AlfredpayOnrampStatusMetadata | null = null;
  /** Called after createOnramp succeeds; use it to apply the on-chain mint effect. */
  onCreateOnramp?: (order: { transactionId: string; depositAddress: string }) => void;
  readonly onrampOrders: CreateAlfredpayOnrampRequest[] = [];
  readonly transactions = new Map<string, AlfredpayOnrampTransaction>();
  /** toAmount = fromAmount * offrampRate for offramp quotes. */
  offrampRate = 1;
  /** Status reported for every order by getOfframpTransaction. */
  offrampStatus: AlfredpayOfframpStatus = AlfredpayOfframpStatus.FIAT_TRANSFER_COMPLETED;
  /** Deposit address handed out for every offramp order. */
  offrampDepositAddress = "0x5afe00000000000000000000000000000000d0e5";
  readonly offrampOrders: CreateAlfredpayOfframpRequest[] = [];
  readonly offrampTransactions = new Map<string, AlfredpayOfframpTransaction>();
  private counter = 0;

  private readonly fiatPaymentInstructions: AlfredpayFiatPaymentInstructions = {
    clabe: "646180157000000004",
    paymentType: "SPEI",
    reference: "VORTEX-TEST"
  };

  private onrampQuote(request: CreateAlfredpayOnrampQuoteRequest): AlfredpayOnrampQuote {
    const fromAmount = request.fromAmount ?? "0";
    return {
      chain: request.chain,
      expiration: new Date(Date.now() + 5 * 60_000).toISOString(),
      fees: [...this.quoteFees],
      fromAmount,
      fromCurrency: request.fromCurrency,
      metadata: {},
      paymentMethodType: request.paymentMethodType,
      quoteId: `alfredpay-quote-${++this.counter}`,
      rate: this.onrampRate.toString(),
      toAmount: (Number(fromAmount) * this.onrampRate).toString(),
      toCurrency: request.toCurrency
    };
  }

  private offrampQuote(request: CreateAlfredpayOfframpQuoteRequest): AlfredpayOfframpQuote {
    const fromAmount = request.fromAmount ?? "0";
    return {
      chain: request.chain,
      expiration: new Date(Date.now() + 5 * 60_000).toISOString(),
      fees: [...this.quoteFees],
      fromAmount,
      fromCurrency: request.fromCurrency,
      metadata: {},
      paymentMethodType: request.paymentMethodType,
      quoteId: `alfredpay-offramp-quote-${++this.counter}`,
      rate: this.offrampRate.toString(),
      toAmount: (Number(fromAmount) * this.offrampRate).toString(),
      toCurrency: request.toCurrency
    };
  }

  private readonly impl = {
    createOfframp: async (request: CreateAlfredpayOfframpRequest): Promise<CreateAlfredpayOfframpResponse> => {
      this.offrampOrders.push(request);
      const transactionId = `alfredpay-offramp-${++this.counter}`;
      const now = new Date().toISOString();
      const transaction: AlfredpayOfframpTransaction = {
        chain: request.chain,
        createdAt: now,
        customerId: request.customerId,
        depositAddress: this.offrampDepositAddress,
        expiration: new Date(Date.now() + 30 * 60_000).toISOString(),
        fiatAccountId: request.fiatAccountId,
        fromAmount: request.amount,
        fromCurrency: request.fromCurrency,
        memo: request.memo,
        quote: this.offrampQuote({
          fromAmount: request.amount,
          fromCurrency: request.fromCurrency,
          metadata: { businessId: "vortex", customerId: request.customerId },
          paymentMethodType: AlfredpayPaymentMethodType.BANK,
          toCurrency: request.toCurrency
        }),
        quoteId: request.quoteId,
        status: AlfredpayOfframpStatus.ON_CHAIN_DEPOSIT_RECEIVED,
        toAmount: (Number(request.amount) * this.offrampRate).toString(),
        toCurrency: request.toCurrency,
        transactionId,
        updatedAt: now
      };
      this.offrampTransactions.set(transactionId, transaction);
      return transaction;
    },
    createOfframpQuote: async (request: CreateAlfredpayOfframpQuoteRequest): Promise<AlfredpayOfframpQuote> =>
      this.offrampQuote(request),
    createOnramp: async (request: CreateAlfredpayOnrampRequest): Promise<CreateAlfredpayOnrampResponse> => {
      this.onrampOrders.push(request);
      const transactionId = `alfredpay-onramp-${++this.counter}`;
      const now = new Date().toISOString();
      const transaction: AlfredpayOnrampTransaction = {
        chain: request.chain,
        createdAt: now,
        customerId: request.customerId,
        depositAddress: request.depositAddress,
        email: "test@example.com",
        externalId: `external-${transactionId}`,
        fromAmount: request.amount,
        fromCurrency: request.fromCurrency,
        memo: "",
        metadata: null,
        paymentMethodType: request.paymentMethodType,
        quote: this.onrampQuote({
          fromAmount: request.amount,
          fromCurrency: request.fromCurrency,
          metadata: { businessId: "vortex", customerId: request.customerId },
          paymentMethodType: request.paymentMethodType,
          toCurrency: request.toCurrency
        }),
        quoteId: request.quoteId,
        status: AlfredpayOnrampStatus.CREATED,
        toAmount: (Number(request.amount) * this.onrampRate).toString(),
        toCurrency: request.toCurrency,
        transactionId,
        txHash: null,
        updatedAt: now
      };
      this.transactions.set(transactionId, transaction);
      this.onCreateOnramp?.({ depositAddress: request.depositAddress, transactionId });
      return { fiatPaymentInstructions: { ...this.fiatPaymentInstructions }, transaction };
    },
    createOnrampQuote: async (request: CreateAlfredpayOnrampQuoteRequest): Promise<AlfredpayOnrampQuote> =>
      this.onrampQuote(request),
    getOfframpTransaction: async (transactionId: string): Promise<CreateAlfredpayOfframpResponse> => {
      const transaction = this.offrampTransactions.get(transactionId);
      if (!transaction) {
        throw new Error(`FakeAlfredpay: unknown offramp transaction ${transactionId}`);
      }
      return { ...transaction, status: this.offrampStatus };
    },
    getOnrampTransaction: async (transactionId: string): Promise<GetAlfredpayOnrampTransactionResponse> => {
      const transaction = this.transactions.get(transactionId);
      if (!transaction) {
        throw new Error(`FakeAlfredpay: unknown onramp transaction ${transactionId}`);
      }
      return {
        ...transaction,
        fiatPaymentInstructions: { ...this.fiatPaymentInstructions },
        metadata: this.onrampStatusMetadata,
        status: this.onrampStatus
      };
    }
  };

  asService(): AlfredpayApiService {
    return unimplementedProxy<AlfredpayApiService>(this.impl, "FakeAlfredpay");
  }
}

export function installFakeAnchors(): {
  fakeMykobo: FakeMykobo;
  fakeBrla: FakeBrla;
  fakeAlfredpay: FakeAlfredpay;
  restore: () => void;
} {
  const originals = {
    alfredpay: AlfredpayApiService.getInstance,
    brla: BrlaApiService.getInstance,
    mykobo: MykoboApiService.getInstance
  };

  const fakeMykobo = new FakeMykobo();
  const fakeBrla = new FakeBrla();
  const fakeAlfredpay = new FakeAlfredpay();

  MykoboApiService.getInstance = () => fakeMykobo.asService();
  BrlaApiService.getInstance = () => fakeBrla.asService();
  AlfredpayApiService.getInstance = () => fakeAlfredpay.asService();

  return {
    fakeAlfredpay,
    fakeBrla,
    fakeMykobo,
    restore: () => {
      MykoboApiService.getInstance = originals.mykobo;
      BrlaApiService.getInstance = originals.brla;
      AlfredpayApiService.getInstance = originals.alfredpay;
    }
  };
}
