import {describe, expect, it, mock} from "bun:test";
import { EstimateGasExecutionError, ExecutionRevertedError } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {Networks} from "../../helpers";
import logger from "../../logger";
import {
  EvmClientManager,
  getEvmNetworks,
  isDeterministicPreBroadcastRevert,
  redactRpcUrlForLogs,
  sanitizeRpcErrorMessage
} from "./clientManager";

describe("redactRpcUrlForLogs", () => {
  it("redacts provider API keys from RPC URLs", () => {
    expect(redactRpcUrlForLogs("https://polygon-mainnet.g.alchemy.com/v2/test-api-key")).toBe(
      "https://polygon-mainnet.g.alchemy.com/v2/[redacted]"
    );
    expect(redactRpcUrlForLogs("https://polygon-amoy.g.alchemy.com/v2/test-api-key")).toBe(
      "https://polygon-amoy.g.alchemy.com/v2/[redacted]"
    );
  });

  it("leaves empty viem default RPC markers readable", () => {
    expect(redactRpcUrlForLogs("")).toBe("<default>");
  });

  it("redacts provider API keys embedded in RPC error messages", () => {
    expect(
      sanitizeRpcErrorMessage("URL: https://polygon-mainnet.g.alchemy.com/v2/test-api-key\nRequest failed")
    ).toBe("URL: https://polygon-mainnet.g.alchemy.com/v2/[redacted]\nRequest failed");
  });
});

describe("EvmClientManager RPC configuration", () => {
  it("prefers Alchemy for Polygon Amoy and keeps viem's default transport as the fallback", () => {
    const polygonAmoyConfig = getEvmNetworks("test-api-key").find(network => network.name === Networks.PolygonAmoy);

    expect(polygonAmoyConfig?.rpcUrls).toEqual(["https://polygon-amoy.g.alchemy.com/v2/test-api-key", ""]);
  });

  it("uses only viem's default Polygon Amoy transport without an Alchemy API key", () => {
    const polygonAmoyConfig = getEvmNetworks().find(network => network.name === Networks.PolygonAmoy);

    expect(polygonAmoyConfig?.rpcUrls).toEqual([""]);
  });
});

describe("EvmClientManager RPC cache keys", () => {
  it("keeps viem's default transport distinct from explicit RPC URLs", () => {
    const manager = EvmClientManager.getInstance();
    const explicitRpcClient = manager.getClient(Networks.Moonbeam, "https://rpc.api.moonbeam.network");
    const defaultRpcClient = manager.getClient(Networks.Moonbeam, "");

    expect(defaultRpcClient).not.toBe(explicitRpcClient);
  });
});

describe("EvmClientManager read contract retries", () => {
  it("does not retry deterministic Nabla coverage-ratio reverts", async () => {
    const manager = EvmClientManager.getInstance();
    const managerWithMockedClient = manager as EvmClientManager & { getClient: EvmClientManager["getClient"] };
    const originalGetClient = managerWithMockedClient.getClient;
    const originalLogger = logger.current;
    const warningMessages: string[] = [];
    let attempts = 0;

    logger.current = {
      debug: mock(() => {}),
      error: mock(() => {}),
      info: mock(() => {}),
      warn: mock((...args: unknown[]) => {
        warningMessages.push(String(args[0]));
      })
    };

    managerWithMockedClient.getClient = (() =>
      ({
        readContract: async () => {
          attempts += 1;
          throw new Error("execution reverted: SP:quoteSwapInto:EXCEEDS_MAX_COVERAGE_RATIO");
        }
      }) as unknown as ReturnType<EvmClientManager["getClient"]>) as EvmClientManager["getClient"];

    try {
      await expect(
        manager.readContractWithRetry(
          Networks.Base,
          {
            abi: [],
            address: "0x2A7989993335b31A3133CDA93bc1a095e7b178Ff",
            functionName: "quoteSwapExactTokensForTokens"
          },
          3,
          0
        )
      ).rejects.toThrow("EXCEEDS_MAX_COVERAGE_RATIO");
      expect(attempts).toBe(1);
      expect(warningMessages).toHaveLength(1);
      expect(warningMessages[0]).toContain("read contract failed without retry on base");
      expect(warningMessages[0]).not.toContain("attempt 1/4 failed");
    } finally {
      managerWithMockedClient.getClient = originalGetClient;
      logger.current = originalLogger;
    }
  });
});

