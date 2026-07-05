import { EvmClientManager, type EvmNetworks } from "@vortexfi/shared";

export interface RecordedEvmTx {
  network: string;
  from?: string;
  to?: string;
  data?: string;
  value?: bigint;
  serialized?: string;
  hash: `0x${string}`;
}

interface ReadContractParams {
  abi: readonly unknown[];
  address: `0x${string}`;
  functionName: string;
  args?: readonly unknown[];
}

const CHAIN_IDS: Record<string, number> = {
  arbitrum: 42161,
  avalanche: 43114,
  base: 8453,
  "base-sepolia": 84532,
  bsc: 56,
  ethereum: 1,
  moonbeam: 1284,
  polygon: 137,
  polygonAmoy: 80002
};

const MAX_UINT256 = 2n ** 256n - 1n;

/**
 * In-memory EVM world standing in for EvmClientManager. Balances are a simple
 * ledger keyed by network/token/holder; transactions are recorded, assigned a
 * deterministic hash, and confirmed instantly. Behavior that a test cares
 * about (swap rates, transfer effects, failures) is scripted via the public
 * hooks.
 */
export class FakeEvm {
  private balances = new Map<string, bigint>();
  private nonces = new Map<string, number>();
  private txCounter = 0;
  readonly sentTransactions: RecordedEvmTx[] = [];

  /** Called for every recorded transaction; use it to apply balance effects. */
  onTransaction?: (tx: RecordedEvmTx) => void;
  /** First chance to answer any readContract call; return undefined to fall through to defaults. */
  onReadContract?: (network: string, params: ReadContractParams) => unknown;
  /** Nabla router getAmountOut. Default: same-decimals 1:1.05. */
  onGetAmountOut: (network: string, routerAddress: string, amountIn: bigint) => bigint = (_n, _r, amountIn) =>
    (amountIn * 105n) / 100n;
  /** Reverts the next `failNextSends` transaction submissions with the given error. */
  failNextSends = 0;
  sendFailureMessage = "FakeEvm: scripted transaction failure";

  private key(network: string, token: string, holder: string): string {
    return `${network}:${token.toLowerCase()}:${holder.toLowerCase()}`;
  }

  setErc20Balance(network: string, token: string, holder: string, amount: bigint): void {
    this.balances.set(this.key(network, token, holder), amount);
  }

  erc20Balance(network: string, token: string, holder: string): bigint {
    return this.balances.get(this.key(network, token, holder)) ?? 0n;
  }

  setNativeBalance(network: string, holder: string, amount: bigint): void {
    this.balances.set(this.key(network, "native", holder), amount);
  }

  nativeBalance(network: string, holder: string): bigint {
    return this.balances.get(this.key(network, "native", holder)) ?? 0n;
  }

  private nextHash(): `0x${string}` {
    this.txCounter += 1;
    return `0x${this.txCounter.toString(16).padStart(64, "0")}` as `0x${string}`;
  }

  private recordTransaction(tx: Omit<RecordedEvmTx, "hash">): `0x${string}` {
    if (this.failNextSends > 0) {
      this.failNextSends -= 1;
      throw new Error(this.sendFailureMessage);
    }
    const recorded = { ...tx, hash: this.nextHash() };
    this.sentTransactions.push(recorded);
    this.onTransaction?.(recorded);
    return recorded.hash;
  }

  private readContract(network: string, params: ReadContractParams): unknown {
    const custom = this.onReadContract?.(network, params);
    if (custom !== undefined) {
      return custom;
    }
    switch (params.functionName) {
      case "balanceOf":
        return this.erc20Balance(network, params.address, params.args?.[0] as string);
      case "allowance":
        return MAX_UINT256;
      case "getAmountOut":
        return this.onGetAmountOut(network, params.address, params.args?.[0] as bigint);
      default:
        throw new Error(
          `FakeEvm: readContract '${params.functionName}' on ${network} is not implemented — ` +
            "script it via fakeEvm.onReadContract in the test."
        );
    }
  }

  private makeUnimplementedProxy(target: Record<string, unknown>, label: string): unknown {
    return new Proxy(target, {
      get: (obj, prop) => {
        if (prop in obj) {
          return obj[prop as string];
        }
        if (prop === "then") {
          return undefined;
        }
        throw new Error(`FakeEvm: ${label}.${String(prop)} is not implemented — extend src/test-utils/fake-world/fake-evm.ts.`);
      }
    });
  }

  // --- EvmClientManager surface used by the API ---

  getClient(networkName: EvmNetworks): unknown {
    const network = networkName as string;
    const receipt = (hash: `0x${string}`) => ({
      blockNumber: 1n,
      logs: [],
      status: "success" as const,
      transactionHash: hash
    });
    return this.makeUnimplementedProxy(
      {
        chain: { id: CHAIN_IDS[network] ?? 0, name: network },
        estimateFeesPerGas: async () => ({ maxFeePerGas: 1_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n }),
        estimateGas: async () => 21_000n,
        getBalance: async ({ address }: { address: string }) => this.nativeBalance(network, address),
        getGasPrice: async () => 1_000_000_000n,
        getTransactionCount: async ({ address }: { address: string }) => this.nonces.get(`${network}:${address}`) ?? 0,
        getTransactionReceipt: async ({ hash }: { hash: `0x${string}` }) => receipt(hash),
        readContract: async (params: ReadContractParams) => this.readContract(network, params),
        sendRawTransaction: async ({ serializedTransaction }: { serializedTransaction: string }) =>
          this.recordTransaction({ network, serialized: serializedTransaction }),
        waitForTransactionReceipt: async ({ hash }: { hash: `0x${string}` }) => receipt(hash)
      },
      `PublicClient(${network})`
    );
  }

  getWalletClient(networkName: EvmNetworks, account: { address: string }): unknown {
    const network = networkName as string;
    return this.makeUnimplementedProxy(
      {
        account,
        sendTransaction: async (params: { to?: string; data?: string; value?: bigint }) =>
          this.recordTransaction({ data: params.data, from: account.address, network, to: params.to, value: params.value }),
        writeContract: async (params: { address: string; functionName: string }) =>
          this.recordTransaction({ data: params.functionName, from: account.address, network, to: params.address })
      },
      `WalletClient(${network})`
    );
  }

  async readContractWithRetry<T = unknown>(networkName: EvmNetworks, contractParams: ReadContractParams): Promise<T> {
    return this.readContract(networkName as string, contractParams) as T;
  }

  async getBalanceWithRetry(networkName: EvmNetworks, address: `0x${string}`): Promise<bigint> {
    return this.nativeBalance(networkName as string, address);
  }

  async sendRawTransactionWithRetry(networkName: EvmNetworks, serializedTransaction: `0x${string}`): Promise<string> {
    return this.recordTransaction({ network: networkName as string, serialized: serializedTransaction });
  }

  async sendTransactionWithBlindRetry(
    networkName: EvmNetworks,
    account: { address: string },
    transactionParams: { data?: `0x${string}`; to: `0x${string}`; value?: bigint }
  ): Promise<`0x${string}`> {
    return this.recordTransaction({
      data: transactionParams.data,
      from: account.address,
      network: networkName as string,
      to: transactionParams.to,
      value: transactionParams.value
    });
  }
}

export function installFakeEvm(): { fakeEvm: FakeEvm; restore: () => void } {
  const original = EvmClientManager.getInstance;
  const fakeEvm = new FakeEvm();
  EvmClientManager.getInstance = () => fakeEvm as unknown as EvmClientManager;
  return {
    fakeEvm,
    restore: () => {
      EvmClientManager.getInstance = original;
    }
  };
}
