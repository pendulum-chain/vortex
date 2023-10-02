/* eslint-disable */
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  /** Big number integer */
  BigInt: { input: any; output: any; }
  /** Binary data encoded as a hex string always prefixed with 0x */
  Bytes: { input: any; output: any; }
  /** A date-time string in simplified extended ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ) */
  DateTime: { input: any; output: any; }
};

export type BackstopPool = {
  __typename?: 'BackstopPool';
  id: Scalars['String']['output'];
  liabilities: Scalars['BigInt']['output'];
  paused: Scalars['Boolean']['output'];
  reserves: Scalars['BigInt']['output'];
  router: Router;
  token: NablaToken;
  totalSupply: Scalars['BigInt']['output'];
};

export type BackstopPoolEdge = {
  __typename?: 'BackstopPoolEdge';
  cursor: Scalars['String']['output'];
  node: BackstopPool;
};

export enum BackstopPoolOrderByInput {
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  LiabilitiesAsc = 'liabilities_ASC',
  LiabilitiesDesc = 'liabilities_DESC',
  PausedAsc = 'paused_ASC',
  PausedDesc = 'paused_DESC',
  ReservesAsc = 'reserves_ASC',
  ReservesDesc = 'reserves_DESC',
  RouterIdAsc = 'router_id_ASC',
  RouterIdDesc = 'router_id_DESC',
  RouterPausedAsc = 'router_paused_ASC',
  RouterPausedDesc = 'router_paused_DESC',
  TokenDecimalsAsc = 'token_decimals_ASC',
  TokenDecimalsDesc = 'token_decimals_DESC',
  TokenIdAsc = 'token_id_ASC',
  TokenIdDesc = 'token_id_DESC',
  TokenNameAsc = 'token_name_ASC',
  TokenNameDesc = 'token_name_DESC',
  TokenSymbolAsc = 'token_symbol_ASC',
  TokenSymbolDesc = 'token_symbol_DESC',
  TotalSupplyAsc = 'totalSupply_ASC',
  TotalSupplyDesc = 'totalSupply_DESC'
}

export type BackstopPoolWhereInput = {
  AND?: InputMaybe<Array<BackstopPoolWhereInput>>;
  OR?: InputMaybe<Array<BackstopPoolWhereInput>>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  liabilities_eq?: InputMaybe<Scalars['BigInt']['input']>;
  liabilities_gt?: InputMaybe<Scalars['BigInt']['input']>;
  liabilities_gte?: InputMaybe<Scalars['BigInt']['input']>;
  liabilities_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  liabilities_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  liabilities_lt?: InputMaybe<Scalars['BigInt']['input']>;
  liabilities_lte?: InputMaybe<Scalars['BigInt']['input']>;
  liabilities_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  liabilities_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  paused_eq?: InputMaybe<Scalars['Boolean']['input']>;
  paused_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  paused_not_eq?: InputMaybe<Scalars['Boolean']['input']>;
  reserves_eq?: InputMaybe<Scalars['BigInt']['input']>;
  reserves_gt?: InputMaybe<Scalars['BigInt']['input']>;
  reserves_gte?: InputMaybe<Scalars['BigInt']['input']>;
  reserves_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  reserves_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  reserves_lt?: InputMaybe<Scalars['BigInt']['input']>;
  reserves_lte?: InputMaybe<Scalars['BigInt']['input']>;
  reserves_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  reserves_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  router?: InputMaybe<RouterWhereInput>;
  router_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  token?: InputMaybe<NablaTokenWhereInput>;
  token_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalSupply_eq?: InputMaybe<Scalars['BigInt']['input']>;
  totalSupply_gt?: InputMaybe<Scalars['BigInt']['input']>;
  totalSupply_gte?: InputMaybe<Scalars['BigInt']['input']>;
  totalSupply_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  totalSupply_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalSupply_lt?: InputMaybe<Scalars['BigInt']['input']>;
  totalSupply_lte?: InputMaybe<Scalars['BigInt']['input']>;
  totalSupply_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  totalSupply_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
};

