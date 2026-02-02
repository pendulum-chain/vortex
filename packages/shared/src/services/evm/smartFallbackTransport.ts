import { createTransport, type HttpTransportConfig, http, type Transport } from "viem";
import logger from "../../logger";

export interface SmartFallbackConfig {
  /** Maximum number of retry attempts. Defaults to the number of RPC URLs provided. */
  maxRetries?: number;
  /** Initial delay in ms before first retry. Uses exponential backoff. Default: 1000 */
  initialDelayMs?: number;
  /** Request timeout in ms. Default: 10000 */
  timeout?: number;
  httpConfig?: Omit<HttpTransportConfig, "timeout">;
  onRetry?: (info: { rpcUrl: string; attempt: number; maxRetries: number; error: Error }) => void;
}

interface TransportInstance {
  url: string;
  // biome-ignore lint/suspicious/noExplicitAny: viem internal request function type
  request: (args: { method: string; params?: any }) => Promise<any>;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createSmartFallbackTransport(rpcUrls: string[], config: SmartFallbackConfig = {}): Transport {
  const { initialDelayMs = 1000, timeout = 10_000, httpConfig = {}, onRetry } = config;

  if (rpcUrls.length === 0) {
    throw new Error("createSmartFallbackTransport requires at least one RPC URL");
  }

  // Default maxRetries to number of RPC URLs if not specified
  const maxRetries = config.maxRetries ?? rpcUrls.length;

  const key = "smartFallback";
  const name = "Smart Fallback";

  return ({ chain }) => {
    const transports: TransportInstance[] = rpcUrls.map(url => {
      const transport = http(url, {
        ...httpConfig,
        retryCount: 0,
        timeout
      })({ chain });

      return {
        request: transport.request,
        url
      };
    });

    // biome-ignore lint/suspicious/noExplicitAny: viem EIP1193RequestFn has complex generics
    const request = async ({ method, params }: { method: string; params?: any }): Promise<any> => {
      let lastError: Error | undefined;

      // Cycle through RPCs up to maxRetries times
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const transportIndex = attempt % transports.length;
        const transport = transports[transportIndex];

        try {
          const result = await transport.request({ method, params });
          return result;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          const retryInfo = {
            attempt: attempt + 1,
            error: lastError,
            maxRetries,
            rpcUrl: transport.url || `transport-${transportIndex}`
          };

          if (onRetry) {
            onRetry(retryInfo);
          } else {
            logger.current.warn(
              `Smart fallback attempt ${retryInfo.attempt}/${retryInfo.maxRetries} failed on ${retryInfo.rpcUrl}: ${lastError.message}`
            );
          }

          if (attempt < maxRetries - 1) {
            const delayMs = initialDelayMs * Math.pow(2, attempt);
            await sleep(delayMs);
          }
        }
      }

      throw lastError ?? new Error("All RPC endpoints failed");
    };

    return createTransport({
      key,
      name,
      request,
      retryCount: 0,
      type: "smartFallback"
    });
  };
}

export type ChainRpcConfig = Record<number, string[]>;

export function createSmartFallbackTransports(
  chainRpcConfig: ChainRpcConfig,
  config: SmartFallbackConfig = {}
): Record<number, Transport> {
  const transports: Record<number, Transport> = {};

  for (const [chainIdStr, rpcUrls] of Object.entries(chainRpcConfig)) {
    const chainId = Number(chainIdStr);

    if (rpcUrls.length === 0) {
      transports[chainId] = http();
    } else if (rpcUrls.length === 1) {
      transports[chainId] = http(rpcUrls[0], { timeout: config.timeout ?? 10_000 });
    } else {
      transports[chainId] = createSmartFallbackTransport(rpcUrls, config);
    }
  }

  return transports;
}
