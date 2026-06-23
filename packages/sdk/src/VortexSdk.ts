import {
  AccountMeta,
  CreateQuoteRequest,
  createMoonbeamEphemeral,
  createPendulumEphemeral,
  EphemeralAccount,
  EphemeralAccountType,
  EvmTransactionData,
  GetRampStatusResponse,
  isAlfredpayToken,
  isEvmTransactionData,
  isSignedTypedData,
  isSignedTypedDataArray,
  Networks,
  PresignedTx,
  QuoteResponse,
  RampDirection,
  RampProcess,
  SignedTypedData,
  signUnsignedTransactions,
  UnsignedTx
} from "@vortexfi/shared";
import { attachSignatures, typedDataToSign, type UserTransactionType, userTransactionType } from "./eip712";
import { TransactionSigningError } from "./errors";
import { AlfredpayHandler } from "./handlers/AlfredpayHandler";
import { BrlHandler } from "./handlers/BrlHandler";
import { ApiService } from "./services/ApiService";
import { NetworkManager } from "./services/NetworkManager";
import { storeEphemeralKeys } from "./storage";
import type {
  AlfredpayOfframpAdditionalData,
  AlfredpayOfframpUpdateAdditionalData,
  AlfredpayOnrampAdditionalData,
  BrlOfframpAdditionalData,
  BrlOfframpUpdateAdditionalData,
  BrlOnrampAdditionalData,
  ExtendedQuoteResponse,
  RegisterRampAdditionalData,
  SubmitUserTransactionsHandlers,
  UpdateRampAdditionalData,
  VortexSdkConfig
} from "./types";

export class VortexSdk {
  private apiService: ApiService;
  private publicKey: string | undefined;
  private networkManager: NetworkManager;
  private brlHandler: BrlHandler;
  private alfredpayHandler: AlfredpayHandler;
  private initializationPromise: Promise<void>;
  private storeEphemeralKeys: boolean;

  constructor(config: VortexSdkConfig) {
    this.apiService = new ApiService(config.apiBaseUrl, config.secretKey);
    this.networkManager = new NetworkManager(config);
    this.storeEphemeralKeys = config.storeEphemeralKeys ?? true;
    this.publicKey = config.publicKey;

    this.brlHandler = new BrlHandler(
      this.apiService,
      this,
      this.generateEphemerals.bind(this),
      this.signTransactions.bind(this)
    );

    this.alfredpayHandler = new AlfredpayHandler(
      this.apiService,
      this,
      this.generateEphemerals.bind(this),
      this.signTransactions.bind(this)
    );

    this.initializationPromise = this.networkManager.waitForInitialization();
  }

  async createQuote<T extends CreateQuoteRequest>(request: T): Promise<ExtendedQuoteResponse<T>> {
    const apiRequest = { ...request, api: true, apiKey: this.publicKey };
    const baseQuote = await this.apiService.createQuote(apiRequest);
    return baseQuote as ExtendedQuoteResponse<T>;
  }

  async getQuote(quoteId: string): Promise<QuoteResponse> {
    return this.apiService.getQuote(quoteId);
  }

  async getRampStatus(rampId: string): Promise<GetRampStatusResponse> {
    return this.apiService.getRampStatus(rampId);
  }

  async getUserTransactions(rampProcess: RampProcess, userAddress: string): Promise<UnsignedTx[]> {
    if (!rampProcess.unsignedTxs) {
      return [];
    }

    return rampProcess.unsignedTxs.filter(tx => tx.signer === userAddress);
  }

  async registerRamp<Q extends QuoteResponse>(
    quote: Q,
    additionalData: RegisterRampAdditionalData<Q>
  ): Promise<{
    rampProcess: RampProcess;
    unsignedTransactions: UnsignedTx[];
  }> {
    await this.ensureInitialized();

    let rampProcess: RampProcess;
    let unsignedTransactions: UnsignedTx[] = [];

    if (quote.rampType === RampDirection.BUY) {
      if (isAlfredpayToken(quote.inputCurrency)) {
        rampProcess = await this.alfredpayHandler.registerAlfredpayOnramp(
          quote.id,
          additionalData as AlfredpayOnrampAdditionalData
        );
        unsignedTransactions = [];
      } else if (quote.from === "pix") {
        rampProcess = await this.brlHandler.registerBrlOnramp(quote.id, additionalData as BrlOnrampAdditionalData);
        unsignedTransactions = [];
      } else if (quote.from === "sepa") {
        throw new Error("Euro onramp handler not implemented yet");
      } else {
        throw new Error(`Unsupported onramp from: ${quote.from}`);
      }
    } else if (quote.rampType === RampDirection.SELL) {
      if (isAlfredpayToken(quote.outputCurrency)) {
        const offrampData = additionalData as AlfredpayOfframpAdditionalData;
        rampProcess = await this.alfredpayHandler.registerAlfredpayOfframp(quote.id, offrampData);
        unsignedTransactions = await this.getUserTransactions(rampProcess, offrampData.walletAddress);
      } else if (quote.to === "pix") {
        rampProcess = await this.brlHandler.registerBrlOfframp(quote.id, additionalData as BrlOfframpAdditionalData);
        const userAddress = (additionalData as BrlOfframpAdditionalData).walletAddress;
        unsignedTransactions = await this.getUserTransactions(rampProcess, userAddress);
      } else if (quote.to === "sepa") {
        throw new Error("Euro offramp handler not implemented yet");
      } else {
        throw new Error(`Unsupported offramp to: ${quote.to}`);
      }
    } else {
      throw new Error(`Unsupported ramp type: ${quote.rampType}`);
    }

    return { rampProcess, unsignedTransactions };
  }