export type BackstopPoolsConnection = {
  __typename?: 'BackstopPoolsConnection';
  edges: Array<BackstopPoolEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type Bundle = {
  __typename?: 'Bundle';
  /** BigDecimal */
  ethPrice: Scalars['String']['output'];
  id: Scalars['String']['output'];
};

export type BundleEdge = {
  __typename?: 'BundleEdge';
  cursor: Scalars['String']['output'];
  node: Bundle;
};

export enum BundleOrderByInput {
  EthPriceAsc = 'ethPrice_ASC',
  EthPriceDesc = 'ethPrice_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC'
}

export type BundleWhereInput = {
  AND?: InputMaybe<Array<BundleWhereInput>>;
  OR?: InputMaybe<Array<BundleWhereInput>>;
  ethPrice_contains?: InputMaybe<Scalars['String']['input']>;
  ethPrice_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  ethPrice_endsWith?: InputMaybe<Scalars['String']['input']>;
  ethPrice_eq?: InputMaybe<Scalars['String']['input']>;
  ethPrice_gt?: InputMaybe<Scalars['String']['input']>;
  ethPrice_gte?: InputMaybe<Scalars['String']['input']>;
  ethPrice_in?: InputMaybe<Array<Scalars['String']['input']>>;
  ethPrice_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  ethPrice_lt?: InputMaybe<Scalars['String']['input']>;
  ethPrice_lte?: InputMaybe<Scalars['String']['input']>;
  ethPrice_not_contains?: InputMaybe<Scalars['String']['input']>;
  ethPrice_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  ethPrice_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  ethPrice_not_eq?: InputMaybe<Scalars['String']['input']>;
  ethPrice_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  ethPrice_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  ethPrice_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type BundlesConnection = {
  __typename?: 'BundlesConnection';
  edges: Array<BundleEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type Burn = {
  __typename?: 'Burn';
  amount0?: Maybe<Scalars['String']['output']>;
  amount1?: Maybe<Scalars['String']['output']>;
  amountUSD?: Maybe<Scalars['String']['output']>;
  feeLiquidity?: Maybe<Scalars['String']['output']>;
  feeTo?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  liquidity: Scalars['String']['output'];
  logIndex?: Maybe<Scalars['Int']['output']>;
  needsComplete: Scalars['Boolean']['output'];
  pair: Pair;
  sender?: Maybe<Scalars['String']['output']>;
  timestamp: Scalars['DateTime']['output'];
  to?: Maybe<Scalars['String']['output']>;
  transaction: Transaction;
};

export type BurnEdge = {
  __typename?: 'BurnEdge';
  cursor: Scalars['String']['output'];
  node: Burn;
};

export enum BurnOrderByInput {
  Amount0Asc = 'amount0_ASC',
  Amount0Desc = 'amount0_DESC',
  Amount1Asc = 'amount1_ASC',
  Amount1Desc = 'amount1_DESC',
  AmountUsdAsc = 'amountUSD_ASC',
  AmountUsdDesc = 'amountUSD_DESC',
  FeeLiquidityAsc = 'feeLiquidity_ASC',
  FeeLiquidityDesc = 'feeLiquidity_DESC',
  FeeToAsc = 'feeTo_ASC',
  FeeToDesc = 'feeTo_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  LiquidityAsc = 'liquidity_ASC',
  LiquidityDesc = 'liquidity_DESC',
  LogIndexAsc = 'logIndex_ASC',
  LogIndexDesc = 'logIndex_DESC',
  NeedsCompleteAsc = 'needsComplete_ASC',
  NeedsCompleteDesc = 'needsComplete_DESC',
  PairCreatedAtBlockNumberAsc = 'pair_createdAtBlockNumber_ASC',
  PairCreatedAtBlockNumberDesc = 'pair_createdAtBlockNumber_DESC',
  PairCreatedAtTimestampAsc = 'pair_createdAtTimestamp_ASC',
  PairCreatedAtTimestampDesc = 'pair_createdAtTimestamp_DESC',
  PairIdAsc = 'pair_id_ASC',
  PairIdDesc = 'pair_id_DESC',
  PairLiquidityProviderCountAsc = 'pair_liquidityProviderCount_ASC',
  PairLiquidityProviderCountDesc = 'pair_liquidityProviderCount_DESC',
  PairReserve0Asc = 'pair_reserve0_ASC',
  PairReserve0Desc = 'pair_reserve0_DESC',
  PairReserve1Asc = 'pair_reserve1_ASC',
  PairReserve1Desc = 'pair_reserve1_DESC',
  PairReserveEthAsc = 'pair_reserveETH_ASC',
  PairReserveEthDesc = 'pair_reserveETH_DESC',
  PairReserveUsdAsc = 'pair_reserveUSD_ASC',
  PairReserveUsdDesc = 'pair_reserveUSD_DESC',
  PairToken0PriceAsc = 'pair_token0Price_ASC',
  PairToken0PriceDesc = 'pair_token0Price_DESC',
  PairToken1PriceAsc = 'pair_token1Price_ASC',
  PairToken1PriceDesc = 'pair_token1Price_DESC',
  PairTotalSupplyAsc = 'pair_totalSupply_ASC',
  PairTotalSupplyDesc = 'pair_totalSupply_DESC',
  PairTrackedReserveEthAsc = 'pair_trackedReserveETH_ASC',
  PairTrackedReserveEthDesc = 'pair_trackedReserveETH_DESC',
  PairTxCountAsc = 'pair_txCount_ASC',
  PairTxCountDesc = 'pair_txCount_DESC',
  PairUntrackedVolumeUsdAsc = 'pair_untrackedVolumeUSD_ASC',
  PairUntrackedVolumeUsdDesc = 'pair_untrackedVolumeUSD_DESC',
  PairVolumeToken0Asc = 'pair_volumeToken0_ASC',
  PairVolumeToken0Desc = 'pair_volumeToken0_DESC',
  PairVolumeToken1Asc = 'pair_volumeToken1_ASC',
  PairVolumeToken1Desc = 'pair_volumeToken1_DESC',
  PairVolumeUsdAsc = 'pair_volumeUSD_ASC',
  PairVolumeUsdDesc = 'pair_volumeUSD_DESC',
  SenderAsc = 'sender_ASC',
  SenderDesc = 'sender_DESC',
  TimestampAsc = 'timestamp_ASC',
  TimestampDesc = 'timestamp_DESC',
  ToAsc = 'to_ASC',
  ToDesc = 'to_DESC',
  TransactionBlockNumberAsc = 'transaction_blockNumber_ASC',
  TransactionBlockNumberDesc = 'transaction_blockNumber_DESC',
  TransactionIdAsc = 'transaction_id_ASC',
  TransactionIdDesc = 'transaction_id_DESC',
  TransactionTimestampAsc = 'transaction_timestamp_ASC',
  TransactionTimestampDesc = 'transaction_timestamp_DESC'
}

export type BurnWhereInput = {
  AND?: InputMaybe<Array<BurnWhereInput>>;
  OR?: InputMaybe<Array<BurnWhereInput>>;
  amount0_contains?: InputMaybe<Scalars['String']['input']>;
  amount0_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  amount0_endsWith?: InputMaybe<Scalars['String']['input']>;
  amount0_eq?: InputMaybe<Scalars['String']['input']>;
  amount0_gt?: InputMaybe<Scalars['String']['input']>;
  amount0_gte?: InputMaybe<Scalars['String']['input']>;
  amount0_in?: InputMaybe<Array<Scalars['String']['input']>>;
  amount0_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  amount0_lt?: InputMaybe<Scalars['String']['input']>;
  amount0_lte?: InputMaybe<Scalars['String']['input']>;
  amount0_not_contains?: InputMaybe<Scalars['String']['input']>;
  amount0_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  amount0_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  amount0_not_eq?: InputMaybe<Scalars['String']['input']>;
  amount0_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  amount0_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  amount0_startsWith?: InputMaybe<Scalars['String']['input']>;
  amount1_contains?: InputMaybe<Scalars['String']['input']>;
  amount1_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  amount1_endsWith?: InputMaybe<Scalars['String']['input']>;
  amount1_eq?: InputMaybe<Scalars['String']['input']>;
  amount1_gt?: InputMaybe<Scalars['String']['input']>;
  amount1_gte?: InputMaybe<Scalars['String']['input']>;
  amount1_in?: InputMaybe<Array<Scalars['String']['input']>>;
  amount1_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  amount1_lt?: InputMaybe<Scalars['String']['input']>;
  amount1_lte?: InputMaybe<Scalars['String']['input']>;
  amount1_not_contains?: InputMaybe<Scalars['String']['input']>;
  amount1_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  amount1_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  amount1_not_eq?: InputMaybe<Scalars['String']['input']>;
  amount1_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  amount1_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  amount1_startsWith?: InputMaybe<Scalars['String']['input']>;
  amountUSD_contains?: InputMaybe<Scalars['String']['input']>;
  amountUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  amountUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  amountUSD_eq?: InputMaybe<Scalars['String']['input']>;
  amountUSD_gt?: InputMaybe<Scalars['String']['input']>;
  amountUSD_gte?: InputMaybe<Scalars['String']['input']>;
  amountUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  amountUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  amountUSD_lt?: InputMaybe<Scalars['String']['input']>;
  amountUSD_lte?: InputMaybe<Scalars['String']['input']>;
  amountUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  amountUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  amountUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  amountUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  amountUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  amountUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  amountUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_contains?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_endsWith?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_eq?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_gt?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_gte?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_in?: InputMaybe<Array<Scalars['String']['input']>>;
  feeLiquidity_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  feeLiquidity_lt?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_lte?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_not_contains?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_not_eq?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  feeLiquidity_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_startsWith?: InputMaybe<Scalars['String']['input']>;
  feeTo_contains?: InputMaybe<Scalars['String']['input']>;
  feeTo_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  feeTo_endsWith?: InputMaybe<Scalars['String']['input']>;
  feeTo_eq?: InputMaybe<Scalars['String']['input']>;
  feeTo_gt?: InputMaybe<Scalars['String']['input']>;
  feeTo_gte?: InputMaybe<Scalars['String']['input']>;
  feeTo_in?: InputMaybe<Array<Scalars['String']['input']>>;
  feeTo_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  feeTo_lt?: InputMaybe<Scalars['String']['input']>;
  feeTo_lte?: InputMaybe<Scalars['String']['input']>;
  feeTo_not_contains?: InputMaybe<Scalars['String']['input']>;
  feeTo_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  feeTo_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  feeTo_not_eq?: InputMaybe<Scalars['String']['input']>;
  feeTo_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  feeTo_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  feeTo_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  liquidity_contains?: InputMaybe<Scalars['String']['input']>;
  liquidity_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  liquidity_endsWith?: InputMaybe<Scalars['String']['input']>;
  liquidity_eq?: InputMaybe<Scalars['String']['input']>;
  liquidity_gt?: InputMaybe<Scalars['String']['input']>;
  liquidity_gte?: InputMaybe<Scalars['String']['input']>;
  liquidity_in?: InputMaybe<Array<Scalars['String']['input']>>;
  liquidity_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  liquidity_lt?: InputMaybe<Scalars['String']['input']>;
  liquidity_lte?: InputMaybe<Scalars['String']['input']>;
  liquidity_not_contains?: InputMaybe<Scalars['String']['input']>;
  liquidity_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  liquidity_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  liquidity_not_eq?: InputMaybe<Scalars['String']['input']>;
  liquidity_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  liquidity_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  liquidity_startsWith?: InputMaybe<Scalars['String']['input']>;
  logIndex_eq?: InputMaybe<Scalars['Int']['input']>;
  logIndex_gt?: InputMaybe<Scalars['Int']['input']>;
  logIndex_gte?: InputMaybe<Scalars['Int']['input']>;
  logIndex_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  logIndex_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  logIndex_lt?: InputMaybe<Scalars['Int']['input']>;
  logIndex_lte?: InputMaybe<Scalars['Int']['input']>;
  logIndex_not_eq?: InputMaybe<Scalars['Int']['input']>;
  logIndex_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  needsComplete_eq?: InputMaybe<Scalars['Boolean']['input']>;
  needsComplete_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  needsComplete_not_eq?: InputMaybe<Scalars['Boolean']['input']>;
  pair?: InputMaybe<PairWhereInput>;
  pair_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  sender_contains?: InputMaybe<Scalars['String']['input']>;
  sender_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  sender_endsWith?: InputMaybe<Scalars['String']['input']>;
  sender_eq?: InputMaybe<Scalars['String']['input']>;
  sender_gt?: InputMaybe<Scalars['String']['input']>;
  sender_gte?: InputMaybe<Scalars['String']['input']>;
  sender_in?: InputMaybe<Array<Scalars['String']['input']>>;
  sender_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  sender_lt?: InputMaybe<Scalars['String']['input']>;
  sender_lte?: InputMaybe<Scalars['String']['input']>;
  sender_not_contains?: InputMaybe<Scalars['String']['input']>;
  sender_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  sender_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  sender_not_eq?: InputMaybe<Scalars['String']['input']>;
  sender_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  sender_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  sender_startsWith?: InputMaybe<Scalars['String']['input']>;
  timestamp_eq?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_gt?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_gte?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  timestamp_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  timestamp_lt?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_lte?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_not_eq?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_not_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  to_contains?: InputMaybe<Scalars['String']['input']>;
  to_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  to_endsWith?: InputMaybe<Scalars['String']['input']>;
  to_eq?: InputMaybe<Scalars['String']['input']>;
  to_gt?: InputMaybe<Scalars['String']['input']>;
  to_gte?: InputMaybe<Scalars['String']['input']>;
  to_in?: InputMaybe<Array<Scalars['String']['input']>>;
  to_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  to_lt?: InputMaybe<Scalars['String']['input']>;
  to_lte?: InputMaybe<Scalars['String']['input']>;
  to_not_contains?: InputMaybe<Scalars['String']['input']>;
  to_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  to_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  to_not_eq?: InputMaybe<Scalars['String']['input']>;
  to_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  to_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  to_startsWith?: InputMaybe<Scalars['String']['input']>;
  transaction?: InputMaybe<TransactionWhereInput>;
  transaction_isNull?: InputMaybe<Scalars['Boolean']['input']>;
};

export type BurnsConnection = {
  __typename?: 'BurnsConnection';
  edges: Array<BurnEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type FactoriesConnection = {
  __typename?: 'FactoriesConnection';
  edges: Array<FactoryEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type Factory = {
  __typename?: 'Factory';
  id: Scalars['String']['output'];
  pairCount: Scalars['Int']['output'];
  /** BigDecimal */
  totalLiquidityETH: Scalars['String']['output'];
  /** BigDecimal */
  totalLiquidityUSD: Scalars['String']['output'];
  /** BigDecimal */
  totalVolumeETH: Scalars['String']['output'];
  /** BigDecimal */
  totalVolumeUSD: Scalars['String']['output'];
  txCount: Scalars['Int']['output'];
  /** BigDecimal */
  untrackedVolumeUSD: Scalars['String']['output'];
};

export type FactoryDayData = {
  __typename?: 'FactoryDayData';
  dailyVolumeETH: Scalars['String']['output'];
  dailyVolumeUSD: Scalars['String']['output'];
  dailyVolumeUntracked: Scalars['String']['output'];
  date: Scalars['DateTime']['output'];
  id: Scalars['String']['output'];
  totalLiquidityETH: Scalars['String']['output'];
  totalLiquidityUSD: Scalars['String']['output'];
  totalVolumeETH: Scalars['String']['output'];
  totalVolumeUSD: Scalars['String']['output'];
  txCount: Scalars['Int']['output'];
};

export type FactoryDayDataConnection = {
  __typename?: 'FactoryDayDataConnection';
  edges: Array<FactoryDayDataEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type FactoryDayDataEdge = {
  __typename?: 'FactoryDayDataEdge';
  cursor: Scalars['String']['output'];
  node: FactoryDayData;
};

export enum FactoryDayDataOrderByInput {
  DailyVolumeEthAsc = 'dailyVolumeETH_ASC',
  DailyVolumeEthDesc = 'dailyVolumeETH_DESC',
  DailyVolumeUsdAsc = 'dailyVolumeUSD_ASC',
  DailyVolumeUsdDesc = 'dailyVolumeUSD_DESC',
  DailyVolumeUntrackedAsc = 'dailyVolumeUntracked_ASC',
  DailyVolumeUntrackedDesc = 'dailyVolumeUntracked_DESC',
  DateAsc = 'date_ASC',
  DateDesc = 'date_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  TotalLiquidityEthAsc = 'totalLiquidityETH_ASC',
  TotalLiquidityEthDesc = 'totalLiquidityETH_DESC',
  TotalLiquidityUsdAsc = 'totalLiquidityUSD_ASC',
  TotalLiquidityUsdDesc = 'totalLiquidityUSD_DESC',
  TotalVolumeEthAsc = 'totalVolumeETH_ASC',
  TotalVolumeEthDesc = 'totalVolumeETH_DESC',
  TotalVolumeUsdAsc = 'totalVolumeUSD_ASC',
  TotalVolumeUsdDesc = 'totalVolumeUSD_DESC',
  TxCountAsc = 'txCount_ASC',
  TxCountDesc = 'txCount_DESC'
}

export type FactoryDayDataWhereInput = {
  AND?: InputMaybe<Array<FactoryDayDataWhereInput>>;
  OR?: InputMaybe<Array<FactoryDayDataWhereInput>>;
  dailyVolumeETH_contains?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_endsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_eq?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_gt?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_gte?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_in?: InputMaybe<Array<Scalars['String']['input']>>;
  dailyVolumeETH_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  dailyVolumeETH_lt?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_lte?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_not_contains?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_not_eq?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  dailyVolumeETH_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_startsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_contains?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_eq?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_gt?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_gte?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  dailyVolumeUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  dailyVolumeUSD_lt?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_lte?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  dailyVolumeUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUntracked_contains?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUntracked_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUntracked_endsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUntracked_eq?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUntracked_gt?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUntracked_gte?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUntracked_in?: InputMaybe<Array<Scalars['String']['input']>>;
  dailyVolumeUntracked_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  dailyVolumeUntracked_lt?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUntracked_lte?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUntracked_not_contains?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUntracked_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUntracked_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUntracked_not_eq?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUntracked_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  dailyVolumeUntracked_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUntracked_startsWith?: InputMaybe<Scalars['String']['input']>;
  date_eq?: InputMaybe<Scalars['DateTime']['input']>;
  date_gt?: InputMaybe<Scalars['DateTime']['input']>;
  date_gte?: InputMaybe<Scalars['DateTime']['input']>;
  date_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  date_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  date_lt?: InputMaybe<Scalars['DateTime']['input']>;
  date_lte?: InputMaybe<Scalars['DateTime']['input']>;
  date_not_eq?: InputMaybe<Scalars['DateTime']['input']>;
  date_not_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_gt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_gte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityETH_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalLiquidityETH_lt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_lte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityETH_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_gt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_gte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalLiquidityUSD_lt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_lte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_contains?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_eq?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_gt?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_gte?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalVolumeETH_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalVolumeETH_lt?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_lte?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalVolumeETH_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_contains?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_eq?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_gt?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_gte?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalVolumeUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalVolumeUSD_lt?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_lte?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalVolumeUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  txCount_eq?: InputMaybe<Scalars['Int']['input']>;
  txCount_gt?: InputMaybe<Scalars['Int']['input']>;
  txCount_gte?: InputMaybe<Scalars['Int']['input']>;
  txCount_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  txCount_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  txCount_lt?: InputMaybe<Scalars['Int']['input']>;
  txCount_lte?: InputMaybe<Scalars['Int']['input']>;
  txCount_not_eq?: InputMaybe<Scalars['Int']['input']>;
  txCount_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
};

export type FactoryEdge = {
  __typename?: 'FactoryEdge';
  cursor: Scalars['String']['output'];
  node: Factory;
};

export enum FactoryOrderByInput {
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  PairCountAsc = 'pairCount_ASC',
  PairCountDesc = 'pairCount_DESC',
  TotalLiquidityEthAsc = 'totalLiquidityETH_ASC',
  TotalLiquidityEthDesc = 'totalLiquidityETH_DESC',
  TotalLiquidityUsdAsc = 'totalLiquidityUSD_ASC',
  TotalLiquidityUsdDesc = 'totalLiquidityUSD_DESC',
  TotalVolumeEthAsc = 'totalVolumeETH_ASC',
  TotalVolumeEthDesc = 'totalVolumeETH_DESC',
  TotalVolumeUsdAsc = 'totalVolumeUSD_ASC',
  TotalVolumeUsdDesc = 'totalVolumeUSD_DESC',
  TxCountAsc = 'txCount_ASC',
  TxCountDesc = 'txCount_DESC',
  UntrackedVolumeUsdAsc = 'untrackedVolumeUSD_ASC',
  UntrackedVolumeUsdDesc = 'untrackedVolumeUSD_DESC'
}

export type FactoryWhereInput = {
  AND?: InputMaybe<Array<FactoryWhereInput>>;
  OR?: InputMaybe<Array<FactoryWhereInput>>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  pairCount_eq?: InputMaybe<Scalars['Int']['input']>;
  pairCount_gt?: InputMaybe<Scalars['Int']['input']>;
  pairCount_gte?: InputMaybe<Scalars['Int']['input']>;
  pairCount_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  pairCount_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  pairCount_lt?: InputMaybe<Scalars['Int']['input']>;
  pairCount_lte?: InputMaybe<Scalars['Int']['input']>;
  pairCount_not_eq?: InputMaybe<Scalars['Int']['input']>;
  pairCount_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  totalLiquidityETH_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_gt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_gte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityETH_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalLiquidityETH_lt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_lte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityETH_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_gt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_gte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalLiquidityUSD_lt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_lte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_contains?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_eq?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_gt?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_gte?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalVolumeETH_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalVolumeETH_lt?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_lte?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalVolumeETH_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalVolumeETH_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_contains?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_eq?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_gt?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_gte?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalVolumeUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalVolumeUSD_lt?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_lte?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalVolumeUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  txCount_eq?: InputMaybe<Scalars['Int']['input']>;
  txCount_gt?: InputMaybe<Scalars['Int']['input']>;
  txCount_gte?: InputMaybe<Scalars['Int']['input']>;
  txCount_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  txCount_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  txCount_lt?: InputMaybe<Scalars['Int']['input']>;
  txCount_lte?: InputMaybe<Scalars['Int']['input']>;
  txCount_not_eq?: InputMaybe<Scalars['Int']['input']>;
  txCount_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  untrackedVolumeUSD_contains?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_eq?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_gt?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_gte?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  untrackedVolumeUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  untrackedVolumeUSD_lt?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_lte?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  untrackedVolumeUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type Farm = {
  __typename?: 'Farm';
  createdAtBlock: Scalars['BigInt']['output'];
  createdAtTimestamp: Scalars['BigInt']['output'];
  id: Scalars['String']['output'];
  incentives: Array<Incentive>;
  liquidityStaked: Scalars['BigInt']['output'];
  pair?: Maybe<Pair>;
  pid: Scalars['BigInt']['output'];
  rewardUSDPerDay: Scalars['String']['output'];
  singleTokenLock?: Maybe<SingleTokenLock>;
  stableSwap?: Maybe<StableSwap>;
  stakeApr: Scalars['String']['output'];
  stakePositions: Array<StakePosition>;
  stakeToken: Scalars['String']['output'];
  stakedUSD: Scalars['String']['output'];
};


export type FarmIncentivesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<IncentiveOrderByInput>>;
  where?: InputMaybe<IncentiveWhereInput>;
};


export type FarmStakePositionsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StakePositionOrderByInput>>;
  where?: InputMaybe<StakePositionWhereInput>;
};

export type FarmEdge = {
  __typename?: 'FarmEdge';
  cursor: Scalars['String']['output'];
  node: Farm;
};

export enum FarmOrderByInput {
  CreatedAtBlockAsc = 'createdAtBlock_ASC',
  CreatedAtBlockDesc = 'createdAtBlock_DESC',
  CreatedAtTimestampAsc = 'createdAtTimestamp_ASC',
  CreatedAtTimestampDesc = 'createdAtTimestamp_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  LiquidityStakedAsc = 'liquidityStaked_ASC',
  LiquidityStakedDesc = 'liquidityStaked_DESC',
  PairCreatedAtBlockNumberAsc = 'pair_createdAtBlockNumber_ASC',
  PairCreatedAtBlockNumberDesc = 'pair_createdAtBlockNumber_DESC',
  PairCreatedAtTimestampAsc = 'pair_createdAtTimestamp_ASC',
  PairCreatedAtTimestampDesc = 'pair_createdAtTimestamp_DESC',
  PairIdAsc = 'pair_id_ASC',
  PairIdDesc = 'pair_id_DESC',
  PairLiquidityProviderCountAsc = 'pair_liquidityProviderCount_ASC',
  PairLiquidityProviderCountDesc = 'pair_liquidityProviderCount_DESC',
  PairReserve0Asc = 'pair_reserve0_ASC',
  PairReserve0Desc = 'pair_reserve0_DESC',
  PairReserve1Asc = 'pair_reserve1_ASC',
  PairReserve1Desc = 'pair_reserve1_DESC',
  PairReserveEthAsc = 'pair_reserveETH_ASC',
  PairReserveEthDesc = 'pair_reserveETH_DESC',
  PairReserveUsdAsc = 'pair_reserveUSD_ASC',
  PairReserveUsdDesc = 'pair_reserveUSD_DESC',
  PairToken0PriceAsc = 'pair_token0Price_ASC',
  PairToken0PriceDesc = 'pair_token0Price_DESC',
  PairToken1PriceAsc = 'pair_token1Price_ASC',
  PairToken1PriceDesc = 'pair_token1Price_DESC',
  PairTotalSupplyAsc = 'pair_totalSupply_ASC',
  PairTotalSupplyDesc = 'pair_totalSupply_DESC',
  PairTrackedReserveEthAsc = 'pair_trackedReserveETH_ASC',
  PairTrackedReserveEthDesc = 'pair_trackedReserveETH_DESC',
  PairTxCountAsc = 'pair_txCount_ASC',
  PairTxCountDesc = 'pair_txCount_DESC',
  PairUntrackedVolumeUsdAsc = 'pair_untrackedVolumeUSD_ASC',
  PairUntrackedVolumeUsdDesc = 'pair_untrackedVolumeUSD_DESC',
  PairVolumeToken0Asc = 'pair_volumeToken0_ASC',
  PairVolumeToken0Desc = 'pair_volumeToken0_DESC',
  PairVolumeToken1Asc = 'pair_volumeToken1_ASC',
  PairVolumeToken1Desc = 'pair_volumeToken1_DESC',
  PairVolumeUsdAsc = 'pair_volumeUSD_ASC',
  PairVolumeUsdDesc = 'pair_volumeUSD_DESC',
  PidAsc = 'pid_ASC',
  PidDesc = 'pid_DESC',
  RewardUsdPerDayAsc = 'rewardUSDPerDay_ASC',
  RewardUsdPerDayDesc = 'rewardUSDPerDay_DESC',
  SingleTokenLockIdAsc = 'singleTokenLock_id_ASC',
  SingleTokenLockIdDesc = 'singleTokenLock_id_DESC',
  SingleTokenLockTotalLiquidityEthAsc = 'singleTokenLock_totalLiquidityETH_ASC',
  SingleTokenLockTotalLiquidityEthDesc = 'singleTokenLock_totalLiquidityETH_DESC',
  SingleTokenLockTotalLiquidityUsdAsc = 'singleTokenLock_totalLiquidityUSD_ASC',
  SingleTokenLockTotalLiquidityUsdDesc = 'singleTokenLock_totalLiquidityUSD_DESC',
  SingleTokenLockTotalLiquidityAsc = 'singleTokenLock_totalLiquidity_ASC',
  SingleTokenLockTotalLiquidityDesc = 'singleTokenLock_totalLiquidity_DESC',
  StableSwapAAsc = 'stableSwap_a_ASC',
  StableSwapADesc = 'stableSwap_a_DESC',
  StableSwapAddressAsc = 'stableSwap_address_ASC',
  StableSwapAddressDesc = 'stableSwap_address_DESC',
  StableSwapAdminFeeAsc = 'stableSwap_adminFee_ASC',
  StableSwapAdminFeeDesc = 'stableSwap_adminFee_DESC',
  StableSwapBaseSwapAddressAsc = 'stableSwap_baseSwapAddress_ASC',
  StableSwapBaseSwapAddressDesc = 'stableSwap_baseSwapAddress_DESC',
  StableSwapIdAsc = 'stableSwap_id_ASC',
  StableSwapIdDesc = 'stableSwap_id_DESC',
  StableSwapLpTokenAsc = 'stableSwap_lpToken_ASC',
  StableSwapLpTokenDesc = 'stableSwap_lpToken_DESC',
  StableSwapLpTotalSupplyAsc = 'stableSwap_lpTotalSupply_ASC',
  StableSwapLpTotalSupplyDesc = 'stableSwap_lpTotalSupply_DESC',
  StableSwapNumTokensAsc = 'stableSwap_numTokens_ASC',
  StableSwapNumTokensDesc = 'stableSwap_numTokens_DESC',
  StableSwapSwapFeeAsc = 'stableSwap_swapFee_ASC',
  StableSwapSwapFeeDesc = 'stableSwap_swapFee_DESC',
  StableSwapTvlUsdAsc = 'stableSwap_tvlUSD_ASC',
  StableSwapTvlUsdDesc = 'stableSwap_tvlUSD_DESC',
  StableSwapVirtualPriceAsc = 'stableSwap_virtualPrice_ASC',
  StableSwapVirtualPriceDesc = 'stableSwap_virtualPrice_DESC',
  StableSwapVolumeUsdAsc = 'stableSwap_volumeUSD_ASC',
  StableSwapVolumeUsdDesc = 'stableSwap_volumeUSD_DESC',
  StakeAprAsc = 'stakeApr_ASC',
  StakeAprDesc = 'stakeApr_DESC',
  StakeTokenAsc = 'stakeToken_ASC',
  StakeTokenDesc = 'stakeToken_DESC',
  StakedUsdAsc = 'stakedUSD_ASC',
  StakedUsdDesc = 'stakedUSD_DESC'
}

export type FarmWhereInput = {
  AND?: InputMaybe<Array<FarmWhereInput>>;
  OR?: InputMaybe<Array<FarmWhereInput>>;
  createdAtBlock_eq?: InputMaybe<Scalars['BigInt']['input']>;
  createdAtBlock_gt?: InputMaybe<Scalars['BigInt']['input']>;
  createdAtBlock_gte?: InputMaybe<Scalars['BigInt']['input']>;
  createdAtBlock_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  createdAtBlock_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  createdAtBlock_lt?: InputMaybe<Scalars['BigInt']['input']>;
  createdAtBlock_lte?: InputMaybe<Scalars['BigInt']['input']>;
  createdAtBlock_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  createdAtBlock_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  createdAtTimestamp_eq?: InputMaybe<Scalars['BigInt']['input']>;
  createdAtTimestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  createdAtTimestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  createdAtTimestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  createdAtTimestamp_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  createdAtTimestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  createdAtTimestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  createdAtTimestamp_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  createdAtTimestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  incentives_every?: InputMaybe<IncentiveWhereInput>;
  incentives_none?: InputMaybe<IncentiveWhereInput>;
  incentives_some?: InputMaybe<IncentiveWhereInput>;
  liquidityStaked_eq?: InputMaybe<Scalars['BigInt']['input']>;
  liquidityStaked_gt?: InputMaybe<Scalars['BigInt']['input']>;
  liquidityStaked_gte?: InputMaybe<Scalars['BigInt']['input']>;
  liquidityStaked_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  liquidityStaked_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  liquidityStaked_lt?: InputMaybe<Scalars['BigInt']['input']>;
  liquidityStaked_lte?: InputMaybe<Scalars['BigInt']['input']>;
  liquidityStaked_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  liquidityStaked_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  pair?: InputMaybe<PairWhereInput>;
  pair_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  pid_eq?: InputMaybe<Scalars['BigInt']['input']>;
  pid_gt?: InputMaybe<Scalars['BigInt']['input']>;
  pid_gte?: InputMaybe<Scalars['BigInt']['input']>;
  pid_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  pid_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  pid_lt?: InputMaybe<Scalars['BigInt']['input']>;
  pid_lte?: InputMaybe<Scalars['BigInt']['input']>;
  pid_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  pid_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  rewardUSDPerDay_contains?: InputMaybe<Scalars['String']['input']>;
  rewardUSDPerDay_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  rewardUSDPerDay_endsWith?: InputMaybe<Scalars['String']['input']>;
  rewardUSDPerDay_eq?: InputMaybe<Scalars['String']['input']>;
  rewardUSDPerDay_gt?: InputMaybe<Scalars['String']['input']>;
  rewardUSDPerDay_gte?: InputMaybe<Scalars['String']['input']>;
  rewardUSDPerDay_in?: InputMaybe<Array<Scalars['String']['input']>>;
  rewardUSDPerDay_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  rewardUSDPerDay_lt?: InputMaybe<Scalars['String']['input']>;
  rewardUSDPerDay_lte?: InputMaybe<Scalars['String']['input']>;
  rewardUSDPerDay_not_contains?: InputMaybe<Scalars['String']['input']>;
  rewardUSDPerDay_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  rewardUSDPerDay_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  rewardUSDPerDay_not_eq?: InputMaybe<Scalars['String']['input']>;
  rewardUSDPerDay_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  rewardUSDPerDay_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  rewardUSDPerDay_startsWith?: InputMaybe<Scalars['String']['input']>;
  singleTokenLock?: InputMaybe<SingleTokenLockWhereInput>;
  singleTokenLock_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  stableSwap?: InputMaybe<StableSwapWhereInput>;
  stableSwap_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  stakeApr_contains?: InputMaybe<Scalars['String']['input']>;
  stakeApr_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  stakeApr_endsWith?: InputMaybe<Scalars['String']['input']>;
  stakeApr_eq?: InputMaybe<Scalars['String']['input']>;
  stakeApr_gt?: InputMaybe<Scalars['String']['input']>;
  stakeApr_gte?: InputMaybe<Scalars['String']['input']>;
  stakeApr_in?: InputMaybe<Array<Scalars['String']['input']>>;
  stakeApr_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  stakeApr_lt?: InputMaybe<Scalars['String']['input']>;
  stakeApr_lte?: InputMaybe<Scalars['String']['input']>;
  stakeApr_not_contains?: InputMaybe<Scalars['String']['input']>;
  stakeApr_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  stakeApr_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  stakeApr_not_eq?: InputMaybe<Scalars['String']['input']>;
  stakeApr_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  stakeApr_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  stakeApr_startsWith?: InputMaybe<Scalars['String']['input']>;
  stakePositions_every?: InputMaybe<StakePositionWhereInput>;
  stakePositions_none?: InputMaybe<StakePositionWhereInput>;
  stakePositions_some?: InputMaybe<StakePositionWhereInput>;
  stakeToken_contains?: InputMaybe<Scalars['String']['input']>;
  stakeToken_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  stakeToken_endsWith?: InputMaybe<Scalars['String']['input']>;
  stakeToken_eq?: InputMaybe<Scalars['String']['input']>;
  stakeToken_gt?: InputMaybe<Scalars['String']['input']>;
  stakeToken_gte?: InputMaybe<Scalars['String']['input']>;
  stakeToken_in?: InputMaybe<Array<Scalars['String']['input']>>;
  stakeToken_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  stakeToken_lt?: InputMaybe<Scalars['String']['input']>;
  stakeToken_lte?: InputMaybe<Scalars['String']['input']>;
  stakeToken_not_contains?: InputMaybe<Scalars['String']['input']>;
  stakeToken_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  stakeToken_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  stakeToken_not_eq?: InputMaybe<Scalars['String']['input']>;
  stakeToken_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  stakeToken_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  stakeToken_startsWith?: InputMaybe<Scalars['String']['input']>;
  stakedUSD_contains?: InputMaybe<Scalars['String']['input']>;
  stakedUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  stakedUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  stakedUSD_eq?: InputMaybe<Scalars['String']['input']>;
  stakedUSD_gt?: InputMaybe<Scalars['String']['input']>;
  stakedUSD_gte?: InputMaybe<Scalars['String']['input']>;
  stakedUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  stakedUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  stakedUSD_lt?: InputMaybe<Scalars['String']['input']>;
  stakedUSD_lte?: InputMaybe<Scalars['String']['input']>;
  stakedUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  stakedUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  stakedUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  stakedUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  stakedUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  stakedUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  stakedUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type FarmsConnection = {
  __typename?: 'FarmsConnection';
  edges: Array<FarmEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type Incentive = {
  __typename?: 'Incentive';
  farm: Farm;
  id: Scalars['String']['output'];
  rewardPerDay: Scalars['String']['output'];
  rewardToken: Token;
};

export type IncentiveEdge = {
  __typename?: 'IncentiveEdge';
  cursor: Scalars['String']['output'];
  node: Incentive;
};

export enum IncentiveOrderByInput {
  FarmCreatedAtBlockAsc = 'farm_createdAtBlock_ASC',
  FarmCreatedAtBlockDesc = 'farm_createdAtBlock_DESC',
  FarmCreatedAtTimestampAsc = 'farm_createdAtTimestamp_ASC',
  FarmCreatedAtTimestampDesc = 'farm_createdAtTimestamp_DESC',
  FarmIdAsc = 'farm_id_ASC',
  FarmIdDesc = 'farm_id_DESC',
  FarmLiquidityStakedAsc = 'farm_liquidityStaked_ASC',
  FarmLiquidityStakedDesc = 'farm_liquidityStaked_DESC',
  FarmPidAsc = 'farm_pid_ASC',
  FarmPidDesc = 'farm_pid_DESC',
  FarmRewardUsdPerDayAsc = 'farm_rewardUSDPerDay_ASC',
  FarmRewardUsdPerDayDesc = 'farm_rewardUSDPerDay_DESC',
  FarmStakeAprAsc = 'farm_stakeApr_ASC',
  FarmStakeAprDesc = 'farm_stakeApr_DESC',
  FarmStakeTokenAsc = 'farm_stakeToken_ASC',
  FarmStakeTokenDesc = 'farm_stakeToken_DESC',
  FarmStakedUsdAsc = 'farm_stakedUSD_ASC',
  FarmStakedUsdDesc = 'farm_stakedUSD_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  RewardPerDayAsc = 'rewardPerDay_ASC',
  RewardPerDayDesc = 'rewardPerDay_DESC',
  RewardTokenDecimalsAsc = 'rewardToken_decimals_ASC',
  RewardTokenDecimalsDesc = 'rewardToken_decimals_DESC',
  RewardTokenDerivedEthAsc = 'rewardToken_derivedETH_ASC',
  RewardTokenDerivedEthDesc = 'rewardToken_derivedETH_DESC',
  RewardTokenIdAsc = 'rewardToken_id_ASC',
  RewardTokenIdDesc = 'rewardToken_id_DESC',
  RewardTokenNameAsc = 'rewardToken_name_ASC',
  RewardTokenNameDesc = 'rewardToken_name_DESC',
  RewardTokenSymbolAsc = 'rewardToken_symbol_ASC',
  RewardTokenSymbolDesc = 'rewardToken_symbol_DESC',
  RewardTokenTotalLiquidityAsc = 'rewardToken_totalLiquidity_ASC',
  RewardTokenTotalLiquidityDesc = 'rewardToken_totalLiquidity_DESC',
  RewardTokenTotalSupplyAsc = 'rewardToken_totalSupply_ASC',
  RewardTokenTotalSupplyDesc = 'rewardToken_totalSupply_DESC',
  RewardTokenTradeVolumeUsdAsc = 'rewardToken_tradeVolumeUSD_ASC',
  RewardTokenTradeVolumeUsdDesc = 'rewardToken_tradeVolumeUSD_DESC',
  RewardTokenTradeVolumeAsc = 'rewardToken_tradeVolume_ASC',
  RewardTokenTradeVolumeDesc = 'rewardToken_tradeVolume_DESC',
  RewardTokenTxCountAsc = 'rewardToken_txCount_ASC',
  RewardTokenTxCountDesc = 'rewardToken_txCount_DESC',
  RewardTokenUntrackedVolumeUsdAsc = 'rewardToken_untrackedVolumeUSD_ASC',
  RewardTokenUntrackedVolumeUsdDesc = 'rewardToken_untrackedVolumeUSD_DESC'
}

export type IncentiveWhereInput = {
  AND?: InputMaybe<Array<IncentiveWhereInput>>;
  OR?: InputMaybe<Array<IncentiveWhereInput>>;
  farm?: InputMaybe<FarmWhereInput>;
  farm_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  rewardPerDay_contains?: InputMaybe<Scalars['String']['input']>;
  rewardPerDay_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  rewardPerDay_endsWith?: InputMaybe<Scalars['String']['input']>;
  rewardPerDay_eq?: InputMaybe<Scalars['String']['input']>;
  rewardPerDay_gt?: InputMaybe<Scalars['String']['input']>;
  rewardPerDay_gte?: InputMaybe<Scalars['String']['input']>;
  rewardPerDay_in?: InputMaybe<Array<Scalars['String']['input']>>;
  rewardPerDay_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  rewardPerDay_lt?: InputMaybe<Scalars['String']['input']>;
  rewardPerDay_lte?: InputMaybe<Scalars['String']['input']>;
  rewardPerDay_not_contains?: InputMaybe<Scalars['String']['input']>;
  rewardPerDay_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  rewardPerDay_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  rewardPerDay_not_eq?: InputMaybe<Scalars['String']['input']>;
  rewardPerDay_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  rewardPerDay_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  rewardPerDay_startsWith?: InputMaybe<Scalars['String']['input']>;
  rewardToken?: InputMaybe<TokenWhereInput>;
  rewardToken_isNull?: InputMaybe<Scalars['Boolean']['input']>;
};

export type IncentivesConnection = {
  __typename?: 'IncentivesConnection';
  edges: Array<IncentiveEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type LiquidityPosition = {
  __typename?: 'LiquidityPosition';
  id: Scalars['String']['output'];
  /** BigDecimal */
  liquidityTokenBalance: Scalars['String']['output'];
  pair: Pair;
  user: User;
};

export type LiquidityPositionEdge = {
  __typename?: 'LiquidityPositionEdge';
  cursor: Scalars['String']['output'];
  node: LiquidityPosition;
};

export enum LiquidityPositionOrderByInput {
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  LiquidityTokenBalanceAsc = 'liquidityTokenBalance_ASC',
  LiquidityTokenBalanceDesc = 'liquidityTokenBalance_DESC',
  PairCreatedAtBlockNumberAsc = 'pair_createdAtBlockNumber_ASC',
  PairCreatedAtBlockNumberDesc = 'pair_createdAtBlockNumber_DESC',
  PairCreatedAtTimestampAsc = 'pair_createdAtTimestamp_ASC',
  PairCreatedAtTimestampDesc = 'pair_createdAtTimestamp_DESC',
  PairIdAsc = 'pair_id_ASC',
  PairIdDesc = 'pair_id_DESC',
  PairLiquidityProviderCountAsc = 'pair_liquidityProviderCount_ASC',
  PairLiquidityProviderCountDesc = 'pair_liquidityProviderCount_DESC',
  PairReserve0Asc = 'pair_reserve0_ASC',
  PairReserve0Desc = 'pair_reserve0_DESC',
  PairReserve1Asc = 'pair_reserve1_ASC',
  PairReserve1Desc = 'pair_reserve1_DESC',
  PairReserveEthAsc = 'pair_reserveETH_ASC',
  PairReserveEthDesc = 'pair_reserveETH_DESC',
  PairReserveUsdAsc = 'pair_reserveUSD_ASC',
  PairReserveUsdDesc = 'pair_reserveUSD_DESC',
  PairToken0PriceAsc = 'pair_token0Price_ASC',
  PairToken0PriceDesc = 'pair_token0Price_DESC',
  PairToken1PriceAsc = 'pair_token1Price_ASC',
  PairToken1PriceDesc = 'pair_token1Price_DESC',
  PairTotalSupplyAsc = 'pair_totalSupply_ASC',
  PairTotalSupplyDesc = 'pair_totalSupply_DESC',
  PairTrackedReserveEthAsc = 'pair_trackedReserveETH_ASC',
  PairTrackedReserveEthDesc = 'pair_trackedReserveETH_DESC',
  PairTxCountAsc = 'pair_txCount_ASC',
  PairTxCountDesc = 'pair_txCount_DESC',
  PairUntrackedVolumeUsdAsc = 'pair_untrackedVolumeUSD_ASC',
  PairUntrackedVolumeUsdDesc = 'pair_untrackedVolumeUSD_DESC',
  PairVolumeToken0Asc = 'pair_volumeToken0_ASC',
  PairVolumeToken0Desc = 'pair_volumeToken0_DESC',
  PairVolumeToken1Asc = 'pair_volumeToken1_ASC',
  PairVolumeToken1Desc = 'pair_volumeToken1_DESC',
  PairVolumeUsdAsc = 'pair_volumeUSD_ASC',
  PairVolumeUsdDesc = 'pair_volumeUSD_DESC',
  UserIdAsc = 'user_id_ASC',
  UserIdDesc = 'user_id_DESC',
  UserUsdSwappedAsc = 'user_usdSwapped_ASC',
  UserUsdSwappedDesc = 'user_usdSwapped_DESC'
}

export type LiquidityPositionSnapshot = {
  __typename?: 'LiquidityPositionSnapshot';
  block: Scalars['Int']['output'];
  id: Scalars['String']['output'];
  liquidityPosition: LiquidityPosition;
  /** BigDecimal */
  liquidityTokenBalance: Scalars['String']['output'];
  /** BigDecimal */
  liquidityTokenTotalSupply: Scalars['String']['output'];
  pair: Pair;
  /** BigDecimal */
  reserve0: Scalars['String']['output'];
  /** BigDecimal */
  reserve1: Scalars['String']['output'];
  /** BigDecimal */
  reserveUSD: Scalars['String']['output'];
  timestamp: Scalars['DateTime']['output'];
  /** BigDecimal */
  token0PriceUSD: Scalars['String']['output'];
  /** BigDecimal */
  token1PriceUSD: Scalars['String']['output'];
  user: User;
};

export type LiquidityPositionSnapshotEdge = {
  __typename?: 'LiquidityPositionSnapshotEdge';
  cursor: Scalars['String']['output'];
  node: LiquidityPositionSnapshot;
};

export enum LiquidityPositionSnapshotOrderByInput {
  BlockAsc = 'block_ASC',
  BlockDesc = 'block_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  LiquidityPositionIdAsc = 'liquidityPosition_id_ASC',
  LiquidityPositionIdDesc = 'liquidityPosition_id_DESC',
  LiquidityPositionLiquidityTokenBalanceAsc = 'liquidityPosition_liquidityTokenBalance_ASC',
  LiquidityPositionLiquidityTokenBalanceDesc = 'liquidityPosition_liquidityTokenBalance_DESC',
  LiquidityTokenBalanceAsc = 'liquidityTokenBalance_ASC',
  LiquidityTokenBalanceDesc = 'liquidityTokenBalance_DESC',
  LiquidityTokenTotalSupplyAsc = 'liquidityTokenTotalSupply_ASC',
  LiquidityTokenTotalSupplyDesc = 'liquidityTokenTotalSupply_DESC',
  PairCreatedAtBlockNumberAsc = 'pair_createdAtBlockNumber_ASC',
  PairCreatedAtBlockNumberDesc = 'pair_createdAtBlockNumber_DESC',
  PairCreatedAtTimestampAsc = 'pair_createdAtTimestamp_ASC',
  PairCreatedAtTimestampDesc = 'pair_createdAtTimestamp_DESC',
  PairIdAsc = 'pair_id_ASC',
  PairIdDesc = 'pair_id_DESC',
  PairLiquidityProviderCountAsc = 'pair_liquidityProviderCount_ASC',
  PairLiquidityProviderCountDesc = 'pair_liquidityProviderCount_DESC',
  PairReserve0Asc = 'pair_reserve0_ASC',
  PairReserve0Desc = 'pair_reserve0_DESC',
  PairReserve1Asc = 'pair_reserve1_ASC',
  PairReserve1Desc = 'pair_reserve1_DESC',
  PairReserveEthAsc = 'pair_reserveETH_ASC',
  PairReserveEthDesc = 'pair_reserveETH_DESC',
  PairReserveUsdAsc = 'pair_reserveUSD_ASC',
  PairReserveUsdDesc = 'pair_reserveUSD_DESC',
  PairToken0PriceAsc = 'pair_token0Price_ASC',
  PairToken0PriceDesc = 'pair_token0Price_DESC',
  PairToken1PriceAsc = 'pair_token1Price_ASC',
  PairToken1PriceDesc = 'pair_token1Price_DESC',
  PairTotalSupplyAsc = 'pair_totalSupply_ASC',
  PairTotalSupplyDesc = 'pair_totalSupply_DESC',
  PairTrackedReserveEthAsc = 'pair_trackedReserveETH_ASC',
  PairTrackedReserveEthDesc = 'pair_trackedReserveETH_DESC',
  PairTxCountAsc = 'pair_txCount_ASC',
  PairTxCountDesc = 'pair_txCount_DESC',
  PairUntrackedVolumeUsdAsc = 'pair_untrackedVolumeUSD_ASC',
  PairUntrackedVolumeUsdDesc = 'pair_untrackedVolumeUSD_DESC',
  PairVolumeToken0Asc = 'pair_volumeToken0_ASC',
  PairVolumeToken0Desc = 'pair_volumeToken0_DESC',
  PairVolumeToken1Asc = 'pair_volumeToken1_ASC',
  PairVolumeToken1Desc = 'pair_volumeToken1_DESC',
  PairVolumeUsdAsc = 'pair_volumeUSD_ASC',
  PairVolumeUsdDesc = 'pair_volumeUSD_DESC',
  Reserve0Asc = 'reserve0_ASC',
  Reserve0Desc = 'reserve0_DESC',
  Reserve1Asc = 'reserve1_ASC',
  Reserve1Desc = 'reserve1_DESC',
  ReserveUsdAsc = 'reserveUSD_ASC',
  ReserveUsdDesc = 'reserveUSD_DESC',
  TimestampAsc = 'timestamp_ASC',
  TimestampDesc = 'timestamp_DESC',
  Token0PriceUsdAsc = 'token0PriceUSD_ASC',
  Token0PriceUsdDesc = 'token0PriceUSD_DESC',
  Token1PriceUsdAsc = 'token1PriceUSD_ASC',
  Token1PriceUsdDesc = 'token1PriceUSD_DESC',
  UserIdAsc = 'user_id_ASC',
  UserIdDesc = 'user_id_DESC',
  UserUsdSwappedAsc = 'user_usdSwapped_ASC',
  UserUsdSwappedDesc = 'user_usdSwapped_DESC'
}

export type LiquidityPositionSnapshotWhereInput = {
  AND?: InputMaybe<Array<LiquidityPositionSnapshotWhereInput>>;
  OR?: InputMaybe<Array<LiquidityPositionSnapshotWhereInput>>;
  block_eq?: InputMaybe<Scalars['Int']['input']>;
  block_gt?: InputMaybe<Scalars['Int']['input']>;
  block_gte?: InputMaybe<Scalars['Int']['input']>;
  block_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  block_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  block_lt?: InputMaybe<Scalars['Int']['input']>;
  block_lte?: InputMaybe<Scalars['Int']['input']>;
  block_not_eq?: InputMaybe<Scalars['Int']['input']>;
  block_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  liquidityPosition?: InputMaybe<LiquidityPositionWhereInput>;
  liquidityPosition_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  liquidityTokenBalance_contains?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_endsWith?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_eq?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_gt?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_gte?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_in?: InputMaybe<Array<Scalars['String']['input']>>;
  liquidityTokenBalance_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  liquidityTokenBalance_lt?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_lte?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_not_contains?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_not_eq?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  liquidityTokenBalance_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_startsWith?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenTotalSupply_contains?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenTotalSupply_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenTotalSupply_endsWith?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenTotalSupply_eq?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenTotalSupply_gt?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenTotalSupply_gte?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenTotalSupply_in?: InputMaybe<Array<Scalars['String']['input']>>;
  liquidityTokenTotalSupply_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  liquidityTokenTotalSupply_lt?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenTotalSupply_lte?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenTotalSupply_not_contains?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenTotalSupply_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenTotalSupply_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenTotalSupply_not_eq?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenTotalSupply_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  liquidityTokenTotalSupply_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenTotalSupply_startsWith?: InputMaybe<Scalars['String']['input']>;
  pair?: InputMaybe<PairWhereInput>;
  pair_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  reserve0_contains?: InputMaybe<Scalars['String']['input']>;
  reserve0_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserve0_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserve0_eq?: InputMaybe<Scalars['String']['input']>;
  reserve0_gt?: InputMaybe<Scalars['String']['input']>;
  reserve0_gte?: InputMaybe<Scalars['String']['input']>;
  reserve0_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserve0_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  reserve0_lt?: InputMaybe<Scalars['String']['input']>;
  reserve0_lte?: InputMaybe<Scalars['String']['input']>;
  reserve0_not_contains?: InputMaybe<Scalars['String']['input']>;
  reserve0_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserve0_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserve0_not_eq?: InputMaybe<Scalars['String']['input']>;
  reserve0_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserve0_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  reserve0_startsWith?: InputMaybe<Scalars['String']['input']>;
  reserve1_contains?: InputMaybe<Scalars['String']['input']>;
  reserve1_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserve1_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserve1_eq?: InputMaybe<Scalars['String']['input']>;
  reserve1_gt?: InputMaybe<Scalars['String']['input']>;
  reserve1_gte?: InputMaybe<Scalars['String']['input']>;
  reserve1_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserve1_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  reserve1_lt?: InputMaybe<Scalars['String']['input']>;
  reserve1_lte?: InputMaybe<Scalars['String']['input']>;
  reserve1_not_contains?: InputMaybe<Scalars['String']['input']>;
  reserve1_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserve1_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserve1_not_eq?: InputMaybe<Scalars['String']['input']>;
  reserve1_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserve1_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  reserve1_startsWith?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_contains?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_eq?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_gt?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_gte?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserveUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  reserveUSD_lt?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_lte?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserveUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  timestamp_eq?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_gt?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_gte?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  timestamp_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  timestamp_lt?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_lte?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_not_eq?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_not_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  token0PriceUSD_contains?: InputMaybe<Scalars['String']['input']>;
  token0PriceUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  token0PriceUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  token0PriceUSD_eq?: InputMaybe<Scalars['String']['input']>;
  token0PriceUSD_gt?: InputMaybe<Scalars['String']['input']>;
  token0PriceUSD_gte?: InputMaybe<Scalars['String']['input']>;
  token0PriceUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  token0PriceUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  token0PriceUSD_lt?: InputMaybe<Scalars['String']['input']>;
  token0PriceUSD_lte?: InputMaybe<Scalars['String']['input']>;
  token0PriceUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  token0PriceUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  token0PriceUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  token0PriceUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  token0PriceUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  token0PriceUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  token0PriceUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  token1PriceUSD_contains?: InputMaybe<Scalars['String']['input']>;
  token1PriceUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  token1PriceUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  token1PriceUSD_eq?: InputMaybe<Scalars['String']['input']>;
  token1PriceUSD_gt?: InputMaybe<Scalars['String']['input']>;
  token1PriceUSD_gte?: InputMaybe<Scalars['String']['input']>;
  token1PriceUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  token1PriceUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  token1PriceUSD_lt?: InputMaybe<Scalars['String']['input']>;
  token1PriceUSD_lte?: InputMaybe<Scalars['String']['input']>;
  token1PriceUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  token1PriceUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  token1PriceUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  token1PriceUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  token1PriceUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  token1PriceUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  token1PriceUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  user?: InputMaybe<UserWhereInput>;
  user_isNull?: InputMaybe<Scalars['Boolean']['input']>;
};

export type LiquidityPositionSnapshotsConnection = {
  __typename?: 'LiquidityPositionSnapshotsConnection';
  edges: Array<LiquidityPositionSnapshotEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type LiquidityPositionWhereInput = {
  AND?: InputMaybe<Array<LiquidityPositionWhereInput>>;
  OR?: InputMaybe<Array<LiquidityPositionWhereInput>>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_contains?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_endsWith?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_eq?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_gt?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_gte?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_in?: InputMaybe<Array<Scalars['String']['input']>>;
  liquidityTokenBalance_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  liquidityTokenBalance_lt?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_lte?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_not_contains?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_not_eq?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  liquidityTokenBalance_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_startsWith?: InputMaybe<Scalars['String']['input']>;
  pair?: InputMaybe<PairWhereInput>;
  pair_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  user?: InputMaybe<UserWhereInput>;
  user_isNull?: InputMaybe<Scalars['Boolean']['input']>;
};

export type LiquidityPositionsConnection = {
  __typename?: 'LiquidityPositionsConnection';
  edges: Array<LiquidityPositionEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type Mint = {
  __typename?: 'Mint';
  amount0?: Maybe<Scalars['String']['output']>;
  amount1?: Maybe<Scalars['String']['output']>;
  amountUSD?: Maybe<Scalars['String']['output']>;
  feeLiquidity?: Maybe<Scalars['String']['output']>;
  feeTo?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  liquidity: Scalars['String']['output'];
  logIndex?: Maybe<Scalars['Int']['output']>;
  pair: Pair;
  sender?: Maybe<Scalars['String']['output']>;
  timestamp: Scalars['DateTime']['output'];
  to: Scalars['String']['output'];
  transaction: Transaction;
};

export type MintEdge = {
  __typename?: 'MintEdge';
  cursor: Scalars['String']['output'];
  node: Mint;
};

export enum MintOrderByInput {
  Amount0Asc = 'amount0_ASC',
  Amount0Desc = 'amount0_DESC',
  Amount1Asc = 'amount1_ASC',
  Amount1Desc = 'amount1_DESC',
  AmountUsdAsc = 'amountUSD_ASC',
  AmountUsdDesc = 'amountUSD_DESC',
  FeeLiquidityAsc = 'feeLiquidity_ASC',
  FeeLiquidityDesc = 'feeLiquidity_DESC',
  FeeToAsc = 'feeTo_ASC',
  FeeToDesc = 'feeTo_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  LiquidityAsc = 'liquidity_ASC',
  LiquidityDesc = 'liquidity_DESC',
  LogIndexAsc = 'logIndex_ASC',
  LogIndexDesc = 'logIndex_DESC',
  PairCreatedAtBlockNumberAsc = 'pair_createdAtBlockNumber_ASC',
  PairCreatedAtBlockNumberDesc = 'pair_createdAtBlockNumber_DESC',
  PairCreatedAtTimestampAsc = 'pair_createdAtTimestamp_ASC',
  PairCreatedAtTimestampDesc = 'pair_createdAtTimestamp_DESC',
  PairIdAsc = 'pair_id_ASC',
  PairIdDesc = 'pair_id_DESC',
  PairLiquidityProviderCountAsc = 'pair_liquidityProviderCount_ASC',
  PairLiquidityProviderCountDesc = 'pair_liquidityProviderCount_DESC',
  PairReserve0Asc = 'pair_reserve0_ASC',
  PairReserve0Desc = 'pair_reserve0_DESC',
  PairReserve1Asc = 'pair_reserve1_ASC',
  PairReserve1Desc = 'pair_reserve1_DESC',
  PairReserveEthAsc = 'pair_reserveETH_ASC',
  PairReserveEthDesc = 'pair_reserveETH_DESC',
  PairReserveUsdAsc = 'pair_reserveUSD_ASC',
  PairReserveUsdDesc = 'pair_reserveUSD_DESC',
  PairToken0PriceAsc = 'pair_token0Price_ASC',
  PairToken0PriceDesc = 'pair_token0Price_DESC',
  PairToken1PriceAsc = 'pair_token1Price_ASC',
  PairToken1PriceDesc = 'pair_token1Price_DESC',
  PairTotalSupplyAsc = 'pair_totalSupply_ASC',
  PairTotalSupplyDesc = 'pair_totalSupply_DESC',
  PairTrackedReserveEthAsc = 'pair_trackedReserveETH_ASC',
  PairTrackedReserveEthDesc = 'pair_trackedReserveETH_DESC',
  PairTxCountAsc = 'pair_txCount_ASC',
  PairTxCountDesc = 'pair_txCount_DESC',
  PairUntrackedVolumeUsdAsc = 'pair_untrackedVolumeUSD_ASC',
  PairUntrackedVolumeUsdDesc = 'pair_untrackedVolumeUSD_DESC',
  PairVolumeToken0Asc = 'pair_volumeToken0_ASC',
  PairVolumeToken0Desc = 'pair_volumeToken0_DESC',
  PairVolumeToken1Asc = 'pair_volumeToken1_ASC',
  PairVolumeToken1Desc = 'pair_volumeToken1_DESC',
  PairVolumeUsdAsc = 'pair_volumeUSD_ASC',
  PairVolumeUsdDesc = 'pair_volumeUSD_DESC',
  SenderAsc = 'sender_ASC',
  SenderDesc = 'sender_DESC',
  TimestampAsc = 'timestamp_ASC',
  TimestampDesc = 'timestamp_DESC',
  ToAsc = 'to_ASC',
  ToDesc = 'to_DESC',
  TransactionBlockNumberAsc = 'transaction_blockNumber_ASC',
  TransactionBlockNumberDesc = 'transaction_blockNumber_DESC',
  TransactionIdAsc = 'transaction_id_ASC',
  TransactionIdDesc = 'transaction_id_DESC',
  TransactionTimestampAsc = 'transaction_timestamp_ASC',
  TransactionTimestampDesc = 'transaction_timestamp_DESC'
}

export type MintWhereInput = {
  AND?: InputMaybe<Array<MintWhereInput>>;
  OR?: InputMaybe<Array<MintWhereInput>>;
  amount0_contains?: InputMaybe<Scalars['String']['input']>;
  amount0_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  amount0_endsWith?: InputMaybe<Scalars['String']['input']>;
  amount0_eq?: InputMaybe<Scalars['String']['input']>;
  amount0_gt?: InputMaybe<Scalars['String']['input']>;
  amount0_gte?: InputMaybe<Scalars['String']['input']>;
  amount0_in?: InputMaybe<Array<Scalars['String']['input']>>;
  amount0_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  amount0_lt?: InputMaybe<Scalars['String']['input']>;
  amount0_lte?: InputMaybe<Scalars['String']['input']>;
  amount0_not_contains?: InputMaybe<Scalars['String']['input']>;
  amount0_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  amount0_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  amount0_not_eq?: InputMaybe<Scalars['String']['input']>;
  amount0_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  amount0_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  amount0_startsWith?: InputMaybe<Scalars['String']['input']>;
  amount1_contains?: InputMaybe<Scalars['String']['input']>;
  amount1_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  amount1_endsWith?: InputMaybe<Scalars['String']['input']>;
  amount1_eq?: InputMaybe<Scalars['String']['input']>;
  amount1_gt?: InputMaybe<Scalars['String']['input']>;
  amount1_gte?: InputMaybe<Scalars['String']['input']>;
  amount1_in?: InputMaybe<Array<Scalars['String']['input']>>;
  amount1_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  amount1_lt?: InputMaybe<Scalars['String']['input']>;
  amount1_lte?: InputMaybe<Scalars['String']['input']>;
  amount1_not_contains?: InputMaybe<Scalars['String']['input']>;
  amount1_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  amount1_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  amount1_not_eq?: InputMaybe<Scalars['String']['input']>;
  amount1_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  amount1_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  amount1_startsWith?: InputMaybe<Scalars['String']['input']>;
  amountUSD_contains?: InputMaybe<Scalars['String']['input']>;
  amountUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  amountUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  amountUSD_eq?: InputMaybe<Scalars['String']['input']>;
  amountUSD_gt?: InputMaybe<Scalars['String']['input']>;
  amountUSD_gte?: InputMaybe<Scalars['String']['input']>;
  amountUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  amountUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  amountUSD_lt?: InputMaybe<Scalars['String']['input']>;
  amountUSD_lte?: InputMaybe<Scalars['String']['input']>;
  amountUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  amountUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  amountUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  amountUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  amountUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  amountUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  amountUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_contains?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_endsWith?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_eq?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_gt?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_gte?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_in?: InputMaybe<Array<Scalars['String']['input']>>;
  feeLiquidity_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  feeLiquidity_lt?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_lte?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_not_contains?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_not_eq?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  feeLiquidity_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  feeLiquidity_startsWith?: InputMaybe<Scalars['String']['input']>;
  feeTo_contains?: InputMaybe<Scalars['String']['input']>;
  feeTo_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  feeTo_endsWith?: InputMaybe<Scalars['String']['input']>;
  feeTo_eq?: InputMaybe<Scalars['String']['input']>;
  feeTo_gt?: InputMaybe<Scalars['String']['input']>;
  feeTo_gte?: InputMaybe<Scalars['String']['input']>;
  feeTo_in?: InputMaybe<Array<Scalars['String']['input']>>;
  feeTo_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  feeTo_lt?: InputMaybe<Scalars['String']['input']>;
  feeTo_lte?: InputMaybe<Scalars['String']['input']>;
  feeTo_not_contains?: InputMaybe<Scalars['String']['input']>;
  feeTo_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  feeTo_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  feeTo_not_eq?: InputMaybe<Scalars['String']['input']>;
  feeTo_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  feeTo_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  feeTo_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  liquidity_contains?: InputMaybe<Scalars['String']['input']>;
  liquidity_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  liquidity_endsWith?: InputMaybe<Scalars['String']['input']>;
  liquidity_eq?: InputMaybe<Scalars['String']['input']>;
  liquidity_gt?: InputMaybe<Scalars['String']['input']>;
  liquidity_gte?: InputMaybe<Scalars['String']['input']>;
  liquidity_in?: InputMaybe<Array<Scalars['String']['input']>>;
  liquidity_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  liquidity_lt?: InputMaybe<Scalars['String']['input']>;
  liquidity_lte?: InputMaybe<Scalars['String']['input']>;
  liquidity_not_contains?: InputMaybe<Scalars['String']['input']>;
  liquidity_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  liquidity_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  liquidity_not_eq?: InputMaybe<Scalars['String']['input']>;
  liquidity_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  liquidity_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  liquidity_startsWith?: InputMaybe<Scalars['String']['input']>;
  logIndex_eq?: InputMaybe<Scalars['Int']['input']>;
  logIndex_gt?: InputMaybe<Scalars['Int']['input']>;
  logIndex_gte?: InputMaybe<Scalars['Int']['input']>;
  logIndex_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  logIndex_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  logIndex_lt?: InputMaybe<Scalars['Int']['input']>;
  logIndex_lte?: InputMaybe<Scalars['Int']['input']>;
  logIndex_not_eq?: InputMaybe<Scalars['Int']['input']>;
  logIndex_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  pair?: InputMaybe<PairWhereInput>;
  pair_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  sender_contains?: InputMaybe<Scalars['String']['input']>;
  sender_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  sender_endsWith?: InputMaybe<Scalars['String']['input']>;
  sender_eq?: InputMaybe<Scalars['String']['input']>;
  sender_gt?: InputMaybe<Scalars['String']['input']>;
  sender_gte?: InputMaybe<Scalars['String']['input']>;
  sender_in?: InputMaybe<Array<Scalars['String']['input']>>;
  sender_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  sender_lt?: InputMaybe<Scalars['String']['input']>;
  sender_lte?: InputMaybe<Scalars['String']['input']>;
  sender_not_contains?: InputMaybe<Scalars['String']['input']>;
  sender_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  sender_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  sender_not_eq?: InputMaybe<Scalars['String']['input']>;
  sender_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  sender_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  sender_startsWith?: InputMaybe<Scalars['String']['input']>;
  timestamp_eq?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_gt?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_gte?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  timestamp_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  timestamp_lt?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_lte?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_not_eq?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_not_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  to_contains?: InputMaybe<Scalars['String']['input']>;
  to_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  to_endsWith?: InputMaybe<Scalars['String']['input']>;
  to_eq?: InputMaybe<Scalars['String']['input']>;
  to_gt?: InputMaybe<Scalars['String']['input']>;
  to_gte?: InputMaybe<Scalars['String']['input']>;
  to_in?: InputMaybe<Array<Scalars['String']['input']>>;
  to_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  to_lt?: InputMaybe<Scalars['String']['input']>;
  to_lte?: InputMaybe<Scalars['String']['input']>;
  to_not_contains?: InputMaybe<Scalars['String']['input']>;
  to_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  to_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  to_not_eq?: InputMaybe<Scalars['String']['input']>;
  to_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  to_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  to_startsWith?: InputMaybe<Scalars['String']['input']>;
  transaction?: InputMaybe<TransactionWhereInput>;
  transaction_isNull?: InputMaybe<Scalars['Boolean']['input']>;
};

export type MintsConnection = {
  __typename?: 'MintsConnection';
  edges: Array<MintEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type NablaToken = {
  __typename?: 'NablaToken';
  decimals: Scalars['Int']['output'];
  id: Scalars['String']['output'];
  name: Scalars['String']['output'];
  symbol: Scalars['String']['output'];
};

export type NablaTokenEdge = {
  __typename?: 'NablaTokenEdge';
  cursor: Scalars['String']['output'];
  node: NablaToken;
};

export enum NablaTokenOrderByInput {
  DecimalsAsc = 'decimals_ASC',
  DecimalsDesc = 'decimals_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  NameAsc = 'name_ASC',
  NameDesc = 'name_DESC',
  SymbolAsc = 'symbol_ASC',
  SymbolDesc = 'symbol_DESC'
}

export type NablaTokenWhereInput = {
  AND?: InputMaybe<Array<NablaTokenWhereInput>>;
  OR?: InputMaybe<Array<NablaTokenWhereInput>>;
  decimals_eq?: InputMaybe<Scalars['Int']['input']>;
  decimals_gt?: InputMaybe<Scalars['Int']['input']>;
  decimals_gte?: InputMaybe<Scalars['Int']['input']>;
  decimals_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  decimals_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  decimals_lt?: InputMaybe<Scalars['Int']['input']>;
  decimals_lte?: InputMaybe<Scalars['Int']['input']>;
  decimals_not_eq?: InputMaybe<Scalars['Int']['input']>;
  decimals_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  name_contains?: InputMaybe<Scalars['String']['input']>;
  name_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  name_endsWith?: InputMaybe<Scalars['String']['input']>;
  name_eq?: InputMaybe<Scalars['String']['input']>;
  name_gt?: InputMaybe<Scalars['String']['input']>;
  name_gte?: InputMaybe<Scalars['String']['input']>;
  name_in?: InputMaybe<Array<Scalars['String']['input']>>;
  name_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  name_lt?: InputMaybe<Scalars['String']['input']>;
  name_lte?: InputMaybe<Scalars['String']['input']>;
  name_not_contains?: InputMaybe<Scalars['String']['input']>;
  name_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  name_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  name_not_eq?: InputMaybe<Scalars['String']['input']>;
  name_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  name_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  name_startsWith?: InputMaybe<Scalars['String']['input']>;
  symbol_contains?: InputMaybe<Scalars['String']['input']>;
  symbol_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  symbol_endsWith?: InputMaybe<Scalars['String']['input']>;
  symbol_eq?: InputMaybe<Scalars['String']['input']>;
  symbol_gt?: InputMaybe<Scalars['String']['input']>;
  symbol_gte?: InputMaybe<Scalars['String']['input']>;
  symbol_in?: InputMaybe<Array<Scalars['String']['input']>>;
  symbol_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  symbol_lt?: InputMaybe<Scalars['String']['input']>;
  symbol_lte?: InputMaybe<Scalars['String']['input']>;
  symbol_not_contains?: InputMaybe<Scalars['String']['input']>;
  symbol_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  symbol_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  symbol_not_eq?: InputMaybe<Scalars['String']['input']>;
  symbol_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  symbol_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  symbol_startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type NablaTokensConnection = {
  __typename?: 'NablaTokensConnection';
  edges: Array<NablaTokenEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type OraclePrice = {
  __typename?: 'OraclePrice';
  blockchain: Scalars['String']['output'];
  id: Scalars['String']['output'];
  name: Scalars['String']['output'];
  /** BigDecimal */
  price: Scalars['String']['output'];
  /** BigDecimal */
  supply: Scalars['String']['output'];
  symbol: Scalars['String']['output'];
  timestamp: Scalars['BigInt']['output'];
};

export type OraclePriceEdge = {
  __typename?: 'OraclePriceEdge';
  cursor: Scalars['String']['output'];
  node: OraclePrice;
};

export enum OraclePriceOrderByInput {
  BlockchainAsc = 'blockchain_ASC',
  BlockchainDesc = 'blockchain_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  NameAsc = 'name_ASC',
  NameDesc = 'name_DESC',
  PriceAsc = 'price_ASC',
  PriceDesc = 'price_DESC',
  SupplyAsc = 'supply_ASC',
  SupplyDesc = 'supply_DESC',
  SymbolAsc = 'symbol_ASC',
  SymbolDesc = 'symbol_DESC',
  TimestampAsc = 'timestamp_ASC',
  TimestampDesc = 'timestamp_DESC'
}

export type OraclePriceWhereInput = {
  AND?: InputMaybe<Array<OraclePriceWhereInput>>;
  OR?: InputMaybe<Array<OraclePriceWhereInput>>;
  blockchain_contains?: InputMaybe<Scalars['String']['input']>;
  blockchain_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  blockchain_endsWith?: InputMaybe<Scalars['String']['input']>;
  blockchain_eq?: InputMaybe<Scalars['String']['input']>;
  blockchain_gt?: InputMaybe<Scalars['String']['input']>;
  blockchain_gte?: InputMaybe<Scalars['String']['input']>;
  blockchain_in?: InputMaybe<Array<Scalars['String']['input']>>;
  blockchain_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  blockchain_lt?: InputMaybe<Scalars['String']['input']>;
  blockchain_lte?: InputMaybe<Scalars['String']['input']>;
  blockchain_not_contains?: InputMaybe<Scalars['String']['input']>;
  blockchain_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  blockchain_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  blockchain_not_eq?: InputMaybe<Scalars['String']['input']>;
  blockchain_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  blockchain_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  blockchain_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  name_contains?: InputMaybe<Scalars['String']['input']>;
  name_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  name_endsWith?: InputMaybe<Scalars['String']['input']>;
  name_eq?: InputMaybe<Scalars['String']['input']>;
  name_gt?: InputMaybe<Scalars['String']['input']>;
  name_gte?: InputMaybe<Scalars['String']['input']>;
  name_in?: InputMaybe<Array<Scalars['String']['input']>>;
  name_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  name_lt?: InputMaybe<Scalars['String']['input']>;
  name_lte?: InputMaybe<Scalars['String']['input']>;
  name_not_contains?: InputMaybe<Scalars['String']['input']>;
  name_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  name_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  name_not_eq?: InputMaybe<Scalars['String']['input']>;
  name_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  name_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  name_startsWith?: InputMaybe<Scalars['String']['input']>;
  price_contains?: InputMaybe<Scalars['String']['input']>;
  price_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  price_endsWith?: InputMaybe<Scalars['String']['input']>;
  price_eq?: InputMaybe<Scalars['String']['input']>;
  price_gt?: InputMaybe<Scalars['String']['input']>;
  price_gte?: InputMaybe<Scalars['String']['input']>;
  price_in?: InputMaybe<Array<Scalars['String']['input']>>;
  price_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  price_lt?: InputMaybe<Scalars['String']['input']>;
  price_lte?: InputMaybe<Scalars['String']['input']>;
  price_not_contains?: InputMaybe<Scalars['String']['input']>;
  price_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  price_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  price_not_eq?: InputMaybe<Scalars['String']['input']>;
  price_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  price_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  price_startsWith?: InputMaybe<Scalars['String']['input']>;
  supply_contains?: InputMaybe<Scalars['String']['input']>;
  supply_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  supply_endsWith?: InputMaybe<Scalars['String']['input']>;
  supply_eq?: InputMaybe<Scalars['String']['input']>;
  supply_gt?: InputMaybe<Scalars['String']['input']>;
  supply_gte?: InputMaybe<Scalars['String']['input']>;
  supply_in?: InputMaybe<Array<Scalars['String']['input']>>;
  supply_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  supply_lt?: InputMaybe<Scalars['String']['input']>;
  supply_lte?: InputMaybe<Scalars['String']['input']>;
  supply_not_contains?: InputMaybe<Scalars['String']['input']>;
  supply_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  supply_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  supply_not_eq?: InputMaybe<Scalars['String']['input']>;
  supply_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  supply_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  supply_startsWith?: InputMaybe<Scalars['String']['input']>;
  symbol_contains?: InputMaybe<Scalars['String']['input']>;
  symbol_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  symbol_endsWith?: InputMaybe<Scalars['String']['input']>;
  symbol_eq?: InputMaybe<Scalars['String']['input']>;
  symbol_gt?: InputMaybe<Scalars['String']['input']>;
  symbol_gte?: InputMaybe<Scalars['String']['input']>;
  symbol_in?: InputMaybe<Array<Scalars['String']['input']>>;
  symbol_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  symbol_lt?: InputMaybe<Scalars['String']['input']>;
  symbol_lte?: InputMaybe<Scalars['String']['input']>;
  symbol_not_contains?: InputMaybe<Scalars['String']['input']>;
  symbol_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  symbol_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  symbol_not_eq?: InputMaybe<Scalars['String']['input']>;
  symbol_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  symbol_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  symbol_startsWith?: InputMaybe<Scalars['String']['input']>;
  timestamp_eq?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  timestamp_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  timestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
};

export type OraclePricesConnection = {
  __typename?: 'OraclePricesConnection';
  edges: Array<OraclePriceEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type PageInfo = {
  __typename?: 'PageInfo';
  endCursor: Scalars['String']['output'];
  hasNextPage: Scalars['Boolean']['output'];
  hasPreviousPage: Scalars['Boolean']['output'];
  startCursor: Scalars['String']['output'];
};

export type Pair = {
  __typename?: 'Pair';
  burns: Array<Burn>;
  createdAtBlockNumber: Scalars['BigInt']['output'];
  createdAtTimestamp: Scalars['DateTime']['output'];
  farm: Array<Farm>;
  id: Scalars['String']['output'];
  liquidityPositionSnapshots: Array<LiquidityPositionSnapshot>;
  liquidityPositions: Array<LiquidityPosition>;
  /**  APR  */
  liquidityProviderCount: Scalars['Int']['output'];
  mints: Array<Mint>;
  pairDayData: Array<PairDayData>;
  pairHourData: Array<PairHourData>;
  /** BigDecimal */
  reserve0: Scalars['String']['output'];
  /** BigDecimal */
  reserve1: Scalars['String']['output'];
  /** BigDecimal */
  reserveETH: Scalars['String']['output'];
  /** BigDecimal */
  reserveUSD: Scalars['String']['output'];
  swaps: Array<Swap>;
  token0: Token;
  /** BigDecimal */
  token0Price: Scalars['String']['output'];
  token1: Token;
  /** BigDecimal */
  token1Price: Scalars['String']['output'];
  /** BigDecimal */
  totalSupply: Scalars['String']['output'];
  /** BigDecimal */
  trackedReserveETH: Scalars['String']['output'];
  txCount: Scalars['Int']['output'];
  /** BigDecimal */
  untrackedVolumeUSD: Scalars['String']['output'];
  /** BigDecimal */
  volumeToken0: Scalars['String']['output'];
  /** BigDecimal */
  volumeToken1: Scalars['String']['output'];
  /** BigDecimal */
  volumeUSD: Scalars['String']['output'];
};


export type PairBurnsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<BurnOrderByInput>>;
  where?: InputMaybe<BurnWhereInput>;
};


export type PairFarmArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<FarmOrderByInput>>;
  where?: InputMaybe<FarmWhereInput>;
};


export type PairLiquidityPositionSnapshotsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<LiquidityPositionSnapshotOrderByInput>>;
  where?: InputMaybe<LiquidityPositionSnapshotWhereInput>;
};


export type PairLiquidityPositionsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<LiquidityPositionOrderByInput>>;
  where?: InputMaybe<LiquidityPositionWhereInput>;
};


export type PairMintsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<MintOrderByInput>>;
  where?: InputMaybe<MintWhereInput>;
};


export type PairPairDayDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<PairDayDataOrderByInput>>;
  where?: InputMaybe<PairDayDataWhereInput>;
};


export type PairPairHourDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<PairHourDataOrderByInput>>;
  where?: InputMaybe<PairHourDataWhereInput>;
};


export type PairSwapsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SwapOrderByInput>>;
  where?: InputMaybe<SwapWhereInput>;
};

export type PairDayData = {
  __typename?: 'PairDayData';
  dailyTxns: Scalars['Int']['output'];
  dailyVolumeToken0: Scalars['String']['output'];
  dailyVolumeToken1: Scalars['String']['output'];
  dailyVolumeUSD: Scalars['String']['output'];
  date: Scalars['DateTime']['output'];
  id: Scalars['String']['output'];
  pair: Pair;
  pairAddress: Scalars['String']['output'];
  reserve0: Scalars['String']['output'];
  reserve1: Scalars['String']['output'];
  reserveUSD: Scalars['String']['output'];
  token0: Token;
  token1: Token;
  totalSupply: Scalars['String']['output'];
};

export type PairDayDataConnection = {
  __typename?: 'PairDayDataConnection';
  edges: Array<PairDayDataEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type PairDayDataEdge = {
  __typename?: 'PairDayDataEdge';
  cursor: Scalars['String']['output'];
  node: PairDayData;
};

export enum PairDayDataOrderByInput {
  DailyTxnsAsc = 'dailyTxns_ASC',
  DailyTxnsDesc = 'dailyTxns_DESC',
  DailyVolumeToken0Asc = 'dailyVolumeToken0_ASC',
  DailyVolumeToken0Desc = 'dailyVolumeToken0_DESC',
  DailyVolumeToken1Asc = 'dailyVolumeToken1_ASC',
  DailyVolumeToken1Desc = 'dailyVolumeToken1_DESC',
  DailyVolumeUsdAsc = 'dailyVolumeUSD_ASC',
  DailyVolumeUsdDesc = 'dailyVolumeUSD_DESC',
  DateAsc = 'date_ASC',
  DateDesc = 'date_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  PairAddressAsc = 'pairAddress_ASC',
  PairAddressDesc = 'pairAddress_DESC',
  PairCreatedAtBlockNumberAsc = 'pair_createdAtBlockNumber_ASC',
  PairCreatedAtBlockNumberDesc = 'pair_createdAtBlockNumber_DESC',
  PairCreatedAtTimestampAsc = 'pair_createdAtTimestamp_ASC',
  PairCreatedAtTimestampDesc = 'pair_createdAtTimestamp_DESC',
  PairIdAsc = 'pair_id_ASC',
  PairIdDesc = 'pair_id_DESC',
  PairLiquidityProviderCountAsc = 'pair_liquidityProviderCount_ASC',
  PairLiquidityProviderCountDesc = 'pair_liquidityProviderCount_DESC',
  PairReserve0Asc = 'pair_reserve0_ASC',
  PairReserve0Desc = 'pair_reserve0_DESC',
  PairReserve1Asc = 'pair_reserve1_ASC',
  PairReserve1Desc = 'pair_reserve1_DESC',
  PairReserveEthAsc = 'pair_reserveETH_ASC',
  PairReserveEthDesc = 'pair_reserveETH_DESC',
  PairReserveUsdAsc = 'pair_reserveUSD_ASC',
  PairReserveUsdDesc = 'pair_reserveUSD_DESC',
  PairToken0PriceAsc = 'pair_token0Price_ASC',
  PairToken0PriceDesc = 'pair_token0Price_DESC',
  PairToken1PriceAsc = 'pair_token1Price_ASC',
  PairToken1PriceDesc = 'pair_token1Price_DESC',
  PairTotalSupplyAsc = 'pair_totalSupply_ASC',
  PairTotalSupplyDesc = 'pair_totalSupply_DESC',
  PairTrackedReserveEthAsc = 'pair_trackedReserveETH_ASC',
  PairTrackedReserveEthDesc = 'pair_trackedReserveETH_DESC',
  PairTxCountAsc = 'pair_txCount_ASC',
  PairTxCountDesc = 'pair_txCount_DESC',
  PairUntrackedVolumeUsdAsc = 'pair_untrackedVolumeUSD_ASC',
  PairUntrackedVolumeUsdDesc = 'pair_untrackedVolumeUSD_DESC',
  PairVolumeToken0Asc = 'pair_volumeToken0_ASC',
  PairVolumeToken0Desc = 'pair_volumeToken0_DESC',
  PairVolumeToken1Asc = 'pair_volumeToken1_ASC',
  PairVolumeToken1Desc = 'pair_volumeToken1_DESC',
  PairVolumeUsdAsc = 'pair_volumeUSD_ASC',
  PairVolumeUsdDesc = 'pair_volumeUSD_DESC',
  Reserve0Asc = 'reserve0_ASC',
  Reserve0Desc = 'reserve0_DESC',
  Reserve1Asc = 'reserve1_ASC',
  Reserve1Desc = 'reserve1_DESC',
  ReserveUsdAsc = 'reserveUSD_ASC',
  ReserveUsdDesc = 'reserveUSD_DESC',
  Token0DecimalsAsc = 'token0_decimals_ASC',
  Token0DecimalsDesc = 'token0_decimals_DESC',
  Token0DerivedEthAsc = 'token0_derivedETH_ASC',
  Token0DerivedEthDesc = 'token0_derivedETH_DESC',
  Token0IdAsc = 'token0_id_ASC',
  Token0IdDesc = 'token0_id_DESC',
  Token0NameAsc = 'token0_name_ASC',
  Token0NameDesc = 'token0_name_DESC',
  Token0SymbolAsc = 'token0_symbol_ASC',
  Token0SymbolDesc = 'token0_symbol_DESC',
  Token0TotalLiquidityAsc = 'token0_totalLiquidity_ASC',
  Token0TotalLiquidityDesc = 'token0_totalLiquidity_DESC',
  Token0TotalSupplyAsc = 'token0_totalSupply_ASC',
  Token0TotalSupplyDesc = 'token0_totalSupply_DESC',
  Token0TradeVolumeUsdAsc = 'token0_tradeVolumeUSD_ASC',
  Token0TradeVolumeUsdDesc = 'token0_tradeVolumeUSD_DESC',
  Token0TradeVolumeAsc = 'token0_tradeVolume_ASC',
  Token0TradeVolumeDesc = 'token0_tradeVolume_DESC',
  Token0TxCountAsc = 'token0_txCount_ASC',
  Token0TxCountDesc = 'token0_txCount_DESC',
  Token0UntrackedVolumeUsdAsc = 'token0_untrackedVolumeUSD_ASC',
  Token0UntrackedVolumeUsdDesc = 'token0_untrackedVolumeUSD_DESC',
  Token1DecimalsAsc = 'token1_decimals_ASC',
  Token1DecimalsDesc = 'token1_decimals_DESC',
  Token1DerivedEthAsc = 'token1_derivedETH_ASC',
  Token1DerivedEthDesc = 'token1_derivedETH_DESC',
  Token1IdAsc = 'token1_id_ASC',
  Token1IdDesc = 'token1_id_DESC',
  Token1NameAsc = 'token1_name_ASC',
  Token1NameDesc = 'token1_name_DESC',
  Token1SymbolAsc = 'token1_symbol_ASC',
  Token1SymbolDesc = 'token1_symbol_DESC',
  Token1TotalLiquidityAsc = 'token1_totalLiquidity_ASC',
  Token1TotalLiquidityDesc = 'token1_totalLiquidity_DESC',
  Token1TotalSupplyAsc = 'token1_totalSupply_ASC',
  Token1TotalSupplyDesc = 'token1_totalSupply_DESC',
  Token1TradeVolumeUsdAsc = 'token1_tradeVolumeUSD_ASC',
  Token1TradeVolumeUsdDesc = 'token1_tradeVolumeUSD_DESC',
  Token1TradeVolumeAsc = 'token1_tradeVolume_ASC',
  Token1TradeVolumeDesc = 'token1_tradeVolume_DESC',
  Token1TxCountAsc = 'token1_txCount_ASC',
  Token1TxCountDesc = 'token1_txCount_DESC',
  Token1UntrackedVolumeUsdAsc = 'token1_untrackedVolumeUSD_ASC',
  Token1UntrackedVolumeUsdDesc = 'token1_untrackedVolumeUSD_DESC',
  TotalSupplyAsc = 'totalSupply_ASC',
  TotalSupplyDesc = 'totalSupply_DESC'
}

export type PairDayDataWhereInput = {
  AND?: InputMaybe<Array<PairDayDataWhereInput>>;
  OR?: InputMaybe<Array<PairDayDataWhereInput>>;
  dailyTxns_eq?: InputMaybe<Scalars['Int']['input']>;
  dailyTxns_gt?: InputMaybe<Scalars['Int']['input']>;
  dailyTxns_gte?: InputMaybe<Scalars['Int']['input']>;
  dailyTxns_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  dailyTxns_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  dailyTxns_lt?: InputMaybe<Scalars['Int']['input']>;
  dailyTxns_lte?: InputMaybe<Scalars['Int']['input']>;
  dailyTxns_not_eq?: InputMaybe<Scalars['Int']['input']>;
  dailyTxns_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  dailyVolumeToken0_contains?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken0_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken0_endsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken0_eq?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken0_gt?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken0_gte?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken0_in?: InputMaybe<Array<Scalars['String']['input']>>;
  dailyVolumeToken0_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  dailyVolumeToken0_lt?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken0_lte?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken0_not_contains?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken0_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken0_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken0_not_eq?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken0_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  dailyVolumeToken0_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken0_startsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken1_contains?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken1_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken1_endsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken1_eq?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken1_gt?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken1_gte?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken1_in?: InputMaybe<Array<Scalars['String']['input']>>;
  dailyVolumeToken1_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  dailyVolumeToken1_lt?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken1_lte?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken1_not_contains?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken1_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken1_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken1_not_eq?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken1_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  dailyVolumeToken1_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken1_startsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_contains?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_eq?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_gt?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_gte?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  dailyVolumeUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  dailyVolumeUSD_lt?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_lte?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  dailyVolumeUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  date_eq?: InputMaybe<Scalars['DateTime']['input']>;
  date_gt?: InputMaybe<Scalars['DateTime']['input']>;
  date_gte?: InputMaybe<Scalars['DateTime']['input']>;
  date_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  date_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  date_lt?: InputMaybe<Scalars['DateTime']['input']>;
  date_lte?: InputMaybe<Scalars['DateTime']['input']>;
  date_not_eq?: InputMaybe<Scalars['DateTime']['input']>;
  date_not_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  pair?: InputMaybe<PairWhereInput>;
  pairAddress_contains?: InputMaybe<Scalars['String']['input']>;
  pairAddress_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  pairAddress_endsWith?: InputMaybe<Scalars['String']['input']>;
  pairAddress_eq?: InputMaybe<Scalars['String']['input']>;
  pairAddress_gt?: InputMaybe<Scalars['String']['input']>;
  pairAddress_gte?: InputMaybe<Scalars['String']['input']>;
  pairAddress_in?: InputMaybe<Array<Scalars['String']['input']>>;
  pairAddress_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  pairAddress_lt?: InputMaybe<Scalars['String']['input']>;
  pairAddress_lte?: InputMaybe<Scalars['String']['input']>;
  pairAddress_not_contains?: InputMaybe<Scalars['String']['input']>;
  pairAddress_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  pairAddress_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  pairAddress_not_eq?: InputMaybe<Scalars['String']['input']>;
  pairAddress_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  pairAddress_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  pairAddress_startsWith?: InputMaybe<Scalars['String']['input']>;
  pair_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  reserve0_contains?: InputMaybe<Scalars['String']['input']>;
  reserve0_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserve0_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserve0_eq?: InputMaybe<Scalars['String']['input']>;
  reserve0_gt?: InputMaybe<Scalars['String']['input']>;
  reserve0_gte?: InputMaybe<Scalars['String']['input']>;
  reserve0_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserve0_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  reserve0_lt?: InputMaybe<Scalars['String']['input']>;
  reserve0_lte?: InputMaybe<Scalars['String']['input']>;
  reserve0_not_contains?: InputMaybe<Scalars['String']['input']>;
  reserve0_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserve0_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserve0_not_eq?: InputMaybe<Scalars['String']['input']>;
  reserve0_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserve0_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  reserve0_startsWith?: InputMaybe<Scalars['String']['input']>;
  reserve1_contains?: InputMaybe<Scalars['String']['input']>;
  reserve1_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserve1_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserve1_eq?: InputMaybe<Scalars['String']['input']>;
  reserve1_gt?: InputMaybe<Scalars['String']['input']>;
  reserve1_gte?: InputMaybe<Scalars['String']['input']>;
  reserve1_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserve1_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  reserve1_lt?: InputMaybe<Scalars['String']['input']>;
  reserve1_lte?: InputMaybe<Scalars['String']['input']>;
  reserve1_not_contains?: InputMaybe<Scalars['String']['input']>;
  reserve1_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserve1_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserve1_not_eq?: InputMaybe<Scalars['String']['input']>;
  reserve1_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserve1_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  reserve1_startsWith?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_contains?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_eq?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_gt?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_gte?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserveUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  reserveUSD_lt?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_lte?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserveUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  token0?: InputMaybe<TokenWhereInput>;
  token0_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  token1?: InputMaybe<TokenWhereInput>;
  token1_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalSupply_contains?: InputMaybe<Scalars['String']['input']>;
  totalSupply_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalSupply_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalSupply_eq?: InputMaybe<Scalars['String']['input']>;
  totalSupply_gt?: InputMaybe<Scalars['String']['input']>;
  totalSupply_gte?: InputMaybe<Scalars['String']['input']>;
  totalSupply_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalSupply_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalSupply_lt?: InputMaybe<Scalars['String']['input']>;
  totalSupply_lte?: InputMaybe<Scalars['String']['input']>;
  totalSupply_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalSupply_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalSupply_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalSupply_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalSupply_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalSupply_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalSupply_startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type PairEdge = {
  __typename?: 'PairEdge';
  cursor: Scalars['String']['output'];
  node: Pair;
};

export type PairHourData = {
  __typename?: 'PairHourData';
  hourStartUnix: Scalars['BigInt']['output'];
  hourlyTxns: Scalars['Int']['output'];
  hourlyVolumeToken0: Scalars['String']['output'];
  hourlyVolumeToken1: Scalars['String']['output'];
  hourlyVolumeUSD: Scalars['String']['output'];
  id: Scalars['String']['output'];
  pair: Pair;
  reserve0: Scalars['String']['output'];
  reserve1: Scalars['String']['output'];
  reserveUSD: Scalars['String']['output'];
  totalSupply: Scalars['String']['output'];
};

export type PairHourDataConnection = {
  __typename?: 'PairHourDataConnection';
  edges: Array<PairHourDataEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type PairHourDataEdge = {
  __typename?: 'PairHourDataEdge';
  cursor: Scalars['String']['output'];
  node: PairHourData;
};

export enum PairHourDataOrderByInput {
  HourStartUnixAsc = 'hourStartUnix_ASC',
  HourStartUnixDesc = 'hourStartUnix_DESC',
  HourlyTxnsAsc = 'hourlyTxns_ASC',
  HourlyTxnsDesc = 'hourlyTxns_DESC',
  HourlyVolumeToken0Asc = 'hourlyVolumeToken0_ASC',
  HourlyVolumeToken0Desc = 'hourlyVolumeToken0_DESC',
  HourlyVolumeToken1Asc = 'hourlyVolumeToken1_ASC',
  HourlyVolumeToken1Desc = 'hourlyVolumeToken1_DESC',
  HourlyVolumeUsdAsc = 'hourlyVolumeUSD_ASC',
  HourlyVolumeUsdDesc = 'hourlyVolumeUSD_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  PairCreatedAtBlockNumberAsc = 'pair_createdAtBlockNumber_ASC',
  PairCreatedAtBlockNumberDesc = 'pair_createdAtBlockNumber_DESC',
  PairCreatedAtTimestampAsc = 'pair_createdAtTimestamp_ASC',
  PairCreatedAtTimestampDesc = 'pair_createdAtTimestamp_DESC',
  PairIdAsc = 'pair_id_ASC',
  PairIdDesc = 'pair_id_DESC',
  PairLiquidityProviderCountAsc = 'pair_liquidityProviderCount_ASC',
  PairLiquidityProviderCountDesc = 'pair_liquidityProviderCount_DESC',
  PairReserve0Asc = 'pair_reserve0_ASC',
  PairReserve0Desc = 'pair_reserve0_DESC',
  PairReserve1Asc = 'pair_reserve1_ASC',
  PairReserve1Desc = 'pair_reserve1_DESC',
  PairReserveEthAsc = 'pair_reserveETH_ASC',
  PairReserveEthDesc = 'pair_reserveETH_DESC',
  PairReserveUsdAsc = 'pair_reserveUSD_ASC',
  PairReserveUsdDesc = 'pair_reserveUSD_DESC',
  PairToken0PriceAsc = 'pair_token0Price_ASC',
  PairToken0PriceDesc = 'pair_token0Price_DESC',
  PairToken1PriceAsc = 'pair_token1Price_ASC',
  PairToken1PriceDesc = 'pair_token1Price_DESC',
  PairTotalSupplyAsc = 'pair_totalSupply_ASC',
  PairTotalSupplyDesc = 'pair_totalSupply_DESC',
  PairTrackedReserveEthAsc = 'pair_trackedReserveETH_ASC',
  PairTrackedReserveEthDesc = 'pair_trackedReserveETH_DESC',
  PairTxCountAsc = 'pair_txCount_ASC',
  PairTxCountDesc = 'pair_txCount_DESC',
  PairUntrackedVolumeUsdAsc = 'pair_untrackedVolumeUSD_ASC',
  PairUntrackedVolumeUsdDesc = 'pair_untrackedVolumeUSD_DESC',
  PairVolumeToken0Asc = 'pair_volumeToken0_ASC',
  PairVolumeToken0Desc = 'pair_volumeToken0_DESC',
  PairVolumeToken1Asc = 'pair_volumeToken1_ASC',
  PairVolumeToken1Desc = 'pair_volumeToken1_DESC',
  PairVolumeUsdAsc = 'pair_volumeUSD_ASC',
  PairVolumeUsdDesc = 'pair_volumeUSD_DESC',
  Reserve0Asc = 'reserve0_ASC',
  Reserve0Desc = 'reserve0_DESC',
  Reserve1Asc = 'reserve1_ASC',
  Reserve1Desc = 'reserve1_DESC',
  ReserveUsdAsc = 'reserveUSD_ASC',
  ReserveUsdDesc = 'reserveUSD_DESC',
  TotalSupplyAsc = 'totalSupply_ASC',
  TotalSupplyDesc = 'totalSupply_DESC'
}

export type PairHourDataWhereInput = {
  AND?: InputMaybe<Array<PairHourDataWhereInput>>;
  OR?: InputMaybe<Array<PairHourDataWhereInput>>;
  hourStartUnix_eq?: InputMaybe<Scalars['BigInt']['input']>;
  hourStartUnix_gt?: InputMaybe<Scalars['BigInt']['input']>;
  hourStartUnix_gte?: InputMaybe<Scalars['BigInt']['input']>;
  hourStartUnix_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  hourStartUnix_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  hourStartUnix_lt?: InputMaybe<Scalars['BigInt']['input']>;
  hourStartUnix_lte?: InputMaybe<Scalars['BigInt']['input']>;
  hourStartUnix_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  hourStartUnix_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  hourlyTxns_eq?: InputMaybe<Scalars['Int']['input']>;
  hourlyTxns_gt?: InputMaybe<Scalars['Int']['input']>;
  hourlyTxns_gte?: InputMaybe<Scalars['Int']['input']>;
  hourlyTxns_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  hourlyTxns_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  hourlyTxns_lt?: InputMaybe<Scalars['Int']['input']>;
  hourlyTxns_lte?: InputMaybe<Scalars['Int']['input']>;
  hourlyTxns_not_eq?: InputMaybe<Scalars['Int']['input']>;
  hourlyTxns_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  hourlyVolumeToken0_contains?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken0_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken0_endsWith?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken0_eq?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken0_gt?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken0_gte?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken0_in?: InputMaybe<Array<Scalars['String']['input']>>;
  hourlyVolumeToken0_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  hourlyVolumeToken0_lt?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken0_lte?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken0_not_contains?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken0_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken0_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken0_not_eq?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken0_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  hourlyVolumeToken0_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken0_startsWith?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken1_contains?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken1_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken1_endsWith?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken1_eq?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken1_gt?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken1_gte?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken1_in?: InputMaybe<Array<Scalars['String']['input']>>;
  hourlyVolumeToken1_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  hourlyVolumeToken1_lt?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken1_lte?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken1_not_contains?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken1_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken1_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken1_not_eq?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken1_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  hourlyVolumeToken1_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeToken1_startsWith?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_contains?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_eq?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_gt?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_gte?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  hourlyVolumeUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  hourlyVolumeUSD_lt?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_lte?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  hourlyVolumeUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  pair?: InputMaybe<PairWhereInput>;
  pair_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  reserve0_contains?: InputMaybe<Scalars['String']['input']>;
  reserve0_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserve0_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserve0_eq?: InputMaybe<Scalars['String']['input']>;
  reserve0_gt?: InputMaybe<Scalars['String']['input']>;
  reserve0_gte?: InputMaybe<Scalars['String']['input']>;
  reserve0_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserve0_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  reserve0_lt?: InputMaybe<Scalars['String']['input']>;
  reserve0_lte?: InputMaybe<Scalars['String']['input']>;
  reserve0_not_contains?: InputMaybe<Scalars['String']['input']>;
  reserve0_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserve0_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserve0_not_eq?: InputMaybe<Scalars['String']['input']>;
  reserve0_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserve0_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  reserve0_startsWith?: InputMaybe<Scalars['String']['input']>;
  reserve1_contains?: InputMaybe<Scalars['String']['input']>;
  reserve1_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserve1_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserve1_eq?: InputMaybe<Scalars['String']['input']>;
  reserve1_gt?: InputMaybe<Scalars['String']['input']>;
  reserve1_gte?: InputMaybe<Scalars['String']['input']>;
  reserve1_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserve1_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  reserve1_lt?: InputMaybe<Scalars['String']['input']>;
  reserve1_lte?: InputMaybe<Scalars['String']['input']>;
  reserve1_not_contains?: InputMaybe<Scalars['String']['input']>;
  reserve1_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserve1_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserve1_not_eq?: InputMaybe<Scalars['String']['input']>;
  reserve1_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserve1_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  reserve1_startsWith?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_contains?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_eq?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_gt?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_gte?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserveUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  reserveUSD_lt?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_lte?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserveUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalSupply_contains?: InputMaybe<Scalars['String']['input']>;
  totalSupply_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalSupply_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalSupply_eq?: InputMaybe<Scalars['String']['input']>;
  totalSupply_gt?: InputMaybe<Scalars['String']['input']>;
  totalSupply_gte?: InputMaybe<Scalars['String']['input']>;
  totalSupply_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalSupply_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalSupply_lt?: InputMaybe<Scalars['String']['input']>;
  totalSupply_lte?: InputMaybe<Scalars['String']['input']>;
  totalSupply_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalSupply_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalSupply_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalSupply_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalSupply_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalSupply_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalSupply_startsWith?: InputMaybe<Scalars['String']['input']>;
};

export enum PairOrderByInput {
  CreatedAtBlockNumberAsc = 'createdAtBlockNumber_ASC',
  CreatedAtBlockNumberDesc = 'createdAtBlockNumber_DESC',
  CreatedAtTimestampAsc = 'createdAtTimestamp_ASC',
  CreatedAtTimestampDesc = 'createdAtTimestamp_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  LiquidityProviderCountAsc = 'liquidityProviderCount_ASC',
  LiquidityProviderCountDesc = 'liquidityProviderCount_DESC',
  Reserve0Asc = 'reserve0_ASC',
  Reserve0Desc = 'reserve0_DESC',
  Reserve1Asc = 'reserve1_ASC',
  Reserve1Desc = 'reserve1_DESC',
  ReserveEthAsc = 'reserveETH_ASC',
  ReserveEthDesc = 'reserveETH_DESC',
  ReserveUsdAsc = 'reserveUSD_ASC',
  ReserveUsdDesc = 'reserveUSD_DESC',
  Token0PriceAsc = 'token0Price_ASC',
  Token0PriceDesc = 'token0Price_DESC',
  Token0DecimalsAsc = 'token0_decimals_ASC',
  Token0DecimalsDesc = 'token0_decimals_DESC',
  Token0DerivedEthAsc = 'token0_derivedETH_ASC',
  Token0DerivedEthDesc = 'token0_derivedETH_DESC',
  Token0IdAsc = 'token0_id_ASC',
  Token0IdDesc = 'token0_id_DESC',
  Token0NameAsc = 'token0_name_ASC',
  Token0NameDesc = 'token0_name_DESC',
  Token0SymbolAsc = 'token0_symbol_ASC',
  Token0SymbolDesc = 'token0_symbol_DESC',
  Token0TotalLiquidityAsc = 'token0_totalLiquidity_ASC',
  Token0TotalLiquidityDesc = 'token0_totalLiquidity_DESC',
  Token0TotalSupplyAsc = 'token0_totalSupply_ASC',
  Token0TotalSupplyDesc = 'token0_totalSupply_DESC',
  Token0TradeVolumeUsdAsc = 'token0_tradeVolumeUSD_ASC',
  Token0TradeVolumeUsdDesc = 'token0_tradeVolumeUSD_DESC',
  Token0TradeVolumeAsc = 'token0_tradeVolume_ASC',
  Token0TradeVolumeDesc = 'token0_tradeVolume_DESC',
  Token0TxCountAsc = 'token0_txCount_ASC',
  Token0TxCountDesc = 'token0_txCount_DESC',
  Token0UntrackedVolumeUsdAsc = 'token0_untrackedVolumeUSD_ASC',
  Token0UntrackedVolumeUsdDesc = 'token0_untrackedVolumeUSD_DESC',
  Token1PriceAsc = 'token1Price_ASC',
  Token1PriceDesc = 'token1Price_DESC',
  Token1DecimalsAsc = 'token1_decimals_ASC',
  Token1DecimalsDesc = 'token1_decimals_DESC',
  Token1DerivedEthAsc = 'token1_derivedETH_ASC',
  Token1DerivedEthDesc = 'token1_derivedETH_DESC',
  Token1IdAsc = 'token1_id_ASC',
  Token1IdDesc = 'token1_id_DESC',
  Token1NameAsc = 'token1_name_ASC',
  Token1NameDesc = 'token1_name_DESC',
  Token1SymbolAsc = 'token1_symbol_ASC',
  Token1SymbolDesc = 'token1_symbol_DESC',
  Token1TotalLiquidityAsc = 'token1_totalLiquidity_ASC',
  Token1TotalLiquidityDesc = 'token1_totalLiquidity_DESC',
  Token1TotalSupplyAsc = 'token1_totalSupply_ASC',
  Token1TotalSupplyDesc = 'token1_totalSupply_DESC',
  Token1TradeVolumeUsdAsc = 'token1_tradeVolumeUSD_ASC',
  Token1TradeVolumeUsdDesc = 'token1_tradeVolumeUSD_DESC',
  Token1TradeVolumeAsc = 'token1_tradeVolume_ASC',
  Token1TradeVolumeDesc = 'token1_tradeVolume_DESC',
  Token1TxCountAsc = 'token1_txCount_ASC',
  Token1TxCountDesc = 'token1_txCount_DESC',
  Token1UntrackedVolumeUsdAsc = 'token1_untrackedVolumeUSD_ASC',
  Token1UntrackedVolumeUsdDesc = 'token1_untrackedVolumeUSD_DESC',
  TotalSupplyAsc = 'totalSupply_ASC',
  TotalSupplyDesc = 'totalSupply_DESC',
  TrackedReserveEthAsc = 'trackedReserveETH_ASC',
  TrackedReserveEthDesc = 'trackedReserveETH_DESC',
  TxCountAsc = 'txCount_ASC',
  TxCountDesc = 'txCount_DESC',
  UntrackedVolumeUsdAsc = 'untrackedVolumeUSD_ASC',
  UntrackedVolumeUsdDesc = 'untrackedVolumeUSD_DESC',
  VolumeToken0Asc = 'volumeToken0_ASC',
  VolumeToken0Desc = 'volumeToken0_DESC',
  VolumeToken1Asc = 'volumeToken1_ASC',
  VolumeToken1Desc = 'volumeToken1_DESC',
  VolumeUsdAsc = 'volumeUSD_ASC',
  VolumeUsdDesc = 'volumeUSD_DESC'
}

export type PairWhereInput = {
  AND?: InputMaybe<Array<PairWhereInput>>;
  OR?: InputMaybe<Array<PairWhereInput>>;
  burns_every?: InputMaybe<BurnWhereInput>;
  burns_none?: InputMaybe<BurnWhereInput>;
  burns_some?: InputMaybe<BurnWhereInput>;
  createdAtBlockNumber_eq?: InputMaybe<Scalars['BigInt']['input']>;
  createdAtBlockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  createdAtBlockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  createdAtBlockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  createdAtBlockNumber_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  createdAtBlockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  createdAtBlockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  createdAtBlockNumber_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  createdAtBlockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  createdAtTimestamp_eq?: InputMaybe<Scalars['DateTime']['input']>;
  createdAtTimestamp_gt?: InputMaybe<Scalars['DateTime']['input']>;
  createdAtTimestamp_gte?: InputMaybe<Scalars['DateTime']['input']>;
  createdAtTimestamp_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  createdAtTimestamp_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  createdAtTimestamp_lt?: InputMaybe<Scalars['DateTime']['input']>;
  createdAtTimestamp_lte?: InputMaybe<Scalars['DateTime']['input']>;
  createdAtTimestamp_not_eq?: InputMaybe<Scalars['DateTime']['input']>;
  createdAtTimestamp_not_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  farm_every?: InputMaybe<FarmWhereInput>;
  farm_none?: InputMaybe<FarmWhereInput>;
  farm_some?: InputMaybe<FarmWhereInput>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  liquidityPositionSnapshots_every?: InputMaybe<LiquidityPositionSnapshotWhereInput>;
  liquidityPositionSnapshots_none?: InputMaybe<LiquidityPositionSnapshotWhereInput>;
  liquidityPositionSnapshots_some?: InputMaybe<LiquidityPositionSnapshotWhereInput>;
  liquidityPositions_every?: InputMaybe<LiquidityPositionWhereInput>;
  liquidityPositions_none?: InputMaybe<LiquidityPositionWhereInput>;
  liquidityPositions_some?: InputMaybe<LiquidityPositionWhereInput>;
  liquidityProviderCount_eq?: InputMaybe<Scalars['Int']['input']>;
  liquidityProviderCount_gt?: InputMaybe<Scalars['Int']['input']>;
  liquidityProviderCount_gte?: InputMaybe<Scalars['Int']['input']>;
  liquidityProviderCount_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  liquidityProviderCount_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  liquidityProviderCount_lt?: InputMaybe<Scalars['Int']['input']>;
  liquidityProviderCount_lte?: InputMaybe<Scalars['Int']['input']>;
  liquidityProviderCount_not_eq?: InputMaybe<Scalars['Int']['input']>;
  liquidityProviderCount_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  mints_every?: InputMaybe<MintWhereInput>;
  mints_none?: InputMaybe<MintWhereInput>;
  mints_some?: InputMaybe<MintWhereInput>;
  pairDayData_every?: InputMaybe<PairDayDataWhereInput>;
  pairDayData_none?: InputMaybe<PairDayDataWhereInput>;
  pairDayData_some?: InputMaybe<PairDayDataWhereInput>;
  pairHourData_every?: InputMaybe<PairHourDataWhereInput>;
  pairHourData_none?: InputMaybe<PairHourDataWhereInput>;
  pairHourData_some?: InputMaybe<PairHourDataWhereInput>;
  reserve0_contains?: InputMaybe<Scalars['String']['input']>;
  reserve0_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserve0_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserve0_eq?: InputMaybe<Scalars['String']['input']>;
  reserve0_gt?: InputMaybe<Scalars['String']['input']>;
  reserve0_gte?: InputMaybe<Scalars['String']['input']>;
  reserve0_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserve0_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  reserve0_lt?: InputMaybe<Scalars['String']['input']>;
  reserve0_lte?: InputMaybe<Scalars['String']['input']>;
  reserve0_not_contains?: InputMaybe<Scalars['String']['input']>;
  reserve0_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserve0_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserve0_not_eq?: InputMaybe<Scalars['String']['input']>;
  reserve0_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserve0_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  reserve0_startsWith?: InputMaybe<Scalars['String']['input']>;
  reserve1_contains?: InputMaybe<Scalars['String']['input']>;
  reserve1_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserve1_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserve1_eq?: InputMaybe<Scalars['String']['input']>;
  reserve1_gt?: InputMaybe<Scalars['String']['input']>;
  reserve1_gte?: InputMaybe<Scalars['String']['input']>;
  reserve1_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserve1_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  reserve1_lt?: InputMaybe<Scalars['String']['input']>;
  reserve1_lte?: InputMaybe<Scalars['String']['input']>;
  reserve1_not_contains?: InputMaybe<Scalars['String']['input']>;
  reserve1_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserve1_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserve1_not_eq?: InputMaybe<Scalars['String']['input']>;
  reserve1_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserve1_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  reserve1_startsWith?: InputMaybe<Scalars['String']['input']>;
  reserveETH_contains?: InputMaybe<Scalars['String']['input']>;
  reserveETH_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserveETH_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserveETH_eq?: InputMaybe<Scalars['String']['input']>;
  reserveETH_gt?: InputMaybe<Scalars['String']['input']>;
  reserveETH_gte?: InputMaybe<Scalars['String']['input']>;
  reserveETH_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserveETH_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  reserveETH_lt?: InputMaybe<Scalars['String']['input']>;
  reserveETH_lte?: InputMaybe<Scalars['String']['input']>;
  reserveETH_not_contains?: InputMaybe<Scalars['String']['input']>;
  reserveETH_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserveETH_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserveETH_not_eq?: InputMaybe<Scalars['String']['input']>;
  reserveETH_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserveETH_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  reserveETH_startsWith?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_contains?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_eq?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_gt?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_gte?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserveUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  reserveUSD_lt?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_lte?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  reserveUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  reserveUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  swaps_every?: InputMaybe<SwapWhereInput>;
  swaps_none?: InputMaybe<SwapWhereInput>;
  swaps_some?: InputMaybe<SwapWhereInput>;
  token0?: InputMaybe<TokenWhereInput>;
  token0Price_contains?: InputMaybe<Scalars['String']['input']>;
  token0Price_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  token0Price_endsWith?: InputMaybe<Scalars['String']['input']>;
  token0Price_eq?: InputMaybe<Scalars['String']['input']>;
  token0Price_gt?: InputMaybe<Scalars['String']['input']>;
  token0Price_gte?: InputMaybe<Scalars['String']['input']>;
  token0Price_in?: InputMaybe<Array<Scalars['String']['input']>>;
  token0Price_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  token0Price_lt?: InputMaybe<Scalars['String']['input']>;
  token0Price_lte?: InputMaybe<Scalars['String']['input']>;
  token0Price_not_contains?: InputMaybe<Scalars['String']['input']>;
  token0Price_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  token0Price_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  token0Price_not_eq?: InputMaybe<Scalars['String']['input']>;
  token0Price_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  token0Price_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  token0Price_startsWith?: InputMaybe<Scalars['String']['input']>;
  token0_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  token1?: InputMaybe<TokenWhereInput>;
  token1Price_contains?: InputMaybe<Scalars['String']['input']>;
  token1Price_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  token1Price_endsWith?: InputMaybe<Scalars['String']['input']>;
  token1Price_eq?: InputMaybe<Scalars['String']['input']>;
  token1Price_gt?: InputMaybe<Scalars['String']['input']>;
  token1Price_gte?: InputMaybe<Scalars['String']['input']>;
  token1Price_in?: InputMaybe<Array<Scalars['String']['input']>>;
  token1Price_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  token1Price_lt?: InputMaybe<Scalars['String']['input']>;
  token1Price_lte?: InputMaybe<Scalars['String']['input']>;
  token1Price_not_contains?: InputMaybe<Scalars['String']['input']>;
  token1Price_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  token1Price_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  token1Price_not_eq?: InputMaybe<Scalars['String']['input']>;
  token1Price_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  token1Price_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  token1Price_startsWith?: InputMaybe<Scalars['String']['input']>;
  token1_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalSupply_contains?: InputMaybe<Scalars['String']['input']>;
  totalSupply_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalSupply_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalSupply_eq?: InputMaybe<Scalars['String']['input']>;
  totalSupply_gt?: InputMaybe<Scalars['String']['input']>;
  totalSupply_gte?: InputMaybe<Scalars['String']['input']>;
  totalSupply_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalSupply_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalSupply_lt?: InputMaybe<Scalars['String']['input']>;
  totalSupply_lte?: InputMaybe<Scalars['String']['input']>;
  totalSupply_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalSupply_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalSupply_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalSupply_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalSupply_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalSupply_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalSupply_startsWith?: InputMaybe<Scalars['String']['input']>;
  trackedReserveETH_contains?: InputMaybe<Scalars['String']['input']>;
  trackedReserveETH_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  trackedReserveETH_endsWith?: InputMaybe<Scalars['String']['input']>;
  trackedReserveETH_eq?: InputMaybe<Scalars['String']['input']>;
  trackedReserveETH_gt?: InputMaybe<Scalars['String']['input']>;
  trackedReserveETH_gte?: InputMaybe<Scalars['String']['input']>;
  trackedReserveETH_in?: InputMaybe<Array<Scalars['String']['input']>>;
  trackedReserveETH_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  trackedReserveETH_lt?: InputMaybe<Scalars['String']['input']>;
  trackedReserveETH_lte?: InputMaybe<Scalars['String']['input']>;
  trackedReserveETH_not_contains?: InputMaybe<Scalars['String']['input']>;
  trackedReserveETH_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  trackedReserveETH_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  trackedReserveETH_not_eq?: InputMaybe<Scalars['String']['input']>;
  trackedReserveETH_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  trackedReserveETH_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  trackedReserveETH_startsWith?: InputMaybe<Scalars['String']['input']>;
  txCount_eq?: InputMaybe<Scalars['Int']['input']>;
  txCount_gt?: InputMaybe<Scalars['Int']['input']>;
  txCount_gte?: InputMaybe<Scalars['Int']['input']>;
  txCount_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  txCount_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  txCount_lt?: InputMaybe<Scalars['Int']['input']>;
  txCount_lte?: InputMaybe<Scalars['Int']['input']>;
  txCount_not_eq?: InputMaybe<Scalars['Int']['input']>;
  txCount_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  untrackedVolumeUSD_contains?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_eq?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_gt?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_gte?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  untrackedVolumeUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  untrackedVolumeUSD_lt?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_lte?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  untrackedVolumeUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  volumeToken0_contains?: InputMaybe<Scalars['String']['input']>;
  volumeToken0_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  volumeToken0_endsWith?: InputMaybe<Scalars['String']['input']>;
  volumeToken0_eq?: InputMaybe<Scalars['String']['input']>;
  volumeToken0_gt?: InputMaybe<Scalars['String']['input']>;
  volumeToken0_gte?: InputMaybe<Scalars['String']['input']>;
  volumeToken0_in?: InputMaybe<Array<Scalars['String']['input']>>;
  volumeToken0_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  volumeToken0_lt?: InputMaybe<Scalars['String']['input']>;
  volumeToken0_lte?: InputMaybe<Scalars['String']['input']>;
  volumeToken0_not_contains?: InputMaybe<Scalars['String']['input']>;
  volumeToken0_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  volumeToken0_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  volumeToken0_not_eq?: InputMaybe<Scalars['String']['input']>;
  volumeToken0_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  volumeToken0_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  volumeToken0_startsWith?: InputMaybe<Scalars['String']['input']>;
  volumeToken1_contains?: InputMaybe<Scalars['String']['input']>;
  volumeToken1_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  volumeToken1_endsWith?: InputMaybe<Scalars['String']['input']>;
  volumeToken1_eq?: InputMaybe<Scalars['String']['input']>;
  volumeToken1_gt?: InputMaybe<Scalars['String']['input']>;
  volumeToken1_gte?: InputMaybe<Scalars['String']['input']>;
  volumeToken1_in?: InputMaybe<Array<Scalars['String']['input']>>;
  volumeToken1_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  volumeToken1_lt?: InputMaybe<Scalars['String']['input']>;
  volumeToken1_lte?: InputMaybe<Scalars['String']['input']>;
  volumeToken1_not_contains?: InputMaybe<Scalars['String']['input']>;
  volumeToken1_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  volumeToken1_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  volumeToken1_not_eq?: InputMaybe<Scalars['String']['input']>;
  volumeToken1_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  volumeToken1_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  volumeToken1_startsWith?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_contains?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_eq?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_gt?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_gte?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  volumeUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  volumeUSD_lt?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_lte?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  volumeUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type PairsConnection = {
  __typename?: 'PairsConnection';
  edges: Array<PairEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type Query = {
  __typename?: 'Query';
  backstopPoolById?: Maybe<BackstopPool>;
  /** @deprecated Use backstopPoolById */
  backstopPoolByUniqueInput?: Maybe<BackstopPool>;
  backstopPools: Array<BackstopPool>;
  backstopPoolsConnection: BackstopPoolsConnection;
  bundleById?: Maybe<Bundle>;
  /** @deprecated Use bundleById */
  bundleByUniqueInput?: Maybe<Bundle>;
  bundles: Array<Bundle>;
  bundlesConnection: BundlesConnection;
  burnById?: Maybe<Burn>;
  /** @deprecated Use burnById */
  burnByUniqueInput?: Maybe<Burn>;
  burns: Array<Burn>;
  burnsConnection: BurnsConnection;
  factories: Array<Factory>;
  factoriesConnection: FactoriesConnection;
  factoryById?: Maybe<Factory>;
  /** @deprecated Use factoryById */
  factoryByUniqueInput?: Maybe<Factory>;
  factoryDayData: Array<FactoryDayData>;
  factoryDayDataById?: Maybe<FactoryDayData>;
  /** @deprecated Use factoryDayDataById */
  factoryDayDataByUniqueInput?: Maybe<FactoryDayData>;
  factoryDayDataConnection: FactoryDayDataConnection;
  farmById?: Maybe<Farm>;
  /** @deprecated Use farmById */
  farmByUniqueInput?: Maybe<Farm>;
  farms: Array<Farm>;
  farmsConnection: FarmsConnection;
  incentiveById?: Maybe<Incentive>;
  /** @deprecated Use incentiveById */
  incentiveByUniqueInput?: Maybe<Incentive>;
  incentives: Array<Incentive>;
  incentivesConnection: IncentivesConnection;
  liquidityPositionById?: Maybe<LiquidityPosition>;
  /** @deprecated Use liquidityPositionById */
  liquidityPositionByUniqueInput?: Maybe<LiquidityPosition>;
  liquidityPositionSnapshotById?: Maybe<LiquidityPositionSnapshot>;
  /** @deprecated Use liquidityPositionSnapshotById */
  liquidityPositionSnapshotByUniqueInput?: Maybe<LiquidityPositionSnapshot>;
  liquidityPositionSnapshots: Array<LiquidityPositionSnapshot>;
  liquidityPositionSnapshotsConnection: LiquidityPositionSnapshotsConnection;
  liquidityPositions: Array<LiquidityPosition>;
  liquidityPositionsConnection: LiquidityPositionsConnection;
  mintById?: Maybe<Mint>;
  /** @deprecated Use mintById */
  mintByUniqueInput?: Maybe<Mint>;
  mints: Array<Mint>;
  mintsConnection: MintsConnection;
  nablaTokenById?: Maybe<NablaToken>;
  /** @deprecated Use nablaTokenById */
  nablaTokenByUniqueInput?: Maybe<NablaToken>;
  nablaTokens: Array<NablaToken>;
  nablaTokensConnection: NablaTokensConnection;
  oraclePriceById?: Maybe<OraclePrice>;
  /** @deprecated Use oraclePriceById */
  oraclePriceByUniqueInput?: Maybe<OraclePrice>;
  oraclePrices: Array<OraclePrice>;
  oraclePricesConnection: OraclePricesConnection;
  pairById?: Maybe<Pair>;
  /** @deprecated Use pairById */
  pairByUniqueInput?: Maybe<Pair>;
  pairDayData: Array<PairDayData>;
  pairDayDataById?: Maybe<PairDayData>;
  /** @deprecated Use pairDayDataById */
  pairDayDataByUniqueInput?: Maybe<PairDayData>;
  pairDayDataConnection: PairDayDataConnection;
  pairHourData: Array<PairHourData>;
  pairHourDataById?: Maybe<PairHourData>;
  /** @deprecated Use pairHourDataById */
  pairHourDataByUniqueInput?: Maybe<PairHourData>;
  pairHourDataConnection: PairHourDataConnection;
  pairs: Array<Pair>;
  pairsConnection: PairsConnection;
  routerById?: Maybe<Router>;
  /** @deprecated Use routerById */
  routerByUniqueInput?: Maybe<Router>;
  routers: Array<Router>;
  routersConnection: RoutersConnection;
  singleTokenLockById?: Maybe<SingleTokenLock>;
  /** @deprecated Use singleTokenLockById */
  singleTokenLockByUniqueInput?: Maybe<SingleTokenLock>;
  singleTokenLockDayData: Array<SingleTokenLockDayData>;
  singleTokenLockDayDataById?: Maybe<SingleTokenLockDayData>;
  /** @deprecated Use singleTokenLockDayDataById */
  singleTokenLockDayDataByUniqueInput?: Maybe<SingleTokenLockDayData>;
  singleTokenLockDayDataConnection: SingleTokenLockDayDataConnection;
  singleTokenLockHourData: Array<SingleTokenLockHourData>;
  singleTokenLockHourDataById?: Maybe<SingleTokenLockHourData>;
  /** @deprecated Use singleTokenLockHourDataById */
  singleTokenLockHourDataByUniqueInput?: Maybe<SingleTokenLockHourData>;
  singleTokenLockHourDataConnection: SingleTokenLockHourDataConnection;
  singleTokenLocks: Array<SingleTokenLock>;
  singleTokenLocksConnection: SingleTokenLocksConnection;
  squidStatus?: Maybe<SquidStatus>;
  stableDayData: Array<StableDayData>;
  stableDayDataById?: Maybe<StableDayData>;
  /** @deprecated Use stableDayDataById */
  stableDayDataByUniqueInput?: Maybe<StableDayData>;
  stableDayDataConnection: StableDayDataConnection;
  stableSwapById?: Maybe<StableSwap>;
  /** @deprecated Use stableSwapById */
  stableSwapByUniqueInput?: Maybe<StableSwap>;
  stableSwapDayData: Array<StableSwapDayData>;
  stableSwapDayDataById?: Maybe<StableSwapDayData>;
  /** @deprecated Use stableSwapDayDataById */
  stableSwapDayDataByUniqueInput?: Maybe<StableSwapDayData>;
  stableSwapDayDataConnection: StableSwapDayDataConnection;
  stableSwapEventById?: Maybe<StableSwapEvent>;
  /** @deprecated Use stableSwapEventById */
  stableSwapEventByUniqueInput?: Maybe<StableSwapEvent>;
  stableSwapEvents: Array<StableSwapEvent>;
  stableSwapEventsConnection: StableSwapEventsConnection;
  stableSwapExchangeById?: Maybe<StableSwapExchange>;
  /** @deprecated Use stableSwapExchangeById */
  stableSwapExchangeByUniqueInput?: Maybe<StableSwapExchange>;
  stableSwapExchanges: Array<StableSwapExchange>;
  stableSwapExchangesConnection: StableSwapExchangesConnection;
  stableSwapHourData: Array<StableSwapHourData>;
  stableSwapHourDataById?: Maybe<StableSwapHourData>;
  /** @deprecated Use stableSwapHourDataById */
  stableSwapHourDataByUniqueInput?: Maybe<StableSwapHourData>;
  stableSwapHourDataConnection: StableSwapHourDataConnection;
  stableSwapInfoById?: Maybe<StableSwapInfo>;
  /** @deprecated Use stableSwapInfoById */
  stableSwapInfoByUniqueInput?: Maybe<StableSwapInfo>;
  stableSwapInfos: Array<StableSwapInfo>;
  stableSwapInfosConnection: StableSwapInfosConnection;
  stableSwapLiquidityPositionById?: Maybe<StableSwapLiquidityPosition>;
  /** @deprecated Use stableSwapLiquidityPositionById */
  stableSwapLiquidityPositionByUniqueInput?: Maybe<StableSwapLiquidityPosition>;
  stableSwapLiquidityPositions: Array<StableSwapLiquidityPosition>;
  stableSwapLiquidityPositionsConnection: StableSwapLiquidityPositionsConnection;
  stableSwaps: Array<StableSwap>;
  stableSwapsConnection: StableSwapsConnection;
  stakePositionById?: Maybe<StakePosition>;
  /** @deprecated Use stakePositionById */
  stakePositionByUniqueInput?: Maybe<StakePosition>;
  stakePositions: Array<StakePosition>;
  stakePositionsConnection: StakePositionsConnection;
  swapById?: Maybe<Swap>;
  /** @deprecated Use swapById */
  swapByUniqueInput?: Maybe<Swap>;
  swapPoolById?: Maybe<SwapPool>;
  /** @deprecated Use swapPoolById */
  swapPoolByUniqueInput?: Maybe<SwapPool>;
  swapPools: Array<SwapPool>;
  swapPoolsConnection: SwapPoolsConnection;
  swaps: Array<Swap>;
  swapsConnection: SwapsConnection;
  tokenById?: Maybe<Token>;
  /** @deprecated Use tokenById */
  tokenByUniqueInput?: Maybe<Token>;
  tokenDayData: Array<TokenDayData>;
  tokenDayDataById?: Maybe<TokenDayData>;
  /** @deprecated Use tokenDayDataById */
  tokenDayDataByUniqueInput?: Maybe<TokenDayData>;
  tokenDayDataConnection: TokenDayDataConnection;
  tokens: Array<Token>;
  tokensConnection: TokensConnection;
  transactionById?: Maybe<Transaction>;
  /** @deprecated Use transactionById */
  transactionByUniqueInput?: Maybe<Transaction>;
  transactions: Array<Transaction>;
  transactionsConnection: TransactionsConnection;
  transferById?: Maybe<Transfer>;
  /** @deprecated Use transferById */
  transferByUniqueInput?: Maybe<Transfer>;
  transfers: Array<Transfer>;
  transfersConnection: TransfersConnection;
  userById?: Maybe<User>;
  /** @deprecated Use userById */
  userByUniqueInput?: Maybe<User>;
  users: Array<User>;
  usersConnection: UsersConnection;
  zenlinkDayInfoById?: Maybe<ZenlinkDayInfo>;
  /** @deprecated Use zenlinkDayInfoById */
  zenlinkDayInfoByUniqueInput?: Maybe<ZenlinkDayInfo>;
  zenlinkDayInfos: Array<ZenlinkDayInfo>;
  zenlinkDayInfosConnection: ZenlinkDayInfosConnection;
  zenlinkInfoById?: Maybe<ZenlinkInfo>;
  /** @deprecated Use zenlinkInfoById */
  zenlinkInfoByUniqueInput?: Maybe<ZenlinkInfo>;
  zenlinkInfos: Array<ZenlinkInfo>;
  zenlinkInfosConnection: ZenlinkInfosConnection;
  zlkInfoById?: Maybe<ZlkInfo>;
  /** @deprecated Use zlkInfoById */
  zlkInfoByUniqueInput?: Maybe<ZlkInfo>;
  zlkInfos: Array<ZlkInfo>;
  zlkInfosConnection: ZlkInfosConnection;
};


export type QueryBackstopPoolByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryBackstopPoolByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryBackstopPoolsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<BackstopPoolOrderByInput>>;
  where?: InputMaybe<BackstopPoolWhereInput>;
};


export type QueryBackstopPoolsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<BackstopPoolOrderByInput>;
  where?: InputMaybe<BackstopPoolWhereInput>;
};


export type QueryBundleByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryBundleByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryBundlesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<BundleOrderByInput>>;
  where?: InputMaybe<BundleWhereInput>;
};


export type QueryBundlesConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<BundleOrderByInput>;
  where?: InputMaybe<BundleWhereInput>;
};


export type QueryBurnByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryBurnByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryBurnsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<BurnOrderByInput>>;
  where?: InputMaybe<BurnWhereInput>;
};


export type QueryBurnsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<BurnOrderByInput>;
  where?: InputMaybe<BurnWhereInput>;
};


export type QueryFactoriesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<FactoryOrderByInput>>;
  where?: InputMaybe<FactoryWhereInput>;
};


export type QueryFactoriesConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<FactoryOrderByInput>;
  where?: InputMaybe<FactoryWhereInput>;
};


export type QueryFactoryByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryFactoryByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryFactoryDayDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<FactoryDayDataOrderByInput>>;
  where?: InputMaybe<FactoryDayDataWhereInput>;
};


export type QueryFactoryDayDataByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryFactoryDayDataByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryFactoryDayDataConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<FactoryDayDataOrderByInput>;
  where?: InputMaybe<FactoryDayDataWhereInput>;
};


export type QueryFarmByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryFarmByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryFarmsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<FarmOrderByInput>>;
  where?: InputMaybe<FarmWhereInput>;
};