describe("EvmClientManager transaction retries", () => {
  it("recognizes only an estimate-gas execution revert as a deterministic pre-broadcast failure", () => {
    const executionRevert = new ExecutionRevertedError({ message: "transfer amount exceeds balance" });
    const estimateGasRevert = new EstimateGasExecutionError(executionRevert, {});

    expect(isDeterministicPreBroadcastRevert(new Error("send failed", { cause: estimateGasRevert }))).toBe(true);
    expect(isDeterministicPreBroadcastRevert(executionRevert)).toBe(false);
    expect(isDeterministicPreBroadcastRevert(new Error("transport timeout"))).toBe(false);
  });

  it("does not retry a deterministic pre-broadcast revert and preserves its cause", async () => {
    const manager = EvmClientManager.getInstance();
    const managerWithMockedClient = manager as EvmClientManager & {
      getWalletClient: EvmClientManager["getWalletClient"];
    };
    const originalGetWalletClient = managerWithMockedClient.getWalletClient;
    const originalLogger = logger.current;
    const executionRevert = new ExecutionRevertedError({ message: "transfer amount exceeds balance" });
    const estimateGasRevert = new EstimateGasExecutionError(executionRevert, {});
    const account = privateKeyToAccount("0x1111111111111111111111111111111111111111111111111111111111111111");
    let attempts = 0;
    let thrown: unknown;

    logger.current = {
      debug: mock(() => {}),
      error: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {})
    };
    managerWithMockedClient.getWalletClient = (() =>
      ({
        sendTransaction: async () => {
          attempts += 1;
          throw estimateGasRevert;
        }
      }) as unknown as ReturnType<EvmClientManager["getWalletClient"]>) as EvmClientManager["getWalletClient"];

    try {
      await manager.sendTransactionWithBlindRetry(
        Networks.Base,
        account,
        { to: "0x2222222222222222222222222222222222222222" },
        3,
        0
      );
    } catch (error) {
      thrown = error;
    } finally {
      managerWithMockedClient.getWalletClient = originalGetWalletClient;
      logger.current = originalLogger;
    }

    expect(attempts).toBe(1);
    expect(isDeterministicPreBroadcastRevert(thrown)).toBe(true);
  });

  it("preserves the last cause after retrying an ambiguous send failure", async () => {
    const manager = EvmClientManager.getInstance();
    const managerWithMockedClient = manager as EvmClientManager & {
      getWalletClient: EvmClientManager["getWalletClient"];
    };
    const originalGetWalletClient = managerWithMockedClient.getWalletClient;
    const originalLogger = logger.current;
    const account = privateKeyToAccount("0x1111111111111111111111111111111111111111111111111111111111111111");
    const failures: Error[] = [];
    let thrown: unknown;

    logger.current = {
      debug: mock(() => {}),
      error: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {})
    };
    managerWithMockedClient.getWalletClient = (() =>
      ({
        sendTransaction: async () => {
          const failure = new Error(`timeout ${failures.length + 1}`);
          failures.push(failure);
          throw failure;
        }
      }) as unknown as ReturnType<EvmClientManager["getWalletClient"]>) as EvmClientManager["getWalletClient"];

    try {
      await manager.sendTransactionWithBlindRetry(
        Networks.Base,
        account,
        { to: "0x2222222222222222222222222222222222222222" },
        1,
        0
      );
    } catch (error) {
      thrown = error;
    } finally {
      managerWithMockedClient.getWalletClient = originalGetWalletClient;
      logger.current = originalLogger;
    }

    expect(failures).toHaveLength(2);
    expect((thrown as Error & { cause?: unknown }).cause).toBe(failures[1]);
    expect(isDeterministicPreBroadcastRevert(thrown)).toBe(false);
  });

  it("does not let a later estimate revert erase an earlier ambiguous send", async () => {
    const manager = EvmClientManager.getInstance();
    const managerWithMockedClient = manager as EvmClientManager & {
      getWalletClient: EvmClientManager["getWalletClient"];
    };
    const originalGetWalletClient = managerWithMockedClient.getWalletClient;
    const originalLogger = logger.current;
    const account = privateKeyToAccount("0x1111111111111111111111111111111111111111111111111111111111111111");
    const estimateGasRevert = new EstimateGasExecutionError(
      new ExecutionRevertedError({ message: "transfer amount exceeds balance" }),
      {}
    );
    let attempts = 0;
    let thrown: unknown;

    logger.current = {
      debug: mock(() => {}),
      error: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {})
    };
    managerWithMockedClient.getWalletClient = (() =>
      ({
        sendTransaction: async () => {
          attempts += 1;
          if (attempts === 1) throw new Error("response timed out after submission");
          throw estimateGasRevert;
        }
      }) as unknown as ReturnType<EvmClientManager["getWalletClient"]>) as EvmClientManager["getWalletClient"];

    try {
      await manager.sendTransactionWithBlindRetry(
        Networks.Base,
        account,
        { to: "0x2222222222222222222222222222222222222222" },
        3,
        0
      );
    } catch (error) {
      thrown = error;
    } finally {
      managerWithMockedClient.getWalletClient = originalGetWalletClient;
      logger.current = originalLogger;
    }

    expect(attempts).toBe(2);
    expect(isDeterministicPreBroadcastRevert(thrown)).toBe(false);
  });
});
