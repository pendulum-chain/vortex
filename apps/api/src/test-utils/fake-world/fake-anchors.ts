import {
  AlfredpayApiService,
  BrlaApiService,
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
    createPixOutputTicket: async () => {
      const ticket = { id: `pix-out-${++this.counter}` };
      this.pixOutputTickets.push(ticket);
      return ticket;
    },
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

/** Fake Alfredpay anchor; extend as Alfredpay corridors gain test coverage. */
export class FakeAlfredpay {
  private readonly impl = {};

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