export type QueryFarmsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<FarmOrderByInput>;
  where?: InputMaybe<FarmWhereInput>;
};


export type QueryIncentiveByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryIncentiveByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryIncentivesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<IncentiveOrderByInput>>;
  where?: InputMaybe<IncentiveWhereInput>;
};


export type QueryIncentivesConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<IncentiveOrderByInput>;
  where?: InputMaybe<IncentiveWhereInput>;
};


export type QueryLiquidityPositionByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryLiquidityPositionByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryLiquidityPositionSnapshotByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryLiquidityPositionSnapshotByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryLiquidityPositionSnapshotsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<LiquidityPositionSnapshotOrderByInput>>;
  where?: InputMaybe<LiquidityPositionSnapshotWhereInput>;
};


export type QueryLiquidityPositionSnapshotsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<LiquidityPositionSnapshotOrderByInput>;
  where?: InputMaybe<LiquidityPositionSnapshotWhereInput>;
};


export type QueryLiquidityPositionsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<LiquidityPositionOrderByInput>>;
  where?: InputMaybe<LiquidityPositionWhereInput>;
};


export type QueryLiquidityPositionsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<LiquidityPositionOrderByInput>;
  where?: InputMaybe<LiquidityPositionWhereInput>;
};


export type QueryMintByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryMintByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryMintsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<MintOrderByInput>>;
  where?: InputMaybe<MintWhereInput>;
};