  async updateRamp<Q extends QuoteResponse>(
    quote: Q,
    rampId: string,
    additionalUpdateData: UpdateRampAdditionalData<Q>
  ): Promise<RampProcess> {
    if (quote.rampType === RampDirection.BUY) {
      if (isAlfredpayToken(quote.inputCurrency)) {
        throw new Error("Alfredpay onramp does not require any further data");
      } else if (quote.from === "pix") {
        throw new Error("Brl onramp does not require any further data");
      } else if (quote.from === "sepa") {
        throw new Error("Euro onramp handler not implemented yet");
      }
    } else if (quote.rampType === RampDirection.SELL) {
      if (isAlfredpayToken(quote.outputCurrency)) {
        return this.alfredpayHandler.updateAlfredpayOfframp(
          rampId,
          additionalUpdateData as AlfredpayOfframpUpdateAdditionalData
        );
      } else if (quote.to === "pix") {
        return this.brlHandler.updateBrlOfframp(rampId, additionalUpdateData as BrlOfframpUpdateAdditionalData);
      } else if (quote.to === "sepa") {
        throw new Error("Euro offramp handler not implemented yet");
      }
    }

    throw new Error(`Unsupported ramp type: ${quote.rampType} with from: ${quote.from}, to: ${quote.to}`);
  }

  async startRamp(rampId: string): Promise<RampProcess> {
    return this.apiService.startRamp({ rampId });
  }

  /**
   * Submit a user signature for an EIP-712 typed-data transaction (e.g. an offramp permit) returned
   * by registerRamp in `unsignedTransactions`. The user's wallet signs the typed data off-chain
   * (e.g. eth_signTypedData_v4 / wagmi signTypedData); pass the resulting 65-byte hex signature here.
   * The signature is attached to the transaction and submitted to Vortex.
   */
  async submitUserSignature(rampId: string, tx: UnsignedTx, signatures: string | string[]): Promise<RampProcess> {
    if (userTransactionType(tx) !== "evm-typed-data") {
      throw new Error(
        `submitUserSignature: phase ${tx.phase} is not a typed-data transaction; use submitUserTxHash for evm-transaction types.`
      );
    }
    const sigList = Array.isArray(signatures) ? signatures : [signatures];
    const signedTxData = attachSignatures(tx, sigList);
    return this.apiService.updateRamp({ additionalData: {}, presignedTxs: [{ ...tx, txData: signedTxData }], rampId });
  }

  /**
   * Classify a user transaction returned in `unsignedTransactions`:
   * - "evm-typed-data": sign it (e.g. an offramp permit) and submit via submitUserSignature.
   * - "evm-transaction": broadcast it from the user wallet and submit the hash via submitUserTxHash.
   * - "unsupported": the SDK cannot broadcast this transaction type; handle it with a network-specific wallet flow.
   */
  getUserTransactionType(tx: UnsignedTx): UserTransactionType {
    return userTransactionType(tx);
  }

  /**
   * Return the EIP-712 payload(s) to sign for a typed-data user transaction. A single transaction
   * may carry more than one payload (e.g. a permit + a relayer payload) — sign each, in order, and
   * pass the signatures to submitUserSignature in the same order.
   *
   * Default output is ready for wagmi / viem `signTypedData` (they derive EIP712Domain themselves).
   * Pass { includeDomainType: true } to also emit the EIP712Domain type entry, as required by the
   * low-level `eth_signTypedData_v4` JSON-RPC call.
   */
  getTypedDataToSign(tx: UnsignedTx, options: { includeDomainType?: boolean } = {}): SignedTypedData[] {
    return typedDataToSign(tx, options);
  }

  /**
   * Return the EVM transaction to broadcast for an "evm-transaction" user transaction.
   */
  getTransactionToBroadcast(tx: UnsignedTx): EvmTransactionData {
    if (!isEvmTransactionData(tx.txData)) {
      throw new Error(`getTransactionToBroadcast: phase ${tx.phase} is not a broadcastable EVM transaction.`);
    }
    return tx.txData;
  }

  /**
   * Submit the hash of a user-broadcast EVM transaction (e.g. squidRouter approve/swap) to Vortex.
   * The hash is recorded against the transaction's phase (e.g. `squidRouterApproveHash`).
   */
  async submitUserTxHash(rampId: string, tx: UnsignedTx, hash: string): Promise<RampProcess> {
    return this.apiService.updateRamp({ additionalData: { [`${tx.phase}Hash`]: hash }, presignedTxs: [], rampId });
  }

