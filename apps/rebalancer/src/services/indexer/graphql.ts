import { NABLA_ROUTER } from "@vortexfi/shared";
import request from "graphql-request";
import { graphql } from "../../../gql";
import type { GetRouterQuery } from "../../../gql/graphql.ts";

export type NablaInstanceRouter = NonNullable<GetRouterQuery["routerById"]>;
export type NablaInstanceBackstopPool = NablaInstanceRouter["backstopPool"][number];
export type NablaInstanceSwapPool = NablaInstanceRouter["swapPools"][number];
export type NablaInstanceToken = NablaInstanceBackstopPool["token"];

const INDEXER_URL = "https://pendulum.squids.live/pendulum-squid/graphql";

export interface NablaInstance {
  router: NablaInstanceRouter;
  backstopPool: NablaInstanceBackstopPool;
  swapPools: NablaInstanceSwapPool[];
  tokens: Partial<Record<string, NablaInstanceToken>>;
}

export async function fetchNablaInstance(): Promise<
  | {
      router: NablaInstanceRouter;
      backstopPool: NablaInstanceBackstopPool;
      swapPools: NablaInstanceSwapPool[];
      tokens: Partial<Record<string, NablaInstanceToken>>;
    }
  | undefined
> {
  const result = await request(INDEXER_URL, getNablaInstance, { id: NABLA_ROUTER });

  if (!result || !result.routerById) {
    console.error("Failed to fetch Nabla instance or router not found");
    return undefined;
  }

  const router = result.routerById;
  const backstopPool = router.backstopPool[0];
  if (!backstopPool) {
    console.error("Backstop pool not found in the Nabla instance");
    return undefined;
  }

  const tokensMap = router.swapPools.reduce(
    (acc, pool) => ({
      ...acc,
      [pool.token.id]: pool.token
    }),
    {
      [backstopPool.token.id]: backstopPool.token
    }
  );

  return {
    backstopPool,
    router,
    swapPools: router.swapPools,
    tokens: tokensMap
  };
}

export async function fetchLatestBlockFromIndexer() {
  try {
    const response = await request(INDEXER_URL, getLatestBlock);
    return response.blocks[0];
  } catch (error) {
    console.error("Failed to fetch latest block:", error);
    return undefined;
  }
}

const getLatestBlock = graphql(`
    query getLatestBlock {
        blocks(limit: 1, orderBy: timestamp_DESC) {
            id
            timestamp
            height
        }
    }
`);

const getNablaInstance = graphql(`
    query getRouter($id: String!) {
        routerById(id: $id) {
            id
            swapPools {
                id
                paused
                name
                reserve
                reserveWithSlippage
                totalLiabilities
                totalSupply
                lpTokenDecimals
                apr
                symbol
                token {
                    id
                    decimals
                    name
                    symbol
                }
                insuranceFeeBps
                protocolTreasuryAddress
            }
            backstopPool {
                id
                name
                paused
                symbol
                totalSupply
                apr
                reserves
                lpTokenDecimals
                token {
                    id
                    decimals
                    name
                    symbol
                }
            }
            paused
        }
    }
`);