export type QueryMintsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<MintOrderByInput>;
  where?: InputMaybe<MintWhereInput>;
};


export type QueryNablaTokenByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryNablaTokenByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryNablaTokensArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<NablaTokenOrderByInput>>;
  where?: InputMaybe<NablaTokenWhereInput>;
};


export type QueryNablaTokensConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<NablaTokenOrderByInput>;
  where?: InputMaybe<NablaTokenWhereInput>;
};


export type QueryOraclePriceByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryOraclePriceByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryOraclePricesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<OraclePriceOrderByInput>>;
  where?: InputMaybe<OraclePriceWhereInput>;
};


export type QueryOraclePricesConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<OraclePriceOrderByInput>;
  where?: InputMaybe<OraclePriceWhereInput>;
};


export type QueryPairByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryPairByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryPairDayDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<PairDayDataOrderByInput>>;
  where?: InputMaybe<PairDayDataWhereInput>;
};


export type QueryPairDayDataByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryPairDayDataByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryPairDayDataConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<PairDayDataOrderByInput>;
  where?: InputMaybe<PairDayDataWhereInput>;
};


export type QueryPairHourDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<PairHourDataOrderByInput>>;
  where?: InputMaybe<PairHourDataWhereInput>;
};