  /**
   * Process all user-owned transactions returned by registerRamp. The SDK classifies each entry,
   * asks the caller's wallet callbacks to sign or broadcast it, then submits the result to Vortex.
   */
  async submitUserTransactions(
    rampId: string,
    unsignedTransactions: UnsignedTx[],
    handlers: SubmitUserTransactionsHandlers
  ): Promise<RampProcess> {
    let rampProcess: RampProcess | undefined;

    for (const tx of unsignedTransactions) {
      const txType = this.getUserTransactionType(tx);

      if (txType === "evm-typed-data") {
        if (!handlers.signTypedData) {
          throw new Error(`submitUserTransactions: signTypedData handler is required for phase ${tx.phase}.`);
        }

        const payloads = this.getTypedDataToSign(tx, { includeDomainType: handlers.includeDomainType });
        const signatures: string[] = [];

        for (let payloadIndex = 0; payloadIndex < payloads.length; payloadIndex++) {
          signatures.push(
            await handlers.signTypedData(payloads[payloadIndex], {
              payloadCount: payloads.length,
              payloadIndex,
              unsignedTransaction: tx
            })
          );
        }

        rampProcess = await this.submitUserSignature(rampId, tx, signatures);
      } else if (txType === "evm-transaction") {
        if (!handlers.sendTransaction) {
          throw new Error(`submitUserTransactions: sendTransaction handler is required for phase ${tx.phase}.`);
        }

        const transaction = this.getTransactionToBroadcast(tx);
        const hash = await handlers.sendTransaction(transaction, { unsignedTransaction: tx });
        rampProcess = await this.submitUserTxHash(rampId, tx, hash);
      } else {
        if (!handlers.handleUnsupported) {
          throw new Error(
            `submitUserTransactions: no handler provided for unsupported transaction type at phase ${tx.phase} on ${tx.network}.`
          );
        }
        await handlers.handleUnsupported(tx);
      }
    }

    return rampProcess ?? this.getRampStatus(rampId);
  }

  public async storeEphemerals(
    ephemerals: { [key in EphemeralAccountType]?: EphemeralAccount },
    rampId: string
  ): Promise<void> {
    if (!this.storeEphemeralKeys) {
      return;
    }

    const ephemeralItems = [];
    for (const type of Object.keys(ephemerals) as EphemeralAccountType[]) {
      const ephemeral = ephemerals[type];
      if (ephemeral) {
        const { address, secret } = ephemeral;
        ephemeralItems.push({ address, rampId, secret, type });
      }
    }

    const fileName = `ephemerals_${rampId}.json`;
    try {
      await storeEphemeralKeys(fileName, ephemeralItems);
    } catch (error) {
      console.error(`Error storing ephemeral key for ${rampId}:`, error);
    }
  }

  private async ensureInitialized(): Promise<void> {
    await this.initializationPromise;
  }

  private async generateEphemerals(): Promise<{
    ephemerals: { [key in EphemeralAccountType]?: EphemeralAccount };
    accountMetas: AccountMeta[];
  }> {
    const ephemerals: { [key in EphemeralAccountType]?: EphemeralAccount } = {};
    const accountMetas: AccountMeta[] = [];

    const substrateEphemeral = await createPendulumEphemeral();
    const evmEphemeral = createMoonbeamEphemeral();

    accountMetas.push({
      address: substrateEphemeral.address,
      type: EphemeralAccountType.Substrate
    });
    ephemerals[EphemeralAccountType.Substrate] = substrateEphemeral;

    accountMetas.push({
      address: evmEphemeral.address,
      type: EphemeralAccountType.EVM
    });
    ephemerals[EphemeralAccountType.EVM] = evmEphemeral;

    return { accountMetas, ephemerals };
  }

  private async signTransactions(
    unsignedTxs: UnsignedTx[],
    ephemerals: {
      substrateEphemeral?: EphemeralAccount;
      evmEphemeral?: EphemeralAccount;
    }
  ): Promise<PresignedTx[]> {
    await this.ensureInitialized();

    try {
      const signedTxs = await signUnsignedTransactions(
        unsignedTxs,
        ephemerals,
        unsignedTxs.some(tx => tx.network === Networks.Pendulum) ? await this.networkManager.getPendulumApi() : undefined,
        unsignedTxs.some(
          tx =>
            tx.network === Networks.Moonbeam &&
            !isEvmTransactionData(tx.txData) &&
            !isSignedTypedData(tx.txData) &&
            !isSignedTypedDataArray(tx.txData)
        )
          ? await this.networkManager.getMoonbeamApi()
          : undefined,
        unsignedTxs.some(tx => tx.network === Networks.Hydration) ? await this.networkManager.getHydrationApi() : undefined,
        this.networkManager.getAlchemyApiKey()
      );

      return signedTxs;
    } catch (error) {
      throw new TransactionSigningError(undefined, error as Error);
    }
  }
}