export type QueryPairHourDataByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryPairHourDataByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryPairHourDataConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<PairHourDataOrderByInput>;
  where?: InputMaybe<PairHourDataWhereInput>;
};


export type QueryPairsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<PairOrderByInput>>;
  where?: InputMaybe<PairWhereInput>;
};


export type QueryPairsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<PairOrderByInput>;
  where?: InputMaybe<PairWhereInput>;
};


export type QueryRouterByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryRouterByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryRoutersArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<RouterOrderByInput>>;
  where?: InputMaybe<RouterWhereInput>;
};


export type QueryRoutersConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<RouterOrderByInput>;
  where?: InputMaybe<RouterWhereInput>;
};


export type QuerySingleTokenLockByIdArgs = {
  id: Scalars['String']['input'];
};


export type QuerySingleTokenLockByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QuerySingleTokenLockDayDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SingleTokenLockDayDataOrderByInput>>;
  where?: InputMaybe<SingleTokenLockDayDataWhereInput>;
};


export type QuerySingleTokenLockDayDataByIdArgs = {
  id: Scalars['String']['input'];
};


export type QuerySingleTokenLockDayDataByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QuerySingleTokenLockDayDataConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<SingleTokenLockDayDataOrderByInput>;
  where?: InputMaybe<SingleTokenLockDayDataWhereInput>;
};


export type QuerySingleTokenLockHourDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SingleTokenLockHourDataOrderByInput>>;
  where?: InputMaybe<SingleTokenLockHourDataWhereInput>;
};


export type QuerySingleTokenLockHourDataByIdArgs = {
  id: Scalars['String']['input'];
};


export type QuerySingleTokenLockHourDataByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QuerySingleTokenLockHourDataConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<SingleTokenLockHourDataOrderByInput>;
  where?: InputMaybe<SingleTokenLockHourDataWhereInput>;
};


export type QuerySingleTokenLocksArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SingleTokenLockOrderByInput>>;
  where?: InputMaybe<SingleTokenLockWhereInput>;
};


export type QuerySingleTokenLocksConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<SingleTokenLockOrderByInput>;
  where?: InputMaybe<SingleTokenLockWhereInput>;
};


export type QueryStableDayDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StableDayDataOrderByInput>>;
  where?: InputMaybe<StableDayDataWhereInput>;
};


export type QueryStableDayDataByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryStableDayDataByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryStableDayDataConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<StableDayDataOrderByInput>;
  where?: InputMaybe<StableDayDataWhereInput>;
};


export type QueryStableSwapByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryStableSwapByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryStableSwapDayDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StableSwapDayDataOrderByInput>>;
  where?: InputMaybe<StableSwapDayDataWhereInput>;
};


export type QueryStableSwapDayDataByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryStableSwapDayDataByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryStableSwapDayDataConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<StableSwapDayDataOrderByInput>;
  where?: InputMaybe<StableSwapDayDataWhereInput>;
};


export type QueryStableSwapEventByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryStableSwapEventByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryStableSwapEventsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StableSwapEventOrderByInput>>;
  where?: InputMaybe<StableSwapEventWhereInput>;
};


export type QueryStableSwapEventsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<StableSwapEventOrderByInput>;
  where?: InputMaybe<StableSwapEventWhereInput>;
};


export type QueryStableSwapExchangeByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryStableSwapExchangeByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryStableSwapExchangesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StableSwapExchangeOrderByInput>>;
  where?: InputMaybe<StableSwapExchangeWhereInput>;
};


export type QueryStableSwapExchangesConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<StableSwapExchangeOrderByInput>;
  where?: InputMaybe<StableSwapExchangeWhereInput>;
};


export type QueryStableSwapHourDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StableSwapHourDataOrderByInput>>;
  where?: InputMaybe<StableSwapHourDataWhereInput>;
};


export type QueryStableSwapHourDataByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryStableSwapHourDataByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryStableSwapHourDataConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<StableSwapHourDataOrderByInput>;
  where?: InputMaybe<StableSwapHourDataWhereInput>;
};


export type QueryStableSwapInfoByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryStableSwapInfoByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryStableSwapInfosArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StableSwapInfoOrderByInput>>;
  where?: InputMaybe<StableSwapInfoWhereInput>;
};


export type QueryStableSwapInfosConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<StableSwapInfoOrderByInput>;
  where?: InputMaybe<StableSwapInfoWhereInput>;
};


export type QueryStableSwapLiquidityPositionByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryStableSwapLiquidityPositionByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryStableSwapLiquidityPositionsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StableSwapLiquidityPositionOrderByInput>>;
  where?: InputMaybe<StableSwapLiquidityPositionWhereInput>;
};


export type QueryStableSwapLiquidityPositionsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<StableSwapLiquidityPositionOrderByInput>;
  where?: InputMaybe<StableSwapLiquidityPositionWhereInput>;
};


export type QueryStableSwapsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StableSwapOrderByInput>>;
  where?: InputMaybe<StableSwapWhereInput>;
};


export type QueryStableSwapsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<StableSwapOrderByInput>;
  where?: InputMaybe<StableSwapWhereInput>;
};


export type QueryStakePositionByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryStakePositionByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryStakePositionsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StakePositionOrderByInput>>;
  where?: InputMaybe<StakePositionWhereInput>;
};


export type QueryStakePositionsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<StakePositionOrderByInput>;
  where?: InputMaybe<StakePositionWhereInput>;
};


export type QuerySwapByIdArgs = {
  id: Scalars['String']['input'];
};


export type QuerySwapByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QuerySwapPoolByIdArgs = {
  id: Scalars['String']['input'];
};


export type QuerySwapPoolByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QuerySwapPoolsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SwapPoolOrderByInput>>;
  where?: InputMaybe<SwapPoolWhereInput>;
};


export type QuerySwapPoolsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<SwapPoolOrderByInput>;
  where?: InputMaybe<SwapPoolWhereInput>;
};


export type QuerySwapsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SwapOrderByInput>>;
  where?: InputMaybe<SwapWhereInput>;
};


export type QuerySwapsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<SwapOrderByInput>;
  where?: InputMaybe<SwapWhereInput>;
};


export type QueryTokenByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryTokenByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryTokenDayDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<TokenDayDataOrderByInput>>;
  where?: InputMaybe<TokenDayDataWhereInput>;
};


export type QueryTokenDayDataByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryTokenDayDataByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryTokenDayDataConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<TokenDayDataOrderByInput>;
  where?: InputMaybe<TokenDayDataWhereInput>;
};


export type QueryTokensArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<TokenOrderByInput>>;
  where?: InputMaybe<TokenWhereInput>;
};


export type QueryTokensConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<TokenOrderByInput>;
  where?: InputMaybe<TokenWhereInput>;
};


export type QueryTransactionByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryTransactionByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryTransactionsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<TransactionOrderByInput>>;
  where?: InputMaybe<TransactionWhereInput>;
};


export type QueryTransactionsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<TransactionOrderByInput>;
  where?: InputMaybe<TransactionWhereInput>;
};


export type QueryTransferByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryTransferByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryTransfersArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<TransferOrderByInput>>;
  where?: InputMaybe<TransferWhereInput>;
};


export type QueryTransfersConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<TransferOrderByInput>;
  where?: InputMaybe<TransferWhereInput>;
};


export type QueryUserByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryUserByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryUsersArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<UserOrderByInput>>;
  where?: InputMaybe<UserWhereInput>;
};


export type QueryUsersConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<UserOrderByInput>;
  where?: InputMaybe<UserWhereInput>;
};


export type QueryZenlinkDayInfoByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryZenlinkDayInfoByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryZenlinkDayInfosArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ZenlinkDayInfoOrderByInput>>;
  where?: InputMaybe<ZenlinkDayInfoWhereInput>;
};


export type QueryZenlinkDayInfosConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<ZenlinkDayInfoOrderByInput>;
  where?: InputMaybe<ZenlinkDayInfoWhereInput>;
};


export type QueryZenlinkInfoByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryZenlinkInfoByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryZenlinkInfosArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ZenlinkInfoOrderByInput>>;
  where?: InputMaybe<ZenlinkInfoWhereInput>;
};


export type QueryZenlinkInfosConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<ZenlinkInfoOrderByInput>;
  where?: InputMaybe<ZenlinkInfoWhereInput>;
};


export type QueryZlkInfoByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryZlkInfoByUniqueInputArgs = {
  where: WhereIdInput;
};


export type QueryZlkInfosArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ZlkInfoOrderByInput>>;
  where?: InputMaybe<ZlkInfoWhereInput>;
};


export type QueryZlkInfosConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<ZlkInfoOrderByInput>;
  where?: InputMaybe<ZlkInfoWhereInput>;
};

export type Router = {
  __typename?: 'Router';
  backstopPools: Array<BackstopPool>;
  id: Scalars['String']['output'];
  paused: Scalars['Boolean']['output'];
  swapPools: Array<SwapPool>;
};


export type RouterBackstopPoolsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<BackstopPoolOrderByInput>>;
  where?: InputMaybe<BackstopPoolWhereInput>;
};


export type RouterSwapPoolsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SwapPoolOrderByInput>>;
  where?: InputMaybe<SwapPoolWhereInput>;
};

export type RouterEdge = {
  __typename?: 'RouterEdge';
  cursor: Scalars['String']['output'];
  node: Router;
};

export enum RouterOrderByInput {
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  PausedAsc = 'paused_ASC',
  PausedDesc = 'paused_DESC'
}

export type RouterWhereInput = {
  AND?: InputMaybe<Array<RouterWhereInput>>;
  OR?: InputMaybe<Array<RouterWhereInput>>;
  backstopPools_every?: InputMaybe<BackstopPoolWhereInput>;
  backstopPools_none?: InputMaybe<BackstopPoolWhereInput>;
  backstopPools_some?: InputMaybe<BackstopPoolWhereInput>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  paused_eq?: InputMaybe<Scalars['Boolean']['input']>;
  paused_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  paused_not_eq?: InputMaybe<Scalars['Boolean']['input']>;
  swapPools_every?: InputMaybe<SwapPoolWhereInput>;
  swapPools_none?: InputMaybe<SwapPoolWhereInput>;
  swapPools_some?: InputMaybe<SwapPoolWhereInput>;
};

export type RoutersConnection = {
  __typename?: 'RoutersConnection';
  edges: Array<RouterEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type SingleTokenLock = {
  __typename?: 'SingleTokenLock';
  farm: Array<Farm>;
  id: Scalars['String']['output'];
  singleTokenLockDayData: Array<SingleTokenLockDayData>;
  singleTokenLockHourData: Array<SingleTokenLockHourData>;
  token: Token;
  /** BigDecimal */
  totalLiquidity: Scalars['String']['output'];
  totalLiquidityETH: Scalars['String']['output'];
  /** BigDecimal */
  totalLiquidityUSD: Scalars['String']['output'];
};


export type SingleTokenLockFarmArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<FarmOrderByInput>>;
  where?: InputMaybe<FarmWhereInput>;
};


export type SingleTokenLockSingleTokenLockDayDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SingleTokenLockDayDataOrderByInput>>;
  where?: InputMaybe<SingleTokenLockDayDataWhereInput>;
};


export type SingleTokenLockSingleTokenLockHourDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SingleTokenLockHourDataOrderByInput>>;
  where?: InputMaybe<SingleTokenLockHourDataWhereInput>;
};

export type SingleTokenLockDayData = {
  __typename?: 'SingleTokenLockDayData';
  date: Scalars['DateTime']['output'];
  id: Scalars['String']['output'];
  singleTokenLock: SingleTokenLock;
  totalLiquidity: Scalars['String']['output'];
  totalLiquidityETH: Scalars['String']['output'];
  totalLiquidityUSD: Scalars['String']['output'];
};

export type SingleTokenLockDayDataConnection = {
  __typename?: 'SingleTokenLockDayDataConnection';
  edges: Array<SingleTokenLockDayDataEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type SingleTokenLockDayDataEdge = {
  __typename?: 'SingleTokenLockDayDataEdge';
  cursor: Scalars['String']['output'];
  node: SingleTokenLockDayData;
};

export enum SingleTokenLockDayDataOrderByInput {
  DateAsc = 'date_ASC',
  DateDesc = 'date_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  SingleTokenLockIdAsc = 'singleTokenLock_id_ASC',
  SingleTokenLockIdDesc = 'singleTokenLock_id_DESC',
  SingleTokenLockTotalLiquidityEthAsc = 'singleTokenLock_totalLiquidityETH_ASC',
  SingleTokenLockTotalLiquidityEthDesc = 'singleTokenLock_totalLiquidityETH_DESC',
  SingleTokenLockTotalLiquidityUsdAsc = 'singleTokenLock_totalLiquidityUSD_ASC',
  SingleTokenLockTotalLiquidityUsdDesc = 'singleTokenLock_totalLiquidityUSD_DESC',
  SingleTokenLockTotalLiquidityAsc = 'singleTokenLock_totalLiquidity_ASC',
  SingleTokenLockTotalLiquidityDesc = 'singleTokenLock_totalLiquidity_DESC',
  TotalLiquidityEthAsc = 'totalLiquidityETH_ASC',
  TotalLiquidityEthDesc = 'totalLiquidityETH_DESC',
  TotalLiquidityUsdAsc = 'totalLiquidityUSD_ASC',
  TotalLiquidityUsdDesc = 'totalLiquidityUSD_DESC',
  TotalLiquidityAsc = 'totalLiquidity_ASC',
  TotalLiquidityDesc = 'totalLiquidity_DESC'
}

export type SingleTokenLockDayDataWhereInput = {
  AND?: InputMaybe<Array<SingleTokenLockDayDataWhereInput>>;
  OR?: InputMaybe<Array<SingleTokenLockDayDataWhereInput>>;
  date_eq?: InputMaybe<Scalars['DateTime']['input']>;
  date_gt?: InputMaybe<Scalars['DateTime']['input']>;
  date_gte?: InputMaybe<Scalars['DateTime']['input']>;
  date_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  date_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  date_lt?: InputMaybe<Scalars['DateTime']['input']>;
  date_lte?: InputMaybe<Scalars['DateTime']['input']>;
  date_not_eq?: InputMaybe<Scalars['DateTime']['input']>;
  date_not_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  singleTokenLock?: InputMaybe<SingleTokenLockWhereInput>;
  singleTokenLock_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalLiquidityETH_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_gt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_gte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityETH_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalLiquidityETH_lt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_lte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityETH_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_gt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_gte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalLiquidityUSD_lt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_lte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_gt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_gte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidity_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalLiquidity_lt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_lte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidity_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type SingleTokenLockEdge = {
  __typename?: 'SingleTokenLockEdge';
  cursor: Scalars['String']['output'];
  node: SingleTokenLock;
};

export type SingleTokenLockHourData = {
  __typename?: 'SingleTokenLockHourData';
  hourStartUnix: Scalars['BigInt']['output'];
  id: Scalars['String']['output'];
  singleTokenLock: SingleTokenLock;
  totalLiquidity: Scalars['String']['output'];
  totalLiquidityETH: Scalars['String']['output'];
  totalLiquidityUSD: Scalars['String']['output'];
};

export type SingleTokenLockHourDataConnection = {
  __typename?: 'SingleTokenLockHourDataConnection';
  edges: Array<SingleTokenLockHourDataEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type SingleTokenLockHourDataEdge = {
  __typename?: 'SingleTokenLockHourDataEdge';
  cursor: Scalars['String']['output'];
  node: SingleTokenLockHourData;
};

export enum SingleTokenLockHourDataOrderByInput {
  HourStartUnixAsc = 'hourStartUnix_ASC',
  HourStartUnixDesc = 'hourStartUnix_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  SingleTokenLockIdAsc = 'singleTokenLock_id_ASC',
  SingleTokenLockIdDesc = 'singleTokenLock_id_DESC',
  SingleTokenLockTotalLiquidityEthAsc = 'singleTokenLock_totalLiquidityETH_ASC',
  SingleTokenLockTotalLiquidityEthDesc = 'singleTokenLock_totalLiquidityETH_DESC',
  SingleTokenLockTotalLiquidityUsdAsc = 'singleTokenLock_totalLiquidityUSD_ASC',
  SingleTokenLockTotalLiquidityUsdDesc = 'singleTokenLock_totalLiquidityUSD_DESC',
  SingleTokenLockTotalLiquidityAsc = 'singleTokenLock_totalLiquidity_ASC',
  SingleTokenLockTotalLiquidityDesc = 'singleTokenLock_totalLiquidity_DESC',
  TotalLiquidityEthAsc = 'totalLiquidityETH_ASC',
  TotalLiquidityEthDesc = 'totalLiquidityETH_DESC',
  TotalLiquidityUsdAsc = 'totalLiquidityUSD_ASC',
  TotalLiquidityUsdDesc = 'totalLiquidityUSD_DESC',
  TotalLiquidityAsc = 'totalLiquidity_ASC',
  TotalLiquidityDesc = 'totalLiquidity_DESC'
}

export type SingleTokenLockHourDataWhereInput = {
  AND?: InputMaybe<Array<SingleTokenLockHourDataWhereInput>>;
  OR?: InputMaybe<Array<SingleTokenLockHourDataWhereInput>>;
  hourStartUnix_eq?: InputMaybe<Scalars['BigInt']['input']>;
  hourStartUnix_gt?: InputMaybe<Scalars['BigInt']['input']>;
  hourStartUnix_gte?: InputMaybe<Scalars['BigInt']['input']>;
  hourStartUnix_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  hourStartUnix_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  hourStartUnix_lt?: InputMaybe<Scalars['BigInt']['input']>;
  hourStartUnix_lte?: InputMaybe<Scalars['BigInt']['input']>;
  hourStartUnix_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  hourStartUnix_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  singleTokenLock?: InputMaybe<SingleTokenLockWhereInput>;
  singleTokenLock_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalLiquidityETH_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_gt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_gte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityETH_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalLiquidityETH_lt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_lte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityETH_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_gt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_gte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalLiquidityUSD_lt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_lte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_gt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_gte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidity_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalLiquidity_lt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_lte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidity_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_startsWith?: InputMaybe<Scalars['String']['input']>;
};

export enum SingleTokenLockOrderByInput {
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  TokenDecimalsAsc = 'token_decimals_ASC',
  TokenDecimalsDesc = 'token_decimals_DESC',
  TokenDerivedEthAsc = 'token_derivedETH_ASC',
  TokenDerivedEthDesc = 'token_derivedETH_DESC',
  TokenIdAsc = 'token_id_ASC',
  TokenIdDesc = 'token_id_DESC',
  TokenNameAsc = 'token_name_ASC',
  TokenNameDesc = 'token_name_DESC',
  TokenSymbolAsc = 'token_symbol_ASC',
  TokenSymbolDesc = 'token_symbol_DESC',
  TokenTotalLiquidityAsc = 'token_totalLiquidity_ASC',
  TokenTotalLiquidityDesc = 'token_totalLiquidity_DESC',
  TokenTotalSupplyAsc = 'token_totalSupply_ASC',
  TokenTotalSupplyDesc = 'token_totalSupply_DESC',
  TokenTradeVolumeUsdAsc = 'token_tradeVolumeUSD_ASC',
  TokenTradeVolumeUsdDesc = 'token_tradeVolumeUSD_DESC',
  TokenTradeVolumeAsc = 'token_tradeVolume_ASC',
  TokenTradeVolumeDesc = 'token_tradeVolume_DESC',
  TokenTxCountAsc = 'token_txCount_ASC',
  TokenTxCountDesc = 'token_txCount_DESC',
  TokenUntrackedVolumeUsdAsc = 'token_untrackedVolumeUSD_ASC',
  TokenUntrackedVolumeUsdDesc = 'token_untrackedVolumeUSD_DESC',
  TotalLiquidityEthAsc = 'totalLiquidityETH_ASC',
  TotalLiquidityEthDesc = 'totalLiquidityETH_DESC',
  TotalLiquidityUsdAsc = 'totalLiquidityUSD_ASC',
  TotalLiquidityUsdDesc = 'totalLiquidityUSD_DESC',
  TotalLiquidityAsc = 'totalLiquidity_ASC',
  TotalLiquidityDesc = 'totalLiquidity_DESC'
}

export type SingleTokenLockWhereInput = {
  AND?: InputMaybe<Array<SingleTokenLockWhereInput>>;
  OR?: InputMaybe<Array<SingleTokenLockWhereInput>>;
  farm_every?: InputMaybe<FarmWhereInput>;
  farm_none?: InputMaybe<FarmWhereInput>;
  farm_some?: InputMaybe<FarmWhereInput>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  singleTokenLockDayData_every?: InputMaybe<SingleTokenLockDayDataWhereInput>;
  singleTokenLockDayData_none?: InputMaybe<SingleTokenLockDayDataWhereInput>;
  singleTokenLockDayData_some?: InputMaybe<SingleTokenLockDayDataWhereInput>;
  singleTokenLockHourData_every?: InputMaybe<SingleTokenLockHourDataWhereInput>;
  singleTokenLockHourData_none?: InputMaybe<SingleTokenLockHourDataWhereInput>;
  singleTokenLockHourData_some?: InputMaybe<SingleTokenLockHourDataWhereInput>;
  token?: InputMaybe<TokenWhereInput>;
  token_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalLiquidityETH_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_gt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_gte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityETH_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalLiquidityETH_lt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_lte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityETH_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_gt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_gte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalLiquidityUSD_lt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_lte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_gt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_gte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidity_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalLiquidity_lt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_lte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidity_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type SingleTokenLocksConnection = {
  __typename?: 'SingleTokenLocksConnection';
  edges: Array<SingleTokenLockEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type SquidStatus = {
  __typename?: 'SquidStatus';
  /** The height of the processed part of the chain */
  height?: Maybe<Scalars['Int']['output']>;
};

export type StableDayData = {
  __typename?: 'StableDayData';
  dailyVolumeUSD: Scalars['String']['output'];
  date: Scalars['DateTime']['output'];
  id: Scalars['String']['output'];
  tvlUSD: Scalars['String']['output'];
};

export type StableDayDataConnection = {
  __typename?: 'StableDayDataConnection';
  edges: Array<StableDayDataEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type StableDayDataEdge = {
  __typename?: 'StableDayDataEdge';
  cursor: Scalars['String']['output'];
  node: StableDayData;
};

export enum StableDayDataOrderByInput {
  DailyVolumeUsdAsc = 'dailyVolumeUSD_ASC',
  DailyVolumeUsdDesc = 'dailyVolumeUSD_DESC',
  DateAsc = 'date_ASC',
  DateDesc = 'date_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  TvlUsdAsc = 'tvlUSD_ASC',
  TvlUsdDesc = 'tvlUSD_DESC'
}

export type StableDayDataWhereInput = {
  AND?: InputMaybe<Array<StableDayDataWhereInput>>;
  OR?: InputMaybe<Array<StableDayDataWhereInput>>;
  dailyVolumeUSD_contains?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_eq?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_gt?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_gte?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  dailyVolumeUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  dailyVolumeUSD_lt?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_lte?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  dailyVolumeUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  date_eq?: InputMaybe<Scalars['DateTime']['input']>;
  date_gt?: InputMaybe<Scalars['DateTime']['input']>;
  date_gte?: InputMaybe<Scalars['DateTime']['input']>;
  date_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  date_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  date_lt?: InputMaybe<Scalars['DateTime']['input']>;
  date_lte?: InputMaybe<Scalars['DateTime']['input']>;
  date_not_eq?: InputMaybe<Scalars['DateTime']['input']>;
  date_not_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_contains?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_eq?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_gt?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_gte?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  tvlUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  tvlUSD_lt?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_lte?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  tvlUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type StableSwap = {
  __typename?: 'StableSwap';
  a: Scalars['BigInt']['output'];
  address: Scalars['String']['output'];
  adminFee: Scalars['BigInt']['output'];
  allTokens: Array<Scalars['String']['output']>;
  balances: Array<Scalars['String']['output']>;
  baseSwapAddress: Scalars['String']['output'];
  baseTokens: Array<Scalars['String']['output']>;
  events: Array<StableSwapEvent>;
  exchanges: Array<StableSwapExchange>;
  farm: Array<Farm>;
  id: Scalars['String']['output'];
  lpToken: Scalars['String']['output'];
  lpTotalSupply: Scalars['String']['output'];
  numTokens: Scalars['Int']['output'];
  stableSwapDayData: Array<StableSwapDayData>;
  stableSwapHourData: Array<StableSwapHourData>;
  stableSwapInfo: StableSwapInfo;
  swapFee: Scalars['BigInt']['output'];
  tokens: Array<Scalars['String']['output']>;
  /** BigDecimal */
  tvlUSD: Scalars['String']['output'];
  virtualPrice: Scalars['BigInt']['output'];
  /** BigDecimal */
  volumeUSD: Scalars['String']['output'];
};


export type StableSwapEventsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StableSwapEventOrderByInput>>;
  where?: InputMaybe<StableSwapEventWhereInput>;
};


export type StableSwapExchangesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StableSwapExchangeOrderByInput>>;
  where?: InputMaybe<StableSwapExchangeWhereInput>;
};


export type StableSwapFarmArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<FarmOrderByInput>>;
  where?: InputMaybe<FarmWhereInput>;
};


export type StableSwapStableSwapDayDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StableSwapDayDataOrderByInput>>;
  where?: InputMaybe<StableSwapDayDataWhereInput>;
};


export type StableSwapStableSwapHourDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StableSwapHourDataOrderByInput>>;
  where?: InputMaybe<StableSwapHourDataWhereInput>;
};

export type StableSwapAddLiquidityEventData = {
  __typename?: 'StableSwapAddLiquidityEventData';
  fees: Array<Scalars['BigInt']['output']>;
  invariant?: Maybe<Scalars['BigInt']['output']>;
  lpTokenSupply: Scalars['BigInt']['output'];
  provider: Scalars['Bytes']['output'];
  tokenAmounts: Array<Scalars['BigInt']['output']>;
};

export type StableSwapDayData = {
  __typename?: 'StableSwapDayData';
  dailyVolumeUSD: Scalars['String']['output'];
  date: Scalars['DateTime']['output'];
  id: Scalars['String']['output'];
  stableSwap: StableSwap;
  tvlUSD: Scalars['String']['output'];
};

export type StableSwapDayDataConnection = {
  __typename?: 'StableSwapDayDataConnection';
  edges: Array<StableSwapDayDataEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type StableSwapDayDataEdge = {
  __typename?: 'StableSwapDayDataEdge';
  cursor: Scalars['String']['output'];
  node: StableSwapDayData;
};

export enum StableSwapDayDataOrderByInput {
  DailyVolumeUsdAsc = 'dailyVolumeUSD_ASC',
  DailyVolumeUsdDesc = 'dailyVolumeUSD_DESC',
  DateAsc = 'date_ASC',
  DateDesc = 'date_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  StableSwapAAsc = 'stableSwap_a_ASC',
  StableSwapADesc = 'stableSwap_a_DESC',
  StableSwapAddressAsc = 'stableSwap_address_ASC',
  StableSwapAddressDesc = 'stableSwap_address_DESC',
  StableSwapAdminFeeAsc = 'stableSwap_adminFee_ASC',
  StableSwapAdminFeeDesc = 'stableSwap_adminFee_DESC',
  StableSwapBaseSwapAddressAsc = 'stableSwap_baseSwapAddress_ASC',
  StableSwapBaseSwapAddressDesc = 'stableSwap_baseSwapAddress_DESC',
  StableSwapIdAsc = 'stableSwap_id_ASC',
  StableSwapIdDesc = 'stableSwap_id_DESC',
  StableSwapLpTokenAsc = 'stableSwap_lpToken_ASC',
  StableSwapLpTokenDesc = 'stableSwap_lpToken_DESC',
  StableSwapLpTotalSupplyAsc = 'stableSwap_lpTotalSupply_ASC',
  StableSwapLpTotalSupplyDesc = 'stableSwap_lpTotalSupply_DESC',
  StableSwapNumTokensAsc = 'stableSwap_numTokens_ASC',
  StableSwapNumTokensDesc = 'stableSwap_numTokens_DESC',
  StableSwapSwapFeeAsc = 'stableSwap_swapFee_ASC',
  StableSwapSwapFeeDesc = 'stableSwap_swapFee_DESC',
  StableSwapTvlUsdAsc = 'stableSwap_tvlUSD_ASC',
  StableSwapTvlUsdDesc = 'stableSwap_tvlUSD_DESC',
  StableSwapVirtualPriceAsc = 'stableSwap_virtualPrice_ASC',
  StableSwapVirtualPriceDesc = 'stableSwap_virtualPrice_DESC',
  StableSwapVolumeUsdAsc = 'stableSwap_volumeUSD_ASC',
  StableSwapVolumeUsdDesc = 'stableSwap_volumeUSD_DESC',
  TvlUsdAsc = 'tvlUSD_ASC',
  TvlUsdDesc = 'tvlUSD_DESC'
}

export type StableSwapDayDataWhereInput = {
  AND?: InputMaybe<Array<StableSwapDayDataWhereInput>>;
  OR?: InputMaybe<Array<StableSwapDayDataWhereInput>>;
  dailyVolumeUSD_contains?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_eq?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_gt?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_gte?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  dailyVolumeUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  dailyVolumeUSD_lt?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_lte?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  dailyVolumeUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  date_eq?: InputMaybe<Scalars['DateTime']['input']>;
  date_gt?: InputMaybe<Scalars['DateTime']['input']>;
  date_gte?: InputMaybe<Scalars['DateTime']['input']>;
  date_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  date_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  date_lt?: InputMaybe<Scalars['DateTime']['input']>;
  date_lte?: InputMaybe<Scalars['DateTime']['input']>;
  date_not_eq?: InputMaybe<Scalars['DateTime']['input']>;
  date_not_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  stableSwap?: InputMaybe<StableSwapWhereInput>;
  stableSwap_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  tvlUSD_contains?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_eq?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_gt?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_gte?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  tvlUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  tvlUSD_lt?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_lte?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  tvlUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type StableSwapEdge = {
  __typename?: 'StableSwapEdge';
  cursor: Scalars['String']['output'];
  node: StableSwap;
};

export type StableSwapEvent = {
  __typename?: 'StableSwapEvent';
  block: Scalars['BigInt']['output'];
  data?: Maybe<StableSwapEventData>;
  id: Scalars['String']['output'];
  stableSwap: StableSwap;
  timestamp: Scalars['BigInt']['output'];
  transaction: Scalars['Bytes']['output'];
};

export type StableSwapEventData = StableSwapAddLiquidityEventData | StableSwapFlashLoanEventData | StableSwapNewFeeEventData | StableSwapRampAEventData | StableSwapRemoveLiquidityEventData | StableSwapStopRampAEventData;

export type StableSwapEventDataWhereInput = {
  adminFee_eq?: InputMaybe<Scalars['BigInt']['input']>;
  adminFee_gt?: InputMaybe<Scalars['BigInt']['input']>;
  adminFee_gte?: InputMaybe<Scalars['BigInt']['input']>;
  adminFee_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  adminFee_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  adminFee_lt?: InputMaybe<Scalars['BigInt']['input']>;
  adminFee_lte?: InputMaybe<Scalars['BigInt']['input']>;
  adminFee_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  adminFee_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  amountsOut_containsAll?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  amountsOut_containsAny?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  amountsOut_containsNone?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  amountsOut_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  caller_eq?: InputMaybe<Scalars['Bytes']['input']>;
  caller_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  caller_not_eq?: InputMaybe<Scalars['Bytes']['input']>;
  currentA_eq?: InputMaybe<Scalars['BigInt']['input']>;
  currentA_gt?: InputMaybe<Scalars['BigInt']['input']>;
  currentA_gte?: InputMaybe<Scalars['BigInt']['input']>;
  currentA_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  currentA_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  currentA_lt?: InputMaybe<Scalars['BigInt']['input']>;
  currentA_lte?: InputMaybe<Scalars['BigInt']['input']>;
  currentA_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  currentA_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  fees_containsAll?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  fees_containsAny?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  fees_containsNone?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  fees_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  futureTime_eq?: InputMaybe<Scalars['BigInt']['input']>;
  futureTime_gt?: InputMaybe<Scalars['BigInt']['input']>;
  futureTime_gte?: InputMaybe<Scalars['BigInt']['input']>;
  futureTime_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  futureTime_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  futureTime_lt?: InputMaybe<Scalars['BigInt']['input']>;
  futureTime_lte?: InputMaybe<Scalars['BigInt']['input']>;
  futureTime_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  futureTime_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  initialTime_eq?: InputMaybe<Scalars['BigInt']['input']>;
  initialTime_gt?: InputMaybe<Scalars['BigInt']['input']>;
  initialTime_gte?: InputMaybe<Scalars['BigInt']['input']>;
  initialTime_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  initialTime_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  initialTime_lt?: InputMaybe<Scalars['BigInt']['input']>;
  initialTime_lte?: InputMaybe<Scalars['BigInt']['input']>;
  initialTime_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  initialTime_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  invariant_eq?: InputMaybe<Scalars['BigInt']['input']>;
  invariant_gt?: InputMaybe<Scalars['BigInt']['input']>;
  invariant_gte?: InputMaybe<Scalars['BigInt']['input']>;
  invariant_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  invariant_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  invariant_lt?: InputMaybe<Scalars['BigInt']['input']>;
  invariant_lte?: InputMaybe<Scalars['BigInt']['input']>;
  invariant_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  invariant_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  isTypeOf_contains?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_endsWith?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_eq?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_gt?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_gte?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_in?: InputMaybe<Array<Scalars['String']['input']>>;
  isTypeOf_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  isTypeOf_lt?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_lte?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_not_contains?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_not_eq?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  isTypeOf_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_startsWith?: InputMaybe<Scalars['String']['input']>;
  lpTokenSupply_eq?: InputMaybe<Scalars['BigInt']['input']>;
  lpTokenSupply_gt?: InputMaybe<Scalars['BigInt']['input']>;
  lpTokenSupply_gte?: InputMaybe<Scalars['BigInt']['input']>;
  lpTokenSupply_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  lpTokenSupply_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  lpTokenSupply_lt?: InputMaybe<Scalars['BigInt']['input']>;
  lpTokenSupply_lte?: InputMaybe<Scalars['BigInt']['input']>;
  lpTokenSupply_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  lpTokenSupply_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  newA_eq?: InputMaybe<Scalars['BigInt']['input']>;
  newA_gt?: InputMaybe<Scalars['BigInt']['input']>;
  newA_gte?: InputMaybe<Scalars['BigInt']['input']>;
  newA_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  newA_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  newA_lt?: InputMaybe<Scalars['BigInt']['input']>;
  newA_lte?: InputMaybe<Scalars['BigInt']['input']>;
  newA_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  newA_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  oldA_eq?: InputMaybe<Scalars['BigInt']['input']>;
  oldA_gt?: InputMaybe<Scalars['BigInt']['input']>;
  oldA_gte?: InputMaybe<Scalars['BigInt']['input']>;
  oldA_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  oldA_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  oldA_lt?: InputMaybe<Scalars['BigInt']['input']>;
  oldA_lte?: InputMaybe<Scalars['BigInt']['input']>;
  oldA_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  oldA_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  provider_eq?: InputMaybe<Scalars['Bytes']['input']>;
  provider_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  provider_not_eq?: InputMaybe<Scalars['Bytes']['input']>;
  receiver_eq?: InputMaybe<Scalars['Bytes']['input']>;
  receiver_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  receiver_not_eq?: InputMaybe<Scalars['Bytes']['input']>;
  swapFee_eq?: InputMaybe<Scalars['BigInt']['input']>;
  swapFee_gt?: InputMaybe<Scalars['BigInt']['input']>;
  swapFee_gte?: InputMaybe<Scalars['BigInt']['input']>;
  swapFee_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  swapFee_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  swapFee_lt?: InputMaybe<Scalars['BigInt']['input']>;
  swapFee_lte?: InputMaybe<Scalars['BigInt']['input']>;
  swapFee_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  swapFee_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  time_eq?: InputMaybe<Scalars['BigInt']['input']>;
  time_gt?: InputMaybe<Scalars['BigInt']['input']>;
  time_gte?: InputMaybe<Scalars['BigInt']['input']>;
  time_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  time_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  time_lt?: InputMaybe<Scalars['BigInt']['input']>;
  time_lte?: InputMaybe<Scalars['BigInt']['input']>;
  time_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  time_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  tokenAmounts_containsAll?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  tokenAmounts_containsAny?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  tokenAmounts_containsNone?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  tokenAmounts_isNull?: InputMaybe<Scalars['Boolean']['input']>;
};

export type StableSwapEventEdge = {
  __typename?: 'StableSwapEventEdge';
  cursor: Scalars['String']['output'];
  node: StableSwapEvent;
};

export enum StableSwapEventOrderByInput {
  BlockAsc = 'block_ASC',
  BlockDesc = 'block_DESC',
  DataAdminFeeAsc = 'data_adminFee_ASC',
  DataAdminFeeDesc = 'data_adminFee_DESC',
  DataCallerAsc = 'data_caller_ASC',
  DataCallerDesc = 'data_caller_DESC',
  DataCurrentAAsc = 'data_currentA_ASC',
  DataCurrentADesc = 'data_currentA_DESC',
  DataFutureTimeAsc = 'data_futureTime_ASC',
  DataFutureTimeDesc = 'data_futureTime_DESC',
  DataInitialTimeAsc = 'data_initialTime_ASC',
  DataInitialTimeDesc = 'data_initialTime_DESC',
  DataInvariantAsc = 'data_invariant_ASC',
  DataInvariantDesc = 'data_invariant_DESC',
  DataIsTypeOfAsc = 'data_isTypeOf_ASC',
  DataIsTypeOfDesc = 'data_isTypeOf_DESC',
  DataLpTokenSupplyAsc = 'data_lpTokenSupply_ASC',
  DataLpTokenSupplyDesc = 'data_lpTokenSupply_DESC',
  DataNewAAsc = 'data_newA_ASC',
  DataNewADesc = 'data_newA_DESC',
  DataOldAAsc = 'data_oldA_ASC',
  DataOldADesc = 'data_oldA_DESC',
  DataProviderAsc = 'data_provider_ASC',
  DataProviderDesc = 'data_provider_DESC',
  DataReceiverAsc = 'data_receiver_ASC',
  DataReceiverDesc = 'data_receiver_DESC',
  DataSwapFeeAsc = 'data_swapFee_ASC',
  DataSwapFeeDesc = 'data_swapFee_DESC',
  DataTimeAsc = 'data_time_ASC',
  DataTimeDesc = 'data_time_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  StableSwapAAsc = 'stableSwap_a_ASC',
  StableSwapADesc = 'stableSwap_a_DESC',
  StableSwapAddressAsc = 'stableSwap_address_ASC',
  StableSwapAddressDesc = 'stableSwap_address_DESC',
  StableSwapAdminFeeAsc = 'stableSwap_adminFee_ASC',
  StableSwapAdminFeeDesc = 'stableSwap_adminFee_DESC',
  StableSwapBaseSwapAddressAsc = 'stableSwap_baseSwapAddress_ASC',
  StableSwapBaseSwapAddressDesc = 'stableSwap_baseSwapAddress_DESC',
  StableSwapIdAsc = 'stableSwap_id_ASC',
  StableSwapIdDesc = 'stableSwap_id_DESC',
  StableSwapLpTokenAsc = 'stableSwap_lpToken_ASC',
  StableSwapLpTokenDesc = 'stableSwap_lpToken_DESC',
  StableSwapLpTotalSupplyAsc = 'stableSwap_lpTotalSupply_ASC',
  StableSwapLpTotalSupplyDesc = 'stableSwap_lpTotalSupply_DESC',
  StableSwapNumTokensAsc = 'stableSwap_numTokens_ASC',
  StableSwapNumTokensDesc = 'stableSwap_numTokens_DESC',
  StableSwapSwapFeeAsc = 'stableSwap_swapFee_ASC',
  StableSwapSwapFeeDesc = 'stableSwap_swapFee_DESC',
  StableSwapTvlUsdAsc = 'stableSwap_tvlUSD_ASC',
  StableSwapTvlUsdDesc = 'stableSwap_tvlUSD_DESC',
  StableSwapVirtualPriceAsc = 'stableSwap_virtualPrice_ASC',
  StableSwapVirtualPriceDesc = 'stableSwap_virtualPrice_DESC',
  StableSwapVolumeUsdAsc = 'stableSwap_volumeUSD_ASC',
  StableSwapVolumeUsdDesc = 'stableSwap_volumeUSD_DESC',
  TimestampAsc = 'timestamp_ASC',
  TimestampDesc = 'timestamp_DESC',
  TransactionAsc = 'transaction_ASC',
  TransactionDesc = 'transaction_DESC'
}

export type StableSwapEventWhereInput = {
  AND?: InputMaybe<Array<StableSwapEventWhereInput>>;
  OR?: InputMaybe<Array<StableSwapEventWhereInput>>;
  block_eq?: InputMaybe<Scalars['BigInt']['input']>;
  block_gt?: InputMaybe<Scalars['BigInt']['input']>;
  block_gte?: InputMaybe<Scalars['BigInt']['input']>;
  block_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  block_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  block_lt?: InputMaybe<Scalars['BigInt']['input']>;
  block_lte?: InputMaybe<Scalars['BigInt']['input']>;
  block_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  block_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  data?: InputMaybe<StableSwapEventDataWhereInput>;
  data_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  stableSwap?: InputMaybe<StableSwapWhereInput>;
  stableSwap_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  timestamp_eq?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  timestamp_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  timestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  transaction_eq?: InputMaybe<Scalars['Bytes']['input']>;
  transaction_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  transaction_not_eq?: InputMaybe<Scalars['Bytes']['input']>;
};

export type StableSwapEventsConnection = {
  __typename?: 'StableSwapEventsConnection';
  edges: Array<StableSwapEventEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type StableSwapExchange = {
  __typename?: 'StableSwapExchange';
  block: Scalars['BigInt']['output'];
  data?: Maybe<StableSwapExchangeData>;
  id: Scalars['String']['output'];
  stableSwap: StableSwap;
  timestamp: Scalars['BigInt']['output'];
  transaction: Scalars['Bytes']['output'];
};

export type StableSwapExchangeData = StableSwapTokenExchangeData | StableSwapTokenExchangeUnderlyingData;

export type StableSwapExchangeDataWhereInput = {
  boughtId_eq?: InputMaybe<Scalars['BigInt']['input']>;
  boughtId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  boughtId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  boughtId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  boughtId_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  boughtId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  boughtId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  boughtId_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  boughtId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  buyer_eq?: InputMaybe<Scalars['Bytes']['input']>;
  buyer_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  buyer_not_eq?: InputMaybe<Scalars['Bytes']['input']>;
  isTypeOf_contains?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_endsWith?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_eq?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_gt?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_gte?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_in?: InputMaybe<Array<Scalars['String']['input']>>;
  isTypeOf_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  isTypeOf_lt?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_lte?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_not_contains?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_not_eq?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  isTypeOf_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  isTypeOf_startsWith?: InputMaybe<Scalars['String']['input']>;
  soldId_eq?: InputMaybe<Scalars['BigInt']['input']>;
  soldId_gt?: InputMaybe<Scalars['BigInt']['input']>;
  soldId_gte?: InputMaybe<Scalars['BigInt']['input']>;
  soldId_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  soldId_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  soldId_lt?: InputMaybe<Scalars['BigInt']['input']>;
  soldId_lte?: InputMaybe<Scalars['BigInt']['input']>;
  soldId_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  soldId_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  tokensBought_eq?: InputMaybe<Scalars['BigInt']['input']>;
  tokensBought_gt?: InputMaybe<Scalars['BigInt']['input']>;
  tokensBought_gte?: InputMaybe<Scalars['BigInt']['input']>;
  tokensBought_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  tokensBought_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  tokensBought_lt?: InputMaybe<Scalars['BigInt']['input']>;
  tokensBought_lte?: InputMaybe<Scalars['BigInt']['input']>;
  tokensBought_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  tokensBought_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  tokensSold_eq?: InputMaybe<Scalars['BigInt']['input']>;
  tokensSold_gt?: InputMaybe<Scalars['BigInt']['input']>;
  tokensSold_gte?: InputMaybe<Scalars['BigInt']['input']>;
  tokensSold_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  tokensSold_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  tokensSold_lt?: InputMaybe<Scalars['BigInt']['input']>;
  tokensSold_lte?: InputMaybe<Scalars['BigInt']['input']>;
  tokensSold_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  tokensSold_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
};

export type StableSwapExchangeEdge = {
  __typename?: 'StableSwapExchangeEdge';
  cursor: Scalars['String']['output'];
  node: StableSwapExchange;
};

export enum StableSwapExchangeOrderByInput {
  BlockAsc = 'block_ASC',
  BlockDesc = 'block_DESC',
  DataBoughtIdAsc = 'data_boughtId_ASC',
  DataBoughtIdDesc = 'data_boughtId_DESC',
  DataBuyerAsc = 'data_buyer_ASC',
  DataBuyerDesc = 'data_buyer_DESC',
  DataIsTypeOfAsc = 'data_isTypeOf_ASC',
  DataIsTypeOfDesc = 'data_isTypeOf_DESC',
  DataSoldIdAsc = 'data_soldId_ASC',
  DataSoldIdDesc = 'data_soldId_DESC',
  DataTokensBoughtAsc = 'data_tokensBought_ASC',
  DataTokensBoughtDesc = 'data_tokensBought_DESC',
  DataTokensSoldAsc = 'data_tokensSold_ASC',
  DataTokensSoldDesc = 'data_tokensSold_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  StableSwapAAsc = 'stableSwap_a_ASC',
  StableSwapADesc = 'stableSwap_a_DESC',
  StableSwapAddressAsc = 'stableSwap_address_ASC',
  StableSwapAddressDesc = 'stableSwap_address_DESC',
  StableSwapAdminFeeAsc = 'stableSwap_adminFee_ASC',
  StableSwapAdminFeeDesc = 'stableSwap_adminFee_DESC',
  StableSwapBaseSwapAddressAsc = 'stableSwap_baseSwapAddress_ASC',
  StableSwapBaseSwapAddressDesc = 'stableSwap_baseSwapAddress_DESC',
  StableSwapIdAsc = 'stableSwap_id_ASC',
  StableSwapIdDesc = 'stableSwap_id_DESC',
  StableSwapLpTokenAsc = 'stableSwap_lpToken_ASC',
  StableSwapLpTokenDesc = 'stableSwap_lpToken_DESC',
  StableSwapLpTotalSupplyAsc = 'stableSwap_lpTotalSupply_ASC',
  StableSwapLpTotalSupplyDesc = 'stableSwap_lpTotalSupply_DESC',
  StableSwapNumTokensAsc = 'stableSwap_numTokens_ASC',
  StableSwapNumTokensDesc = 'stableSwap_numTokens_DESC',
  StableSwapSwapFeeAsc = 'stableSwap_swapFee_ASC',
  StableSwapSwapFeeDesc = 'stableSwap_swapFee_DESC',
  StableSwapTvlUsdAsc = 'stableSwap_tvlUSD_ASC',
  StableSwapTvlUsdDesc = 'stableSwap_tvlUSD_DESC',
  StableSwapVirtualPriceAsc = 'stableSwap_virtualPrice_ASC',
  StableSwapVirtualPriceDesc = 'stableSwap_virtualPrice_DESC',
  StableSwapVolumeUsdAsc = 'stableSwap_volumeUSD_ASC',
  StableSwapVolumeUsdDesc = 'stableSwap_volumeUSD_DESC',
  TimestampAsc = 'timestamp_ASC',
  TimestampDesc = 'timestamp_DESC',
  TransactionAsc = 'transaction_ASC',
  TransactionDesc = 'transaction_DESC'
}

export type StableSwapExchangeWhereInput = {
  AND?: InputMaybe<Array<StableSwapExchangeWhereInput>>;
  OR?: InputMaybe<Array<StableSwapExchangeWhereInput>>;
  block_eq?: InputMaybe<Scalars['BigInt']['input']>;
  block_gt?: InputMaybe<Scalars['BigInt']['input']>;
  block_gte?: InputMaybe<Scalars['BigInt']['input']>;
  block_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  block_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  block_lt?: InputMaybe<Scalars['BigInt']['input']>;
  block_lte?: InputMaybe<Scalars['BigInt']['input']>;
  block_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  block_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  data?: InputMaybe<StableSwapExchangeDataWhereInput>;
  data_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  stableSwap?: InputMaybe<StableSwapWhereInput>;
  stableSwap_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  timestamp_eq?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_gt?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_gte?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  timestamp_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  timestamp_lt?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_lte?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  timestamp_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  transaction_eq?: InputMaybe<Scalars['Bytes']['input']>;
  transaction_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  transaction_not_eq?: InputMaybe<Scalars['Bytes']['input']>;
};

export type StableSwapExchangesConnection = {
  __typename?: 'StableSwapExchangesConnection';
  edges: Array<StableSwapExchangeEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type StableSwapFlashLoanEventData = {
  __typename?: 'StableSwapFlashLoanEventData';
  amountsOut: Array<Scalars['BigInt']['output']>;
  caller: Scalars['Bytes']['output'];
  receiver: Scalars['Bytes']['output'];
};

export type StableSwapHourData = {
  __typename?: 'StableSwapHourData';
  hourStartUnix: Scalars['BigInt']['output'];
  hourlyVolumeUSD: Scalars['String']['output'];
  id: Scalars['String']['output'];
  stableSwap: StableSwap;
  tvlUSD: Scalars['String']['output'];
};

export type StableSwapHourDataConnection = {
  __typename?: 'StableSwapHourDataConnection';
  edges: Array<StableSwapHourDataEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type StableSwapHourDataEdge = {
  __typename?: 'StableSwapHourDataEdge';
  cursor: Scalars['String']['output'];
  node: StableSwapHourData;
};

export enum StableSwapHourDataOrderByInput {
  HourStartUnixAsc = 'hourStartUnix_ASC',
  HourStartUnixDesc = 'hourStartUnix_DESC',
  HourlyVolumeUsdAsc = 'hourlyVolumeUSD_ASC',
  HourlyVolumeUsdDesc = 'hourlyVolumeUSD_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  StableSwapAAsc = 'stableSwap_a_ASC',
  StableSwapADesc = 'stableSwap_a_DESC',
  StableSwapAddressAsc = 'stableSwap_address_ASC',
  StableSwapAddressDesc = 'stableSwap_address_DESC',
  StableSwapAdminFeeAsc = 'stableSwap_adminFee_ASC',
  StableSwapAdminFeeDesc = 'stableSwap_adminFee_DESC',
  StableSwapBaseSwapAddressAsc = 'stableSwap_baseSwapAddress_ASC',
  StableSwapBaseSwapAddressDesc = 'stableSwap_baseSwapAddress_DESC',
  StableSwapIdAsc = 'stableSwap_id_ASC',
  StableSwapIdDesc = 'stableSwap_id_DESC',
  StableSwapLpTokenAsc = 'stableSwap_lpToken_ASC',
  StableSwapLpTokenDesc = 'stableSwap_lpToken_DESC',
  StableSwapLpTotalSupplyAsc = 'stableSwap_lpTotalSupply_ASC',
  StableSwapLpTotalSupplyDesc = 'stableSwap_lpTotalSupply_DESC',
  StableSwapNumTokensAsc = 'stableSwap_numTokens_ASC',
  StableSwapNumTokensDesc = 'stableSwap_numTokens_DESC',
  StableSwapSwapFeeAsc = 'stableSwap_swapFee_ASC',
  StableSwapSwapFeeDesc = 'stableSwap_swapFee_DESC',
  StableSwapTvlUsdAsc = 'stableSwap_tvlUSD_ASC',
  StableSwapTvlUsdDesc = 'stableSwap_tvlUSD_DESC',
  StableSwapVirtualPriceAsc = 'stableSwap_virtualPrice_ASC',
  StableSwapVirtualPriceDesc = 'stableSwap_virtualPrice_DESC',
  StableSwapVolumeUsdAsc = 'stableSwap_volumeUSD_ASC',
  StableSwapVolumeUsdDesc = 'stableSwap_volumeUSD_DESC',
  TvlUsdAsc = 'tvlUSD_ASC',
  TvlUsdDesc = 'tvlUSD_DESC'
}

export type StableSwapHourDataWhereInput = {
  AND?: InputMaybe<Array<StableSwapHourDataWhereInput>>;
  OR?: InputMaybe<Array<StableSwapHourDataWhereInput>>;
  hourStartUnix_eq?: InputMaybe<Scalars['BigInt']['input']>;
  hourStartUnix_gt?: InputMaybe<Scalars['BigInt']['input']>;
  hourStartUnix_gte?: InputMaybe<Scalars['BigInt']['input']>;
  hourStartUnix_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  hourStartUnix_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  hourStartUnix_lt?: InputMaybe<Scalars['BigInt']['input']>;
  hourStartUnix_lte?: InputMaybe<Scalars['BigInt']['input']>;
  hourStartUnix_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  hourStartUnix_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  hourlyVolumeUSD_contains?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_eq?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_gt?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_gte?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  hourlyVolumeUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  hourlyVolumeUSD_lt?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_lte?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  hourlyVolumeUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  hourlyVolumeUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  stableSwap?: InputMaybe<StableSwapWhereInput>;
  stableSwap_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  tvlUSD_contains?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_eq?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_gt?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_gte?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  tvlUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  tvlUSD_lt?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_lte?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  tvlUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type StableSwapInfo = {
  __typename?: 'StableSwapInfo';
  id: Scalars['String']['output'];
  poolCount: Scalars['Int']['output'];
  swaps: Array<StableSwap>;
  /** BigDecimal */
  totalTvlUSD: Scalars['String']['output'];
  /** BigDecimal */
  totalVolumeUSD: Scalars['String']['output'];
  txCount: Scalars['Int']['output'];
};


export type StableSwapInfoSwapsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StableSwapOrderByInput>>;
  where?: InputMaybe<StableSwapWhereInput>;
};

export type StableSwapInfoEdge = {
  __typename?: 'StableSwapInfoEdge';
  cursor: Scalars['String']['output'];
  node: StableSwapInfo;
};

export enum StableSwapInfoOrderByInput {
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  PoolCountAsc = 'poolCount_ASC',
  PoolCountDesc = 'poolCount_DESC',
  TotalTvlUsdAsc = 'totalTvlUSD_ASC',
  TotalTvlUsdDesc = 'totalTvlUSD_DESC',
  TotalVolumeUsdAsc = 'totalVolumeUSD_ASC',
  TotalVolumeUsdDesc = 'totalVolumeUSD_DESC',
  TxCountAsc = 'txCount_ASC',
  TxCountDesc = 'txCount_DESC'
}

export type StableSwapInfoWhereInput = {
  AND?: InputMaybe<Array<StableSwapInfoWhereInput>>;
  OR?: InputMaybe<Array<StableSwapInfoWhereInput>>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  poolCount_eq?: InputMaybe<Scalars['Int']['input']>;
  poolCount_gt?: InputMaybe<Scalars['Int']['input']>;
  poolCount_gte?: InputMaybe<Scalars['Int']['input']>;
  poolCount_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  poolCount_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  poolCount_lt?: InputMaybe<Scalars['Int']['input']>;
  poolCount_lte?: InputMaybe<Scalars['Int']['input']>;
  poolCount_not_eq?: InputMaybe<Scalars['Int']['input']>;
  poolCount_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  swaps_every?: InputMaybe<StableSwapWhereInput>;
  swaps_none?: InputMaybe<StableSwapWhereInput>;
  swaps_some?: InputMaybe<StableSwapWhereInput>;
  totalTvlUSD_contains?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_eq?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_gt?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_gte?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalTvlUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalTvlUSD_lt?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_lte?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalTvlUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_contains?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_eq?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_gt?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_gte?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalVolumeUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalVolumeUSD_lt?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_lte?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalVolumeUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  txCount_eq?: InputMaybe<Scalars['Int']['input']>;
  txCount_gt?: InputMaybe<Scalars['Int']['input']>;
  txCount_gte?: InputMaybe<Scalars['Int']['input']>;
  txCount_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  txCount_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  txCount_lt?: InputMaybe<Scalars['Int']['input']>;
  txCount_lte?: InputMaybe<Scalars['Int']['input']>;
  txCount_not_eq?: InputMaybe<Scalars['Int']['input']>;
  txCount_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
};

export type StableSwapInfosConnection = {
  __typename?: 'StableSwapInfosConnection';
  edges: Array<StableSwapInfoEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type StableSwapLiquidityPosition = {
  __typename?: 'StableSwapLiquidityPosition';
  id: Scalars['String']['output'];
  liquidityTokenBalance: Scalars['String']['output'];
  stableSwap: StableSwap;
  user: User;
};

export type StableSwapLiquidityPositionEdge = {
  __typename?: 'StableSwapLiquidityPositionEdge';
  cursor: Scalars['String']['output'];
  node: StableSwapLiquidityPosition;
};

export enum StableSwapLiquidityPositionOrderByInput {
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  LiquidityTokenBalanceAsc = 'liquidityTokenBalance_ASC',
  LiquidityTokenBalanceDesc = 'liquidityTokenBalance_DESC',
  StableSwapAAsc = 'stableSwap_a_ASC',
  StableSwapADesc = 'stableSwap_a_DESC',
  StableSwapAddressAsc = 'stableSwap_address_ASC',
  StableSwapAddressDesc = 'stableSwap_address_DESC',
  StableSwapAdminFeeAsc = 'stableSwap_adminFee_ASC',
  StableSwapAdminFeeDesc = 'stableSwap_adminFee_DESC',
  StableSwapBaseSwapAddressAsc = 'stableSwap_baseSwapAddress_ASC',
  StableSwapBaseSwapAddressDesc = 'stableSwap_baseSwapAddress_DESC',
  StableSwapIdAsc = 'stableSwap_id_ASC',
  StableSwapIdDesc = 'stableSwap_id_DESC',
  StableSwapLpTokenAsc = 'stableSwap_lpToken_ASC',
  StableSwapLpTokenDesc = 'stableSwap_lpToken_DESC',
  StableSwapLpTotalSupplyAsc = 'stableSwap_lpTotalSupply_ASC',
  StableSwapLpTotalSupplyDesc = 'stableSwap_lpTotalSupply_DESC',
  StableSwapNumTokensAsc = 'stableSwap_numTokens_ASC',
  StableSwapNumTokensDesc = 'stableSwap_numTokens_DESC',
  StableSwapSwapFeeAsc = 'stableSwap_swapFee_ASC',
  StableSwapSwapFeeDesc = 'stableSwap_swapFee_DESC',
  StableSwapTvlUsdAsc = 'stableSwap_tvlUSD_ASC',
  StableSwapTvlUsdDesc = 'stableSwap_tvlUSD_DESC',
  StableSwapVirtualPriceAsc = 'stableSwap_virtualPrice_ASC',
  StableSwapVirtualPriceDesc = 'stableSwap_virtualPrice_DESC',
  StableSwapVolumeUsdAsc = 'stableSwap_volumeUSD_ASC',
  StableSwapVolumeUsdDesc = 'stableSwap_volumeUSD_DESC',
  UserIdAsc = 'user_id_ASC',
  UserIdDesc = 'user_id_DESC',
  UserUsdSwappedAsc = 'user_usdSwapped_ASC',
  UserUsdSwappedDesc = 'user_usdSwapped_DESC'
}

export type StableSwapLiquidityPositionWhereInput = {
  AND?: InputMaybe<Array<StableSwapLiquidityPositionWhereInput>>;
  OR?: InputMaybe<Array<StableSwapLiquidityPositionWhereInput>>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_contains?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_endsWith?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_eq?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_gt?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_gte?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_in?: InputMaybe<Array<Scalars['String']['input']>>;
  liquidityTokenBalance_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  liquidityTokenBalance_lt?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_lte?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_not_contains?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_not_eq?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  liquidityTokenBalance_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  liquidityTokenBalance_startsWith?: InputMaybe<Scalars['String']['input']>;
  stableSwap?: InputMaybe<StableSwapWhereInput>;
  stableSwap_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  user?: InputMaybe<UserWhereInput>;
  user_isNull?: InputMaybe<Scalars['Boolean']['input']>;
};

export type StableSwapLiquidityPositionsConnection = {
  __typename?: 'StableSwapLiquidityPositionsConnection';
  edges: Array<StableSwapLiquidityPositionEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type StableSwapNewFeeEventData = {
  __typename?: 'StableSwapNewFeeEventData';
  adminFee: Scalars['BigInt']['output'];
  swapFee: Scalars['BigInt']['output'];
};

export enum StableSwapOrderByInput {
  AAsc = 'a_ASC',
  ADesc = 'a_DESC',
  AddressAsc = 'address_ASC',
  AddressDesc = 'address_DESC',
  AdminFeeAsc = 'adminFee_ASC',
  AdminFeeDesc = 'adminFee_DESC',
  BaseSwapAddressAsc = 'baseSwapAddress_ASC',
  BaseSwapAddressDesc = 'baseSwapAddress_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  LpTokenAsc = 'lpToken_ASC',
  LpTokenDesc = 'lpToken_DESC',
  LpTotalSupplyAsc = 'lpTotalSupply_ASC',
  LpTotalSupplyDesc = 'lpTotalSupply_DESC',
  NumTokensAsc = 'numTokens_ASC',
  NumTokensDesc = 'numTokens_DESC',
  StableSwapInfoIdAsc = 'stableSwapInfo_id_ASC',
  StableSwapInfoIdDesc = 'stableSwapInfo_id_DESC',
  StableSwapInfoPoolCountAsc = 'stableSwapInfo_poolCount_ASC',
  StableSwapInfoPoolCountDesc = 'stableSwapInfo_poolCount_DESC',
  StableSwapInfoTotalTvlUsdAsc = 'stableSwapInfo_totalTvlUSD_ASC',
  StableSwapInfoTotalTvlUsdDesc = 'stableSwapInfo_totalTvlUSD_DESC',
  StableSwapInfoTotalVolumeUsdAsc = 'stableSwapInfo_totalVolumeUSD_ASC',
  StableSwapInfoTotalVolumeUsdDesc = 'stableSwapInfo_totalVolumeUSD_DESC',
  StableSwapInfoTxCountAsc = 'stableSwapInfo_txCount_ASC',
  StableSwapInfoTxCountDesc = 'stableSwapInfo_txCount_DESC',
  SwapFeeAsc = 'swapFee_ASC',
  SwapFeeDesc = 'swapFee_DESC',
  TvlUsdAsc = 'tvlUSD_ASC',
  TvlUsdDesc = 'tvlUSD_DESC',
  VirtualPriceAsc = 'virtualPrice_ASC',
  VirtualPriceDesc = 'virtualPrice_DESC',
  VolumeUsdAsc = 'volumeUSD_ASC',
  VolumeUsdDesc = 'volumeUSD_DESC'
}

export type StableSwapRampAEventData = {
  __typename?: 'StableSwapRampAEventData';
  futureTime: Scalars['BigInt']['output'];
  initialTime: Scalars['BigInt']['output'];
  newA: Scalars['BigInt']['output'];
  oldA: Scalars['BigInt']['output'];
};

export type StableSwapRemoveLiquidityEventData = {
  __typename?: 'StableSwapRemoveLiquidityEventData';
  fees?: Maybe<Array<Scalars['BigInt']['output']>>;
  lpTokenSupply?: Maybe<Scalars['BigInt']['output']>;
  provider: Scalars['Bytes']['output'];
  tokenAmounts: Array<Scalars['BigInt']['output']>;
};

export type StableSwapStopRampAEventData = {
  __typename?: 'StableSwapStopRampAEventData';
  currentA: Scalars['BigInt']['output'];
  time: Scalars['BigInt']['output'];
};

export type StableSwapTokenExchangeData = {
  __typename?: 'StableSwapTokenExchangeData';
  boughtId: Scalars['BigInt']['output'];
  buyer: Scalars['Bytes']['output'];
  soldId: Scalars['BigInt']['output'];
  tokensBought: Scalars['BigInt']['output'];
  tokensSold: Scalars['BigInt']['output'];
};

export type StableSwapTokenExchangeUnderlyingData = {
  __typename?: 'StableSwapTokenExchangeUnderlyingData';
  boughtId: Scalars['BigInt']['output'];
  buyer: Scalars['Bytes']['output'];
  soldId: Scalars['BigInt']['output'];
  tokensBought: Scalars['BigInt']['output'];
  tokensSold: Scalars['BigInt']['output'];
};

export type StableSwapWhereInput = {
  AND?: InputMaybe<Array<StableSwapWhereInput>>;
  OR?: InputMaybe<Array<StableSwapWhereInput>>;
  a_eq?: InputMaybe<Scalars['BigInt']['input']>;
  a_gt?: InputMaybe<Scalars['BigInt']['input']>;
  a_gte?: InputMaybe<Scalars['BigInt']['input']>;
  a_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  a_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  a_lt?: InputMaybe<Scalars['BigInt']['input']>;
  a_lte?: InputMaybe<Scalars['BigInt']['input']>;
  a_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  a_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  address_contains?: InputMaybe<Scalars['String']['input']>;
  address_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  address_endsWith?: InputMaybe<Scalars['String']['input']>;
  address_eq?: InputMaybe<Scalars['String']['input']>;
  address_gt?: InputMaybe<Scalars['String']['input']>;
  address_gte?: InputMaybe<Scalars['String']['input']>;
  address_in?: InputMaybe<Array<Scalars['String']['input']>>;
  address_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  address_lt?: InputMaybe<Scalars['String']['input']>;
  address_lte?: InputMaybe<Scalars['String']['input']>;
  address_not_contains?: InputMaybe<Scalars['String']['input']>;
  address_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  address_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  address_not_eq?: InputMaybe<Scalars['String']['input']>;
  address_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  address_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  address_startsWith?: InputMaybe<Scalars['String']['input']>;
  adminFee_eq?: InputMaybe<Scalars['BigInt']['input']>;
  adminFee_gt?: InputMaybe<Scalars['BigInt']['input']>;
  adminFee_gte?: InputMaybe<Scalars['BigInt']['input']>;
  adminFee_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  adminFee_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  adminFee_lt?: InputMaybe<Scalars['BigInt']['input']>;
  adminFee_lte?: InputMaybe<Scalars['BigInt']['input']>;
  adminFee_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  adminFee_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  allTokens_containsAll?: InputMaybe<Array<Scalars['String']['input']>>;
  allTokens_containsAny?: InputMaybe<Array<Scalars['String']['input']>>;
  allTokens_containsNone?: InputMaybe<Array<Scalars['String']['input']>>;
  allTokens_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  balances_containsAll?: InputMaybe<Array<Scalars['String']['input']>>;
  balances_containsAny?: InputMaybe<Array<Scalars['String']['input']>>;
  balances_containsNone?: InputMaybe<Array<Scalars['String']['input']>>;
  balances_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  baseSwapAddress_contains?: InputMaybe<Scalars['String']['input']>;
  baseSwapAddress_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  baseSwapAddress_endsWith?: InputMaybe<Scalars['String']['input']>;
  baseSwapAddress_eq?: InputMaybe<Scalars['String']['input']>;
  baseSwapAddress_gt?: InputMaybe<Scalars['String']['input']>;
  baseSwapAddress_gte?: InputMaybe<Scalars['String']['input']>;
  baseSwapAddress_in?: InputMaybe<Array<Scalars['String']['input']>>;
  baseSwapAddress_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  baseSwapAddress_lt?: InputMaybe<Scalars['String']['input']>;
  baseSwapAddress_lte?: InputMaybe<Scalars['String']['input']>;
  baseSwapAddress_not_contains?: InputMaybe<Scalars['String']['input']>;
  baseSwapAddress_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  baseSwapAddress_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  baseSwapAddress_not_eq?: InputMaybe<Scalars['String']['input']>;
  baseSwapAddress_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  baseSwapAddress_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  baseSwapAddress_startsWith?: InputMaybe<Scalars['String']['input']>;
  baseTokens_containsAll?: InputMaybe<Array<Scalars['String']['input']>>;
  baseTokens_containsAny?: InputMaybe<Array<Scalars['String']['input']>>;
  baseTokens_containsNone?: InputMaybe<Array<Scalars['String']['input']>>;
  baseTokens_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  events_every?: InputMaybe<StableSwapEventWhereInput>;
  events_none?: InputMaybe<StableSwapEventWhereInput>;
  events_some?: InputMaybe<StableSwapEventWhereInput>;
  exchanges_every?: InputMaybe<StableSwapExchangeWhereInput>;
  exchanges_none?: InputMaybe<StableSwapExchangeWhereInput>;
  exchanges_some?: InputMaybe<StableSwapExchangeWhereInput>;
  farm_every?: InputMaybe<FarmWhereInput>;
  farm_none?: InputMaybe<FarmWhereInput>;
  farm_some?: InputMaybe<FarmWhereInput>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  lpToken_contains?: InputMaybe<Scalars['String']['input']>;
  lpToken_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  lpToken_endsWith?: InputMaybe<Scalars['String']['input']>;
  lpToken_eq?: InputMaybe<Scalars['String']['input']>;
  lpToken_gt?: InputMaybe<Scalars['String']['input']>;
  lpToken_gte?: InputMaybe<Scalars['String']['input']>;
  lpToken_in?: InputMaybe<Array<Scalars['String']['input']>>;
  lpToken_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  lpToken_lt?: InputMaybe<Scalars['String']['input']>;
  lpToken_lte?: InputMaybe<Scalars['String']['input']>;
  lpToken_not_contains?: InputMaybe<Scalars['String']['input']>;
  lpToken_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  lpToken_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  lpToken_not_eq?: InputMaybe<Scalars['String']['input']>;
  lpToken_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  lpToken_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  lpToken_startsWith?: InputMaybe<Scalars['String']['input']>;
  lpTotalSupply_contains?: InputMaybe<Scalars['String']['input']>;
  lpTotalSupply_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  lpTotalSupply_endsWith?: InputMaybe<Scalars['String']['input']>;
  lpTotalSupply_eq?: InputMaybe<Scalars['String']['input']>;
  lpTotalSupply_gt?: InputMaybe<Scalars['String']['input']>;
  lpTotalSupply_gte?: InputMaybe<Scalars['String']['input']>;
  lpTotalSupply_in?: InputMaybe<Array<Scalars['String']['input']>>;
  lpTotalSupply_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  lpTotalSupply_lt?: InputMaybe<Scalars['String']['input']>;
  lpTotalSupply_lte?: InputMaybe<Scalars['String']['input']>;
  lpTotalSupply_not_contains?: InputMaybe<Scalars['String']['input']>;
  lpTotalSupply_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  lpTotalSupply_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  lpTotalSupply_not_eq?: InputMaybe<Scalars['String']['input']>;
  lpTotalSupply_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  lpTotalSupply_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  lpTotalSupply_startsWith?: InputMaybe<Scalars['String']['input']>;
  numTokens_eq?: InputMaybe<Scalars['Int']['input']>;
  numTokens_gt?: InputMaybe<Scalars['Int']['input']>;
  numTokens_gte?: InputMaybe<Scalars['Int']['input']>;
  numTokens_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  numTokens_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  numTokens_lt?: InputMaybe<Scalars['Int']['input']>;
  numTokens_lte?: InputMaybe<Scalars['Int']['input']>;
  numTokens_not_eq?: InputMaybe<Scalars['Int']['input']>;
  numTokens_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  stableSwapDayData_every?: InputMaybe<StableSwapDayDataWhereInput>;
  stableSwapDayData_none?: InputMaybe<StableSwapDayDataWhereInput>;
  stableSwapDayData_some?: InputMaybe<StableSwapDayDataWhereInput>;
  stableSwapHourData_every?: InputMaybe<StableSwapHourDataWhereInput>;
  stableSwapHourData_none?: InputMaybe<StableSwapHourDataWhereInput>;
  stableSwapHourData_some?: InputMaybe<StableSwapHourDataWhereInput>;
  stableSwapInfo?: InputMaybe<StableSwapInfoWhereInput>;
  stableSwapInfo_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  swapFee_eq?: InputMaybe<Scalars['BigInt']['input']>;
  swapFee_gt?: InputMaybe<Scalars['BigInt']['input']>;
  swapFee_gte?: InputMaybe<Scalars['BigInt']['input']>;
  swapFee_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  swapFee_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  swapFee_lt?: InputMaybe<Scalars['BigInt']['input']>;
  swapFee_lte?: InputMaybe<Scalars['BigInt']['input']>;
  swapFee_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  swapFee_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  tokens_containsAll?: InputMaybe<Array<Scalars['String']['input']>>;
  tokens_containsAny?: InputMaybe<Array<Scalars['String']['input']>>;
  tokens_containsNone?: InputMaybe<Array<Scalars['String']['input']>>;
  tokens_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  tvlUSD_contains?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_eq?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_gt?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_gte?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  tvlUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  tvlUSD_lt?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_lte?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  tvlUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  virtualPrice_eq?: InputMaybe<Scalars['BigInt']['input']>;
  virtualPrice_gt?: InputMaybe<Scalars['BigInt']['input']>;
  virtualPrice_gte?: InputMaybe<Scalars['BigInt']['input']>;
  virtualPrice_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  virtualPrice_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  virtualPrice_lt?: InputMaybe<Scalars['BigInt']['input']>;
  virtualPrice_lte?: InputMaybe<Scalars['BigInt']['input']>;
  virtualPrice_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  virtualPrice_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  volumeUSD_contains?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_eq?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_gt?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_gte?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  volumeUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  volumeUSD_lt?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_lte?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  volumeUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  volumeUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type StableSwapsConnection = {
  __typename?: 'StableSwapsConnection';
  edges: Array<StableSwapEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type StakePosition = {
  __typename?: 'StakePosition';
  farm: Farm;
  id: Scalars['String']['output'];
  liquidityStakedBalance: Scalars['BigInt']['output'];
  user: User;
};

export type StakePositionEdge = {
  __typename?: 'StakePositionEdge';
  cursor: Scalars['String']['output'];
  node: StakePosition;
};

export enum StakePositionOrderByInput {
  FarmCreatedAtBlockAsc = 'farm_createdAtBlock_ASC',
  FarmCreatedAtBlockDesc = 'farm_createdAtBlock_DESC',
  FarmCreatedAtTimestampAsc = 'farm_createdAtTimestamp_ASC',
  FarmCreatedAtTimestampDesc = 'farm_createdAtTimestamp_DESC',
  FarmIdAsc = 'farm_id_ASC',
  FarmIdDesc = 'farm_id_DESC',
  FarmLiquidityStakedAsc = 'farm_liquidityStaked_ASC',
  FarmLiquidityStakedDesc = 'farm_liquidityStaked_DESC',
  FarmPidAsc = 'farm_pid_ASC',
  FarmPidDesc = 'farm_pid_DESC',
  FarmRewardUsdPerDayAsc = 'farm_rewardUSDPerDay_ASC',
  FarmRewardUsdPerDayDesc = 'farm_rewardUSDPerDay_DESC',
  FarmStakeAprAsc = 'farm_stakeApr_ASC',
  FarmStakeAprDesc = 'farm_stakeApr_DESC',
  FarmStakeTokenAsc = 'farm_stakeToken_ASC',
  FarmStakeTokenDesc = 'farm_stakeToken_DESC',
  FarmStakedUsdAsc = 'farm_stakedUSD_ASC',
  FarmStakedUsdDesc = 'farm_stakedUSD_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  LiquidityStakedBalanceAsc = 'liquidityStakedBalance_ASC',
  LiquidityStakedBalanceDesc = 'liquidityStakedBalance_DESC',
  UserIdAsc = 'user_id_ASC',
  UserIdDesc = 'user_id_DESC',
  UserUsdSwappedAsc = 'user_usdSwapped_ASC',
  UserUsdSwappedDesc = 'user_usdSwapped_DESC'
}

export type StakePositionWhereInput = {
  AND?: InputMaybe<Array<StakePositionWhereInput>>;
  OR?: InputMaybe<Array<StakePositionWhereInput>>;
  farm?: InputMaybe<FarmWhereInput>;
  farm_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  liquidityStakedBalance_eq?: InputMaybe<Scalars['BigInt']['input']>;
  liquidityStakedBalance_gt?: InputMaybe<Scalars['BigInt']['input']>;
  liquidityStakedBalance_gte?: InputMaybe<Scalars['BigInt']['input']>;
  liquidityStakedBalance_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  liquidityStakedBalance_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  liquidityStakedBalance_lt?: InputMaybe<Scalars['BigInt']['input']>;
  liquidityStakedBalance_lte?: InputMaybe<Scalars['BigInt']['input']>;
  liquidityStakedBalance_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  liquidityStakedBalance_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  user?: InputMaybe<UserWhereInput>;
  user_isNull?: InputMaybe<Scalars['Boolean']['input']>;
};

export type StakePositionsConnection = {
  __typename?: 'StakePositionsConnection';
  edges: Array<StakePositionEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type Swap = {
  __typename?: 'Swap';
  amount0In: Scalars['String']['output'];
  amount0Out: Scalars['String']['output'];
  amount1In: Scalars['String']['output'];
  amount1Out: Scalars['String']['output'];
  amountUSD: Scalars['String']['output'];
  from: Scalars['String']['output'];
  id: Scalars['String']['output'];
  logIndex?: Maybe<Scalars['Int']['output']>;
  pair: Pair;
  sender: Scalars['String']['output'];
  timestamp: Scalars['DateTime']['output'];
  to: Scalars['String']['output'];
  transaction: Transaction;
};

export type SwapEdge = {
  __typename?: 'SwapEdge';
  cursor: Scalars['String']['output'];
  node: Swap;
};

export enum SwapOrderByInput {
  Amount0InAsc = 'amount0In_ASC',
  Amount0InDesc = 'amount0In_DESC',
  Amount0OutAsc = 'amount0Out_ASC',
  Amount0OutDesc = 'amount0Out_DESC',
  Amount1InAsc = 'amount1In_ASC',
  Amount1InDesc = 'amount1In_DESC',
  Amount1OutAsc = 'amount1Out_ASC',
  Amount1OutDesc = 'amount1Out_DESC',
  AmountUsdAsc = 'amountUSD_ASC',
  AmountUsdDesc = 'amountUSD_DESC',
  FromAsc = 'from_ASC',
  FromDesc = 'from_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  LogIndexAsc = 'logIndex_ASC',
  LogIndexDesc = 'logIndex_DESC',
  PairCreatedAtBlockNumberAsc = 'pair_createdAtBlockNumber_ASC',
  PairCreatedAtBlockNumberDesc = 'pair_createdAtBlockNumber_DESC',
  PairCreatedAtTimestampAsc = 'pair_createdAtTimestamp_ASC',
  PairCreatedAtTimestampDesc = 'pair_createdAtTimestamp_DESC',
  PairIdAsc = 'pair_id_ASC',
  PairIdDesc = 'pair_id_DESC',
  PairLiquidityProviderCountAsc = 'pair_liquidityProviderCount_ASC',
  PairLiquidityProviderCountDesc = 'pair_liquidityProviderCount_DESC',
  PairReserve0Asc = 'pair_reserve0_ASC',
  PairReserve0Desc = 'pair_reserve0_DESC',
  PairReserve1Asc = 'pair_reserve1_ASC',
  PairReserve1Desc = 'pair_reserve1_DESC',
  PairReserveEthAsc = 'pair_reserveETH_ASC',
  PairReserveEthDesc = 'pair_reserveETH_DESC',
  PairReserveUsdAsc = 'pair_reserveUSD_ASC',
  PairReserveUsdDesc = 'pair_reserveUSD_DESC',
  PairToken0PriceAsc = 'pair_token0Price_ASC',
  PairToken0PriceDesc = 'pair_token0Price_DESC',
  PairToken1PriceAsc = 'pair_token1Price_ASC',
  PairToken1PriceDesc = 'pair_token1Price_DESC',
  PairTotalSupplyAsc = 'pair_totalSupply_ASC',
  PairTotalSupplyDesc = 'pair_totalSupply_DESC',
  PairTrackedReserveEthAsc = 'pair_trackedReserveETH_ASC',
  PairTrackedReserveEthDesc = 'pair_trackedReserveETH_DESC',
  PairTxCountAsc = 'pair_txCount_ASC',
  PairTxCountDesc = 'pair_txCount_DESC',
  PairUntrackedVolumeUsdAsc = 'pair_untrackedVolumeUSD_ASC',
  PairUntrackedVolumeUsdDesc = 'pair_untrackedVolumeUSD_DESC',
  PairVolumeToken0Asc = 'pair_volumeToken0_ASC',
  PairVolumeToken0Desc = 'pair_volumeToken0_DESC',
  PairVolumeToken1Asc = 'pair_volumeToken1_ASC',
  PairVolumeToken1Desc = 'pair_volumeToken1_DESC',
  PairVolumeUsdAsc = 'pair_volumeUSD_ASC',
  PairVolumeUsdDesc = 'pair_volumeUSD_DESC',
  SenderAsc = 'sender_ASC',
  SenderDesc = 'sender_DESC',
  TimestampAsc = 'timestamp_ASC',
  TimestampDesc = 'timestamp_DESC',
  ToAsc = 'to_ASC',
  ToDesc = 'to_DESC',
  TransactionBlockNumberAsc = 'transaction_blockNumber_ASC',
  TransactionBlockNumberDesc = 'transaction_blockNumber_DESC',
  TransactionIdAsc = 'transaction_id_ASC',
  TransactionIdDesc = 'transaction_id_DESC',
  TransactionTimestampAsc = 'transaction_timestamp_ASC',
  TransactionTimestampDesc = 'transaction_timestamp_DESC'
}

export type SwapPool = {
  __typename?: 'SwapPool';
  backstop: BackstopPool;
  id: Scalars['String']['output'];
  liabilities: Scalars['BigInt']['output'];
  paused: Scalars['Boolean']['output'];
  reserves: Scalars['BigInt']['output'];
  router: Router;
  token: NablaToken;
  totalSupply: Scalars['BigInt']['output'];
};

export type SwapPoolEdge = {
  __typename?: 'SwapPoolEdge';
  cursor: Scalars['String']['output'];
  node: SwapPool;
};

export enum SwapPoolOrderByInput {
  BackstopIdAsc = 'backstop_id_ASC',
  BackstopIdDesc = 'backstop_id_DESC',
  BackstopLiabilitiesAsc = 'backstop_liabilities_ASC',
  BackstopLiabilitiesDesc = 'backstop_liabilities_DESC',
  BackstopPausedAsc = 'backstop_paused_ASC',
  BackstopPausedDesc = 'backstop_paused_DESC',
  BackstopReservesAsc = 'backstop_reserves_ASC',
  BackstopReservesDesc = 'backstop_reserves_DESC',
  BackstopTotalSupplyAsc = 'backstop_totalSupply_ASC',
  BackstopTotalSupplyDesc = 'backstop_totalSupply_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  LiabilitiesAsc = 'liabilities_ASC',
  LiabilitiesDesc = 'liabilities_DESC',
  PausedAsc = 'paused_ASC',
  PausedDesc = 'paused_DESC',
  ReservesAsc = 'reserves_ASC',
  ReservesDesc = 'reserves_DESC',
  RouterIdAsc = 'router_id_ASC',
  RouterIdDesc = 'router_id_DESC',
  RouterPausedAsc = 'router_paused_ASC',
  RouterPausedDesc = 'router_paused_DESC',
  TokenDecimalsAsc = 'token_decimals_ASC',
  TokenDecimalsDesc = 'token_decimals_DESC',
  TokenIdAsc = 'token_id_ASC',
  TokenIdDesc = 'token_id_DESC',
  TokenNameAsc = 'token_name_ASC',
  TokenNameDesc = 'token_name_DESC',
  TokenSymbolAsc = 'token_symbol_ASC',
  TokenSymbolDesc = 'token_symbol_DESC',
  TotalSupplyAsc = 'totalSupply_ASC',
  TotalSupplyDesc = 'totalSupply_DESC'
}

export type SwapPoolWhereInput = {
  AND?: InputMaybe<Array<SwapPoolWhereInput>>;
  OR?: InputMaybe<Array<SwapPoolWhereInput>>;
  backstop?: InputMaybe<BackstopPoolWhereInput>;
  backstop_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  liabilities_eq?: InputMaybe<Scalars['BigInt']['input']>;
  liabilities_gt?: InputMaybe<Scalars['BigInt']['input']>;
  liabilities_gte?: InputMaybe<Scalars['BigInt']['input']>;
  liabilities_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  liabilities_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  liabilities_lt?: InputMaybe<Scalars['BigInt']['input']>;
  liabilities_lte?: InputMaybe<Scalars['BigInt']['input']>;
  liabilities_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  liabilities_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  paused_eq?: InputMaybe<Scalars['Boolean']['input']>;
  paused_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  paused_not_eq?: InputMaybe<Scalars['Boolean']['input']>;
  reserves_eq?: InputMaybe<Scalars['BigInt']['input']>;
  reserves_gt?: InputMaybe<Scalars['BigInt']['input']>;
  reserves_gte?: InputMaybe<Scalars['BigInt']['input']>;
  reserves_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  reserves_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  reserves_lt?: InputMaybe<Scalars['BigInt']['input']>;
  reserves_lte?: InputMaybe<Scalars['BigInt']['input']>;
  reserves_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  reserves_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  router?: InputMaybe<RouterWhereInput>;
  router_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  token?: InputMaybe<NablaTokenWhereInput>;
  token_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalSupply_eq?: InputMaybe<Scalars['BigInt']['input']>;
  totalSupply_gt?: InputMaybe<Scalars['BigInt']['input']>;
  totalSupply_gte?: InputMaybe<Scalars['BigInt']['input']>;
  totalSupply_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  totalSupply_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalSupply_lt?: InputMaybe<Scalars['BigInt']['input']>;
  totalSupply_lte?: InputMaybe<Scalars['BigInt']['input']>;
  totalSupply_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  totalSupply_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
};

export type SwapPoolsConnection = {
  __typename?: 'SwapPoolsConnection';
  edges: Array<SwapPoolEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type SwapWhereInput = {
  AND?: InputMaybe<Array<SwapWhereInput>>;
  OR?: InputMaybe<Array<SwapWhereInput>>;
  amount0In_contains?: InputMaybe<Scalars['String']['input']>;
  amount0In_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  amount0In_endsWith?: InputMaybe<Scalars['String']['input']>;
  amount0In_eq?: InputMaybe<Scalars['String']['input']>;
  amount0In_gt?: InputMaybe<Scalars['String']['input']>;
  amount0In_gte?: InputMaybe<Scalars['String']['input']>;
  amount0In_in?: InputMaybe<Array<Scalars['String']['input']>>;
  amount0In_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  amount0In_lt?: InputMaybe<Scalars['String']['input']>;
  amount0In_lte?: InputMaybe<Scalars['String']['input']>;
  amount0In_not_contains?: InputMaybe<Scalars['String']['input']>;
  amount0In_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  amount0In_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  amount0In_not_eq?: InputMaybe<Scalars['String']['input']>;
  amount0In_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  amount0In_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  amount0In_startsWith?: InputMaybe<Scalars['String']['input']>;
  amount0Out_contains?: InputMaybe<Scalars['String']['input']>;
  amount0Out_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  amount0Out_endsWith?: InputMaybe<Scalars['String']['input']>;
  amount0Out_eq?: InputMaybe<Scalars['String']['input']>;
  amount0Out_gt?: InputMaybe<Scalars['String']['input']>;
  amount0Out_gte?: InputMaybe<Scalars['String']['input']>;
  amount0Out_in?: InputMaybe<Array<Scalars['String']['input']>>;
  amount0Out_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  amount0Out_lt?: InputMaybe<Scalars['String']['input']>;
  amount0Out_lte?: InputMaybe<Scalars['String']['input']>;
  amount0Out_not_contains?: InputMaybe<Scalars['String']['input']>;
  amount0Out_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  amount0Out_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  amount0Out_not_eq?: InputMaybe<Scalars['String']['input']>;
  amount0Out_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  amount0Out_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  amount0Out_startsWith?: InputMaybe<Scalars['String']['input']>;
  amount1In_contains?: InputMaybe<Scalars['String']['input']>;
  amount1In_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  amount1In_endsWith?: InputMaybe<Scalars['String']['input']>;
  amount1In_eq?: InputMaybe<Scalars['String']['input']>;
  amount1In_gt?: InputMaybe<Scalars['String']['input']>;
  amount1In_gte?: InputMaybe<Scalars['String']['input']>;
  amount1In_in?: InputMaybe<Array<Scalars['String']['input']>>;
  amount1In_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  amount1In_lt?: InputMaybe<Scalars['String']['input']>;
  amount1In_lte?: InputMaybe<Scalars['String']['input']>;
  amount1In_not_contains?: InputMaybe<Scalars['String']['input']>;
  amount1In_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  amount1In_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  amount1In_not_eq?: InputMaybe<Scalars['String']['input']>;
  amount1In_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  amount1In_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  amount1In_startsWith?: InputMaybe<Scalars['String']['input']>;
  amount1Out_contains?: InputMaybe<Scalars['String']['input']>;
  amount1Out_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  amount1Out_endsWith?: InputMaybe<Scalars['String']['input']>;
  amount1Out_eq?: InputMaybe<Scalars['String']['input']>;
  amount1Out_gt?: InputMaybe<Scalars['String']['input']>;
  amount1Out_gte?: InputMaybe<Scalars['String']['input']>;
  amount1Out_in?: InputMaybe<Array<Scalars['String']['input']>>;
  amount1Out_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  amount1Out_lt?: InputMaybe<Scalars['String']['input']>;
  amount1Out_lte?: InputMaybe<Scalars['String']['input']>;
  amount1Out_not_contains?: InputMaybe<Scalars['String']['input']>;
  amount1Out_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  amount1Out_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  amount1Out_not_eq?: InputMaybe<Scalars['String']['input']>;
  amount1Out_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  amount1Out_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  amount1Out_startsWith?: InputMaybe<Scalars['String']['input']>;
  amountUSD_contains?: InputMaybe<Scalars['String']['input']>;
  amountUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  amountUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  amountUSD_eq?: InputMaybe<Scalars['String']['input']>;
  amountUSD_gt?: InputMaybe<Scalars['String']['input']>;
  amountUSD_gte?: InputMaybe<Scalars['String']['input']>;
  amountUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  amountUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  amountUSD_lt?: InputMaybe<Scalars['String']['input']>;
  amountUSD_lte?: InputMaybe<Scalars['String']['input']>;
  amountUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  amountUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  amountUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  amountUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  amountUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  amountUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  amountUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  from_contains?: InputMaybe<Scalars['String']['input']>;
  from_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  from_endsWith?: InputMaybe<Scalars['String']['input']>;
  from_eq?: InputMaybe<Scalars['String']['input']>;
  from_gt?: InputMaybe<Scalars['String']['input']>;
  from_gte?: InputMaybe<Scalars['String']['input']>;
  from_in?: InputMaybe<Array<Scalars['String']['input']>>;
  from_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  from_lt?: InputMaybe<Scalars['String']['input']>;
  from_lte?: InputMaybe<Scalars['String']['input']>;
  from_not_contains?: InputMaybe<Scalars['String']['input']>;
  from_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  from_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  from_not_eq?: InputMaybe<Scalars['String']['input']>;
  from_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  from_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  from_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  logIndex_eq?: InputMaybe<Scalars['Int']['input']>;
  logIndex_gt?: InputMaybe<Scalars['Int']['input']>;
  logIndex_gte?: InputMaybe<Scalars['Int']['input']>;
  logIndex_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  logIndex_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  logIndex_lt?: InputMaybe<Scalars['Int']['input']>;
  logIndex_lte?: InputMaybe<Scalars['Int']['input']>;
  logIndex_not_eq?: InputMaybe<Scalars['Int']['input']>;
  logIndex_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  pair?: InputMaybe<PairWhereInput>;
  pair_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  sender_contains?: InputMaybe<Scalars['String']['input']>;
  sender_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  sender_endsWith?: InputMaybe<Scalars['String']['input']>;
  sender_eq?: InputMaybe<Scalars['String']['input']>;
  sender_gt?: InputMaybe<Scalars['String']['input']>;
  sender_gte?: InputMaybe<Scalars['String']['input']>;
  sender_in?: InputMaybe<Array<Scalars['String']['input']>>;
  sender_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  sender_lt?: InputMaybe<Scalars['String']['input']>;
  sender_lte?: InputMaybe<Scalars['String']['input']>;
  sender_not_contains?: InputMaybe<Scalars['String']['input']>;
  sender_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  sender_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  sender_not_eq?: InputMaybe<Scalars['String']['input']>;
  sender_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  sender_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  sender_startsWith?: InputMaybe<Scalars['String']['input']>;
  timestamp_eq?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_gt?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_gte?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  timestamp_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  timestamp_lt?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_lte?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_not_eq?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_not_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  to_contains?: InputMaybe<Scalars['String']['input']>;
  to_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  to_endsWith?: InputMaybe<Scalars['String']['input']>;
  to_eq?: InputMaybe<Scalars['String']['input']>;
  to_gt?: InputMaybe<Scalars['String']['input']>;
  to_gte?: InputMaybe<Scalars['String']['input']>;
  to_in?: InputMaybe<Array<Scalars['String']['input']>>;
  to_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  to_lt?: InputMaybe<Scalars['String']['input']>;
  to_lte?: InputMaybe<Scalars['String']['input']>;
  to_not_contains?: InputMaybe<Scalars['String']['input']>;
  to_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  to_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  to_not_eq?: InputMaybe<Scalars['String']['input']>;
  to_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  to_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  to_startsWith?: InputMaybe<Scalars['String']['input']>;
  transaction?: InputMaybe<TransactionWhereInput>;
  transaction_isNull?: InputMaybe<Scalars['Boolean']['input']>;
};

export type SwapsConnection = {
  __typename?: 'SwapsConnection';
  edges: Array<SwapEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type Token = {
  __typename?: 'Token';
  decimals: Scalars['Int']['output'];
  /** BigDecimal */
  derivedETH: Scalars['String']['output'];
  id: Scalars['String']['output'];
  name: Scalars['String']['output'];
  pairBase: Array<Pair>;
  pairDayDataBase: Array<PairDayData>;
  pairDayDataQuote: Array<PairDayData>;
  pairQuote: Array<Pair>;
  symbol: Scalars['String']['output'];
  tokenDayData: Array<TokenDayData>;
  /** BigDecimal */
  totalLiquidity: Scalars['String']['output'];
  totalSupply: Scalars['String']['output'];
  /** BigDecimal */
  tradeVolume: Scalars['String']['output'];
  /** BigDecimal */
  tradeVolumeUSD: Scalars['String']['output'];
  txCount: Scalars['Int']['output'];
  /** BigDecimal */
  untrackedVolumeUSD: Scalars['String']['output'];
};


export type TokenPairBaseArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<PairOrderByInput>>;
  where?: InputMaybe<PairWhereInput>;
};


export type TokenPairDayDataBaseArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<PairDayDataOrderByInput>>;
  where?: InputMaybe<PairDayDataWhereInput>;
};


export type TokenPairDayDataQuoteArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<PairDayDataOrderByInput>>;
  where?: InputMaybe<PairDayDataWhereInput>;
};


export type TokenPairQuoteArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<PairOrderByInput>>;
  where?: InputMaybe<PairWhereInput>;
};


export type TokenTokenDayDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<TokenDayDataOrderByInput>>;
  where?: InputMaybe<TokenDayDataWhereInput>;
};

export type TokenDayData = {
  __typename?: 'TokenDayData';
  dailyTxns: Scalars['Int']['output'];
  dailyVolumeETH: Scalars['String']['output'];
  dailyVolumeToken: Scalars['String']['output'];
  dailyVolumeUSD: Scalars['String']['output'];
  date: Scalars['DateTime']['output'];
  id: Scalars['String']['output'];
  priceUSD: Scalars['String']['output'];
  token: Token;
  totalLiquidityETH: Scalars['String']['output'];
  totalLiquidityToken: Scalars['String']['output'];
  totalLiquidityUSD: Scalars['String']['output'];
};

export type TokenDayDataConnection = {
  __typename?: 'TokenDayDataConnection';
  edges: Array<TokenDayDataEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type TokenDayDataEdge = {
  __typename?: 'TokenDayDataEdge';
  cursor: Scalars['String']['output'];
  node: TokenDayData;
};

export enum TokenDayDataOrderByInput {
  DailyTxnsAsc = 'dailyTxns_ASC',
  DailyTxnsDesc = 'dailyTxns_DESC',
  DailyVolumeEthAsc = 'dailyVolumeETH_ASC',
  DailyVolumeEthDesc = 'dailyVolumeETH_DESC',
  DailyVolumeTokenAsc = 'dailyVolumeToken_ASC',
  DailyVolumeTokenDesc = 'dailyVolumeToken_DESC',
  DailyVolumeUsdAsc = 'dailyVolumeUSD_ASC',
  DailyVolumeUsdDesc = 'dailyVolumeUSD_DESC',
  DateAsc = 'date_ASC',
  DateDesc = 'date_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  PriceUsdAsc = 'priceUSD_ASC',
  PriceUsdDesc = 'priceUSD_DESC',
  TokenDecimalsAsc = 'token_decimals_ASC',
  TokenDecimalsDesc = 'token_decimals_DESC',
  TokenDerivedEthAsc = 'token_derivedETH_ASC',
  TokenDerivedEthDesc = 'token_derivedETH_DESC',
  TokenIdAsc = 'token_id_ASC',
  TokenIdDesc = 'token_id_DESC',
  TokenNameAsc = 'token_name_ASC',
  TokenNameDesc = 'token_name_DESC',
  TokenSymbolAsc = 'token_symbol_ASC',
  TokenSymbolDesc = 'token_symbol_DESC',
  TokenTotalLiquidityAsc = 'token_totalLiquidity_ASC',
  TokenTotalLiquidityDesc = 'token_totalLiquidity_DESC',
  TokenTotalSupplyAsc = 'token_totalSupply_ASC',
  TokenTotalSupplyDesc = 'token_totalSupply_DESC',
  TokenTradeVolumeUsdAsc = 'token_tradeVolumeUSD_ASC',
  TokenTradeVolumeUsdDesc = 'token_tradeVolumeUSD_DESC',
  TokenTradeVolumeAsc = 'token_tradeVolume_ASC',
  TokenTradeVolumeDesc = 'token_tradeVolume_DESC',
  TokenTxCountAsc = 'token_txCount_ASC',
  TokenTxCountDesc = 'token_txCount_DESC',
  TokenUntrackedVolumeUsdAsc = 'token_untrackedVolumeUSD_ASC',
  TokenUntrackedVolumeUsdDesc = 'token_untrackedVolumeUSD_DESC',
  TotalLiquidityEthAsc = 'totalLiquidityETH_ASC',
  TotalLiquidityEthDesc = 'totalLiquidityETH_DESC',
  TotalLiquidityTokenAsc = 'totalLiquidityToken_ASC',
  TotalLiquidityTokenDesc = 'totalLiquidityToken_DESC',
  TotalLiquidityUsdAsc = 'totalLiquidityUSD_ASC',
  TotalLiquidityUsdDesc = 'totalLiquidityUSD_DESC'
}

export type TokenDayDataWhereInput = {
  AND?: InputMaybe<Array<TokenDayDataWhereInput>>;
  OR?: InputMaybe<Array<TokenDayDataWhereInput>>;
  dailyTxns_eq?: InputMaybe<Scalars['Int']['input']>;
  dailyTxns_gt?: InputMaybe<Scalars['Int']['input']>;
  dailyTxns_gte?: InputMaybe<Scalars['Int']['input']>;
  dailyTxns_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  dailyTxns_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  dailyTxns_lt?: InputMaybe<Scalars['Int']['input']>;
  dailyTxns_lte?: InputMaybe<Scalars['Int']['input']>;
  dailyTxns_not_eq?: InputMaybe<Scalars['Int']['input']>;
  dailyTxns_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  dailyVolumeETH_contains?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_endsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_eq?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_gt?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_gte?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_in?: InputMaybe<Array<Scalars['String']['input']>>;
  dailyVolumeETH_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  dailyVolumeETH_lt?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_lte?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_not_contains?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_not_eq?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  dailyVolumeETH_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeETH_startsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken_contains?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken_endsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken_eq?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken_gt?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken_gte?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken_in?: InputMaybe<Array<Scalars['String']['input']>>;
  dailyVolumeToken_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  dailyVolumeToken_lt?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken_lte?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken_not_contains?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken_not_eq?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  dailyVolumeToken_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeToken_startsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_contains?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_eq?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_gt?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_gte?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  dailyVolumeUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  dailyVolumeUSD_lt?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_lte?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  dailyVolumeUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  date_eq?: InputMaybe<Scalars['DateTime']['input']>;
  date_gt?: InputMaybe<Scalars['DateTime']['input']>;
  date_gte?: InputMaybe<Scalars['DateTime']['input']>;
  date_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  date_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  date_lt?: InputMaybe<Scalars['DateTime']['input']>;
  date_lte?: InputMaybe<Scalars['DateTime']['input']>;
  date_not_eq?: InputMaybe<Scalars['DateTime']['input']>;
  date_not_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  priceUSD_contains?: InputMaybe<Scalars['String']['input']>;
  priceUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  priceUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  priceUSD_eq?: InputMaybe<Scalars['String']['input']>;
  priceUSD_gt?: InputMaybe<Scalars['String']['input']>;
  priceUSD_gte?: InputMaybe<Scalars['String']['input']>;
  priceUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  priceUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  priceUSD_lt?: InputMaybe<Scalars['String']['input']>;
  priceUSD_lte?: InputMaybe<Scalars['String']['input']>;
  priceUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  priceUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  priceUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  priceUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  priceUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  priceUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  priceUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  token?: InputMaybe<TokenWhereInput>;
  token_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalLiquidityETH_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_gt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_gte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityETH_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalLiquidityETH_lt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_lte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityETH_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityETH_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityToken_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityToken_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityToken_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityToken_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityToken_gt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityToken_gte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityToken_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityToken_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalLiquidityToken_lt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityToken_lte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityToken_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityToken_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityToken_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityToken_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityToken_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityToken_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityToken_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_gt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_gte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalLiquidityUSD_lt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_lte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidityUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidityUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type TokenEdge = {
  __typename?: 'TokenEdge';
  cursor: Scalars['String']['output'];
  node: Token;
};

export enum TokenOrderByInput {
  DecimalsAsc = 'decimals_ASC',
  DecimalsDesc = 'decimals_DESC',
  DerivedEthAsc = 'derivedETH_ASC',
  DerivedEthDesc = 'derivedETH_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  NameAsc = 'name_ASC',
  NameDesc = 'name_DESC',
  SymbolAsc = 'symbol_ASC',
  SymbolDesc = 'symbol_DESC',
  TotalLiquidityAsc = 'totalLiquidity_ASC',
  TotalLiquidityDesc = 'totalLiquidity_DESC',
  TotalSupplyAsc = 'totalSupply_ASC',
  TotalSupplyDesc = 'totalSupply_DESC',
  TradeVolumeUsdAsc = 'tradeVolumeUSD_ASC',
  TradeVolumeUsdDesc = 'tradeVolumeUSD_DESC',
  TradeVolumeAsc = 'tradeVolume_ASC',
  TradeVolumeDesc = 'tradeVolume_DESC',
  TxCountAsc = 'txCount_ASC',
  TxCountDesc = 'txCount_DESC',
  UntrackedVolumeUsdAsc = 'untrackedVolumeUSD_ASC',
  UntrackedVolumeUsdDesc = 'untrackedVolumeUSD_DESC'
}

export type TokenWhereInput = {
  AND?: InputMaybe<Array<TokenWhereInput>>;
  OR?: InputMaybe<Array<TokenWhereInput>>;
  decimals_eq?: InputMaybe<Scalars['Int']['input']>;
  decimals_gt?: InputMaybe<Scalars['Int']['input']>;
  decimals_gte?: InputMaybe<Scalars['Int']['input']>;
  decimals_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  decimals_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  decimals_lt?: InputMaybe<Scalars['Int']['input']>;
  decimals_lte?: InputMaybe<Scalars['Int']['input']>;
  decimals_not_eq?: InputMaybe<Scalars['Int']['input']>;
  decimals_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  derivedETH_contains?: InputMaybe<Scalars['String']['input']>;
  derivedETH_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  derivedETH_endsWith?: InputMaybe<Scalars['String']['input']>;
  derivedETH_eq?: InputMaybe<Scalars['String']['input']>;
  derivedETH_gt?: InputMaybe<Scalars['String']['input']>;
  derivedETH_gte?: InputMaybe<Scalars['String']['input']>;
  derivedETH_in?: InputMaybe<Array<Scalars['String']['input']>>;
  derivedETH_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  derivedETH_lt?: InputMaybe<Scalars['String']['input']>;
  derivedETH_lte?: InputMaybe<Scalars['String']['input']>;
  derivedETH_not_contains?: InputMaybe<Scalars['String']['input']>;
  derivedETH_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  derivedETH_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  derivedETH_not_eq?: InputMaybe<Scalars['String']['input']>;
  derivedETH_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  derivedETH_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  derivedETH_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  name_contains?: InputMaybe<Scalars['String']['input']>;
  name_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  name_endsWith?: InputMaybe<Scalars['String']['input']>;
  name_eq?: InputMaybe<Scalars['String']['input']>;
  name_gt?: InputMaybe<Scalars['String']['input']>;
  name_gte?: InputMaybe<Scalars['String']['input']>;
  name_in?: InputMaybe<Array<Scalars['String']['input']>>;
  name_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  name_lt?: InputMaybe<Scalars['String']['input']>;
  name_lte?: InputMaybe<Scalars['String']['input']>;
  name_not_contains?: InputMaybe<Scalars['String']['input']>;
  name_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  name_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  name_not_eq?: InputMaybe<Scalars['String']['input']>;
  name_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  name_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  name_startsWith?: InputMaybe<Scalars['String']['input']>;
  pairBase_every?: InputMaybe<PairWhereInput>;
  pairBase_none?: InputMaybe<PairWhereInput>;
  pairBase_some?: InputMaybe<PairWhereInput>;
  pairDayDataBase_every?: InputMaybe<PairDayDataWhereInput>;
  pairDayDataBase_none?: InputMaybe<PairDayDataWhereInput>;
  pairDayDataBase_some?: InputMaybe<PairDayDataWhereInput>;
  pairDayDataQuote_every?: InputMaybe<PairDayDataWhereInput>;
  pairDayDataQuote_none?: InputMaybe<PairDayDataWhereInput>;
  pairDayDataQuote_some?: InputMaybe<PairDayDataWhereInput>;
  pairQuote_every?: InputMaybe<PairWhereInput>;
  pairQuote_none?: InputMaybe<PairWhereInput>;
  pairQuote_some?: InputMaybe<PairWhereInput>;
  symbol_contains?: InputMaybe<Scalars['String']['input']>;
  symbol_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  symbol_endsWith?: InputMaybe<Scalars['String']['input']>;
  symbol_eq?: InputMaybe<Scalars['String']['input']>;
  symbol_gt?: InputMaybe<Scalars['String']['input']>;
  symbol_gte?: InputMaybe<Scalars['String']['input']>;
  symbol_in?: InputMaybe<Array<Scalars['String']['input']>>;
  symbol_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  symbol_lt?: InputMaybe<Scalars['String']['input']>;
  symbol_lte?: InputMaybe<Scalars['String']['input']>;
  symbol_not_contains?: InputMaybe<Scalars['String']['input']>;
  symbol_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  symbol_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  symbol_not_eq?: InputMaybe<Scalars['String']['input']>;
  symbol_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  symbol_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  symbol_startsWith?: InputMaybe<Scalars['String']['input']>;
  tokenDayData_every?: InputMaybe<TokenDayDataWhereInput>;
  tokenDayData_none?: InputMaybe<TokenDayDataWhereInput>;
  tokenDayData_some?: InputMaybe<TokenDayDataWhereInput>;
  totalLiquidity_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_gt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_gte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidity_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalLiquidity_lt?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_lte?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalLiquidity_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalLiquidity_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalSupply_contains?: InputMaybe<Scalars['String']['input']>;
  totalSupply_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalSupply_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalSupply_eq?: InputMaybe<Scalars['String']['input']>;
  totalSupply_gt?: InputMaybe<Scalars['String']['input']>;
  totalSupply_gte?: InputMaybe<Scalars['String']['input']>;
  totalSupply_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalSupply_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalSupply_lt?: InputMaybe<Scalars['String']['input']>;
  totalSupply_lte?: InputMaybe<Scalars['String']['input']>;
  totalSupply_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalSupply_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalSupply_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalSupply_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalSupply_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalSupply_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalSupply_startsWith?: InputMaybe<Scalars['String']['input']>;
  tradeVolumeUSD_contains?: InputMaybe<Scalars['String']['input']>;
  tradeVolumeUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  tradeVolumeUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  tradeVolumeUSD_eq?: InputMaybe<Scalars['String']['input']>;
  tradeVolumeUSD_gt?: InputMaybe<Scalars['String']['input']>;
  tradeVolumeUSD_gte?: InputMaybe<Scalars['String']['input']>;
  tradeVolumeUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  tradeVolumeUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  tradeVolumeUSD_lt?: InputMaybe<Scalars['String']['input']>;
  tradeVolumeUSD_lte?: InputMaybe<Scalars['String']['input']>;
  tradeVolumeUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  tradeVolumeUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  tradeVolumeUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  tradeVolumeUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  tradeVolumeUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  tradeVolumeUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  tradeVolumeUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  tradeVolume_contains?: InputMaybe<Scalars['String']['input']>;
  tradeVolume_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  tradeVolume_endsWith?: InputMaybe<Scalars['String']['input']>;
  tradeVolume_eq?: InputMaybe<Scalars['String']['input']>;
  tradeVolume_gt?: InputMaybe<Scalars['String']['input']>;
  tradeVolume_gte?: InputMaybe<Scalars['String']['input']>;
  tradeVolume_in?: InputMaybe<Array<Scalars['String']['input']>>;
  tradeVolume_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  tradeVolume_lt?: InputMaybe<Scalars['String']['input']>;
  tradeVolume_lte?: InputMaybe<Scalars['String']['input']>;
  tradeVolume_not_contains?: InputMaybe<Scalars['String']['input']>;
  tradeVolume_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  tradeVolume_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  tradeVolume_not_eq?: InputMaybe<Scalars['String']['input']>;
  tradeVolume_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  tradeVolume_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  tradeVolume_startsWith?: InputMaybe<Scalars['String']['input']>;
  txCount_eq?: InputMaybe<Scalars['Int']['input']>;
  txCount_gt?: InputMaybe<Scalars['Int']['input']>;
  txCount_gte?: InputMaybe<Scalars['Int']['input']>;
  txCount_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  txCount_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  txCount_lt?: InputMaybe<Scalars['Int']['input']>;
  txCount_lte?: InputMaybe<Scalars['Int']['input']>;
  txCount_not_eq?: InputMaybe<Scalars['Int']['input']>;
  txCount_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  untrackedVolumeUSD_contains?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_eq?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_gt?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_gte?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  untrackedVolumeUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  untrackedVolumeUSD_lt?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_lte?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  untrackedVolumeUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  untrackedVolumeUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type TokensConnection = {
  __typename?: 'TokensConnection';
  edges: Array<TokenEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type Transaction = {
  __typename?: 'Transaction';
  blockNumber: Scalars['BigInt']['output'];
  burns: Array<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  mints: Array<Scalars['String']['output']>;
  swaps: Array<Scalars['String']['output']>;
  timestamp: Scalars['DateTime']['output'];
};

export type TransactionEdge = {
  __typename?: 'TransactionEdge';
  cursor: Scalars['String']['output'];
  node: Transaction;
};

export enum TransactionOrderByInput {
  BlockNumberAsc = 'blockNumber_ASC',
  BlockNumberDesc = 'blockNumber_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  TimestampAsc = 'timestamp_ASC',
  TimestampDesc = 'timestamp_DESC'
}

export type TransactionWhereInput = {
  AND?: InputMaybe<Array<TransactionWhereInput>>;
  OR?: InputMaybe<Array<TransactionWhereInput>>;
  blockNumber_eq?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  blockNumber_lt?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  burns_containsAll?: InputMaybe<Array<Scalars['String']['input']>>;
  burns_containsAny?: InputMaybe<Array<Scalars['String']['input']>>;
  burns_containsNone?: InputMaybe<Array<Scalars['String']['input']>>;
  burns_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  mints_containsAll?: InputMaybe<Array<Scalars['String']['input']>>;
  mints_containsAny?: InputMaybe<Array<Scalars['String']['input']>>;
  mints_containsNone?: InputMaybe<Array<Scalars['String']['input']>>;
  mints_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  swaps_containsAll?: InputMaybe<Array<Scalars['String']['input']>>;
  swaps_containsAny?: InputMaybe<Array<Scalars['String']['input']>>;
  swaps_containsNone?: InputMaybe<Array<Scalars['String']['input']>>;
  swaps_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  timestamp_eq?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_gt?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_gte?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  timestamp_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  timestamp_lt?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_lte?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_not_eq?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_not_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
};

export type TransactionsConnection = {
  __typename?: 'TransactionsConnection';
  edges: Array<TransactionEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type Transfer = {
  __typename?: 'Transfer';
  amount: Scalars['BigInt']['output'];
  blockNumber: Scalars['Int']['output'];
  extrinsicHash?: Maybe<Scalars['String']['output']>;
  fee: Scalars['BigInt']['output'];
  from: Scalars['String']['output'];
  id: Scalars['String']['output'];
  timestamp: Scalars['DateTime']['output'];
  to: Scalars['String']['output'];
};

export type TransferEdge = {
  __typename?: 'TransferEdge';
  cursor: Scalars['String']['output'];
  node: Transfer;
};

export enum TransferOrderByInput {
  AmountAsc = 'amount_ASC',
  AmountDesc = 'amount_DESC',
  BlockNumberAsc = 'blockNumber_ASC',
  BlockNumberDesc = 'blockNumber_DESC',
  ExtrinsicHashAsc = 'extrinsicHash_ASC',
  ExtrinsicHashDesc = 'extrinsicHash_DESC',
  FeeAsc = 'fee_ASC',
  FeeDesc = 'fee_DESC',
  FromAsc = 'from_ASC',
  FromDesc = 'from_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  TimestampAsc = 'timestamp_ASC',
  TimestampDesc = 'timestamp_DESC',
  ToAsc = 'to_ASC',
  ToDesc = 'to_DESC'
}

export type TransferWhereInput = {
  AND?: InputMaybe<Array<TransferWhereInput>>;
  OR?: InputMaybe<Array<TransferWhereInput>>;
  amount_eq?: InputMaybe<Scalars['BigInt']['input']>;
  amount_gt?: InputMaybe<Scalars['BigInt']['input']>;
  amount_gte?: InputMaybe<Scalars['BigInt']['input']>;
  amount_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  amount_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  amount_lt?: InputMaybe<Scalars['BigInt']['input']>;
  amount_lte?: InputMaybe<Scalars['BigInt']['input']>;
  amount_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  amount_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  blockNumber_eq?: InputMaybe<Scalars['Int']['input']>;
  blockNumber_gt?: InputMaybe<Scalars['Int']['input']>;
  blockNumber_gte?: InputMaybe<Scalars['Int']['input']>;
  blockNumber_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  blockNumber_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  blockNumber_lt?: InputMaybe<Scalars['Int']['input']>;
  blockNumber_lte?: InputMaybe<Scalars['Int']['input']>;
  blockNumber_not_eq?: InputMaybe<Scalars['Int']['input']>;
  blockNumber_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  extrinsicHash_contains?: InputMaybe<Scalars['String']['input']>;
  extrinsicHash_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  extrinsicHash_endsWith?: InputMaybe<Scalars['String']['input']>;
  extrinsicHash_eq?: InputMaybe<Scalars['String']['input']>;
  extrinsicHash_gt?: InputMaybe<Scalars['String']['input']>;
  extrinsicHash_gte?: InputMaybe<Scalars['String']['input']>;
  extrinsicHash_in?: InputMaybe<Array<Scalars['String']['input']>>;
  extrinsicHash_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  extrinsicHash_lt?: InputMaybe<Scalars['String']['input']>;
  extrinsicHash_lte?: InputMaybe<Scalars['String']['input']>;
  extrinsicHash_not_contains?: InputMaybe<Scalars['String']['input']>;
  extrinsicHash_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  extrinsicHash_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  extrinsicHash_not_eq?: InputMaybe<Scalars['String']['input']>;
  extrinsicHash_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  extrinsicHash_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  extrinsicHash_startsWith?: InputMaybe<Scalars['String']['input']>;
  fee_eq?: InputMaybe<Scalars['BigInt']['input']>;
  fee_gt?: InputMaybe<Scalars['BigInt']['input']>;
  fee_gte?: InputMaybe<Scalars['BigInt']['input']>;
  fee_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  fee_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  fee_lt?: InputMaybe<Scalars['BigInt']['input']>;
  fee_lte?: InputMaybe<Scalars['BigInt']['input']>;
  fee_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  fee_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  from_contains?: InputMaybe<Scalars['String']['input']>;
  from_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  from_endsWith?: InputMaybe<Scalars['String']['input']>;
  from_eq?: InputMaybe<Scalars['String']['input']>;
  from_gt?: InputMaybe<Scalars['String']['input']>;
  from_gte?: InputMaybe<Scalars['String']['input']>;
  from_in?: InputMaybe<Array<Scalars['String']['input']>>;
  from_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  from_lt?: InputMaybe<Scalars['String']['input']>;
  from_lte?: InputMaybe<Scalars['String']['input']>;
  from_not_contains?: InputMaybe<Scalars['String']['input']>;
  from_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  from_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  from_not_eq?: InputMaybe<Scalars['String']['input']>;
  from_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  from_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  from_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  timestamp_eq?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_gt?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_gte?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  timestamp_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  timestamp_lt?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_lte?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_not_eq?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_not_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  to_contains?: InputMaybe<Scalars['String']['input']>;
  to_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  to_endsWith?: InputMaybe<Scalars['String']['input']>;
  to_eq?: InputMaybe<Scalars['String']['input']>;
  to_gt?: InputMaybe<Scalars['String']['input']>;
  to_gte?: InputMaybe<Scalars['String']['input']>;
  to_in?: InputMaybe<Array<Scalars['String']['input']>>;
  to_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  to_lt?: InputMaybe<Scalars['String']['input']>;
  to_lte?: InputMaybe<Scalars['String']['input']>;
  to_not_contains?: InputMaybe<Scalars['String']['input']>;
  to_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  to_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  to_not_eq?: InputMaybe<Scalars['String']['input']>;
  to_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  to_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  to_startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type TransfersConnection = {
  __typename?: 'TransfersConnection';
  edges: Array<TransferEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type User = {
  __typename?: 'User';
  id: Scalars['String']['output'];
  liquidityPositions: Array<LiquidityPosition>;
  stableSwapLiquidityPositions: Array<StableSwapLiquidityPosition>;
  stakePositions: Array<StakePosition>;
  /** BigDecimal */
  usdSwapped: Scalars['String']['output'];
};


export type UserLiquidityPositionsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<LiquidityPositionOrderByInput>>;
  where?: InputMaybe<LiquidityPositionWhereInput>;
};


export type UserStableSwapLiquidityPositionsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StableSwapLiquidityPositionOrderByInput>>;
  where?: InputMaybe<StableSwapLiquidityPositionWhereInput>;
};


export type UserStakePositionsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StakePositionOrderByInput>>;
  where?: InputMaybe<StakePositionWhereInput>;
};

export type UserEdge = {
  __typename?: 'UserEdge';
  cursor: Scalars['String']['output'];
  node: User;
};

export enum UserOrderByInput {
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  UsdSwappedAsc = 'usdSwapped_ASC',
  UsdSwappedDesc = 'usdSwapped_DESC'
}

export type UserWhereInput = {
  AND?: InputMaybe<Array<UserWhereInput>>;
  OR?: InputMaybe<Array<UserWhereInput>>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  liquidityPositions_every?: InputMaybe<LiquidityPositionWhereInput>;
  liquidityPositions_none?: InputMaybe<LiquidityPositionWhereInput>;
  liquidityPositions_some?: InputMaybe<LiquidityPositionWhereInput>;
  stableSwapLiquidityPositions_every?: InputMaybe<StableSwapLiquidityPositionWhereInput>;
  stableSwapLiquidityPositions_none?: InputMaybe<StableSwapLiquidityPositionWhereInput>;
  stableSwapLiquidityPositions_some?: InputMaybe<StableSwapLiquidityPositionWhereInput>;
  stakePositions_every?: InputMaybe<StakePositionWhereInput>;
  stakePositions_none?: InputMaybe<StakePositionWhereInput>;
  stakePositions_some?: InputMaybe<StakePositionWhereInput>;
  usdSwapped_contains?: InputMaybe<Scalars['String']['input']>;
  usdSwapped_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  usdSwapped_endsWith?: InputMaybe<Scalars['String']['input']>;
  usdSwapped_eq?: InputMaybe<Scalars['String']['input']>;
  usdSwapped_gt?: InputMaybe<Scalars['String']['input']>;
  usdSwapped_gte?: InputMaybe<Scalars['String']['input']>;
  usdSwapped_in?: InputMaybe<Array<Scalars['String']['input']>>;
  usdSwapped_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  usdSwapped_lt?: InputMaybe<Scalars['String']['input']>;
  usdSwapped_lte?: InputMaybe<Scalars['String']['input']>;
  usdSwapped_not_contains?: InputMaybe<Scalars['String']['input']>;
  usdSwapped_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  usdSwapped_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  usdSwapped_not_eq?: InputMaybe<Scalars['String']['input']>;
  usdSwapped_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  usdSwapped_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  usdSwapped_startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type UsersConnection = {
  __typename?: 'UsersConnection';
  edges: Array<UserEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type WhereIdInput = {
  id: Scalars['String']['input'];
};

export type ZlkInfo = {
  __typename?: 'ZLKInfo';
  burn: Scalars['BigInt']['output'];
  id: Scalars['String']['output'];
  updatedDate: Scalars['DateTime']['output'];
};

export type ZlkInfoEdge = {
  __typename?: 'ZLKInfoEdge';
  cursor: Scalars['String']['output'];
  node: ZlkInfo;
};

export enum ZlkInfoOrderByInput {
  BurnAsc = 'burn_ASC',
  BurnDesc = 'burn_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  UpdatedDateAsc = 'updatedDate_ASC',
  UpdatedDateDesc = 'updatedDate_DESC'
}

export type ZlkInfoWhereInput = {
  AND?: InputMaybe<Array<ZlkInfoWhereInput>>;
  OR?: InputMaybe<Array<ZlkInfoWhereInput>>;
  burn_eq?: InputMaybe<Scalars['BigInt']['input']>;
  burn_gt?: InputMaybe<Scalars['BigInt']['input']>;
  burn_gte?: InputMaybe<Scalars['BigInt']['input']>;
  burn_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  burn_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  burn_lt?: InputMaybe<Scalars['BigInt']['input']>;
  burn_lte?: InputMaybe<Scalars['BigInt']['input']>;
  burn_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  burn_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  updatedDate_eq?: InputMaybe<Scalars['DateTime']['input']>;
  updatedDate_gt?: InputMaybe<Scalars['DateTime']['input']>;
  updatedDate_gte?: InputMaybe<Scalars['DateTime']['input']>;
  updatedDate_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  updatedDate_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  updatedDate_lt?: InputMaybe<Scalars['DateTime']['input']>;
  updatedDate_lte?: InputMaybe<Scalars['DateTime']['input']>;
  updatedDate_not_eq?: InputMaybe<Scalars['DateTime']['input']>;
  updatedDate_not_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
};

export type ZlkInfosConnection = {
  __typename?: 'ZLKInfosConnection';
  edges: Array<ZlkInfoEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type ZenlinkDayInfo = {
  __typename?: 'ZenlinkDayInfo';
  dailyVolumeUSD: Scalars['String']['output'];
  date: Scalars['DateTime']['output'];
  id: Scalars['String']['output'];
  stableInfo: StableSwapDayData;
  standardInfo: FactoryDayData;
  tvlUSD: Scalars['String']['output'];
};

export type ZenlinkDayInfoEdge = {
  __typename?: 'ZenlinkDayInfoEdge';
  cursor: Scalars['String']['output'];
  node: ZenlinkDayInfo;
};

export enum ZenlinkDayInfoOrderByInput {
  DailyVolumeUsdAsc = 'dailyVolumeUSD_ASC',
  DailyVolumeUsdDesc = 'dailyVolumeUSD_DESC',
  DateAsc = 'date_ASC',
  DateDesc = 'date_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  StableInfoDailyVolumeUsdAsc = 'stableInfo_dailyVolumeUSD_ASC',
  StableInfoDailyVolumeUsdDesc = 'stableInfo_dailyVolumeUSD_DESC',
  StableInfoDateAsc = 'stableInfo_date_ASC',
  StableInfoDateDesc = 'stableInfo_date_DESC',
  StableInfoIdAsc = 'stableInfo_id_ASC',
  StableInfoIdDesc = 'stableInfo_id_DESC',
  StableInfoTvlUsdAsc = 'stableInfo_tvlUSD_ASC',
  StableInfoTvlUsdDesc = 'stableInfo_tvlUSD_DESC',
  StandardInfoDailyVolumeEthAsc = 'standardInfo_dailyVolumeETH_ASC',
  StandardInfoDailyVolumeEthDesc = 'standardInfo_dailyVolumeETH_DESC',
  StandardInfoDailyVolumeUsdAsc = 'standardInfo_dailyVolumeUSD_ASC',
  StandardInfoDailyVolumeUsdDesc = 'standardInfo_dailyVolumeUSD_DESC',
  StandardInfoDailyVolumeUntrackedAsc = 'standardInfo_dailyVolumeUntracked_ASC',
  StandardInfoDailyVolumeUntrackedDesc = 'standardInfo_dailyVolumeUntracked_DESC',
  StandardInfoDateAsc = 'standardInfo_date_ASC',
  StandardInfoDateDesc = 'standardInfo_date_DESC',
  StandardInfoIdAsc = 'standardInfo_id_ASC',
  StandardInfoIdDesc = 'standardInfo_id_DESC',
  StandardInfoTotalLiquidityEthAsc = 'standardInfo_totalLiquidityETH_ASC',
  StandardInfoTotalLiquidityEthDesc = 'standardInfo_totalLiquidityETH_DESC',
  StandardInfoTotalLiquidityUsdAsc = 'standardInfo_totalLiquidityUSD_ASC',
  StandardInfoTotalLiquidityUsdDesc = 'standardInfo_totalLiquidityUSD_DESC',
  StandardInfoTotalVolumeEthAsc = 'standardInfo_totalVolumeETH_ASC',
  StandardInfoTotalVolumeEthDesc = 'standardInfo_totalVolumeETH_DESC',
  StandardInfoTotalVolumeUsdAsc = 'standardInfo_totalVolumeUSD_ASC',
  StandardInfoTotalVolumeUsdDesc = 'standardInfo_totalVolumeUSD_DESC',
  StandardInfoTxCountAsc = 'standardInfo_txCount_ASC',
  StandardInfoTxCountDesc = 'standardInfo_txCount_DESC',
  TvlUsdAsc = 'tvlUSD_ASC',
  TvlUsdDesc = 'tvlUSD_DESC'
}

export type ZenlinkDayInfoWhereInput = {
  AND?: InputMaybe<Array<ZenlinkDayInfoWhereInput>>;
  OR?: InputMaybe<Array<ZenlinkDayInfoWhereInput>>;
  dailyVolumeUSD_contains?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_eq?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_gt?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_gte?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  dailyVolumeUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  dailyVolumeUSD_lt?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_lte?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  dailyVolumeUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  dailyVolumeUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  date_eq?: InputMaybe<Scalars['DateTime']['input']>;
  date_gt?: InputMaybe<Scalars['DateTime']['input']>;
  date_gte?: InputMaybe<Scalars['DateTime']['input']>;
  date_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  date_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  date_lt?: InputMaybe<Scalars['DateTime']['input']>;
  date_lte?: InputMaybe<Scalars['DateTime']['input']>;
  date_not_eq?: InputMaybe<Scalars['DateTime']['input']>;
  date_not_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  stableInfo?: InputMaybe<StableSwapDayDataWhereInput>;
  stableInfo_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  standardInfo?: InputMaybe<FactoryDayDataWhereInput>;
  standardInfo_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  tvlUSD_contains?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_eq?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_gt?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_gte?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  tvlUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  tvlUSD_lt?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_lte?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  tvlUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  tvlUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type ZenlinkDayInfosConnection = {
  __typename?: 'ZenlinkDayInfosConnection';
  edges: Array<ZenlinkDayInfoEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type ZenlinkInfo = {
  __typename?: 'ZenlinkInfo';
  factory: Factory;
  id: Scalars['String']['output'];
  stableSwapInfo: StableSwapInfo;
  /** BigDecimal */
  totalTvlUSD: Scalars['String']['output'];
  /** BigDecimal */
  totalVolumeUSD: Scalars['String']['output'];
  txCount: Scalars['Int']['output'];
  updatedDate: Scalars['DateTime']['output'];
};

export type ZenlinkInfoEdge = {
  __typename?: 'ZenlinkInfoEdge';
  cursor: Scalars['String']['output'];
  node: ZenlinkInfo;
};

export enum ZenlinkInfoOrderByInput {
  FactoryIdAsc = 'factory_id_ASC',
  FactoryIdDesc = 'factory_id_DESC',
  FactoryPairCountAsc = 'factory_pairCount_ASC',
  FactoryPairCountDesc = 'factory_pairCount_DESC',
  FactoryTotalLiquidityEthAsc = 'factory_totalLiquidityETH_ASC',
  FactoryTotalLiquidityEthDesc = 'factory_totalLiquidityETH_DESC',
  FactoryTotalLiquidityUsdAsc = 'factory_totalLiquidityUSD_ASC',
  FactoryTotalLiquidityUsdDesc = 'factory_totalLiquidityUSD_DESC',
  FactoryTotalVolumeEthAsc = 'factory_totalVolumeETH_ASC',
  FactoryTotalVolumeEthDesc = 'factory_totalVolumeETH_DESC',
  FactoryTotalVolumeUsdAsc = 'factory_totalVolumeUSD_ASC',
  FactoryTotalVolumeUsdDesc = 'factory_totalVolumeUSD_DESC',
  FactoryTxCountAsc = 'factory_txCount_ASC',
  FactoryTxCountDesc = 'factory_txCount_DESC',
  FactoryUntrackedVolumeUsdAsc = 'factory_untrackedVolumeUSD_ASC',
  FactoryUntrackedVolumeUsdDesc = 'factory_untrackedVolumeUSD_DESC',
  IdAsc = 'id_ASC',
  IdDesc = 'id_DESC',
  StableSwapInfoIdAsc = 'stableSwapInfo_id_ASC',
  StableSwapInfoIdDesc = 'stableSwapInfo_id_DESC',
  StableSwapInfoPoolCountAsc = 'stableSwapInfo_poolCount_ASC',
  StableSwapInfoPoolCountDesc = 'stableSwapInfo_poolCount_DESC',
  StableSwapInfoTotalTvlUsdAsc = 'stableSwapInfo_totalTvlUSD_ASC',
  StableSwapInfoTotalTvlUsdDesc = 'stableSwapInfo_totalTvlUSD_DESC',
  StableSwapInfoTotalVolumeUsdAsc = 'stableSwapInfo_totalVolumeUSD_ASC',
  StableSwapInfoTotalVolumeUsdDesc = 'stableSwapInfo_totalVolumeUSD_DESC',
  StableSwapInfoTxCountAsc = 'stableSwapInfo_txCount_ASC',
  StableSwapInfoTxCountDesc = 'stableSwapInfo_txCount_DESC',
  TotalTvlUsdAsc = 'totalTvlUSD_ASC',
  TotalTvlUsdDesc = 'totalTvlUSD_DESC',
  TotalVolumeUsdAsc = 'totalVolumeUSD_ASC',
  TotalVolumeUsdDesc = 'totalVolumeUSD_DESC',
  TxCountAsc = 'txCount_ASC',
  TxCountDesc = 'txCount_DESC',
  UpdatedDateAsc = 'updatedDate_ASC',
  UpdatedDateDesc = 'updatedDate_DESC'
}

export type ZenlinkInfoWhereInput = {
  AND?: InputMaybe<Array<ZenlinkInfoWhereInput>>;
  OR?: InputMaybe<Array<ZenlinkInfoWhereInput>>;
  factory?: InputMaybe<FactoryWhereInput>;
  factory_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_contains?: InputMaybe<Scalars['String']['input']>;
  id_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_eq?: InputMaybe<Scalars['String']['input']>;
  id_gt?: InputMaybe<Scalars['String']['input']>;
  id_gte?: InputMaybe<Scalars['String']['input']>;
  id_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  id_lt?: InputMaybe<Scalars['String']['input']>;
  id_lte?: InputMaybe<Scalars['String']['input']>;
  id_not_contains?: InputMaybe<Scalars['String']['input']>;
  id_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  id_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  id_not_eq?: InputMaybe<Scalars['String']['input']>;
  id_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  id_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  id_startsWith?: InputMaybe<Scalars['String']['input']>;
  stableSwapInfo?: InputMaybe<StableSwapInfoWhereInput>;
  stableSwapInfo_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalTvlUSD_contains?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_eq?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_gt?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_gte?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalTvlUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalTvlUSD_lt?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_lte?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalTvlUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalTvlUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_contains?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_eq?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_gt?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_gte?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalVolumeUSD_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalVolumeUSD_lt?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_lte?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_not_contains?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_not_eq?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  totalVolumeUSD_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  totalVolumeUSD_startsWith?: InputMaybe<Scalars['String']['input']>;
  txCount_eq?: InputMaybe<Scalars['Int']['input']>;
  txCount_gt?: InputMaybe<Scalars['Int']['input']>;
  txCount_gte?: InputMaybe<Scalars['Int']['input']>;
  txCount_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  txCount_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  txCount_lt?: InputMaybe<Scalars['Int']['input']>;
  txCount_lte?: InputMaybe<Scalars['Int']['input']>;
  txCount_not_eq?: InputMaybe<Scalars['Int']['input']>;
  txCount_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  updatedDate_eq?: InputMaybe<Scalars['DateTime']['input']>;
  updatedDate_gt?: InputMaybe<Scalars['DateTime']['input']>;
  updatedDate_gte?: InputMaybe<Scalars['DateTime']['input']>;
  updatedDate_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  updatedDate_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  updatedDate_lt?: InputMaybe<Scalars['DateTime']['input']>;
  updatedDate_lte?: InputMaybe<Scalars['DateTime']['input']>;
  updatedDate_not_eq?: InputMaybe<Scalars['DateTime']['input']>;
  updatedDate_not_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
};

export type ZenlinkInfosConnection = {
  __typename?: 'ZenlinkInfosConnection';
  edges: Array<ZenlinkInfoEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type GetBackstopPoolsQueryVariables = Exact<{ [key: string]: never; }>;


export type GetBackstopPoolsQuery = { __typename?: 'Query', backstopPools: Array<{ __typename?: 'BackstopPool', id: string, liabilities: any, paused: boolean, reserves: any, totalSupply: any, token: { __typename?: 'NablaToken', id: string, decimals: number, name: string, symbol: string } }> };

export type GetSwapPoolsQueryVariables = Exact<{ [key: string]: never; }>;


export type GetSwapPoolsQuery = { __typename?: 'Query', swapPools: Array<{ __typename?: 'SwapPool', id: string, liabilities: any, paused: boolean, reserves: any, totalSupply: any, token: { __typename?: 'NablaToken', id: string, name: string, symbol: string, decimals: number }, router: { __typename?: 'Router', id: string, paused: boolean }, backstop: { __typename?: 'BackstopPool', id: string, liabilities: any, paused: boolean, reserves: any, totalSupply: any } }> };

export type GetTokensQueryVariables = Exact<{ [key: string]: never; }>;


export type GetTokensQuery = { __typename?: 'Query', nablaTokens: Array<{ __typename?: 'NablaToken', id: string, name: string, symbol: string, decimals: number }> };


export const GetBackstopPoolsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"getBackstopPools"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"backstopPools"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"liabilities"}},{"kind":"Field","name":{"kind":"Name","value":"paused"}},{"kind":"Field","name":{"kind":"Name","value":"reserves"}},{"kind":"Field","name":{"kind":"Name","value":"totalSupply"}},{"kind":"Field","name":{"kind":"Name","value":"token"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"decimals"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"symbol"}}]}}]}}]}}]} as unknown as DocumentNode<GetBackstopPoolsQuery, GetBackstopPoolsQueryVariables>;
export const GetSwapPoolsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"getSwapPools"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"swapPools"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"liabilities"}},{"kind":"Field","name":{"kind":"Name","value":"paused"}},{"kind":"Field","name":{"kind":"Name","value":"reserves"}},{"kind":"Field","name":{"kind":"Name","value":"totalSupply"}},{"kind":"Field","name":{"kind":"Name","value":"token"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"symbol"}},{"kind":"Field","name":{"kind":"Name","value":"decimals"}}]}},{"kind":"Field","name":{"kind":"Name","value":"router"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"paused"}}]}},{"kind":"Field","name":{"kind":"Name","value":"backstop"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"liabilities"}},{"kind":"Field","name":{"kind":"Name","value":"paused"}},{"kind":"Field","name":{"kind":"Name","value":"reserves"}},{"kind":"Field","name":{"kind":"Name","value":"totalSupply"}}]}}]}}]}}]} as unknown as DocumentNode<GetSwapPoolsQuery, GetSwapPoolsQueryVariables>;
export const GetTokensDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"getTokens"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nablaTokens"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"symbol"}},{"kind":"Field","name":{"kind":"Name","value":"decimals"}}]}}]}}]} as unknown as DocumentNode<GetTokensQuery, GetTokensQueryVariables>;