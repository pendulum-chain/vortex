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
  /** A scalar that can represent any JSON value */
  JSON: { input: any; output: any; }
};

export type BackstopPool = {
  __typename?: 'BackstopPool';
  apr: Scalars['BigInt']['output'];
  coveredSwapPools: Array<SwapPool>;
  feesHistory: Array<NablaSwapFee>;
  id: Scalars['String']['output'];
  lpTokenDecimals: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  paused: Scalars['Boolean']['output'];
  reserves: Scalars['BigInt']['output'];
  router: Router;
  symbol: Scalars['String']['output'];
  token: NablaToken;
  totalSupply: Scalars['BigInt']['output'];
};


export type BackstopPoolCoveredSwapPoolsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SwapPoolOrderByInput>>;
  where?: InputMaybe<SwapPoolWhereInput>;
};


export type BackstopPoolFeesHistoryArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<NablaSwapFeeOrderByInput>>;
  where?: InputMaybe<NablaSwapFeeWhereInput>;
};

export type BackstopPoolEdge = {
  __typename?: 'BackstopPoolEdge';
  cursor: Scalars['String']['output'];
  node: BackstopPool;
};

export enum BackstopPoolOrderByInput {
  AprAsc = 'apr_ASC',
  AprAscNullsFirst = 'apr_ASC_NULLS_FIRST',
  AprAscNullsLast = 'apr_ASC_NULLS_LAST',
  AprDesc = 'apr_DESC',
  AprDescNullsFirst = 'apr_DESC_NULLS_FIRST',
  AprDescNullsLast = 'apr_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  LpTokenDecimalsAsc = 'lpTokenDecimals_ASC',
  LpTokenDecimalsAscNullsFirst = 'lpTokenDecimals_ASC_NULLS_FIRST',
  LpTokenDecimalsAscNullsLast = 'lpTokenDecimals_ASC_NULLS_LAST',
  LpTokenDecimalsDesc = 'lpTokenDecimals_DESC',
  LpTokenDecimalsDescNullsFirst = 'lpTokenDecimals_DESC_NULLS_FIRST',
  LpTokenDecimalsDescNullsLast = 'lpTokenDecimals_DESC_NULLS_LAST',
  NameAsc = 'name_ASC',
  NameAscNullsFirst = 'name_ASC_NULLS_FIRST',
  NameAscNullsLast = 'name_ASC_NULLS_LAST',
  NameDesc = 'name_DESC',
  NameDescNullsFirst = 'name_DESC_NULLS_FIRST',
  NameDescNullsLast = 'name_DESC_NULLS_LAST',
  PausedAsc = 'paused_ASC',
  PausedAscNullsFirst = 'paused_ASC_NULLS_FIRST',
  PausedAscNullsLast = 'paused_ASC_NULLS_LAST',
  PausedDesc = 'paused_DESC',
  PausedDescNullsFirst = 'paused_DESC_NULLS_FIRST',
  PausedDescNullsLast = 'paused_DESC_NULLS_LAST',
  ReservesAsc = 'reserves_ASC',
  ReservesAscNullsFirst = 'reserves_ASC_NULLS_FIRST',
  ReservesAscNullsLast = 'reserves_ASC_NULLS_LAST',
  ReservesDesc = 'reserves_DESC',
  ReservesDescNullsFirst = 'reserves_DESC_NULLS_FIRST',
  ReservesDescNullsLast = 'reserves_DESC_NULLS_LAST',
  RouterIdAsc = 'router_id_ASC',
  RouterIdAscNullsFirst = 'router_id_ASC_NULLS_FIRST',
  RouterIdAscNullsLast = 'router_id_ASC_NULLS_LAST',
  RouterIdDesc = 'router_id_DESC',
  RouterIdDescNullsFirst = 'router_id_DESC_NULLS_FIRST',
  RouterIdDescNullsLast = 'router_id_DESC_NULLS_LAST',
  RouterPausedAsc = 'router_paused_ASC',
  RouterPausedAscNullsFirst = 'router_paused_ASC_NULLS_FIRST',
  RouterPausedAscNullsLast = 'router_paused_ASC_NULLS_LAST',
  RouterPausedDesc = 'router_paused_DESC',
  RouterPausedDescNullsFirst = 'router_paused_DESC_NULLS_FIRST',
  RouterPausedDescNullsLast = 'router_paused_DESC_NULLS_LAST',
  SymbolAsc = 'symbol_ASC',
  SymbolAscNullsFirst = 'symbol_ASC_NULLS_FIRST',
  SymbolAscNullsLast = 'symbol_ASC_NULLS_LAST',
  SymbolDesc = 'symbol_DESC',
  SymbolDescNullsFirst = 'symbol_DESC_NULLS_FIRST',
  SymbolDescNullsLast = 'symbol_DESC_NULLS_LAST',
  TokenDecimalsAsc = 'token_decimals_ASC',
  TokenDecimalsAscNullsFirst = 'token_decimals_ASC_NULLS_FIRST',
  TokenDecimalsAscNullsLast = 'token_decimals_ASC_NULLS_LAST',
  TokenDecimalsDesc = 'token_decimals_DESC',
  TokenDecimalsDescNullsFirst = 'token_decimals_DESC_NULLS_FIRST',
  TokenDecimalsDescNullsLast = 'token_decimals_DESC_NULLS_LAST',
  TokenIdAsc = 'token_id_ASC',
  TokenIdAscNullsFirst = 'token_id_ASC_NULLS_FIRST',
  TokenIdAscNullsLast = 'token_id_ASC_NULLS_LAST',
  TokenIdDesc = 'token_id_DESC',
  TokenIdDescNullsFirst = 'token_id_DESC_NULLS_FIRST',
  TokenIdDescNullsLast = 'token_id_DESC_NULLS_LAST',
  TokenNameAsc = 'token_name_ASC',
  TokenNameAscNullsFirst = 'token_name_ASC_NULLS_FIRST',
  TokenNameAscNullsLast = 'token_name_ASC_NULLS_LAST',
  TokenNameDesc = 'token_name_DESC',
  TokenNameDescNullsFirst = 'token_name_DESC_NULLS_FIRST',
  TokenNameDescNullsLast = 'token_name_DESC_NULLS_LAST',
  TokenSymbolAsc = 'token_symbol_ASC',
  TokenSymbolAscNullsFirst = 'token_symbol_ASC_NULLS_FIRST',
  TokenSymbolAscNullsLast = 'token_symbol_ASC_NULLS_LAST',
  TokenSymbolDesc = 'token_symbol_DESC',
  TokenSymbolDescNullsFirst = 'token_symbol_DESC_NULLS_FIRST',
  TokenSymbolDescNullsLast = 'token_symbol_DESC_NULLS_LAST',
  TotalSupplyAsc = 'totalSupply_ASC',
  TotalSupplyAscNullsFirst = 'totalSupply_ASC_NULLS_FIRST',
  TotalSupplyAscNullsLast = 'totalSupply_ASC_NULLS_LAST',
  TotalSupplyDesc = 'totalSupply_DESC',
  TotalSupplyDescNullsFirst = 'totalSupply_DESC_NULLS_FIRST',
  TotalSupplyDescNullsLast = 'totalSupply_DESC_NULLS_LAST'
}

export type BackstopPoolWhereInput = {
  AND?: InputMaybe<Array<BackstopPoolWhereInput>>;
  OR?: InputMaybe<Array<BackstopPoolWhereInput>>;
  apr_eq?: InputMaybe<Scalars['BigInt']['input']>;
  apr_gt?: InputMaybe<Scalars['BigInt']['input']>;
  apr_gte?: InputMaybe<Scalars['BigInt']['input']>;
  apr_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  apr_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  apr_lt?: InputMaybe<Scalars['BigInt']['input']>;
  apr_lte?: InputMaybe<Scalars['BigInt']['input']>;
  apr_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  apr_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  coveredSwapPools_every?: InputMaybe<SwapPoolWhereInput>;
  coveredSwapPools_none?: InputMaybe<SwapPoolWhereInput>;
  coveredSwapPools_some?: InputMaybe<SwapPoolWhereInput>;
  feesHistory_every?: InputMaybe<NablaSwapFeeWhereInput>;
  feesHistory_none?: InputMaybe<NablaSwapFeeWhereInput>;
  feesHistory_some?: InputMaybe<NablaSwapFeeWhereInput>;
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
  lpTokenDecimals_eq?: InputMaybe<Scalars['Int']['input']>;
  lpTokenDecimals_gt?: InputMaybe<Scalars['Int']['input']>;
  lpTokenDecimals_gte?: InputMaybe<Scalars['Int']['input']>;
  lpTokenDecimals_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  lpTokenDecimals_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  lpTokenDecimals_lt?: InputMaybe<Scalars['Int']['input']>;
  lpTokenDecimals_lte?: InputMaybe<Scalars['Int']['input']>;
  lpTokenDecimals_not_eq?: InputMaybe<Scalars['Int']['input']>;
  lpTokenDecimals_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
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

export type Block = {
  __typename?: 'Block';
  calls: Array<Call>;
  callsCount: Scalars['Int']['output'];
  events: Array<Event>;
  eventsCount: Scalars['Int']['output'];
  extrinsics: Array<Extrinsic>;
  extrinsicsCount: Scalars['Int']['output'];
  extrinsicsicRoot: Scalars['Bytes']['output'];
  hash: Scalars['Bytes']['output'];
  height: Scalars['Int']['output'];
  /** BlockHeight-blockHash - e.g. 0001812319-0001c */
  id: Scalars['String']['output'];
  implName: Scalars['String']['output'];
  implVersion: Scalars['Int']['output'];
  parentHash: Scalars['Bytes']['output'];
  specName: Scalars['String']['output'];
  specVersion: Scalars['Int']['output'];
  stateRoot: Scalars['Bytes']['output'];
  timestamp: Scalars['DateTime']['output'];
  validator?: Maybe<Scalars['Bytes']['output']>;
};


export type BlockCallsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<CallOrderByInput>>;
  where?: InputMaybe<CallWhereInput>;
};


export type BlockEventsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<EventOrderByInput>>;
  where?: InputMaybe<EventWhereInput>;
};


export type BlockExtrinsicsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ExtrinsicOrderByInput>>;
  where?: InputMaybe<ExtrinsicWhereInput>;
};

export type BlockEdge = {
  __typename?: 'BlockEdge';
  cursor: Scalars['String']['output'];
  node: Block;
};

export enum BlockOrderByInput {
  CallsCountAsc = 'callsCount_ASC',
  CallsCountAscNullsFirst = 'callsCount_ASC_NULLS_FIRST',
  CallsCountAscNullsLast = 'callsCount_ASC_NULLS_LAST',
  CallsCountDesc = 'callsCount_DESC',
  CallsCountDescNullsFirst = 'callsCount_DESC_NULLS_FIRST',
  CallsCountDescNullsLast = 'callsCount_DESC_NULLS_LAST',
  EventsCountAsc = 'eventsCount_ASC',
  EventsCountAscNullsFirst = 'eventsCount_ASC_NULLS_FIRST',
  EventsCountAscNullsLast = 'eventsCount_ASC_NULLS_LAST',
  EventsCountDesc = 'eventsCount_DESC',
  EventsCountDescNullsFirst = 'eventsCount_DESC_NULLS_FIRST',
  EventsCountDescNullsLast = 'eventsCount_DESC_NULLS_LAST',
  ExtrinsicsCountAsc = 'extrinsicsCount_ASC',
  ExtrinsicsCountAscNullsFirst = 'extrinsicsCount_ASC_NULLS_FIRST',
  ExtrinsicsCountAscNullsLast = 'extrinsicsCount_ASC_NULLS_LAST',
  ExtrinsicsCountDesc = 'extrinsicsCount_DESC',
  ExtrinsicsCountDescNullsFirst = 'extrinsicsCount_DESC_NULLS_FIRST',
  ExtrinsicsCountDescNullsLast = 'extrinsicsCount_DESC_NULLS_LAST',
  ExtrinsicsicRootAsc = 'extrinsicsicRoot_ASC',
  ExtrinsicsicRootAscNullsFirst = 'extrinsicsicRoot_ASC_NULLS_FIRST',
  ExtrinsicsicRootAscNullsLast = 'extrinsicsicRoot_ASC_NULLS_LAST',
  ExtrinsicsicRootDesc = 'extrinsicsicRoot_DESC',
  ExtrinsicsicRootDescNullsFirst = 'extrinsicsicRoot_DESC_NULLS_FIRST',
  ExtrinsicsicRootDescNullsLast = 'extrinsicsicRoot_DESC_NULLS_LAST',
  HashAsc = 'hash_ASC',
  HashAscNullsFirst = 'hash_ASC_NULLS_FIRST',
  HashAscNullsLast = 'hash_ASC_NULLS_LAST',
  HashDesc = 'hash_DESC',
  HashDescNullsFirst = 'hash_DESC_NULLS_FIRST',
  HashDescNullsLast = 'hash_DESC_NULLS_LAST',
  HeightAsc = 'height_ASC',
  HeightAscNullsFirst = 'height_ASC_NULLS_FIRST',
  HeightAscNullsLast = 'height_ASC_NULLS_LAST',
  HeightDesc = 'height_DESC',
  HeightDescNullsFirst = 'height_DESC_NULLS_FIRST',
  HeightDescNullsLast = 'height_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  ImplNameAsc = 'implName_ASC',
  ImplNameAscNullsFirst = 'implName_ASC_NULLS_FIRST',
  ImplNameAscNullsLast = 'implName_ASC_NULLS_LAST',
  ImplNameDesc = 'implName_DESC',
  ImplNameDescNullsFirst = 'implName_DESC_NULLS_FIRST',
  ImplNameDescNullsLast = 'implName_DESC_NULLS_LAST',
  ImplVersionAsc = 'implVersion_ASC',
  ImplVersionAscNullsFirst = 'implVersion_ASC_NULLS_FIRST',
  ImplVersionAscNullsLast = 'implVersion_ASC_NULLS_LAST',
  ImplVersionDesc = 'implVersion_DESC',
  ImplVersionDescNullsFirst = 'implVersion_DESC_NULLS_FIRST',
  ImplVersionDescNullsLast = 'implVersion_DESC_NULLS_LAST',
  ParentHashAsc = 'parentHash_ASC',
  ParentHashAscNullsFirst = 'parentHash_ASC_NULLS_FIRST',
  ParentHashAscNullsLast = 'parentHash_ASC_NULLS_LAST',
  ParentHashDesc = 'parentHash_DESC',
  ParentHashDescNullsFirst = 'parentHash_DESC_NULLS_FIRST',
  ParentHashDescNullsLast = 'parentHash_DESC_NULLS_LAST',
  SpecNameAsc = 'specName_ASC',
  SpecNameAscNullsFirst = 'specName_ASC_NULLS_FIRST',
  SpecNameAscNullsLast = 'specName_ASC_NULLS_LAST',
  SpecNameDesc = 'specName_DESC',
  SpecNameDescNullsFirst = 'specName_DESC_NULLS_FIRST',
  SpecNameDescNullsLast = 'specName_DESC_NULLS_LAST',
  SpecVersionAsc = 'specVersion_ASC',
  SpecVersionAscNullsFirst = 'specVersion_ASC_NULLS_FIRST',
  SpecVersionAscNullsLast = 'specVersion_ASC_NULLS_LAST',
  SpecVersionDesc = 'specVersion_DESC',
  SpecVersionDescNullsFirst = 'specVersion_DESC_NULLS_FIRST',
  SpecVersionDescNullsLast = 'specVersion_DESC_NULLS_LAST',
  StateRootAsc = 'stateRoot_ASC',
  StateRootAscNullsFirst = 'stateRoot_ASC_NULLS_FIRST',
  StateRootAscNullsLast = 'stateRoot_ASC_NULLS_LAST',
  StateRootDesc = 'stateRoot_DESC',
  StateRootDescNullsFirst = 'stateRoot_DESC_NULLS_FIRST',
  StateRootDescNullsLast = 'stateRoot_DESC_NULLS_LAST',
  TimestampAsc = 'timestamp_ASC',
  TimestampAscNullsFirst = 'timestamp_ASC_NULLS_FIRST',
  TimestampAscNullsLast = 'timestamp_ASC_NULLS_LAST',
  TimestampDesc = 'timestamp_DESC',
  TimestampDescNullsFirst = 'timestamp_DESC_NULLS_FIRST',
  TimestampDescNullsLast = 'timestamp_DESC_NULLS_LAST',
  ValidatorAsc = 'validator_ASC',
  ValidatorAscNullsFirst = 'validator_ASC_NULLS_FIRST',
  ValidatorAscNullsLast = 'validator_ASC_NULLS_LAST',
  ValidatorDesc = 'validator_DESC',
  ValidatorDescNullsFirst = 'validator_DESC_NULLS_FIRST',
  ValidatorDescNullsLast = 'validator_DESC_NULLS_LAST'
}

export type BlockWhereInput = {
  AND?: InputMaybe<Array<BlockWhereInput>>;
  OR?: InputMaybe<Array<BlockWhereInput>>;
  callsCount_eq?: InputMaybe<Scalars['Int']['input']>;
  callsCount_gt?: InputMaybe<Scalars['Int']['input']>;
  callsCount_gte?: InputMaybe<Scalars['Int']['input']>;
  callsCount_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  callsCount_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  callsCount_lt?: InputMaybe<Scalars['Int']['input']>;
  callsCount_lte?: InputMaybe<Scalars['Int']['input']>;
  callsCount_not_eq?: InputMaybe<Scalars['Int']['input']>;
  callsCount_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  calls_every?: InputMaybe<CallWhereInput>;
  calls_none?: InputMaybe<CallWhereInput>;
  calls_some?: InputMaybe<CallWhereInput>;
  eventsCount_eq?: InputMaybe<Scalars['Int']['input']>;
  eventsCount_gt?: InputMaybe<Scalars['Int']['input']>;
  eventsCount_gte?: InputMaybe<Scalars['Int']['input']>;
  eventsCount_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  eventsCount_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  eventsCount_lt?: InputMaybe<Scalars['Int']['input']>;
  eventsCount_lte?: InputMaybe<Scalars['Int']['input']>;
  eventsCount_not_eq?: InputMaybe<Scalars['Int']['input']>;
  eventsCount_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  events_every?: InputMaybe<EventWhereInput>;
  events_none?: InputMaybe<EventWhereInput>;
  events_some?: InputMaybe<EventWhereInput>;
  extrinsicsCount_eq?: InputMaybe<Scalars['Int']['input']>;
  extrinsicsCount_gt?: InputMaybe<Scalars['Int']['input']>;
  extrinsicsCount_gte?: InputMaybe<Scalars['Int']['input']>;
  extrinsicsCount_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  extrinsicsCount_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  extrinsicsCount_lt?: InputMaybe<Scalars['Int']['input']>;
  extrinsicsCount_lte?: InputMaybe<Scalars['Int']['input']>;
  extrinsicsCount_not_eq?: InputMaybe<Scalars['Int']['input']>;
  extrinsicsCount_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  extrinsics_every?: InputMaybe<ExtrinsicWhereInput>;
  extrinsics_none?: InputMaybe<ExtrinsicWhereInput>;
  extrinsics_some?: InputMaybe<ExtrinsicWhereInput>;
  extrinsicsicRoot_eq?: InputMaybe<Scalars['Bytes']['input']>;
  extrinsicsicRoot_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  extrinsicsicRoot_not_eq?: InputMaybe<Scalars['Bytes']['input']>;
  hash_eq?: InputMaybe<Scalars['Bytes']['input']>;
  hash_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  hash_not_eq?: InputMaybe<Scalars['Bytes']['input']>;
  height_eq?: InputMaybe<Scalars['Int']['input']>;
  height_gt?: InputMaybe<Scalars['Int']['input']>;
  height_gte?: InputMaybe<Scalars['Int']['input']>;
  height_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  height_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  height_lt?: InputMaybe<Scalars['Int']['input']>;
  height_lte?: InputMaybe<Scalars['Int']['input']>;
  height_not_eq?: InputMaybe<Scalars['Int']['input']>;
  height_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
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
  implName_contains?: InputMaybe<Scalars['String']['input']>;
  implName_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  implName_endsWith?: InputMaybe<Scalars['String']['input']>;
  implName_eq?: InputMaybe<Scalars['String']['input']>;
  implName_gt?: InputMaybe<Scalars['String']['input']>;
  implName_gte?: InputMaybe<Scalars['String']['input']>;
  implName_in?: InputMaybe<Array<Scalars['String']['input']>>;
  implName_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  implName_lt?: InputMaybe<Scalars['String']['input']>;
  implName_lte?: InputMaybe<Scalars['String']['input']>;
  implName_not_contains?: InputMaybe<Scalars['String']['input']>;
  implName_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  implName_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  implName_not_eq?: InputMaybe<Scalars['String']['input']>;
  implName_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  implName_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  implName_startsWith?: InputMaybe<Scalars['String']['input']>;
  implVersion_eq?: InputMaybe<Scalars['Int']['input']>;
  implVersion_gt?: InputMaybe<Scalars['Int']['input']>;
  implVersion_gte?: InputMaybe<Scalars['Int']['input']>;
  implVersion_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  implVersion_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  implVersion_lt?: InputMaybe<Scalars['Int']['input']>;
  implVersion_lte?: InputMaybe<Scalars['Int']['input']>;
  implVersion_not_eq?: InputMaybe<Scalars['Int']['input']>;
  implVersion_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  parentHash_eq?: InputMaybe<Scalars['Bytes']['input']>;
  parentHash_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  parentHash_not_eq?: InputMaybe<Scalars['Bytes']['input']>;
  specName_contains?: InputMaybe<Scalars['String']['input']>;
  specName_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  specName_endsWith?: InputMaybe<Scalars['String']['input']>;
  specName_eq?: InputMaybe<Scalars['String']['input']>;
  specName_gt?: InputMaybe<Scalars['String']['input']>;
  specName_gte?: InputMaybe<Scalars['String']['input']>;
  specName_in?: InputMaybe<Array<Scalars['String']['input']>>;
  specName_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  specName_lt?: InputMaybe<Scalars['String']['input']>;
  specName_lte?: InputMaybe<Scalars['String']['input']>;
  specName_not_contains?: InputMaybe<Scalars['String']['input']>;
  specName_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  specName_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  specName_not_eq?: InputMaybe<Scalars['String']['input']>;
  specName_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  specName_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  specName_startsWith?: InputMaybe<Scalars['String']['input']>;
  specVersion_eq?: InputMaybe<Scalars['Int']['input']>;
  specVersion_gt?: InputMaybe<Scalars['Int']['input']>;
  specVersion_gte?: InputMaybe<Scalars['Int']['input']>;
  specVersion_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  specVersion_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  specVersion_lt?: InputMaybe<Scalars['Int']['input']>;
  specVersion_lte?: InputMaybe<Scalars['Int']['input']>;
  specVersion_not_eq?: InputMaybe<Scalars['Int']['input']>;
  specVersion_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  stateRoot_eq?: InputMaybe<Scalars['Bytes']['input']>;
  stateRoot_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  stateRoot_not_eq?: InputMaybe<Scalars['Bytes']['input']>;
  timestamp_eq?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_gt?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_gte?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  timestamp_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  timestamp_lt?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_lte?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_not_eq?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_not_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  validator_eq?: InputMaybe<Scalars['Bytes']['input']>;
  validator_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  validator_not_eq?: InputMaybe<Scalars['Bytes']['input']>;
};

export type BlocksConnection = {
  __typename?: 'BlocksConnection';
  edges: Array<BlockEdge>;
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
  EthPriceAscNullsFirst = 'ethPrice_ASC_NULLS_FIRST',
  EthPriceAscNullsLast = 'ethPrice_ASC_NULLS_LAST',
  EthPriceDesc = 'ethPrice_DESC',
  EthPriceDescNullsFirst = 'ethPrice_DESC_NULLS_FIRST',
  EthPriceDescNullsLast = 'ethPrice_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST'
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
  Amount0AscNullsFirst = 'amount0_ASC_NULLS_FIRST',
  Amount0AscNullsLast = 'amount0_ASC_NULLS_LAST',
  Amount0Desc = 'amount0_DESC',
  Amount0DescNullsFirst = 'amount0_DESC_NULLS_FIRST',
  Amount0DescNullsLast = 'amount0_DESC_NULLS_LAST',
  Amount1Asc = 'amount1_ASC',
  Amount1AscNullsFirst = 'amount1_ASC_NULLS_FIRST',
  Amount1AscNullsLast = 'amount1_ASC_NULLS_LAST',
  Amount1Desc = 'amount1_DESC',
  Amount1DescNullsFirst = 'amount1_DESC_NULLS_FIRST',
  Amount1DescNullsLast = 'amount1_DESC_NULLS_LAST',
  AmountUsdAsc = 'amountUSD_ASC',
  AmountUsdAscNullsFirst = 'amountUSD_ASC_NULLS_FIRST',
  AmountUsdAscNullsLast = 'amountUSD_ASC_NULLS_LAST',
  AmountUsdDesc = 'amountUSD_DESC',
  AmountUsdDescNullsFirst = 'amountUSD_DESC_NULLS_FIRST',
  AmountUsdDescNullsLast = 'amountUSD_DESC_NULLS_LAST',
  FeeLiquidityAsc = 'feeLiquidity_ASC',
  FeeLiquidityAscNullsFirst = 'feeLiquidity_ASC_NULLS_FIRST',
  FeeLiquidityAscNullsLast = 'feeLiquidity_ASC_NULLS_LAST',
  FeeLiquidityDesc = 'feeLiquidity_DESC',
  FeeLiquidityDescNullsFirst = 'feeLiquidity_DESC_NULLS_FIRST',
  FeeLiquidityDescNullsLast = 'feeLiquidity_DESC_NULLS_LAST',
  FeeToAsc = 'feeTo_ASC',
  FeeToAscNullsFirst = 'feeTo_ASC_NULLS_FIRST',
  FeeToAscNullsLast = 'feeTo_ASC_NULLS_LAST',
  FeeToDesc = 'feeTo_DESC',
  FeeToDescNullsFirst = 'feeTo_DESC_NULLS_FIRST',
  FeeToDescNullsLast = 'feeTo_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  LiquidityAsc = 'liquidity_ASC',
  LiquidityAscNullsFirst = 'liquidity_ASC_NULLS_FIRST',
  LiquidityAscNullsLast = 'liquidity_ASC_NULLS_LAST',
  LiquidityDesc = 'liquidity_DESC',
  LiquidityDescNullsFirst = 'liquidity_DESC_NULLS_FIRST',
  LiquidityDescNullsLast = 'liquidity_DESC_NULLS_LAST',
  LogIndexAsc = 'logIndex_ASC',
  LogIndexAscNullsFirst = 'logIndex_ASC_NULLS_FIRST',
  LogIndexAscNullsLast = 'logIndex_ASC_NULLS_LAST',
  LogIndexDesc = 'logIndex_DESC',
  LogIndexDescNullsFirst = 'logIndex_DESC_NULLS_FIRST',
  LogIndexDescNullsLast = 'logIndex_DESC_NULLS_LAST',
  NeedsCompleteAsc = 'needsComplete_ASC',
  NeedsCompleteAscNullsFirst = 'needsComplete_ASC_NULLS_FIRST',
  NeedsCompleteAscNullsLast = 'needsComplete_ASC_NULLS_LAST',
  NeedsCompleteDesc = 'needsComplete_DESC',
  NeedsCompleteDescNullsFirst = 'needsComplete_DESC_NULLS_FIRST',
  NeedsCompleteDescNullsLast = 'needsComplete_DESC_NULLS_LAST',
  PairCreatedAtBlockNumberAsc = 'pair_createdAtBlockNumber_ASC',
  PairCreatedAtBlockNumberAscNullsFirst = 'pair_createdAtBlockNumber_ASC_NULLS_FIRST',
  PairCreatedAtBlockNumberAscNullsLast = 'pair_createdAtBlockNumber_ASC_NULLS_LAST',
  PairCreatedAtBlockNumberDesc = 'pair_createdAtBlockNumber_DESC',
  PairCreatedAtBlockNumberDescNullsFirst = 'pair_createdAtBlockNumber_DESC_NULLS_FIRST',
  PairCreatedAtBlockNumberDescNullsLast = 'pair_createdAtBlockNumber_DESC_NULLS_LAST',
  PairCreatedAtTimestampAsc = 'pair_createdAtTimestamp_ASC',
  PairCreatedAtTimestampAscNullsFirst = 'pair_createdAtTimestamp_ASC_NULLS_FIRST',
  PairCreatedAtTimestampAscNullsLast = 'pair_createdAtTimestamp_ASC_NULLS_LAST',
  PairCreatedAtTimestampDesc = 'pair_createdAtTimestamp_DESC',
  PairCreatedAtTimestampDescNullsFirst = 'pair_createdAtTimestamp_DESC_NULLS_FIRST',
  PairCreatedAtTimestampDescNullsLast = 'pair_createdAtTimestamp_DESC_NULLS_LAST',
  PairIdAsc = 'pair_id_ASC',
  PairIdAscNullsFirst = 'pair_id_ASC_NULLS_FIRST',
  PairIdAscNullsLast = 'pair_id_ASC_NULLS_LAST',
  PairIdDesc = 'pair_id_DESC',
  PairIdDescNullsFirst = 'pair_id_DESC_NULLS_FIRST',
  PairIdDescNullsLast = 'pair_id_DESC_NULLS_LAST',
  PairLiquidityProviderCountAsc = 'pair_liquidityProviderCount_ASC',
  PairLiquidityProviderCountAscNullsFirst = 'pair_liquidityProviderCount_ASC_NULLS_FIRST',
  PairLiquidityProviderCountAscNullsLast = 'pair_liquidityProviderCount_ASC_NULLS_LAST',
  PairLiquidityProviderCountDesc = 'pair_liquidityProviderCount_DESC',
  PairLiquidityProviderCountDescNullsFirst = 'pair_liquidityProviderCount_DESC_NULLS_FIRST',
  PairLiquidityProviderCountDescNullsLast = 'pair_liquidityProviderCount_DESC_NULLS_LAST',
  PairReserve0Asc = 'pair_reserve0_ASC',
  PairReserve0AscNullsFirst = 'pair_reserve0_ASC_NULLS_FIRST',
  PairReserve0AscNullsLast = 'pair_reserve0_ASC_NULLS_LAST',
  PairReserve0Desc = 'pair_reserve0_DESC',
  PairReserve0DescNullsFirst = 'pair_reserve0_DESC_NULLS_FIRST',
  PairReserve0DescNullsLast = 'pair_reserve0_DESC_NULLS_LAST',
  PairReserve1Asc = 'pair_reserve1_ASC',
  PairReserve1AscNullsFirst = 'pair_reserve1_ASC_NULLS_FIRST',
  PairReserve1AscNullsLast = 'pair_reserve1_ASC_NULLS_LAST',
  PairReserve1Desc = 'pair_reserve1_DESC',
  PairReserve1DescNullsFirst = 'pair_reserve1_DESC_NULLS_FIRST',
  PairReserve1DescNullsLast = 'pair_reserve1_DESC_NULLS_LAST',
  PairReserveEthAsc = 'pair_reserveETH_ASC',
  PairReserveEthAscNullsFirst = 'pair_reserveETH_ASC_NULLS_FIRST',
  PairReserveEthAscNullsLast = 'pair_reserveETH_ASC_NULLS_LAST',
  PairReserveEthDesc = 'pair_reserveETH_DESC',
  PairReserveEthDescNullsFirst = 'pair_reserveETH_DESC_NULLS_FIRST',
  PairReserveEthDescNullsLast = 'pair_reserveETH_DESC_NULLS_LAST',
  PairReserveUsdAsc = 'pair_reserveUSD_ASC',
  PairReserveUsdAscNullsFirst = 'pair_reserveUSD_ASC_NULLS_FIRST',
  PairReserveUsdAscNullsLast = 'pair_reserveUSD_ASC_NULLS_LAST',
  PairReserveUsdDesc = 'pair_reserveUSD_DESC',
  PairReserveUsdDescNullsFirst = 'pair_reserveUSD_DESC_NULLS_FIRST',
  PairReserveUsdDescNullsLast = 'pair_reserveUSD_DESC_NULLS_LAST',
  PairToken0PriceAsc = 'pair_token0Price_ASC',
  PairToken0PriceAscNullsFirst = 'pair_token0Price_ASC_NULLS_FIRST',
  PairToken0PriceAscNullsLast = 'pair_token0Price_ASC_NULLS_LAST',
  PairToken0PriceDesc = 'pair_token0Price_DESC',
  PairToken0PriceDescNullsFirst = 'pair_token0Price_DESC_NULLS_FIRST',
  PairToken0PriceDescNullsLast = 'pair_token0Price_DESC_NULLS_LAST',
  PairToken1PriceAsc = 'pair_token1Price_ASC',
  PairToken1PriceAscNullsFirst = 'pair_token1Price_ASC_NULLS_FIRST',
  PairToken1PriceAscNullsLast = 'pair_token1Price_ASC_NULLS_LAST',
  PairToken1PriceDesc = 'pair_token1Price_DESC',
  PairToken1PriceDescNullsFirst = 'pair_token1Price_DESC_NULLS_FIRST',
  PairToken1PriceDescNullsLast = 'pair_token1Price_DESC_NULLS_LAST',
  PairTotalSupplyAsc = 'pair_totalSupply_ASC',
  PairTotalSupplyAscNullsFirst = 'pair_totalSupply_ASC_NULLS_FIRST',
  PairTotalSupplyAscNullsLast = 'pair_totalSupply_ASC_NULLS_LAST',
  PairTotalSupplyDesc = 'pair_totalSupply_DESC',
  PairTotalSupplyDescNullsFirst = 'pair_totalSupply_DESC_NULLS_FIRST',
  PairTotalSupplyDescNullsLast = 'pair_totalSupply_DESC_NULLS_LAST',
  PairTrackedReserveEthAsc = 'pair_trackedReserveETH_ASC',
  PairTrackedReserveEthAscNullsFirst = 'pair_trackedReserveETH_ASC_NULLS_FIRST',
  PairTrackedReserveEthAscNullsLast = 'pair_trackedReserveETH_ASC_NULLS_LAST',
  PairTrackedReserveEthDesc = 'pair_trackedReserveETH_DESC',
  PairTrackedReserveEthDescNullsFirst = 'pair_trackedReserveETH_DESC_NULLS_FIRST',
  PairTrackedReserveEthDescNullsLast = 'pair_trackedReserveETH_DESC_NULLS_LAST',
  PairTxCountAsc = 'pair_txCount_ASC',
  PairTxCountAscNullsFirst = 'pair_txCount_ASC_NULLS_FIRST',
  PairTxCountAscNullsLast = 'pair_txCount_ASC_NULLS_LAST',
  PairTxCountDesc = 'pair_txCount_DESC',
  PairTxCountDescNullsFirst = 'pair_txCount_DESC_NULLS_FIRST',
  PairTxCountDescNullsLast = 'pair_txCount_DESC_NULLS_LAST',
  PairUntrackedVolumeUsdAsc = 'pair_untrackedVolumeUSD_ASC',
  PairUntrackedVolumeUsdAscNullsFirst = 'pair_untrackedVolumeUSD_ASC_NULLS_FIRST',
  PairUntrackedVolumeUsdAscNullsLast = 'pair_untrackedVolumeUSD_ASC_NULLS_LAST',
  PairUntrackedVolumeUsdDesc = 'pair_untrackedVolumeUSD_DESC',
  PairUntrackedVolumeUsdDescNullsFirst = 'pair_untrackedVolumeUSD_DESC_NULLS_FIRST',
  PairUntrackedVolumeUsdDescNullsLast = 'pair_untrackedVolumeUSD_DESC_NULLS_LAST',
  PairVolumeToken0Asc = 'pair_volumeToken0_ASC',
  PairVolumeToken0AscNullsFirst = 'pair_volumeToken0_ASC_NULLS_FIRST',
  PairVolumeToken0AscNullsLast = 'pair_volumeToken0_ASC_NULLS_LAST',
  PairVolumeToken0Desc = 'pair_volumeToken0_DESC',
  PairVolumeToken0DescNullsFirst = 'pair_volumeToken0_DESC_NULLS_FIRST',
  PairVolumeToken0DescNullsLast = 'pair_volumeToken0_DESC_NULLS_LAST',
  PairVolumeToken1Asc = 'pair_volumeToken1_ASC',
  PairVolumeToken1AscNullsFirst = 'pair_volumeToken1_ASC_NULLS_FIRST',
  PairVolumeToken1AscNullsLast = 'pair_volumeToken1_ASC_NULLS_LAST',
  PairVolumeToken1Desc = 'pair_volumeToken1_DESC',
  PairVolumeToken1DescNullsFirst = 'pair_volumeToken1_DESC_NULLS_FIRST',
  PairVolumeToken1DescNullsLast = 'pair_volumeToken1_DESC_NULLS_LAST',
  PairVolumeUsdAsc = 'pair_volumeUSD_ASC',
  PairVolumeUsdAscNullsFirst = 'pair_volumeUSD_ASC_NULLS_FIRST',
  PairVolumeUsdAscNullsLast = 'pair_volumeUSD_ASC_NULLS_LAST',
  PairVolumeUsdDesc = 'pair_volumeUSD_DESC',
  PairVolumeUsdDescNullsFirst = 'pair_volumeUSD_DESC_NULLS_FIRST',
  PairVolumeUsdDescNullsLast = 'pair_volumeUSD_DESC_NULLS_LAST',
  SenderAsc = 'sender_ASC',
  SenderAscNullsFirst = 'sender_ASC_NULLS_FIRST',
  SenderAscNullsLast = 'sender_ASC_NULLS_LAST',
  SenderDesc = 'sender_DESC',
  SenderDescNullsFirst = 'sender_DESC_NULLS_FIRST',
  SenderDescNullsLast = 'sender_DESC_NULLS_LAST',
  TimestampAsc = 'timestamp_ASC',
  TimestampAscNullsFirst = 'timestamp_ASC_NULLS_FIRST',
  TimestampAscNullsLast = 'timestamp_ASC_NULLS_LAST',
  TimestampDesc = 'timestamp_DESC',
  TimestampDescNullsFirst = 'timestamp_DESC_NULLS_FIRST',
  TimestampDescNullsLast = 'timestamp_DESC_NULLS_LAST',
  ToAsc = 'to_ASC',
  ToAscNullsFirst = 'to_ASC_NULLS_FIRST',
  ToAscNullsLast = 'to_ASC_NULLS_LAST',
  ToDesc = 'to_DESC',
  ToDescNullsFirst = 'to_DESC_NULLS_FIRST',
  ToDescNullsLast = 'to_DESC_NULLS_LAST',
  TransactionBlockNumberAsc = 'transaction_blockNumber_ASC',
  TransactionBlockNumberAscNullsFirst = 'transaction_blockNumber_ASC_NULLS_FIRST',
  TransactionBlockNumberAscNullsLast = 'transaction_blockNumber_ASC_NULLS_LAST',
  TransactionBlockNumberDesc = 'transaction_blockNumber_DESC',
  TransactionBlockNumberDescNullsFirst = 'transaction_blockNumber_DESC_NULLS_FIRST',
  TransactionBlockNumberDescNullsLast = 'transaction_blockNumber_DESC_NULLS_LAST',
  TransactionIdAsc = 'transaction_id_ASC',
  TransactionIdAscNullsFirst = 'transaction_id_ASC_NULLS_FIRST',
  TransactionIdAscNullsLast = 'transaction_id_ASC_NULLS_LAST',
  TransactionIdDesc = 'transaction_id_DESC',
  TransactionIdDescNullsFirst = 'transaction_id_DESC_NULLS_FIRST',
  TransactionIdDescNullsLast = 'transaction_id_DESC_NULLS_LAST',
  TransactionTimestampAsc = 'transaction_timestamp_ASC',
  TransactionTimestampAscNullsFirst = 'transaction_timestamp_ASC_NULLS_FIRST',
  TransactionTimestampAscNullsLast = 'transaction_timestamp_ASC_NULLS_LAST',
  TransactionTimestampDesc = 'transaction_timestamp_DESC',
  TransactionTimestampDescNullsFirst = 'transaction_timestamp_DESC_NULLS_FIRST',
  TransactionTimestampDescNullsLast = 'transaction_timestamp_DESC_NULLS_LAST'
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

export type Call = {
  __typename?: 'Call';
  address: Array<Scalars['Int']['output']>;
  args?: Maybe<Scalars['JSON']['output']>;
  argsStr?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  block: Block;
  error?: Maybe<Scalars['JSON']['output']>;
  events: Array<Event>;
  extrinsic?: Maybe<Extrinsic>;
  id: Scalars['String']['output'];
  name: Scalars['String']['output'];
  pallet: Scalars['String']['output'];
  parent?: Maybe<Call>;
  subcalls: Array<Call>;
  success: Scalars['Boolean']['output'];
};


export type CallEventsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<EventOrderByInput>>;
  where?: InputMaybe<EventWhereInput>;
};


export type CallSubcallsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<CallOrderByInput>>;
  where?: InputMaybe<CallWhereInput>;
};

export type CallEdge = {
  __typename?: 'CallEdge';
  cursor: Scalars['String']['output'];
  node: Call;
};

export enum CallOrderByInput {
  BlockCallsCountAsc = 'block_callsCount_ASC',
  BlockCallsCountAscNullsFirst = 'block_callsCount_ASC_NULLS_FIRST',
  BlockCallsCountAscNullsLast = 'block_callsCount_ASC_NULLS_LAST',
  BlockCallsCountDesc = 'block_callsCount_DESC',
  BlockCallsCountDescNullsFirst = 'block_callsCount_DESC_NULLS_FIRST',
  BlockCallsCountDescNullsLast = 'block_callsCount_DESC_NULLS_LAST',
  BlockEventsCountAsc = 'block_eventsCount_ASC',
  BlockEventsCountAscNullsFirst = 'block_eventsCount_ASC_NULLS_FIRST',
  BlockEventsCountAscNullsLast = 'block_eventsCount_ASC_NULLS_LAST',
  BlockEventsCountDesc = 'block_eventsCount_DESC',
  BlockEventsCountDescNullsFirst = 'block_eventsCount_DESC_NULLS_FIRST',
  BlockEventsCountDescNullsLast = 'block_eventsCount_DESC_NULLS_LAST',
  BlockExtrinsicsCountAsc = 'block_extrinsicsCount_ASC',
  BlockExtrinsicsCountAscNullsFirst = 'block_extrinsicsCount_ASC_NULLS_FIRST',
  BlockExtrinsicsCountAscNullsLast = 'block_extrinsicsCount_ASC_NULLS_LAST',
  BlockExtrinsicsCountDesc = 'block_extrinsicsCount_DESC',
  BlockExtrinsicsCountDescNullsFirst = 'block_extrinsicsCount_DESC_NULLS_FIRST',
  BlockExtrinsicsCountDescNullsLast = 'block_extrinsicsCount_DESC_NULLS_LAST',
  BlockExtrinsicsicRootAsc = 'block_extrinsicsicRoot_ASC',
  BlockExtrinsicsicRootAscNullsFirst = 'block_extrinsicsicRoot_ASC_NULLS_FIRST',
  BlockExtrinsicsicRootAscNullsLast = 'block_extrinsicsicRoot_ASC_NULLS_LAST',
  BlockExtrinsicsicRootDesc = 'block_extrinsicsicRoot_DESC',
  BlockExtrinsicsicRootDescNullsFirst = 'block_extrinsicsicRoot_DESC_NULLS_FIRST',
  BlockExtrinsicsicRootDescNullsLast = 'block_extrinsicsicRoot_DESC_NULLS_LAST',
  BlockHashAsc = 'block_hash_ASC',
  BlockHashAscNullsFirst = 'block_hash_ASC_NULLS_FIRST',
  BlockHashAscNullsLast = 'block_hash_ASC_NULLS_LAST',
  BlockHashDesc = 'block_hash_DESC',
  BlockHashDescNullsFirst = 'block_hash_DESC_NULLS_FIRST',
  BlockHashDescNullsLast = 'block_hash_DESC_NULLS_LAST',
  BlockHeightAsc = 'block_height_ASC',
  BlockHeightAscNullsFirst = 'block_height_ASC_NULLS_FIRST',
  BlockHeightAscNullsLast = 'block_height_ASC_NULLS_LAST',
  BlockHeightDesc = 'block_height_DESC',
  BlockHeightDescNullsFirst = 'block_height_DESC_NULLS_FIRST',
  BlockHeightDescNullsLast = 'block_height_DESC_NULLS_LAST',
  BlockIdAsc = 'block_id_ASC',
  BlockIdAscNullsFirst = 'block_id_ASC_NULLS_FIRST',
  BlockIdAscNullsLast = 'block_id_ASC_NULLS_LAST',
  BlockIdDesc = 'block_id_DESC',
  BlockIdDescNullsFirst = 'block_id_DESC_NULLS_FIRST',
  BlockIdDescNullsLast = 'block_id_DESC_NULLS_LAST',
  BlockImplNameAsc = 'block_implName_ASC',
  BlockImplNameAscNullsFirst = 'block_implName_ASC_NULLS_FIRST',
  BlockImplNameAscNullsLast = 'block_implName_ASC_NULLS_LAST',
  BlockImplNameDesc = 'block_implName_DESC',
  BlockImplNameDescNullsFirst = 'block_implName_DESC_NULLS_FIRST',
  BlockImplNameDescNullsLast = 'block_implName_DESC_NULLS_LAST',
  BlockImplVersionAsc = 'block_implVersion_ASC',
  BlockImplVersionAscNullsFirst = 'block_implVersion_ASC_NULLS_FIRST',
  BlockImplVersionAscNullsLast = 'block_implVersion_ASC_NULLS_LAST',
  BlockImplVersionDesc = 'block_implVersion_DESC',
  BlockImplVersionDescNullsFirst = 'block_implVersion_DESC_NULLS_FIRST',
  BlockImplVersionDescNullsLast = 'block_implVersion_DESC_NULLS_LAST',
  BlockParentHashAsc = 'block_parentHash_ASC',
  BlockParentHashAscNullsFirst = 'block_parentHash_ASC_NULLS_FIRST',
  BlockParentHashAscNullsLast = 'block_parentHash_ASC_NULLS_LAST',
  BlockParentHashDesc = 'block_parentHash_DESC',
  BlockParentHashDescNullsFirst = 'block_parentHash_DESC_NULLS_FIRST',
  BlockParentHashDescNullsLast = 'block_parentHash_DESC_NULLS_LAST',
  BlockSpecNameAsc = 'block_specName_ASC',
  BlockSpecNameAscNullsFirst = 'block_specName_ASC_NULLS_FIRST',
  BlockSpecNameAscNullsLast = 'block_specName_ASC_NULLS_LAST',
  BlockSpecNameDesc = 'block_specName_DESC',
  BlockSpecNameDescNullsFirst = 'block_specName_DESC_NULLS_FIRST',
  BlockSpecNameDescNullsLast = 'block_specName_DESC_NULLS_LAST',
  BlockSpecVersionAsc = 'block_specVersion_ASC',
  BlockSpecVersionAscNullsFirst = 'block_specVersion_ASC_NULLS_FIRST',
  BlockSpecVersionAscNullsLast = 'block_specVersion_ASC_NULLS_LAST',
  BlockSpecVersionDesc = 'block_specVersion_DESC',
  BlockSpecVersionDescNullsFirst = 'block_specVersion_DESC_NULLS_FIRST',
  BlockSpecVersionDescNullsLast = 'block_specVersion_DESC_NULLS_LAST',
  BlockStateRootAsc = 'block_stateRoot_ASC',
  BlockStateRootAscNullsFirst = 'block_stateRoot_ASC_NULLS_FIRST',
  BlockStateRootAscNullsLast = 'block_stateRoot_ASC_NULLS_LAST',
  BlockStateRootDesc = 'block_stateRoot_DESC',
  BlockStateRootDescNullsFirst = 'block_stateRoot_DESC_NULLS_FIRST',
  BlockStateRootDescNullsLast = 'block_stateRoot_DESC_NULLS_LAST',
  BlockTimestampAsc = 'block_timestamp_ASC',
  BlockTimestampAscNullsFirst = 'block_timestamp_ASC_NULLS_FIRST',
  BlockTimestampAscNullsLast = 'block_timestamp_ASC_NULLS_LAST',
  BlockTimestampDesc = 'block_timestamp_DESC',
  BlockTimestampDescNullsFirst = 'block_timestamp_DESC_NULLS_FIRST',
  BlockTimestampDescNullsLast = 'block_timestamp_DESC_NULLS_LAST',
  BlockValidatorAsc = 'block_validator_ASC',
  BlockValidatorAscNullsFirst = 'block_validator_ASC_NULLS_FIRST',
  BlockValidatorAscNullsLast = 'block_validator_ASC_NULLS_LAST',
  BlockValidatorDesc = 'block_validator_DESC',
  BlockValidatorDescNullsFirst = 'block_validator_DESC_NULLS_FIRST',
  BlockValidatorDescNullsLast = 'block_validator_DESC_NULLS_LAST',
  ExtrinsicFeeAsc = 'extrinsic_fee_ASC',
  ExtrinsicFeeAscNullsFirst = 'extrinsic_fee_ASC_NULLS_FIRST',
  ExtrinsicFeeAscNullsLast = 'extrinsic_fee_ASC_NULLS_LAST',
  ExtrinsicFeeDesc = 'extrinsic_fee_DESC',
  ExtrinsicFeeDescNullsFirst = 'extrinsic_fee_DESC_NULLS_FIRST',
  ExtrinsicFeeDescNullsLast = 'extrinsic_fee_DESC_NULLS_LAST',
  ExtrinsicHashAsc = 'extrinsic_hash_ASC',
  ExtrinsicHashAscNullsFirst = 'extrinsic_hash_ASC_NULLS_FIRST',
  ExtrinsicHashAscNullsLast = 'extrinsic_hash_ASC_NULLS_LAST',
  ExtrinsicHashDesc = 'extrinsic_hash_DESC',
  ExtrinsicHashDescNullsFirst = 'extrinsic_hash_DESC_NULLS_FIRST',
  ExtrinsicHashDescNullsLast = 'extrinsic_hash_DESC_NULLS_LAST',
  ExtrinsicIdAsc = 'extrinsic_id_ASC',
  ExtrinsicIdAscNullsFirst = 'extrinsic_id_ASC_NULLS_FIRST',
  ExtrinsicIdAscNullsLast = 'extrinsic_id_ASC_NULLS_LAST',
  ExtrinsicIdDesc = 'extrinsic_id_DESC',
  ExtrinsicIdDescNullsFirst = 'extrinsic_id_DESC_NULLS_FIRST',
  ExtrinsicIdDescNullsLast = 'extrinsic_id_DESC_NULLS_LAST',
  ExtrinsicIndexAsc = 'extrinsic_index_ASC',
  ExtrinsicIndexAscNullsFirst = 'extrinsic_index_ASC_NULLS_FIRST',
  ExtrinsicIndexAscNullsLast = 'extrinsic_index_ASC_NULLS_LAST',
  ExtrinsicIndexDesc = 'extrinsic_index_DESC',
  ExtrinsicIndexDescNullsFirst = 'extrinsic_index_DESC_NULLS_FIRST',
  ExtrinsicIndexDescNullsLast = 'extrinsic_index_DESC_NULLS_LAST',
  ExtrinsicSuccessAsc = 'extrinsic_success_ASC',
  ExtrinsicSuccessAscNullsFirst = 'extrinsic_success_ASC_NULLS_FIRST',
  ExtrinsicSuccessAscNullsLast = 'extrinsic_success_ASC_NULLS_LAST',
  ExtrinsicSuccessDesc = 'extrinsic_success_DESC',
  ExtrinsicSuccessDescNullsFirst = 'extrinsic_success_DESC_NULLS_FIRST',
  ExtrinsicSuccessDescNullsLast = 'extrinsic_success_DESC_NULLS_LAST',
  ExtrinsicTipAsc = 'extrinsic_tip_ASC',
  ExtrinsicTipAscNullsFirst = 'extrinsic_tip_ASC_NULLS_FIRST',
  ExtrinsicTipAscNullsLast = 'extrinsic_tip_ASC_NULLS_LAST',
  ExtrinsicTipDesc = 'extrinsic_tip_DESC',
  ExtrinsicTipDescNullsFirst = 'extrinsic_tip_DESC_NULLS_FIRST',
  ExtrinsicTipDescNullsLast = 'extrinsic_tip_DESC_NULLS_LAST',
  ExtrinsicVersionAsc = 'extrinsic_version_ASC',
  ExtrinsicVersionAscNullsFirst = 'extrinsic_version_ASC_NULLS_FIRST',
  ExtrinsicVersionAscNullsLast = 'extrinsic_version_ASC_NULLS_LAST',
  ExtrinsicVersionDesc = 'extrinsic_version_DESC',
  ExtrinsicVersionDescNullsFirst = 'extrinsic_version_DESC_NULLS_FIRST',
  ExtrinsicVersionDescNullsLast = 'extrinsic_version_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  NameAsc = 'name_ASC',
  NameAscNullsFirst = 'name_ASC_NULLS_FIRST',
  NameAscNullsLast = 'name_ASC_NULLS_LAST',
  NameDesc = 'name_DESC',
  NameDescNullsFirst = 'name_DESC_NULLS_FIRST',
  NameDescNullsLast = 'name_DESC_NULLS_LAST',
  PalletAsc = 'pallet_ASC',
  PalletAscNullsFirst = 'pallet_ASC_NULLS_FIRST',
  PalletAscNullsLast = 'pallet_ASC_NULLS_LAST',
  PalletDesc = 'pallet_DESC',
  PalletDescNullsFirst = 'pallet_DESC_NULLS_FIRST',
  PalletDescNullsLast = 'pallet_DESC_NULLS_LAST',
  ParentIdAsc = 'parent_id_ASC',
  ParentIdAscNullsFirst = 'parent_id_ASC_NULLS_FIRST',
  ParentIdAscNullsLast = 'parent_id_ASC_NULLS_LAST',
  ParentIdDesc = 'parent_id_DESC',
  ParentIdDescNullsFirst = 'parent_id_DESC_NULLS_FIRST',
  ParentIdDescNullsLast = 'parent_id_DESC_NULLS_LAST',
  ParentNameAsc = 'parent_name_ASC',
  ParentNameAscNullsFirst = 'parent_name_ASC_NULLS_FIRST',
  ParentNameAscNullsLast = 'parent_name_ASC_NULLS_LAST',
  ParentNameDesc = 'parent_name_DESC',
  ParentNameDescNullsFirst = 'parent_name_DESC_NULLS_FIRST',
  ParentNameDescNullsLast = 'parent_name_DESC_NULLS_LAST',
  ParentPalletAsc = 'parent_pallet_ASC',
  ParentPalletAscNullsFirst = 'parent_pallet_ASC_NULLS_FIRST',
  ParentPalletAscNullsLast = 'parent_pallet_ASC_NULLS_LAST',
  ParentPalletDesc = 'parent_pallet_DESC',
  ParentPalletDescNullsFirst = 'parent_pallet_DESC_NULLS_FIRST',
  ParentPalletDescNullsLast = 'parent_pallet_DESC_NULLS_LAST',
  ParentSuccessAsc = 'parent_success_ASC',
  ParentSuccessAscNullsFirst = 'parent_success_ASC_NULLS_FIRST',
  ParentSuccessAscNullsLast = 'parent_success_ASC_NULLS_LAST',
  ParentSuccessDesc = 'parent_success_DESC',
  ParentSuccessDescNullsFirst = 'parent_success_DESC_NULLS_FIRST',
  ParentSuccessDescNullsLast = 'parent_success_DESC_NULLS_LAST',
  SuccessAsc = 'success_ASC',
  SuccessAscNullsFirst = 'success_ASC_NULLS_FIRST',
  SuccessAscNullsLast = 'success_ASC_NULLS_LAST',
  SuccessDesc = 'success_DESC',
  SuccessDescNullsFirst = 'success_DESC_NULLS_FIRST',
  SuccessDescNullsLast = 'success_DESC_NULLS_LAST'
}

export type CallWhereInput = {
  AND?: InputMaybe<Array<CallWhereInput>>;
  OR?: InputMaybe<Array<CallWhereInput>>;
  address_containsAll?: InputMaybe<Array<Scalars['Int']['input']>>;
  address_containsAny?: InputMaybe<Array<Scalars['Int']['input']>>;
  address_containsNone?: InputMaybe<Array<Scalars['Int']['input']>>;
  address_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  argsStr_containsAll?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  argsStr_containsAny?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  argsStr_containsNone?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  argsStr_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  args_eq?: InputMaybe<Scalars['JSON']['input']>;
  args_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  args_jsonContains?: InputMaybe<Scalars['JSON']['input']>;
  args_jsonHasKey?: InputMaybe<Scalars['JSON']['input']>;
  args_not_eq?: InputMaybe<Scalars['JSON']['input']>;
  block?: InputMaybe<BlockWhereInput>;
  block_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  error_eq?: InputMaybe<Scalars['JSON']['input']>;
  error_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  error_jsonContains?: InputMaybe<Scalars['JSON']['input']>;
  error_jsonHasKey?: InputMaybe<Scalars['JSON']['input']>;
  error_not_eq?: InputMaybe<Scalars['JSON']['input']>;
  events_every?: InputMaybe<EventWhereInput>;
  events_none?: InputMaybe<EventWhereInput>;
  events_some?: InputMaybe<EventWhereInput>;
  extrinsic?: InputMaybe<ExtrinsicWhereInput>;
  extrinsic_isNull?: InputMaybe<Scalars['Boolean']['input']>;
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
  pallet_contains?: InputMaybe<Scalars['String']['input']>;
  pallet_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  pallet_endsWith?: InputMaybe<Scalars['String']['input']>;
  pallet_eq?: InputMaybe<Scalars['String']['input']>;
  pallet_gt?: InputMaybe<Scalars['String']['input']>;
  pallet_gte?: InputMaybe<Scalars['String']['input']>;
  pallet_in?: InputMaybe<Array<Scalars['String']['input']>>;
  pallet_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  pallet_lt?: InputMaybe<Scalars['String']['input']>;
  pallet_lte?: InputMaybe<Scalars['String']['input']>;
  pallet_not_contains?: InputMaybe<Scalars['String']['input']>;
  pallet_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  pallet_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  pallet_not_eq?: InputMaybe<Scalars['String']['input']>;
  pallet_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  pallet_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  pallet_startsWith?: InputMaybe<Scalars['String']['input']>;
  parent?: InputMaybe<CallWhereInput>;
  parent_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  subcalls_every?: InputMaybe<CallWhereInput>;
  subcalls_none?: InputMaybe<CallWhereInput>;
  subcalls_some?: InputMaybe<CallWhereInput>;
  success_eq?: InputMaybe<Scalars['Boolean']['input']>;
  success_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  success_not_eq?: InputMaybe<Scalars['Boolean']['input']>;
};

export type CallsConnection = {
  __typename?: 'CallsConnection';
  edges: Array<CallEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export enum CounterLevel {
  Global = 'Global',
  Item = 'Item',
  Pallet = 'Pallet'
}

export type Event = {
  __typename?: 'Event';
  args?: Maybe<Scalars['JSON']['output']>;
  argsStr?: Maybe<Array<Maybe<Scalars['String']['output']>>>;
  block: Block;
  call?: Maybe<Call>;
  extrinsic?: Maybe<Extrinsic>;
  /** Event id - e.g. 0000000001-000000-272d6 */
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  pallet: Scalars['String']['output'];
  phase: Scalars['String']['output'];
};

export type EventEdge = {
  __typename?: 'EventEdge';
  cursor: Scalars['String']['output'];
  node: Event;
};

export enum EventOrderByInput {
  BlockCallsCountAsc = 'block_callsCount_ASC',
  BlockCallsCountAscNullsFirst = 'block_callsCount_ASC_NULLS_FIRST',
  BlockCallsCountAscNullsLast = 'block_callsCount_ASC_NULLS_LAST',
  BlockCallsCountDesc = 'block_callsCount_DESC',
  BlockCallsCountDescNullsFirst = 'block_callsCount_DESC_NULLS_FIRST',
  BlockCallsCountDescNullsLast = 'block_callsCount_DESC_NULLS_LAST',
  BlockEventsCountAsc = 'block_eventsCount_ASC',
  BlockEventsCountAscNullsFirst = 'block_eventsCount_ASC_NULLS_FIRST',
  BlockEventsCountAscNullsLast = 'block_eventsCount_ASC_NULLS_LAST',
  BlockEventsCountDesc = 'block_eventsCount_DESC',
  BlockEventsCountDescNullsFirst = 'block_eventsCount_DESC_NULLS_FIRST',
  BlockEventsCountDescNullsLast = 'block_eventsCount_DESC_NULLS_LAST',
  BlockExtrinsicsCountAsc = 'block_extrinsicsCount_ASC',
  BlockExtrinsicsCountAscNullsFirst = 'block_extrinsicsCount_ASC_NULLS_FIRST',
  BlockExtrinsicsCountAscNullsLast = 'block_extrinsicsCount_ASC_NULLS_LAST',
  BlockExtrinsicsCountDesc = 'block_extrinsicsCount_DESC',
  BlockExtrinsicsCountDescNullsFirst = 'block_extrinsicsCount_DESC_NULLS_FIRST',
  BlockExtrinsicsCountDescNullsLast = 'block_extrinsicsCount_DESC_NULLS_LAST',
  BlockExtrinsicsicRootAsc = 'block_extrinsicsicRoot_ASC',
  BlockExtrinsicsicRootAscNullsFirst = 'block_extrinsicsicRoot_ASC_NULLS_FIRST',
  BlockExtrinsicsicRootAscNullsLast = 'block_extrinsicsicRoot_ASC_NULLS_LAST',
  BlockExtrinsicsicRootDesc = 'block_extrinsicsicRoot_DESC',
  BlockExtrinsicsicRootDescNullsFirst = 'block_extrinsicsicRoot_DESC_NULLS_FIRST',
  BlockExtrinsicsicRootDescNullsLast = 'block_extrinsicsicRoot_DESC_NULLS_LAST',
  BlockHashAsc = 'block_hash_ASC',
  BlockHashAscNullsFirst = 'block_hash_ASC_NULLS_FIRST',
  BlockHashAscNullsLast = 'block_hash_ASC_NULLS_LAST',
  BlockHashDesc = 'block_hash_DESC',
  BlockHashDescNullsFirst = 'block_hash_DESC_NULLS_FIRST',
  BlockHashDescNullsLast = 'block_hash_DESC_NULLS_LAST',
  BlockHeightAsc = 'block_height_ASC',
  BlockHeightAscNullsFirst = 'block_height_ASC_NULLS_FIRST',
  BlockHeightAscNullsLast = 'block_height_ASC_NULLS_LAST',
  BlockHeightDesc = 'block_height_DESC',
  BlockHeightDescNullsFirst = 'block_height_DESC_NULLS_FIRST',
  BlockHeightDescNullsLast = 'block_height_DESC_NULLS_LAST',
  BlockIdAsc = 'block_id_ASC',
  BlockIdAscNullsFirst = 'block_id_ASC_NULLS_FIRST',
  BlockIdAscNullsLast = 'block_id_ASC_NULLS_LAST',
  BlockIdDesc = 'block_id_DESC',
  BlockIdDescNullsFirst = 'block_id_DESC_NULLS_FIRST',
  BlockIdDescNullsLast = 'block_id_DESC_NULLS_LAST',
  BlockImplNameAsc = 'block_implName_ASC',
  BlockImplNameAscNullsFirst = 'block_implName_ASC_NULLS_FIRST',
  BlockImplNameAscNullsLast = 'block_implName_ASC_NULLS_LAST',
  BlockImplNameDesc = 'block_implName_DESC',
  BlockImplNameDescNullsFirst = 'block_implName_DESC_NULLS_FIRST',
  BlockImplNameDescNullsLast = 'block_implName_DESC_NULLS_LAST',
  BlockImplVersionAsc = 'block_implVersion_ASC',
  BlockImplVersionAscNullsFirst = 'block_implVersion_ASC_NULLS_FIRST',
  BlockImplVersionAscNullsLast = 'block_implVersion_ASC_NULLS_LAST',
  BlockImplVersionDesc = 'block_implVersion_DESC',
  BlockImplVersionDescNullsFirst = 'block_implVersion_DESC_NULLS_FIRST',
  BlockImplVersionDescNullsLast = 'block_implVersion_DESC_NULLS_LAST',
  BlockParentHashAsc = 'block_parentHash_ASC',
  BlockParentHashAscNullsFirst = 'block_parentHash_ASC_NULLS_FIRST',
  BlockParentHashAscNullsLast = 'block_parentHash_ASC_NULLS_LAST',
  BlockParentHashDesc = 'block_parentHash_DESC',
  BlockParentHashDescNullsFirst = 'block_parentHash_DESC_NULLS_FIRST',
  BlockParentHashDescNullsLast = 'block_parentHash_DESC_NULLS_LAST',
  BlockSpecNameAsc = 'block_specName_ASC',
  BlockSpecNameAscNullsFirst = 'block_specName_ASC_NULLS_FIRST',
  BlockSpecNameAscNullsLast = 'block_specName_ASC_NULLS_LAST',
  BlockSpecNameDesc = 'block_specName_DESC',
  BlockSpecNameDescNullsFirst = 'block_specName_DESC_NULLS_FIRST',
  BlockSpecNameDescNullsLast = 'block_specName_DESC_NULLS_LAST',
  BlockSpecVersionAsc = 'block_specVersion_ASC',
  BlockSpecVersionAscNullsFirst = 'block_specVersion_ASC_NULLS_FIRST',
  BlockSpecVersionAscNullsLast = 'block_specVersion_ASC_NULLS_LAST',
  BlockSpecVersionDesc = 'block_specVersion_DESC',
  BlockSpecVersionDescNullsFirst = 'block_specVersion_DESC_NULLS_FIRST',
  BlockSpecVersionDescNullsLast = 'block_specVersion_DESC_NULLS_LAST',
  BlockStateRootAsc = 'block_stateRoot_ASC',
  BlockStateRootAscNullsFirst = 'block_stateRoot_ASC_NULLS_FIRST',
  BlockStateRootAscNullsLast = 'block_stateRoot_ASC_NULLS_LAST',
  BlockStateRootDesc = 'block_stateRoot_DESC',
  BlockStateRootDescNullsFirst = 'block_stateRoot_DESC_NULLS_FIRST',
  BlockStateRootDescNullsLast = 'block_stateRoot_DESC_NULLS_LAST',
  BlockTimestampAsc = 'block_timestamp_ASC',
  BlockTimestampAscNullsFirst = 'block_timestamp_ASC_NULLS_FIRST',
  BlockTimestampAscNullsLast = 'block_timestamp_ASC_NULLS_LAST',
  BlockTimestampDesc = 'block_timestamp_DESC',
  BlockTimestampDescNullsFirst = 'block_timestamp_DESC_NULLS_FIRST',
  BlockTimestampDescNullsLast = 'block_timestamp_DESC_NULLS_LAST',
  BlockValidatorAsc = 'block_validator_ASC',
  BlockValidatorAscNullsFirst = 'block_validator_ASC_NULLS_FIRST',
  BlockValidatorAscNullsLast = 'block_validator_ASC_NULLS_LAST',
  BlockValidatorDesc = 'block_validator_DESC',
  BlockValidatorDescNullsFirst = 'block_validator_DESC_NULLS_FIRST',
  BlockValidatorDescNullsLast = 'block_validator_DESC_NULLS_LAST',
  CallIdAsc = 'call_id_ASC',
  CallIdAscNullsFirst = 'call_id_ASC_NULLS_FIRST',
  CallIdAscNullsLast = 'call_id_ASC_NULLS_LAST',
  CallIdDesc = 'call_id_DESC',
  CallIdDescNullsFirst = 'call_id_DESC_NULLS_FIRST',
  CallIdDescNullsLast = 'call_id_DESC_NULLS_LAST',
  CallNameAsc = 'call_name_ASC',
  CallNameAscNullsFirst = 'call_name_ASC_NULLS_FIRST',
  CallNameAscNullsLast = 'call_name_ASC_NULLS_LAST',
  CallNameDesc = 'call_name_DESC',
  CallNameDescNullsFirst = 'call_name_DESC_NULLS_FIRST',
  CallNameDescNullsLast = 'call_name_DESC_NULLS_LAST',
  CallPalletAsc = 'call_pallet_ASC',
  CallPalletAscNullsFirst = 'call_pallet_ASC_NULLS_FIRST',
  CallPalletAscNullsLast = 'call_pallet_ASC_NULLS_LAST',
  CallPalletDesc = 'call_pallet_DESC',
  CallPalletDescNullsFirst = 'call_pallet_DESC_NULLS_FIRST',
  CallPalletDescNullsLast = 'call_pallet_DESC_NULLS_LAST',
  CallSuccessAsc = 'call_success_ASC',
  CallSuccessAscNullsFirst = 'call_success_ASC_NULLS_FIRST',
  CallSuccessAscNullsLast = 'call_success_ASC_NULLS_LAST',
  CallSuccessDesc = 'call_success_DESC',
  CallSuccessDescNullsFirst = 'call_success_DESC_NULLS_FIRST',
  CallSuccessDescNullsLast = 'call_success_DESC_NULLS_LAST',
  ExtrinsicFeeAsc = 'extrinsic_fee_ASC',
  ExtrinsicFeeAscNullsFirst = 'extrinsic_fee_ASC_NULLS_FIRST',
  ExtrinsicFeeAscNullsLast = 'extrinsic_fee_ASC_NULLS_LAST',
  ExtrinsicFeeDesc = 'extrinsic_fee_DESC',
  ExtrinsicFeeDescNullsFirst = 'extrinsic_fee_DESC_NULLS_FIRST',
  ExtrinsicFeeDescNullsLast = 'extrinsic_fee_DESC_NULLS_LAST',
  ExtrinsicHashAsc = 'extrinsic_hash_ASC',
  ExtrinsicHashAscNullsFirst = 'extrinsic_hash_ASC_NULLS_FIRST',
  ExtrinsicHashAscNullsLast = 'extrinsic_hash_ASC_NULLS_LAST',
  ExtrinsicHashDesc = 'extrinsic_hash_DESC',
  ExtrinsicHashDescNullsFirst = 'extrinsic_hash_DESC_NULLS_FIRST',
  ExtrinsicHashDescNullsLast = 'extrinsic_hash_DESC_NULLS_LAST',
  ExtrinsicIdAsc = 'extrinsic_id_ASC',
  ExtrinsicIdAscNullsFirst = 'extrinsic_id_ASC_NULLS_FIRST',
  ExtrinsicIdAscNullsLast = 'extrinsic_id_ASC_NULLS_LAST',
  ExtrinsicIdDesc = 'extrinsic_id_DESC',
  ExtrinsicIdDescNullsFirst = 'extrinsic_id_DESC_NULLS_FIRST',
  ExtrinsicIdDescNullsLast = 'extrinsic_id_DESC_NULLS_LAST',
  ExtrinsicIndexAsc = 'extrinsic_index_ASC',
  ExtrinsicIndexAscNullsFirst = 'extrinsic_index_ASC_NULLS_FIRST',
  ExtrinsicIndexAscNullsLast = 'extrinsic_index_ASC_NULLS_LAST',
  ExtrinsicIndexDesc = 'extrinsic_index_DESC',
  ExtrinsicIndexDescNullsFirst = 'extrinsic_index_DESC_NULLS_FIRST',
  ExtrinsicIndexDescNullsLast = 'extrinsic_index_DESC_NULLS_LAST',
  ExtrinsicSuccessAsc = 'extrinsic_success_ASC',
  ExtrinsicSuccessAscNullsFirst = 'extrinsic_success_ASC_NULLS_FIRST',
  ExtrinsicSuccessAscNullsLast = 'extrinsic_success_ASC_NULLS_LAST',
  ExtrinsicSuccessDesc = 'extrinsic_success_DESC',
  ExtrinsicSuccessDescNullsFirst = 'extrinsic_success_DESC_NULLS_FIRST',
  ExtrinsicSuccessDescNullsLast = 'extrinsic_success_DESC_NULLS_LAST',
  ExtrinsicTipAsc = 'extrinsic_tip_ASC',
  ExtrinsicTipAscNullsFirst = 'extrinsic_tip_ASC_NULLS_FIRST',
  ExtrinsicTipAscNullsLast = 'extrinsic_tip_ASC_NULLS_LAST',
  ExtrinsicTipDesc = 'extrinsic_tip_DESC',
  ExtrinsicTipDescNullsFirst = 'extrinsic_tip_DESC_NULLS_FIRST',
  ExtrinsicTipDescNullsLast = 'extrinsic_tip_DESC_NULLS_LAST',
  ExtrinsicVersionAsc = 'extrinsic_version_ASC',
  ExtrinsicVersionAscNullsFirst = 'extrinsic_version_ASC_NULLS_FIRST',
  ExtrinsicVersionAscNullsLast = 'extrinsic_version_ASC_NULLS_LAST',
  ExtrinsicVersionDesc = 'extrinsic_version_DESC',
  ExtrinsicVersionDescNullsFirst = 'extrinsic_version_DESC_NULLS_FIRST',
  ExtrinsicVersionDescNullsLast = 'extrinsic_version_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  IndexAsc = 'index_ASC',
  IndexAscNullsFirst = 'index_ASC_NULLS_FIRST',
  IndexAscNullsLast = 'index_ASC_NULLS_LAST',
  IndexDesc = 'index_DESC',
  IndexDescNullsFirst = 'index_DESC_NULLS_FIRST',
  IndexDescNullsLast = 'index_DESC_NULLS_LAST',
  NameAsc = 'name_ASC',
  NameAscNullsFirst = 'name_ASC_NULLS_FIRST',
  NameAscNullsLast = 'name_ASC_NULLS_LAST',
  NameDesc = 'name_DESC',
  NameDescNullsFirst = 'name_DESC_NULLS_FIRST',
  NameDescNullsLast = 'name_DESC_NULLS_LAST',
  PalletAsc = 'pallet_ASC',
  PalletAscNullsFirst = 'pallet_ASC_NULLS_FIRST',
  PalletAscNullsLast = 'pallet_ASC_NULLS_LAST',
  PalletDesc = 'pallet_DESC',
  PalletDescNullsFirst = 'pallet_DESC_NULLS_FIRST',
  PalletDescNullsLast = 'pallet_DESC_NULLS_LAST',
  PhaseAsc = 'phase_ASC',
  PhaseAscNullsFirst = 'phase_ASC_NULLS_FIRST',
  PhaseAscNullsLast = 'phase_ASC_NULLS_LAST',
  PhaseDesc = 'phase_DESC',
  PhaseDescNullsFirst = 'phase_DESC_NULLS_FIRST',
  PhaseDescNullsLast = 'phase_DESC_NULLS_LAST'
}

export type EventWhereInput = {
  AND?: InputMaybe<Array<EventWhereInput>>;
  OR?: InputMaybe<Array<EventWhereInput>>;
  argsStr_containsAll?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  argsStr_containsAny?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  argsStr_containsNone?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  argsStr_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  args_eq?: InputMaybe<Scalars['JSON']['input']>;
  args_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  args_jsonContains?: InputMaybe<Scalars['JSON']['input']>;
  args_jsonHasKey?: InputMaybe<Scalars['JSON']['input']>;
  args_not_eq?: InputMaybe<Scalars['JSON']['input']>;
  block?: InputMaybe<BlockWhereInput>;
  block_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  call?: InputMaybe<CallWhereInput>;
  call_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  extrinsic?: InputMaybe<ExtrinsicWhereInput>;
  extrinsic_isNull?: InputMaybe<Scalars['Boolean']['input']>;
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
  index_eq?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  index_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not_eq?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
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
  pallet_contains?: InputMaybe<Scalars['String']['input']>;
  pallet_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  pallet_endsWith?: InputMaybe<Scalars['String']['input']>;
  pallet_eq?: InputMaybe<Scalars['String']['input']>;
  pallet_gt?: InputMaybe<Scalars['String']['input']>;
  pallet_gte?: InputMaybe<Scalars['String']['input']>;
  pallet_in?: InputMaybe<Array<Scalars['String']['input']>>;
  pallet_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  pallet_lt?: InputMaybe<Scalars['String']['input']>;
  pallet_lte?: InputMaybe<Scalars['String']['input']>;
  pallet_not_contains?: InputMaybe<Scalars['String']['input']>;
  pallet_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  pallet_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  pallet_not_eq?: InputMaybe<Scalars['String']['input']>;
  pallet_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  pallet_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  pallet_startsWith?: InputMaybe<Scalars['String']['input']>;
  phase_contains?: InputMaybe<Scalars['String']['input']>;
  phase_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  phase_endsWith?: InputMaybe<Scalars['String']['input']>;
  phase_eq?: InputMaybe<Scalars['String']['input']>;
  phase_gt?: InputMaybe<Scalars['String']['input']>;
  phase_gte?: InputMaybe<Scalars['String']['input']>;
  phase_in?: InputMaybe<Array<Scalars['String']['input']>>;
  phase_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  phase_lt?: InputMaybe<Scalars['String']['input']>;
  phase_lte?: InputMaybe<Scalars['String']['input']>;
  phase_not_contains?: InputMaybe<Scalars['String']['input']>;
  phase_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  phase_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  phase_not_eq?: InputMaybe<Scalars['String']['input']>;
  phase_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  phase_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  phase_startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type EventsConnection = {
  __typename?: 'EventsConnection';
  edges: Array<EventEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type Extrinsic = {
  __typename?: 'Extrinsic';
  block: Block;
  call: Call;
  calls: Array<Call>;
  error?: Maybe<Scalars['JSON']['output']>;
  events: Array<Event>;
  fee?: Maybe<Scalars['BigInt']['output']>;
  hash: Scalars['Bytes']['output'];
  id: Scalars['String']['output'];
  index: Scalars['Int']['output'];
  signature?: Maybe<ExtrinsicSignature>;
  success?: Maybe<Scalars['Boolean']['output']>;
  tip?: Maybe<Scalars['BigInt']['output']>;
  version: Scalars['Int']['output'];
};


export type ExtrinsicCallsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<CallOrderByInput>>;
  where?: InputMaybe<CallWhereInput>;
};


export type ExtrinsicEventsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<EventOrderByInput>>;
  where?: InputMaybe<EventWhereInput>;
};

export type ExtrinsicEdge = {
  __typename?: 'ExtrinsicEdge';
  cursor: Scalars['String']['output'];
  node: Extrinsic;
};

export enum ExtrinsicOrderByInput {
  BlockCallsCountAsc = 'block_callsCount_ASC',
  BlockCallsCountAscNullsFirst = 'block_callsCount_ASC_NULLS_FIRST',
  BlockCallsCountAscNullsLast = 'block_callsCount_ASC_NULLS_LAST',
  BlockCallsCountDesc = 'block_callsCount_DESC',
  BlockCallsCountDescNullsFirst = 'block_callsCount_DESC_NULLS_FIRST',
  BlockCallsCountDescNullsLast = 'block_callsCount_DESC_NULLS_LAST',
  BlockEventsCountAsc = 'block_eventsCount_ASC',
  BlockEventsCountAscNullsFirst = 'block_eventsCount_ASC_NULLS_FIRST',
  BlockEventsCountAscNullsLast = 'block_eventsCount_ASC_NULLS_LAST',
  BlockEventsCountDesc = 'block_eventsCount_DESC',
  BlockEventsCountDescNullsFirst = 'block_eventsCount_DESC_NULLS_FIRST',
  BlockEventsCountDescNullsLast = 'block_eventsCount_DESC_NULLS_LAST',
  BlockExtrinsicsCountAsc = 'block_extrinsicsCount_ASC',
  BlockExtrinsicsCountAscNullsFirst = 'block_extrinsicsCount_ASC_NULLS_FIRST',
  BlockExtrinsicsCountAscNullsLast = 'block_extrinsicsCount_ASC_NULLS_LAST',
  BlockExtrinsicsCountDesc = 'block_extrinsicsCount_DESC',
  BlockExtrinsicsCountDescNullsFirst = 'block_extrinsicsCount_DESC_NULLS_FIRST',
  BlockExtrinsicsCountDescNullsLast = 'block_extrinsicsCount_DESC_NULLS_LAST',
  BlockExtrinsicsicRootAsc = 'block_extrinsicsicRoot_ASC',
  BlockExtrinsicsicRootAscNullsFirst = 'block_extrinsicsicRoot_ASC_NULLS_FIRST',
  BlockExtrinsicsicRootAscNullsLast = 'block_extrinsicsicRoot_ASC_NULLS_LAST',
  BlockExtrinsicsicRootDesc = 'block_extrinsicsicRoot_DESC',
  BlockExtrinsicsicRootDescNullsFirst = 'block_extrinsicsicRoot_DESC_NULLS_FIRST',
  BlockExtrinsicsicRootDescNullsLast = 'block_extrinsicsicRoot_DESC_NULLS_LAST',
  BlockHashAsc = 'block_hash_ASC',
  BlockHashAscNullsFirst = 'block_hash_ASC_NULLS_FIRST',
  BlockHashAscNullsLast = 'block_hash_ASC_NULLS_LAST',
  BlockHashDesc = 'block_hash_DESC',
  BlockHashDescNullsFirst = 'block_hash_DESC_NULLS_FIRST',
  BlockHashDescNullsLast = 'block_hash_DESC_NULLS_LAST',
  BlockHeightAsc = 'block_height_ASC',
  BlockHeightAscNullsFirst = 'block_height_ASC_NULLS_FIRST',
  BlockHeightAscNullsLast = 'block_height_ASC_NULLS_LAST',
  BlockHeightDesc = 'block_height_DESC',
  BlockHeightDescNullsFirst = 'block_height_DESC_NULLS_FIRST',
  BlockHeightDescNullsLast = 'block_height_DESC_NULLS_LAST',
  BlockIdAsc = 'block_id_ASC',
  BlockIdAscNullsFirst = 'block_id_ASC_NULLS_FIRST',
  BlockIdAscNullsLast = 'block_id_ASC_NULLS_LAST',
  BlockIdDesc = 'block_id_DESC',
  BlockIdDescNullsFirst = 'block_id_DESC_NULLS_FIRST',
  BlockIdDescNullsLast = 'block_id_DESC_NULLS_LAST',
  BlockImplNameAsc = 'block_implName_ASC',
  BlockImplNameAscNullsFirst = 'block_implName_ASC_NULLS_FIRST',
  BlockImplNameAscNullsLast = 'block_implName_ASC_NULLS_LAST',
  BlockImplNameDesc = 'block_implName_DESC',
  BlockImplNameDescNullsFirst = 'block_implName_DESC_NULLS_FIRST',
  BlockImplNameDescNullsLast = 'block_implName_DESC_NULLS_LAST',
  BlockImplVersionAsc = 'block_implVersion_ASC',
  BlockImplVersionAscNullsFirst = 'block_implVersion_ASC_NULLS_FIRST',
  BlockImplVersionAscNullsLast = 'block_implVersion_ASC_NULLS_LAST',
  BlockImplVersionDesc = 'block_implVersion_DESC',
  BlockImplVersionDescNullsFirst = 'block_implVersion_DESC_NULLS_FIRST',
  BlockImplVersionDescNullsLast = 'block_implVersion_DESC_NULLS_LAST',
  BlockParentHashAsc = 'block_parentHash_ASC',
  BlockParentHashAscNullsFirst = 'block_parentHash_ASC_NULLS_FIRST',
  BlockParentHashAscNullsLast = 'block_parentHash_ASC_NULLS_LAST',
  BlockParentHashDesc = 'block_parentHash_DESC',
  BlockParentHashDescNullsFirst = 'block_parentHash_DESC_NULLS_FIRST',
  BlockParentHashDescNullsLast = 'block_parentHash_DESC_NULLS_LAST',
  BlockSpecNameAsc = 'block_specName_ASC',
  BlockSpecNameAscNullsFirst = 'block_specName_ASC_NULLS_FIRST',
  BlockSpecNameAscNullsLast = 'block_specName_ASC_NULLS_LAST',
  BlockSpecNameDesc = 'block_specName_DESC',
  BlockSpecNameDescNullsFirst = 'block_specName_DESC_NULLS_FIRST',
  BlockSpecNameDescNullsLast = 'block_specName_DESC_NULLS_LAST',
  BlockSpecVersionAsc = 'block_specVersion_ASC',
  BlockSpecVersionAscNullsFirst = 'block_specVersion_ASC_NULLS_FIRST',
  BlockSpecVersionAscNullsLast = 'block_specVersion_ASC_NULLS_LAST',
  BlockSpecVersionDesc = 'block_specVersion_DESC',
  BlockSpecVersionDescNullsFirst = 'block_specVersion_DESC_NULLS_FIRST',
  BlockSpecVersionDescNullsLast = 'block_specVersion_DESC_NULLS_LAST',
  BlockStateRootAsc = 'block_stateRoot_ASC',
  BlockStateRootAscNullsFirst = 'block_stateRoot_ASC_NULLS_FIRST',
  BlockStateRootAscNullsLast = 'block_stateRoot_ASC_NULLS_LAST',
  BlockStateRootDesc = 'block_stateRoot_DESC',
  BlockStateRootDescNullsFirst = 'block_stateRoot_DESC_NULLS_FIRST',
  BlockStateRootDescNullsLast = 'block_stateRoot_DESC_NULLS_LAST',
  BlockTimestampAsc = 'block_timestamp_ASC',
  BlockTimestampAscNullsFirst = 'block_timestamp_ASC_NULLS_FIRST',
  BlockTimestampAscNullsLast = 'block_timestamp_ASC_NULLS_LAST',
  BlockTimestampDesc = 'block_timestamp_DESC',
  BlockTimestampDescNullsFirst = 'block_timestamp_DESC_NULLS_FIRST',
  BlockTimestampDescNullsLast = 'block_timestamp_DESC_NULLS_LAST',
  BlockValidatorAsc = 'block_validator_ASC',
  BlockValidatorAscNullsFirst = 'block_validator_ASC_NULLS_FIRST',
  BlockValidatorAscNullsLast = 'block_validator_ASC_NULLS_LAST',
  BlockValidatorDesc = 'block_validator_DESC',
  BlockValidatorDescNullsFirst = 'block_validator_DESC_NULLS_FIRST',
  BlockValidatorDescNullsLast = 'block_validator_DESC_NULLS_LAST',
  CallIdAsc = 'call_id_ASC',
  CallIdAscNullsFirst = 'call_id_ASC_NULLS_FIRST',
  CallIdAscNullsLast = 'call_id_ASC_NULLS_LAST',
  CallIdDesc = 'call_id_DESC',
  CallIdDescNullsFirst = 'call_id_DESC_NULLS_FIRST',
  CallIdDescNullsLast = 'call_id_DESC_NULLS_LAST',
  CallNameAsc = 'call_name_ASC',
  CallNameAscNullsFirst = 'call_name_ASC_NULLS_FIRST',
  CallNameAscNullsLast = 'call_name_ASC_NULLS_LAST',
  CallNameDesc = 'call_name_DESC',
  CallNameDescNullsFirst = 'call_name_DESC_NULLS_FIRST',
  CallNameDescNullsLast = 'call_name_DESC_NULLS_LAST',
  CallPalletAsc = 'call_pallet_ASC',
  CallPalletAscNullsFirst = 'call_pallet_ASC_NULLS_FIRST',
  CallPalletAscNullsLast = 'call_pallet_ASC_NULLS_LAST',
  CallPalletDesc = 'call_pallet_DESC',
  CallPalletDescNullsFirst = 'call_pallet_DESC_NULLS_FIRST',
  CallPalletDescNullsLast = 'call_pallet_DESC_NULLS_LAST',
  CallSuccessAsc = 'call_success_ASC',
  CallSuccessAscNullsFirst = 'call_success_ASC_NULLS_FIRST',
  CallSuccessAscNullsLast = 'call_success_ASC_NULLS_LAST',
  CallSuccessDesc = 'call_success_DESC',
  CallSuccessDescNullsFirst = 'call_success_DESC_NULLS_FIRST',
  CallSuccessDescNullsLast = 'call_success_DESC_NULLS_LAST',
  FeeAsc = 'fee_ASC',
  FeeAscNullsFirst = 'fee_ASC_NULLS_FIRST',
  FeeAscNullsLast = 'fee_ASC_NULLS_LAST',
  FeeDesc = 'fee_DESC',
  FeeDescNullsFirst = 'fee_DESC_NULLS_FIRST',
  FeeDescNullsLast = 'fee_DESC_NULLS_LAST',
  HashAsc = 'hash_ASC',
  HashAscNullsFirst = 'hash_ASC_NULLS_FIRST',
  HashAscNullsLast = 'hash_ASC_NULLS_LAST',
  HashDesc = 'hash_DESC',
  HashDescNullsFirst = 'hash_DESC_NULLS_FIRST',
  HashDescNullsLast = 'hash_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  IndexAsc = 'index_ASC',
  IndexAscNullsFirst = 'index_ASC_NULLS_FIRST',
  IndexAscNullsLast = 'index_ASC_NULLS_LAST',
  IndexDesc = 'index_DESC',
  IndexDescNullsFirst = 'index_DESC_NULLS_FIRST',
  IndexDescNullsLast = 'index_DESC_NULLS_LAST',
  SuccessAsc = 'success_ASC',
  SuccessAscNullsFirst = 'success_ASC_NULLS_FIRST',
  SuccessAscNullsLast = 'success_ASC_NULLS_LAST',
  SuccessDesc = 'success_DESC',
  SuccessDescNullsFirst = 'success_DESC_NULLS_FIRST',
  SuccessDescNullsLast = 'success_DESC_NULLS_LAST',
  TipAsc = 'tip_ASC',
  TipAscNullsFirst = 'tip_ASC_NULLS_FIRST',
  TipAscNullsLast = 'tip_ASC_NULLS_LAST',
  TipDesc = 'tip_DESC',
  TipDescNullsFirst = 'tip_DESC_NULLS_FIRST',
  TipDescNullsLast = 'tip_DESC_NULLS_LAST',
  VersionAsc = 'version_ASC',
  VersionAscNullsFirst = 'version_ASC_NULLS_FIRST',
  VersionAscNullsLast = 'version_ASC_NULLS_LAST',
  VersionDesc = 'version_DESC',
  VersionDescNullsFirst = 'version_DESC_NULLS_FIRST',
  VersionDescNullsLast = 'version_DESC_NULLS_LAST'
}

export type ExtrinsicSignature = {
  __typename?: 'ExtrinsicSignature';
  address?: Maybe<Scalars['JSON']['output']>;
  signature?: Maybe<Scalars['JSON']['output']>;
  signedExtensions?: Maybe<Scalars['JSON']['output']>;
};

export type ExtrinsicSignatureWhereInput = {
  address_eq?: InputMaybe<Scalars['JSON']['input']>;
  address_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  address_jsonContains?: InputMaybe<Scalars['JSON']['input']>;
  address_jsonHasKey?: InputMaybe<Scalars['JSON']['input']>;
  address_not_eq?: InputMaybe<Scalars['JSON']['input']>;
  signature_eq?: InputMaybe<Scalars['JSON']['input']>;
  signature_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  signature_jsonContains?: InputMaybe<Scalars['JSON']['input']>;
  signature_jsonHasKey?: InputMaybe<Scalars['JSON']['input']>;
  signature_not_eq?: InputMaybe<Scalars['JSON']['input']>;
  signedExtensions_eq?: InputMaybe<Scalars['JSON']['input']>;
  signedExtensions_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  signedExtensions_jsonContains?: InputMaybe<Scalars['JSON']['input']>;
  signedExtensions_jsonHasKey?: InputMaybe<Scalars['JSON']['input']>;
  signedExtensions_not_eq?: InputMaybe<Scalars['JSON']['input']>;
};

export type ExtrinsicWhereInput = {
  AND?: InputMaybe<Array<ExtrinsicWhereInput>>;
  OR?: InputMaybe<Array<ExtrinsicWhereInput>>;
  block?: InputMaybe<BlockWhereInput>;
  block_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  call?: InputMaybe<CallWhereInput>;
  call_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  calls_every?: InputMaybe<CallWhereInput>;
  calls_none?: InputMaybe<CallWhereInput>;
  calls_some?: InputMaybe<CallWhereInput>;
  error_eq?: InputMaybe<Scalars['JSON']['input']>;
  error_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  error_jsonContains?: InputMaybe<Scalars['JSON']['input']>;
  error_jsonHasKey?: InputMaybe<Scalars['JSON']['input']>;
  error_not_eq?: InputMaybe<Scalars['JSON']['input']>;
  events_every?: InputMaybe<EventWhereInput>;
  events_none?: InputMaybe<EventWhereInput>;
  events_some?: InputMaybe<EventWhereInput>;
  fee_eq?: InputMaybe<Scalars['BigInt']['input']>;
  fee_gt?: InputMaybe<Scalars['BigInt']['input']>;
  fee_gte?: InputMaybe<Scalars['BigInt']['input']>;
  fee_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  fee_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  fee_lt?: InputMaybe<Scalars['BigInt']['input']>;
  fee_lte?: InputMaybe<Scalars['BigInt']['input']>;
  fee_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  fee_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  hash_eq?: InputMaybe<Scalars['Bytes']['input']>;
  hash_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  hash_not_eq?: InputMaybe<Scalars['Bytes']['input']>;
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
  index_eq?: InputMaybe<Scalars['Int']['input']>;
  index_gt?: InputMaybe<Scalars['Int']['input']>;
  index_gte?: InputMaybe<Scalars['Int']['input']>;
  index_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  index_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  index_lt?: InputMaybe<Scalars['Int']['input']>;
  index_lte?: InputMaybe<Scalars['Int']['input']>;
  index_not_eq?: InputMaybe<Scalars['Int']['input']>;
  index_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  signature?: InputMaybe<ExtrinsicSignatureWhereInput>;
  signature_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  success_eq?: InputMaybe<Scalars['Boolean']['input']>;
  success_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  success_not_eq?: InputMaybe<Scalars['Boolean']['input']>;
  tip_eq?: InputMaybe<Scalars['BigInt']['input']>;
  tip_gt?: InputMaybe<Scalars['BigInt']['input']>;
  tip_gte?: InputMaybe<Scalars['BigInt']['input']>;
  tip_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  tip_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  tip_lt?: InputMaybe<Scalars['BigInt']['input']>;
  tip_lte?: InputMaybe<Scalars['BigInt']['input']>;
  tip_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  tip_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  version_eq?: InputMaybe<Scalars['Int']['input']>;
  version_gt?: InputMaybe<Scalars['Int']['input']>;
  version_gte?: InputMaybe<Scalars['Int']['input']>;
  version_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  version_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  version_lt?: InputMaybe<Scalars['Int']['input']>;
  version_lte?: InputMaybe<Scalars['Int']['input']>;
  version_not_eq?: InputMaybe<Scalars['Int']['input']>;
  version_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
};

export type ExtrinsicsConnection = {
  __typename?: 'ExtrinsicsConnection';
  edges: Array<ExtrinsicEdge>;
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
  DailyVolumeEthAscNullsFirst = 'dailyVolumeETH_ASC_NULLS_FIRST',
  DailyVolumeEthAscNullsLast = 'dailyVolumeETH_ASC_NULLS_LAST',
  DailyVolumeEthDesc = 'dailyVolumeETH_DESC',
  DailyVolumeEthDescNullsFirst = 'dailyVolumeETH_DESC_NULLS_FIRST',
  DailyVolumeEthDescNullsLast = 'dailyVolumeETH_DESC_NULLS_LAST',
  DailyVolumeUsdAsc = 'dailyVolumeUSD_ASC',
  DailyVolumeUsdAscNullsFirst = 'dailyVolumeUSD_ASC_NULLS_FIRST',
  DailyVolumeUsdAscNullsLast = 'dailyVolumeUSD_ASC_NULLS_LAST',
  DailyVolumeUsdDesc = 'dailyVolumeUSD_DESC',
  DailyVolumeUsdDescNullsFirst = 'dailyVolumeUSD_DESC_NULLS_FIRST',
  DailyVolumeUsdDescNullsLast = 'dailyVolumeUSD_DESC_NULLS_LAST',
  DailyVolumeUntrackedAsc = 'dailyVolumeUntracked_ASC',
  DailyVolumeUntrackedAscNullsFirst = 'dailyVolumeUntracked_ASC_NULLS_FIRST',
  DailyVolumeUntrackedAscNullsLast = 'dailyVolumeUntracked_ASC_NULLS_LAST',
  DailyVolumeUntrackedDesc = 'dailyVolumeUntracked_DESC',
  DailyVolumeUntrackedDescNullsFirst = 'dailyVolumeUntracked_DESC_NULLS_FIRST',
  DailyVolumeUntrackedDescNullsLast = 'dailyVolumeUntracked_DESC_NULLS_LAST',
  DateAsc = 'date_ASC',
  DateAscNullsFirst = 'date_ASC_NULLS_FIRST',
  DateAscNullsLast = 'date_ASC_NULLS_LAST',
  DateDesc = 'date_DESC',
  DateDescNullsFirst = 'date_DESC_NULLS_FIRST',
  DateDescNullsLast = 'date_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  TotalLiquidityEthAsc = 'totalLiquidityETH_ASC',
  TotalLiquidityEthAscNullsFirst = 'totalLiquidityETH_ASC_NULLS_FIRST',
  TotalLiquidityEthAscNullsLast = 'totalLiquidityETH_ASC_NULLS_LAST',
  TotalLiquidityEthDesc = 'totalLiquidityETH_DESC',
  TotalLiquidityEthDescNullsFirst = 'totalLiquidityETH_DESC_NULLS_FIRST',
  TotalLiquidityEthDescNullsLast = 'totalLiquidityETH_DESC_NULLS_LAST',
  TotalLiquidityUsdAsc = 'totalLiquidityUSD_ASC',
  TotalLiquidityUsdAscNullsFirst = 'totalLiquidityUSD_ASC_NULLS_FIRST',
  TotalLiquidityUsdAscNullsLast = 'totalLiquidityUSD_ASC_NULLS_LAST',
  TotalLiquidityUsdDesc = 'totalLiquidityUSD_DESC',
  TotalLiquidityUsdDescNullsFirst = 'totalLiquidityUSD_DESC_NULLS_FIRST',
  TotalLiquidityUsdDescNullsLast = 'totalLiquidityUSD_DESC_NULLS_LAST',
  TotalVolumeEthAsc = 'totalVolumeETH_ASC',
  TotalVolumeEthAscNullsFirst = 'totalVolumeETH_ASC_NULLS_FIRST',
  TotalVolumeEthAscNullsLast = 'totalVolumeETH_ASC_NULLS_LAST',
  TotalVolumeEthDesc = 'totalVolumeETH_DESC',
  TotalVolumeEthDescNullsFirst = 'totalVolumeETH_DESC_NULLS_FIRST',
  TotalVolumeEthDescNullsLast = 'totalVolumeETH_DESC_NULLS_LAST',
  TotalVolumeUsdAsc = 'totalVolumeUSD_ASC',
  TotalVolumeUsdAscNullsFirst = 'totalVolumeUSD_ASC_NULLS_FIRST',
  TotalVolumeUsdAscNullsLast = 'totalVolumeUSD_ASC_NULLS_LAST',
  TotalVolumeUsdDesc = 'totalVolumeUSD_DESC',
  TotalVolumeUsdDescNullsFirst = 'totalVolumeUSD_DESC_NULLS_FIRST',
  TotalVolumeUsdDescNullsLast = 'totalVolumeUSD_DESC_NULLS_LAST',
  TxCountAsc = 'txCount_ASC',
  TxCountAscNullsFirst = 'txCount_ASC_NULLS_FIRST',
  TxCountAscNullsLast = 'txCount_ASC_NULLS_LAST',
  TxCountDesc = 'txCount_DESC',
  TxCountDescNullsFirst = 'txCount_DESC_NULLS_FIRST',
  TxCountDescNullsLast = 'txCount_DESC_NULLS_LAST'
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
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  PairCountAsc = 'pairCount_ASC',
  PairCountAscNullsFirst = 'pairCount_ASC_NULLS_FIRST',
  PairCountAscNullsLast = 'pairCount_ASC_NULLS_LAST',
  PairCountDesc = 'pairCount_DESC',
  PairCountDescNullsFirst = 'pairCount_DESC_NULLS_FIRST',
  PairCountDescNullsLast = 'pairCount_DESC_NULLS_LAST',
  TotalLiquidityEthAsc = 'totalLiquidityETH_ASC',
  TotalLiquidityEthAscNullsFirst = 'totalLiquidityETH_ASC_NULLS_FIRST',
  TotalLiquidityEthAscNullsLast = 'totalLiquidityETH_ASC_NULLS_LAST',
  TotalLiquidityEthDesc = 'totalLiquidityETH_DESC',
  TotalLiquidityEthDescNullsFirst = 'totalLiquidityETH_DESC_NULLS_FIRST',
  TotalLiquidityEthDescNullsLast = 'totalLiquidityETH_DESC_NULLS_LAST',
  TotalLiquidityUsdAsc = 'totalLiquidityUSD_ASC',
  TotalLiquidityUsdAscNullsFirst = 'totalLiquidityUSD_ASC_NULLS_FIRST',
  TotalLiquidityUsdAscNullsLast = 'totalLiquidityUSD_ASC_NULLS_LAST',
  TotalLiquidityUsdDesc = 'totalLiquidityUSD_DESC',
  TotalLiquidityUsdDescNullsFirst = 'totalLiquidityUSD_DESC_NULLS_FIRST',
  TotalLiquidityUsdDescNullsLast = 'totalLiquidityUSD_DESC_NULLS_LAST',
  TotalVolumeEthAsc = 'totalVolumeETH_ASC',
  TotalVolumeEthAscNullsFirst = 'totalVolumeETH_ASC_NULLS_FIRST',
  TotalVolumeEthAscNullsLast = 'totalVolumeETH_ASC_NULLS_LAST',
  TotalVolumeEthDesc = 'totalVolumeETH_DESC',
  TotalVolumeEthDescNullsFirst = 'totalVolumeETH_DESC_NULLS_FIRST',
  TotalVolumeEthDescNullsLast = 'totalVolumeETH_DESC_NULLS_LAST',
  TotalVolumeUsdAsc = 'totalVolumeUSD_ASC',
  TotalVolumeUsdAscNullsFirst = 'totalVolumeUSD_ASC_NULLS_FIRST',
  TotalVolumeUsdAscNullsLast = 'totalVolumeUSD_ASC_NULLS_LAST',
  TotalVolumeUsdDesc = 'totalVolumeUSD_DESC',
  TotalVolumeUsdDescNullsFirst = 'totalVolumeUSD_DESC_NULLS_FIRST',
  TotalVolumeUsdDescNullsLast = 'totalVolumeUSD_DESC_NULLS_LAST',
  TxCountAsc = 'txCount_ASC',
  TxCountAscNullsFirst = 'txCount_ASC_NULLS_FIRST',
  TxCountAscNullsLast = 'txCount_ASC_NULLS_LAST',
  TxCountDesc = 'txCount_DESC',
  TxCountDescNullsFirst = 'txCount_DESC_NULLS_FIRST',
  TxCountDescNullsLast = 'txCount_DESC_NULLS_LAST',
  UntrackedVolumeUsdAsc = 'untrackedVolumeUSD_ASC',
  UntrackedVolumeUsdAscNullsFirst = 'untrackedVolumeUSD_ASC_NULLS_FIRST',
  UntrackedVolumeUsdAscNullsLast = 'untrackedVolumeUSD_ASC_NULLS_LAST',
  UntrackedVolumeUsdDesc = 'untrackedVolumeUSD_DESC',
  UntrackedVolumeUsdDescNullsFirst = 'untrackedVolumeUSD_DESC_NULLS_FIRST',
  UntrackedVolumeUsdDescNullsLast = 'untrackedVolumeUSD_DESC_NULLS_LAST'
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
  CreatedAtBlockAscNullsFirst = 'createdAtBlock_ASC_NULLS_FIRST',
  CreatedAtBlockAscNullsLast = 'createdAtBlock_ASC_NULLS_LAST',
  CreatedAtBlockDesc = 'createdAtBlock_DESC',
  CreatedAtBlockDescNullsFirst = 'createdAtBlock_DESC_NULLS_FIRST',
  CreatedAtBlockDescNullsLast = 'createdAtBlock_DESC_NULLS_LAST',
  CreatedAtTimestampAsc = 'createdAtTimestamp_ASC',
  CreatedAtTimestampAscNullsFirst = 'createdAtTimestamp_ASC_NULLS_FIRST',
  CreatedAtTimestampAscNullsLast = 'createdAtTimestamp_ASC_NULLS_LAST',
  CreatedAtTimestampDesc = 'createdAtTimestamp_DESC',
  CreatedAtTimestampDescNullsFirst = 'createdAtTimestamp_DESC_NULLS_FIRST',
  CreatedAtTimestampDescNullsLast = 'createdAtTimestamp_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  LiquidityStakedAsc = 'liquidityStaked_ASC',
  LiquidityStakedAscNullsFirst = 'liquidityStaked_ASC_NULLS_FIRST',
  LiquidityStakedAscNullsLast = 'liquidityStaked_ASC_NULLS_LAST',
  LiquidityStakedDesc = 'liquidityStaked_DESC',
  LiquidityStakedDescNullsFirst = 'liquidityStaked_DESC_NULLS_FIRST',
  LiquidityStakedDescNullsLast = 'liquidityStaked_DESC_NULLS_LAST',
  PairCreatedAtBlockNumberAsc = 'pair_createdAtBlockNumber_ASC',
  PairCreatedAtBlockNumberAscNullsFirst = 'pair_createdAtBlockNumber_ASC_NULLS_FIRST',
  PairCreatedAtBlockNumberAscNullsLast = 'pair_createdAtBlockNumber_ASC_NULLS_LAST',
  PairCreatedAtBlockNumberDesc = 'pair_createdAtBlockNumber_DESC',
  PairCreatedAtBlockNumberDescNullsFirst = 'pair_createdAtBlockNumber_DESC_NULLS_FIRST',
  PairCreatedAtBlockNumberDescNullsLast = 'pair_createdAtBlockNumber_DESC_NULLS_LAST',
  PairCreatedAtTimestampAsc = 'pair_createdAtTimestamp_ASC',
  PairCreatedAtTimestampAscNullsFirst = 'pair_createdAtTimestamp_ASC_NULLS_FIRST',
  PairCreatedAtTimestampAscNullsLast = 'pair_createdAtTimestamp_ASC_NULLS_LAST',
  PairCreatedAtTimestampDesc = 'pair_createdAtTimestamp_DESC',
  PairCreatedAtTimestampDescNullsFirst = 'pair_createdAtTimestamp_DESC_NULLS_FIRST',
  PairCreatedAtTimestampDescNullsLast = 'pair_createdAtTimestamp_DESC_NULLS_LAST',
  PairIdAsc = 'pair_id_ASC',
  PairIdAscNullsFirst = 'pair_id_ASC_NULLS_FIRST',
  PairIdAscNullsLast = 'pair_id_ASC_NULLS_LAST',
  PairIdDesc = 'pair_id_DESC',
  PairIdDescNullsFirst = 'pair_id_DESC_NULLS_FIRST',
  PairIdDescNullsLast = 'pair_id_DESC_NULLS_LAST',
  PairLiquidityProviderCountAsc = 'pair_liquidityProviderCount_ASC',
  PairLiquidityProviderCountAscNullsFirst = 'pair_liquidityProviderCount_ASC_NULLS_FIRST',
  PairLiquidityProviderCountAscNullsLast = 'pair_liquidityProviderCount_ASC_NULLS_LAST',
  PairLiquidityProviderCountDesc = 'pair_liquidityProviderCount_DESC',
  PairLiquidityProviderCountDescNullsFirst = 'pair_liquidityProviderCount_DESC_NULLS_FIRST',
  PairLiquidityProviderCountDescNullsLast = 'pair_liquidityProviderCount_DESC_NULLS_LAST',
  PairReserve0Asc = 'pair_reserve0_ASC',
  PairReserve0AscNullsFirst = 'pair_reserve0_ASC_NULLS_FIRST',
  PairReserve0AscNullsLast = 'pair_reserve0_ASC_NULLS_LAST',
  PairReserve0Desc = 'pair_reserve0_DESC',
  PairReserve0DescNullsFirst = 'pair_reserve0_DESC_NULLS_FIRST',
  PairReserve0DescNullsLast = 'pair_reserve0_DESC_NULLS_LAST',
  PairReserve1Asc = 'pair_reserve1_ASC',
  PairReserve1AscNullsFirst = 'pair_reserve1_ASC_NULLS_FIRST',
  PairReserve1AscNullsLast = 'pair_reserve1_ASC_NULLS_LAST',
  PairReserve1Desc = 'pair_reserve1_DESC',
  PairReserve1DescNullsFirst = 'pair_reserve1_DESC_NULLS_FIRST',
  PairReserve1DescNullsLast = 'pair_reserve1_DESC_NULLS_LAST',
  PairReserveEthAsc = 'pair_reserveETH_ASC',
  PairReserveEthAscNullsFirst = 'pair_reserveETH_ASC_NULLS_FIRST',
  PairReserveEthAscNullsLast = 'pair_reserveETH_ASC_NULLS_LAST',
  PairReserveEthDesc = 'pair_reserveETH_DESC',
  PairReserveEthDescNullsFirst = 'pair_reserveETH_DESC_NULLS_FIRST',
  PairReserveEthDescNullsLast = 'pair_reserveETH_DESC_NULLS_LAST',
  PairReserveUsdAsc = 'pair_reserveUSD_ASC',
  PairReserveUsdAscNullsFirst = 'pair_reserveUSD_ASC_NULLS_FIRST',
  PairReserveUsdAscNullsLast = 'pair_reserveUSD_ASC_NULLS_LAST',
  PairReserveUsdDesc = 'pair_reserveUSD_DESC',
  PairReserveUsdDescNullsFirst = 'pair_reserveUSD_DESC_NULLS_FIRST',
  PairReserveUsdDescNullsLast = 'pair_reserveUSD_DESC_NULLS_LAST',
  PairToken0PriceAsc = 'pair_token0Price_ASC',
  PairToken0PriceAscNullsFirst = 'pair_token0Price_ASC_NULLS_FIRST',
  PairToken0PriceAscNullsLast = 'pair_token0Price_ASC_NULLS_LAST',
  PairToken0PriceDesc = 'pair_token0Price_DESC',
  PairToken0PriceDescNullsFirst = 'pair_token0Price_DESC_NULLS_FIRST',
  PairToken0PriceDescNullsLast = 'pair_token0Price_DESC_NULLS_LAST',
  PairToken1PriceAsc = 'pair_token1Price_ASC',
  PairToken1PriceAscNullsFirst = 'pair_token1Price_ASC_NULLS_FIRST',
  PairToken1PriceAscNullsLast = 'pair_token1Price_ASC_NULLS_LAST',
  PairToken1PriceDesc = 'pair_token1Price_DESC',
  PairToken1PriceDescNullsFirst = 'pair_token1Price_DESC_NULLS_FIRST',
  PairToken1PriceDescNullsLast = 'pair_token1Price_DESC_NULLS_LAST',
  PairTotalSupplyAsc = 'pair_totalSupply_ASC',
  PairTotalSupplyAscNullsFirst = 'pair_totalSupply_ASC_NULLS_FIRST',
  PairTotalSupplyAscNullsLast = 'pair_totalSupply_ASC_NULLS_LAST',
  PairTotalSupplyDesc = 'pair_totalSupply_DESC',
  PairTotalSupplyDescNullsFirst = 'pair_totalSupply_DESC_NULLS_FIRST',
  PairTotalSupplyDescNullsLast = 'pair_totalSupply_DESC_NULLS_LAST',
  PairTrackedReserveEthAsc = 'pair_trackedReserveETH_ASC',
  PairTrackedReserveEthAscNullsFirst = 'pair_trackedReserveETH_ASC_NULLS_FIRST',
  PairTrackedReserveEthAscNullsLast = 'pair_trackedReserveETH_ASC_NULLS_LAST',
  PairTrackedReserveEthDesc = 'pair_trackedReserveETH_DESC',
  PairTrackedReserveEthDescNullsFirst = 'pair_trackedReserveETH_DESC_NULLS_FIRST',
  PairTrackedReserveEthDescNullsLast = 'pair_trackedReserveETH_DESC_NULLS_LAST',
  PairTxCountAsc = 'pair_txCount_ASC',
  PairTxCountAscNullsFirst = 'pair_txCount_ASC_NULLS_FIRST',
  PairTxCountAscNullsLast = 'pair_txCount_ASC_NULLS_LAST',
  PairTxCountDesc = 'pair_txCount_DESC',
  PairTxCountDescNullsFirst = 'pair_txCount_DESC_NULLS_FIRST',
  PairTxCountDescNullsLast = 'pair_txCount_DESC_NULLS_LAST',
  PairUntrackedVolumeUsdAsc = 'pair_untrackedVolumeUSD_ASC',
  PairUntrackedVolumeUsdAscNullsFirst = 'pair_untrackedVolumeUSD_ASC_NULLS_FIRST',
  PairUntrackedVolumeUsdAscNullsLast = 'pair_untrackedVolumeUSD_ASC_NULLS_LAST',
  PairUntrackedVolumeUsdDesc = 'pair_untrackedVolumeUSD_DESC',
  PairUntrackedVolumeUsdDescNullsFirst = 'pair_untrackedVolumeUSD_DESC_NULLS_FIRST',
  PairUntrackedVolumeUsdDescNullsLast = 'pair_untrackedVolumeUSD_DESC_NULLS_LAST',
  PairVolumeToken0Asc = 'pair_volumeToken0_ASC',
  PairVolumeToken0AscNullsFirst = 'pair_volumeToken0_ASC_NULLS_FIRST',
  PairVolumeToken0AscNullsLast = 'pair_volumeToken0_ASC_NULLS_LAST',
  PairVolumeToken0Desc = 'pair_volumeToken0_DESC',
  PairVolumeToken0DescNullsFirst = 'pair_volumeToken0_DESC_NULLS_FIRST',
  PairVolumeToken0DescNullsLast = 'pair_volumeToken0_DESC_NULLS_LAST',
  PairVolumeToken1Asc = 'pair_volumeToken1_ASC',
  PairVolumeToken1AscNullsFirst = 'pair_volumeToken1_ASC_NULLS_FIRST',
  PairVolumeToken1AscNullsLast = 'pair_volumeToken1_ASC_NULLS_LAST',
  PairVolumeToken1Desc = 'pair_volumeToken1_DESC',
  PairVolumeToken1DescNullsFirst = 'pair_volumeToken1_DESC_NULLS_FIRST',
  PairVolumeToken1DescNullsLast = 'pair_volumeToken1_DESC_NULLS_LAST',
  PairVolumeUsdAsc = 'pair_volumeUSD_ASC',
  PairVolumeUsdAscNullsFirst = 'pair_volumeUSD_ASC_NULLS_FIRST',
  PairVolumeUsdAscNullsLast = 'pair_volumeUSD_ASC_NULLS_LAST',
  PairVolumeUsdDesc = 'pair_volumeUSD_DESC',
  PairVolumeUsdDescNullsFirst = 'pair_volumeUSD_DESC_NULLS_FIRST',
  PairVolumeUsdDescNullsLast = 'pair_volumeUSD_DESC_NULLS_LAST',
  PidAsc = 'pid_ASC',
  PidAscNullsFirst = 'pid_ASC_NULLS_FIRST',
  PidAscNullsLast = 'pid_ASC_NULLS_LAST',
  PidDesc = 'pid_DESC',
  PidDescNullsFirst = 'pid_DESC_NULLS_FIRST',
  PidDescNullsLast = 'pid_DESC_NULLS_LAST',
  RewardUsdPerDayAsc = 'rewardUSDPerDay_ASC',
  RewardUsdPerDayAscNullsFirst = 'rewardUSDPerDay_ASC_NULLS_FIRST',
  RewardUsdPerDayAscNullsLast = 'rewardUSDPerDay_ASC_NULLS_LAST',
  RewardUsdPerDayDesc = 'rewardUSDPerDay_DESC',
  RewardUsdPerDayDescNullsFirst = 'rewardUSDPerDay_DESC_NULLS_FIRST',
  RewardUsdPerDayDescNullsLast = 'rewardUSDPerDay_DESC_NULLS_LAST',
  SingleTokenLockIdAsc = 'singleTokenLock_id_ASC',
  SingleTokenLockIdAscNullsFirst = 'singleTokenLock_id_ASC_NULLS_FIRST',
  SingleTokenLockIdAscNullsLast = 'singleTokenLock_id_ASC_NULLS_LAST',
  SingleTokenLockIdDesc = 'singleTokenLock_id_DESC',
  SingleTokenLockIdDescNullsFirst = 'singleTokenLock_id_DESC_NULLS_FIRST',
  SingleTokenLockIdDescNullsLast = 'singleTokenLock_id_DESC_NULLS_LAST',
  SingleTokenLockTotalLiquidityEthAsc = 'singleTokenLock_totalLiquidityETH_ASC',
  SingleTokenLockTotalLiquidityEthAscNullsFirst = 'singleTokenLock_totalLiquidityETH_ASC_NULLS_FIRST',
  SingleTokenLockTotalLiquidityEthAscNullsLast = 'singleTokenLock_totalLiquidityETH_ASC_NULLS_LAST',
  SingleTokenLockTotalLiquidityEthDesc = 'singleTokenLock_totalLiquidityETH_DESC',
  SingleTokenLockTotalLiquidityEthDescNullsFirst = 'singleTokenLock_totalLiquidityETH_DESC_NULLS_FIRST',
  SingleTokenLockTotalLiquidityEthDescNullsLast = 'singleTokenLock_totalLiquidityETH_DESC_NULLS_LAST',
  SingleTokenLockTotalLiquidityUsdAsc = 'singleTokenLock_totalLiquidityUSD_ASC',
  SingleTokenLockTotalLiquidityUsdAscNullsFirst = 'singleTokenLock_totalLiquidityUSD_ASC_NULLS_FIRST',
  SingleTokenLockTotalLiquidityUsdAscNullsLast = 'singleTokenLock_totalLiquidityUSD_ASC_NULLS_LAST',
  SingleTokenLockTotalLiquidityUsdDesc = 'singleTokenLock_totalLiquidityUSD_DESC',
  SingleTokenLockTotalLiquidityUsdDescNullsFirst = 'singleTokenLock_totalLiquidityUSD_DESC_NULLS_FIRST',
  SingleTokenLockTotalLiquidityUsdDescNullsLast = 'singleTokenLock_totalLiquidityUSD_DESC_NULLS_LAST',
  SingleTokenLockTotalLiquidityAsc = 'singleTokenLock_totalLiquidity_ASC',
  SingleTokenLockTotalLiquidityAscNullsFirst = 'singleTokenLock_totalLiquidity_ASC_NULLS_FIRST',
  SingleTokenLockTotalLiquidityAscNullsLast = 'singleTokenLock_totalLiquidity_ASC_NULLS_LAST',
  SingleTokenLockTotalLiquidityDesc = 'singleTokenLock_totalLiquidity_DESC',
  SingleTokenLockTotalLiquidityDescNullsFirst = 'singleTokenLock_totalLiquidity_DESC_NULLS_FIRST',
  SingleTokenLockTotalLiquidityDescNullsLast = 'singleTokenLock_totalLiquidity_DESC_NULLS_LAST',
  StableSwapAAsc = 'stableSwap_a_ASC',
  StableSwapAAscNullsFirst = 'stableSwap_a_ASC_NULLS_FIRST',
  StableSwapAAscNullsLast = 'stableSwap_a_ASC_NULLS_LAST',
  StableSwapADesc = 'stableSwap_a_DESC',
  StableSwapADescNullsFirst = 'stableSwap_a_DESC_NULLS_FIRST',
  StableSwapADescNullsLast = 'stableSwap_a_DESC_NULLS_LAST',
  StableSwapAddressAsc = 'stableSwap_address_ASC',
  StableSwapAddressAscNullsFirst = 'stableSwap_address_ASC_NULLS_FIRST',
  StableSwapAddressAscNullsLast = 'stableSwap_address_ASC_NULLS_LAST',
  StableSwapAddressDesc = 'stableSwap_address_DESC',
  StableSwapAddressDescNullsFirst = 'stableSwap_address_DESC_NULLS_FIRST',
  StableSwapAddressDescNullsLast = 'stableSwap_address_DESC_NULLS_LAST',
  StableSwapAdminFeeAsc = 'stableSwap_adminFee_ASC',
  StableSwapAdminFeeAscNullsFirst = 'stableSwap_adminFee_ASC_NULLS_FIRST',
  StableSwapAdminFeeAscNullsLast = 'stableSwap_adminFee_ASC_NULLS_LAST',
  StableSwapAdminFeeDesc = 'stableSwap_adminFee_DESC',
  StableSwapAdminFeeDescNullsFirst = 'stableSwap_adminFee_DESC_NULLS_FIRST',
  StableSwapAdminFeeDescNullsLast = 'stableSwap_adminFee_DESC_NULLS_LAST',
  StableSwapBaseSwapAddressAsc = 'stableSwap_baseSwapAddress_ASC',
  StableSwapBaseSwapAddressAscNullsFirst = 'stableSwap_baseSwapAddress_ASC_NULLS_FIRST',
  StableSwapBaseSwapAddressAscNullsLast = 'stableSwap_baseSwapAddress_ASC_NULLS_LAST',
  StableSwapBaseSwapAddressDesc = 'stableSwap_baseSwapAddress_DESC',
  StableSwapBaseSwapAddressDescNullsFirst = 'stableSwap_baseSwapAddress_DESC_NULLS_FIRST',
  StableSwapBaseSwapAddressDescNullsLast = 'stableSwap_baseSwapAddress_DESC_NULLS_LAST',
  StableSwapIdAsc = 'stableSwap_id_ASC',
  StableSwapIdAscNullsFirst = 'stableSwap_id_ASC_NULLS_FIRST',
  StableSwapIdAscNullsLast = 'stableSwap_id_ASC_NULLS_LAST',
  StableSwapIdDesc = 'stableSwap_id_DESC',
  StableSwapIdDescNullsFirst = 'stableSwap_id_DESC_NULLS_FIRST',
  StableSwapIdDescNullsLast = 'stableSwap_id_DESC_NULLS_LAST',
  StableSwapLpTokenAsc = 'stableSwap_lpToken_ASC',
  StableSwapLpTokenAscNullsFirst = 'stableSwap_lpToken_ASC_NULLS_FIRST',
  StableSwapLpTokenAscNullsLast = 'stableSwap_lpToken_ASC_NULLS_LAST',
  StableSwapLpTokenDesc = 'stableSwap_lpToken_DESC',
  StableSwapLpTokenDescNullsFirst = 'stableSwap_lpToken_DESC_NULLS_FIRST',
  StableSwapLpTokenDescNullsLast = 'stableSwap_lpToken_DESC_NULLS_LAST',
  StableSwapLpTotalSupplyAsc = 'stableSwap_lpTotalSupply_ASC',
  StableSwapLpTotalSupplyAscNullsFirst = 'stableSwap_lpTotalSupply_ASC_NULLS_FIRST',
  StableSwapLpTotalSupplyAscNullsLast = 'stableSwap_lpTotalSupply_ASC_NULLS_LAST',
  StableSwapLpTotalSupplyDesc = 'stableSwap_lpTotalSupply_DESC',
  StableSwapLpTotalSupplyDescNullsFirst = 'stableSwap_lpTotalSupply_DESC_NULLS_FIRST',
  StableSwapLpTotalSupplyDescNullsLast = 'stableSwap_lpTotalSupply_DESC_NULLS_LAST',
  StableSwapNumTokensAsc = 'stableSwap_numTokens_ASC',
  StableSwapNumTokensAscNullsFirst = 'stableSwap_numTokens_ASC_NULLS_FIRST',
  StableSwapNumTokensAscNullsLast = 'stableSwap_numTokens_ASC_NULLS_LAST',
  StableSwapNumTokensDesc = 'stableSwap_numTokens_DESC',
  StableSwapNumTokensDescNullsFirst = 'stableSwap_numTokens_DESC_NULLS_FIRST',
  StableSwapNumTokensDescNullsLast = 'stableSwap_numTokens_DESC_NULLS_LAST',
  StableSwapSwapFeeAsc = 'stableSwap_swapFee_ASC',
  StableSwapSwapFeeAscNullsFirst = 'stableSwap_swapFee_ASC_NULLS_FIRST',
  StableSwapSwapFeeAscNullsLast = 'stableSwap_swapFee_ASC_NULLS_LAST',
  StableSwapSwapFeeDesc = 'stableSwap_swapFee_DESC',
  StableSwapSwapFeeDescNullsFirst = 'stableSwap_swapFee_DESC_NULLS_FIRST',
  StableSwapSwapFeeDescNullsLast = 'stableSwap_swapFee_DESC_NULLS_LAST',
  StableSwapTvlUsdAsc = 'stableSwap_tvlUSD_ASC',
  StableSwapTvlUsdAscNullsFirst = 'stableSwap_tvlUSD_ASC_NULLS_FIRST',
  StableSwapTvlUsdAscNullsLast = 'stableSwap_tvlUSD_ASC_NULLS_LAST',
  StableSwapTvlUsdDesc = 'stableSwap_tvlUSD_DESC',
  StableSwapTvlUsdDescNullsFirst = 'stableSwap_tvlUSD_DESC_NULLS_FIRST',
  StableSwapTvlUsdDescNullsLast = 'stableSwap_tvlUSD_DESC_NULLS_LAST',
  StableSwapVirtualPriceAsc = 'stableSwap_virtualPrice_ASC',
  StableSwapVirtualPriceAscNullsFirst = 'stableSwap_virtualPrice_ASC_NULLS_FIRST',
  StableSwapVirtualPriceAscNullsLast = 'stableSwap_virtualPrice_ASC_NULLS_LAST',
  StableSwapVirtualPriceDesc = 'stableSwap_virtualPrice_DESC',
  StableSwapVirtualPriceDescNullsFirst = 'stableSwap_virtualPrice_DESC_NULLS_FIRST',
  StableSwapVirtualPriceDescNullsLast = 'stableSwap_virtualPrice_DESC_NULLS_LAST',
  StableSwapVolumeUsdAsc = 'stableSwap_volumeUSD_ASC',
  StableSwapVolumeUsdAscNullsFirst = 'stableSwap_volumeUSD_ASC_NULLS_FIRST',
  StableSwapVolumeUsdAscNullsLast = 'stableSwap_volumeUSD_ASC_NULLS_LAST',
  StableSwapVolumeUsdDesc = 'stableSwap_volumeUSD_DESC',
  StableSwapVolumeUsdDescNullsFirst = 'stableSwap_volumeUSD_DESC_NULLS_FIRST',
  StableSwapVolumeUsdDescNullsLast = 'stableSwap_volumeUSD_DESC_NULLS_LAST',
  StakeAprAsc = 'stakeApr_ASC',
  StakeAprAscNullsFirst = 'stakeApr_ASC_NULLS_FIRST',
  StakeAprAscNullsLast = 'stakeApr_ASC_NULLS_LAST',
  StakeAprDesc = 'stakeApr_DESC',
  StakeAprDescNullsFirst = 'stakeApr_DESC_NULLS_FIRST',
  StakeAprDescNullsLast = 'stakeApr_DESC_NULLS_LAST',
  StakeTokenAsc = 'stakeToken_ASC',
  StakeTokenAscNullsFirst = 'stakeToken_ASC_NULLS_FIRST',
  StakeTokenAscNullsLast = 'stakeToken_ASC_NULLS_LAST',
  StakeTokenDesc = 'stakeToken_DESC',
  StakeTokenDescNullsFirst = 'stakeToken_DESC_NULLS_FIRST',
  StakeTokenDescNullsLast = 'stakeToken_DESC_NULLS_LAST',
  StakedUsdAsc = 'stakedUSD_ASC',
  StakedUsdAscNullsFirst = 'stakedUSD_ASC_NULLS_FIRST',
  StakedUsdAscNullsLast = 'stakedUSD_ASC_NULLS_LAST',
  StakedUsdDesc = 'stakedUSD_DESC',
  StakedUsdDescNullsFirst = 'stakedUSD_DESC_NULLS_FIRST',
  StakedUsdDescNullsLast = 'stakedUSD_DESC_NULLS_LAST'
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
  FarmCreatedAtBlockAscNullsFirst = 'farm_createdAtBlock_ASC_NULLS_FIRST',
  FarmCreatedAtBlockAscNullsLast = 'farm_createdAtBlock_ASC_NULLS_LAST',
  FarmCreatedAtBlockDesc = 'farm_createdAtBlock_DESC',
  FarmCreatedAtBlockDescNullsFirst = 'farm_createdAtBlock_DESC_NULLS_FIRST',
  FarmCreatedAtBlockDescNullsLast = 'farm_createdAtBlock_DESC_NULLS_LAST',
  FarmCreatedAtTimestampAsc = 'farm_createdAtTimestamp_ASC',
  FarmCreatedAtTimestampAscNullsFirst = 'farm_createdAtTimestamp_ASC_NULLS_FIRST',
  FarmCreatedAtTimestampAscNullsLast = 'farm_createdAtTimestamp_ASC_NULLS_LAST',
  FarmCreatedAtTimestampDesc = 'farm_createdAtTimestamp_DESC',
  FarmCreatedAtTimestampDescNullsFirst = 'farm_createdAtTimestamp_DESC_NULLS_FIRST',
  FarmCreatedAtTimestampDescNullsLast = 'farm_createdAtTimestamp_DESC_NULLS_LAST',
  FarmIdAsc = 'farm_id_ASC',
  FarmIdAscNullsFirst = 'farm_id_ASC_NULLS_FIRST',
  FarmIdAscNullsLast = 'farm_id_ASC_NULLS_LAST',
  FarmIdDesc = 'farm_id_DESC',
  FarmIdDescNullsFirst = 'farm_id_DESC_NULLS_FIRST',
  FarmIdDescNullsLast = 'farm_id_DESC_NULLS_LAST',
  FarmLiquidityStakedAsc = 'farm_liquidityStaked_ASC',
  FarmLiquidityStakedAscNullsFirst = 'farm_liquidityStaked_ASC_NULLS_FIRST',
  FarmLiquidityStakedAscNullsLast = 'farm_liquidityStaked_ASC_NULLS_LAST',
  FarmLiquidityStakedDesc = 'farm_liquidityStaked_DESC',
  FarmLiquidityStakedDescNullsFirst = 'farm_liquidityStaked_DESC_NULLS_FIRST',
  FarmLiquidityStakedDescNullsLast = 'farm_liquidityStaked_DESC_NULLS_LAST',
  FarmPidAsc = 'farm_pid_ASC',
  FarmPidAscNullsFirst = 'farm_pid_ASC_NULLS_FIRST',
  FarmPidAscNullsLast = 'farm_pid_ASC_NULLS_LAST',
  FarmPidDesc = 'farm_pid_DESC',
  FarmPidDescNullsFirst = 'farm_pid_DESC_NULLS_FIRST',
  FarmPidDescNullsLast = 'farm_pid_DESC_NULLS_LAST',
  FarmRewardUsdPerDayAsc = 'farm_rewardUSDPerDay_ASC',
  FarmRewardUsdPerDayAscNullsFirst = 'farm_rewardUSDPerDay_ASC_NULLS_FIRST',
  FarmRewardUsdPerDayAscNullsLast = 'farm_rewardUSDPerDay_ASC_NULLS_LAST',
  FarmRewardUsdPerDayDesc = 'farm_rewardUSDPerDay_DESC',
  FarmRewardUsdPerDayDescNullsFirst = 'farm_rewardUSDPerDay_DESC_NULLS_FIRST',
  FarmRewardUsdPerDayDescNullsLast = 'farm_rewardUSDPerDay_DESC_NULLS_LAST',
  FarmStakeAprAsc = 'farm_stakeApr_ASC',
  FarmStakeAprAscNullsFirst = 'farm_stakeApr_ASC_NULLS_FIRST',
  FarmStakeAprAscNullsLast = 'farm_stakeApr_ASC_NULLS_LAST',
  FarmStakeAprDesc = 'farm_stakeApr_DESC',
  FarmStakeAprDescNullsFirst = 'farm_stakeApr_DESC_NULLS_FIRST',
  FarmStakeAprDescNullsLast = 'farm_stakeApr_DESC_NULLS_LAST',
  FarmStakeTokenAsc = 'farm_stakeToken_ASC',
  FarmStakeTokenAscNullsFirst = 'farm_stakeToken_ASC_NULLS_FIRST',
  FarmStakeTokenAscNullsLast = 'farm_stakeToken_ASC_NULLS_LAST',
  FarmStakeTokenDesc = 'farm_stakeToken_DESC',
  FarmStakeTokenDescNullsFirst = 'farm_stakeToken_DESC_NULLS_FIRST',
  FarmStakeTokenDescNullsLast = 'farm_stakeToken_DESC_NULLS_LAST',
  FarmStakedUsdAsc = 'farm_stakedUSD_ASC',
  FarmStakedUsdAscNullsFirst = 'farm_stakedUSD_ASC_NULLS_FIRST',
  FarmStakedUsdAscNullsLast = 'farm_stakedUSD_ASC_NULLS_LAST',
  FarmStakedUsdDesc = 'farm_stakedUSD_DESC',
  FarmStakedUsdDescNullsFirst = 'farm_stakedUSD_DESC_NULLS_FIRST',
  FarmStakedUsdDescNullsLast = 'farm_stakedUSD_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  RewardPerDayAsc = 'rewardPerDay_ASC',
  RewardPerDayAscNullsFirst = 'rewardPerDay_ASC_NULLS_FIRST',
  RewardPerDayAscNullsLast = 'rewardPerDay_ASC_NULLS_LAST',
  RewardPerDayDesc = 'rewardPerDay_DESC',
  RewardPerDayDescNullsFirst = 'rewardPerDay_DESC_NULLS_FIRST',
  RewardPerDayDescNullsLast = 'rewardPerDay_DESC_NULLS_LAST',
  RewardTokenDecimalsAsc = 'rewardToken_decimals_ASC',
  RewardTokenDecimalsAscNullsFirst = 'rewardToken_decimals_ASC_NULLS_FIRST',
  RewardTokenDecimalsAscNullsLast = 'rewardToken_decimals_ASC_NULLS_LAST',
  RewardTokenDecimalsDesc = 'rewardToken_decimals_DESC',
  RewardTokenDecimalsDescNullsFirst = 'rewardToken_decimals_DESC_NULLS_FIRST',
  RewardTokenDecimalsDescNullsLast = 'rewardToken_decimals_DESC_NULLS_LAST',
  RewardTokenDerivedEthAsc = 'rewardToken_derivedETH_ASC',
  RewardTokenDerivedEthAscNullsFirst = 'rewardToken_derivedETH_ASC_NULLS_FIRST',
  RewardTokenDerivedEthAscNullsLast = 'rewardToken_derivedETH_ASC_NULLS_LAST',
  RewardTokenDerivedEthDesc = 'rewardToken_derivedETH_DESC',
  RewardTokenDerivedEthDescNullsFirst = 'rewardToken_derivedETH_DESC_NULLS_FIRST',
  RewardTokenDerivedEthDescNullsLast = 'rewardToken_derivedETH_DESC_NULLS_LAST',
  RewardTokenIdAsc = 'rewardToken_id_ASC',
  RewardTokenIdAscNullsFirst = 'rewardToken_id_ASC_NULLS_FIRST',
  RewardTokenIdAscNullsLast = 'rewardToken_id_ASC_NULLS_LAST',
  RewardTokenIdDesc = 'rewardToken_id_DESC',
  RewardTokenIdDescNullsFirst = 'rewardToken_id_DESC_NULLS_FIRST',
  RewardTokenIdDescNullsLast = 'rewardToken_id_DESC_NULLS_LAST',
  RewardTokenNameAsc = 'rewardToken_name_ASC',
  RewardTokenNameAscNullsFirst = 'rewardToken_name_ASC_NULLS_FIRST',
  RewardTokenNameAscNullsLast = 'rewardToken_name_ASC_NULLS_LAST',
  RewardTokenNameDesc = 'rewardToken_name_DESC',
  RewardTokenNameDescNullsFirst = 'rewardToken_name_DESC_NULLS_FIRST',
  RewardTokenNameDescNullsLast = 'rewardToken_name_DESC_NULLS_LAST',
  RewardTokenSymbolAsc = 'rewardToken_symbol_ASC',
  RewardTokenSymbolAscNullsFirst = 'rewardToken_symbol_ASC_NULLS_FIRST',
  RewardTokenSymbolAscNullsLast = 'rewardToken_symbol_ASC_NULLS_LAST',
  RewardTokenSymbolDesc = 'rewardToken_symbol_DESC',
  RewardTokenSymbolDescNullsFirst = 'rewardToken_symbol_DESC_NULLS_FIRST',
  RewardTokenSymbolDescNullsLast = 'rewardToken_symbol_DESC_NULLS_LAST',
  RewardTokenTotalLiquidityAsc = 'rewardToken_totalLiquidity_ASC',
  RewardTokenTotalLiquidityAscNullsFirst = 'rewardToken_totalLiquidity_ASC_NULLS_FIRST',
  RewardTokenTotalLiquidityAscNullsLast = 'rewardToken_totalLiquidity_ASC_NULLS_LAST',
  RewardTokenTotalLiquidityDesc = 'rewardToken_totalLiquidity_DESC',
  RewardTokenTotalLiquidityDescNullsFirst = 'rewardToken_totalLiquidity_DESC_NULLS_FIRST',
  RewardTokenTotalLiquidityDescNullsLast = 'rewardToken_totalLiquidity_DESC_NULLS_LAST',
  RewardTokenTotalSupplyAsc = 'rewardToken_totalSupply_ASC',
  RewardTokenTotalSupplyAscNullsFirst = 'rewardToken_totalSupply_ASC_NULLS_FIRST',
  RewardTokenTotalSupplyAscNullsLast = 'rewardToken_totalSupply_ASC_NULLS_LAST',
  RewardTokenTotalSupplyDesc = 'rewardToken_totalSupply_DESC',
  RewardTokenTotalSupplyDescNullsFirst = 'rewardToken_totalSupply_DESC_NULLS_FIRST',
  RewardTokenTotalSupplyDescNullsLast = 'rewardToken_totalSupply_DESC_NULLS_LAST',
  RewardTokenTradeVolumeUsdAsc = 'rewardToken_tradeVolumeUSD_ASC',
  RewardTokenTradeVolumeUsdAscNullsFirst = 'rewardToken_tradeVolumeUSD_ASC_NULLS_FIRST',
  RewardTokenTradeVolumeUsdAscNullsLast = 'rewardToken_tradeVolumeUSD_ASC_NULLS_LAST',
  RewardTokenTradeVolumeUsdDesc = 'rewardToken_tradeVolumeUSD_DESC',
  RewardTokenTradeVolumeUsdDescNullsFirst = 'rewardToken_tradeVolumeUSD_DESC_NULLS_FIRST',
  RewardTokenTradeVolumeUsdDescNullsLast = 'rewardToken_tradeVolumeUSD_DESC_NULLS_LAST',
  RewardTokenTradeVolumeAsc = 'rewardToken_tradeVolume_ASC',
  RewardTokenTradeVolumeAscNullsFirst = 'rewardToken_tradeVolume_ASC_NULLS_FIRST',
  RewardTokenTradeVolumeAscNullsLast = 'rewardToken_tradeVolume_ASC_NULLS_LAST',
  RewardTokenTradeVolumeDesc = 'rewardToken_tradeVolume_DESC',
  RewardTokenTradeVolumeDescNullsFirst = 'rewardToken_tradeVolume_DESC_NULLS_FIRST',
  RewardTokenTradeVolumeDescNullsLast = 'rewardToken_tradeVolume_DESC_NULLS_LAST',
  RewardTokenTxCountAsc = 'rewardToken_txCount_ASC',
  RewardTokenTxCountAscNullsFirst = 'rewardToken_txCount_ASC_NULLS_FIRST',
  RewardTokenTxCountAscNullsLast = 'rewardToken_txCount_ASC_NULLS_LAST',
  RewardTokenTxCountDesc = 'rewardToken_txCount_DESC',
  RewardTokenTxCountDescNullsFirst = 'rewardToken_txCount_DESC_NULLS_FIRST',
  RewardTokenTxCountDescNullsLast = 'rewardToken_txCount_DESC_NULLS_LAST',
  RewardTokenUntrackedVolumeUsdAsc = 'rewardToken_untrackedVolumeUSD_ASC',
  RewardTokenUntrackedVolumeUsdAscNullsFirst = 'rewardToken_untrackedVolumeUSD_ASC_NULLS_FIRST',
  RewardTokenUntrackedVolumeUsdAscNullsLast = 'rewardToken_untrackedVolumeUSD_ASC_NULLS_LAST',
  RewardTokenUntrackedVolumeUsdDesc = 'rewardToken_untrackedVolumeUSD_DESC',
  RewardTokenUntrackedVolumeUsdDescNullsFirst = 'rewardToken_untrackedVolumeUSD_DESC_NULLS_FIRST',
  RewardTokenUntrackedVolumeUsdDescNullsLast = 'rewardToken_untrackedVolumeUSD_DESC_NULLS_LAST'
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

export type IssueRequest = {
  __typename?: 'IssueRequest';
  amount: Scalars['BigInt']['output'];
  asset: Scalars['String']['output'];
  fee: Scalars['BigInt']['output'];
  griefingCollateral: Scalars['BigInt']['output'];
  id: Scalars['String']['output'];
  opentime: Scalars['BigInt']['output'];
  period: Scalars['BigInt']['output'];
  requester: Scalars['String']['output'];
  status: IssueRequestStatus;
  stellarAddress: Scalars['String']['output'];
  timestamp: Scalars['DateTime']['output'];
  vault: Vault;
};

export type IssueRequestEdge = {
  __typename?: 'IssueRequestEdge';
  cursor: Scalars['String']['output'];
  node: IssueRequest;
};

export enum IssueRequestOrderByInput {
  AmountAsc = 'amount_ASC',
  AmountAscNullsFirst = 'amount_ASC_NULLS_FIRST',
  AmountAscNullsLast = 'amount_ASC_NULLS_LAST',
  AmountDesc = 'amount_DESC',
  AmountDescNullsFirst = 'amount_DESC_NULLS_FIRST',
  AmountDescNullsLast = 'amount_DESC_NULLS_LAST',
  AssetAsc = 'asset_ASC',
  AssetAscNullsFirst = 'asset_ASC_NULLS_FIRST',
  AssetAscNullsLast = 'asset_ASC_NULLS_LAST',
  AssetDesc = 'asset_DESC',
  AssetDescNullsFirst = 'asset_DESC_NULLS_FIRST',
  AssetDescNullsLast = 'asset_DESC_NULLS_LAST',
  FeeAsc = 'fee_ASC',
  FeeAscNullsFirst = 'fee_ASC_NULLS_FIRST',
  FeeAscNullsLast = 'fee_ASC_NULLS_LAST',
  FeeDesc = 'fee_DESC',
  FeeDescNullsFirst = 'fee_DESC_NULLS_FIRST',
  FeeDescNullsLast = 'fee_DESC_NULLS_LAST',
  GriefingCollateralAsc = 'griefingCollateral_ASC',
  GriefingCollateralAscNullsFirst = 'griefingCollateral_ASC_NULLS_FIRST',
  GriefingCollateralAscNullsLast = 'griefingCollateral_ASC_NULLS_LAST',
  GriefingCollateralDesc = 'griefingCollateral_DESC',
  GriefingCollateralDescNullsFirst = 'griefingCollateral_DESC_NULLS_FIRST',
  GriefingCollateralDescNullsLast = 'griefingCollateral_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  OpentimeAsc = 'opentime_ASC',
  OpentimeAscNullsFirst = 'opentime_ASC_NULLS_FIRST',
  OpentimeAscNullsLast = 'opentime_ASC_NULLS_LAST',
  OpentimeDesc = 'opentime_DESC',
  OpentimeDescNullsFirst = 'opentime_DESC_NULLS_FIRST',
  OpentimeDescNullsLast = 'opentime_DESC_NULLS_LAST',
  PeriodAsc = 'period_ASC',
  PeriodAscNullsFirst = 'period_ASC_NULLS_FIRST',
  PeriodAscNullsLast = 'period_ASC_NULLS_LAST',
  PeriodDesc = 'period_DESC',
  PeriodDescNullsFirst = 'period_DESC_NULLS_FIRST',
  PeriodDescNullsLast = 'period_DESC_NULLS_LAST',
  RequesterAsc = 'requester_ASC',
  RequesterAscNullsFirst = 'requester_ASC_NULLS_FIRST',
  RequesterAscNullsLast = 'requester_ASC_NULLS_LAST',
  RequesterDesc = 'requester_DESC',
  RequesterDescNullsFirst = 'requester_DESC_NULLS_FIRST',
  RequesterDescNullsLast = 'requester_DESC_NULLS_LAST',
  StatusAsc = 'status_ASC',
  StatusAscNullsFirst = 'status_ASC_NULLS_FIRST',
  StatusAscNullsLast = 'status_ASC_NULLS_LAST',
  StatusDesc = 'status_DESC',
  StatusDescNullsFirst = 'status_DESC_NULLS_FIRST',
  StatusDescNullsLast = 'status_DESC_NULLS_LAST',
  StellarAddressAsc = 'stellarAddress_ASC',
  StellarAddressAscNullsFirst = 'stellarAddress_ASC_NULLS_FIRST',
  StellarAddressAscNullsLast = 'stellarAddress_ASC_NULLS_LAST',
  StellarAddressDesc = 'stellarAddress_DESC',
  StellarAddressDescNullsFirst = 'stellarAddress_DESC_NULLS_FIRST',
  StellarAddressDescNullsLast = 'stellarAddress_DESC_NULLS_LAST',
  TimestampAsc = 'timestamp_ASC',
  TimestampAscNullsFirst = 'timestamp_ASC_NULLS_FIRST',
  TimestampAscNullsLast = 'timestamp_ASC_NULLS_LAST',
  TimestampDesc = 'timestamp_DESC',
  TimestampDescNullsFirst = 'timestamp_DESC_NULLS_FIRST',
  TimestampDescNullsLast = 'timestamp_DESC_NULLS_LAST',
  VaultAccountIdAsc = 'vault_accountId_ASC',
  VaultAccountIdAscNullsFirst = 'vault_accountId_ASC_NULLS_FIRST',
  VaultAccountIdAscNullsLast = 'vault_accountId_ASC_NULLS_LAST',
  VaultAccountIdDesc = 'vault_accountId_DESC',
  VaultAccountIdDescNullsFirst = 'vault_accountId_DESC_NULLS_FIRST',
  VaultAccountIdDescNullsLast = 'vault_accountId_DESC_NULLS_LAST',
  VaultCollateralAsc = 'vault_collateral_ASC',
  VaultCollateralAscNullsFirst = 'vault_collateral_ASC_NULLS_FIRST',
  VaultCollateralAscNullsLast = 'vault_collateral_ASC_NULLS_LAST',
  VaultCollateralDesc = 'vault_collateral_DESC',
  VaultCollateralDescNullsFirst = 'vault_collateral_DESC_NULLS_FIRST',
  VaultCollateralDescNullsLast = 'vault_collateral_DESC_NULLS_LAST',
  VaultIdAsc = 'vault_id_ASC',
  VaultIdAscNullsFirst = 'vault_id_ASC_NULLS_FIRST',
  VaultIdAscNullsLast = 'vault_id_ASC_NULLS_LAST',
  VaultIdDesc = 'vault_id_DESC',
  VaultIdDescNullsFirst = 'vault_id_DESC_NULLS_FIRST',
  VaultIdDescNullsLast = 'vault_id_DESC_NULLS_LAST',
  VaultVaultStellarPublicKeyAsc = 'vault_vaultStellarPublicKey_ASC',
  VaultVaultStellarPublicKeyAscNullsFirst = 'vault_vaultStellarPublicKey_ASC_NULLS_FIRST',
  VaultVaultStellarPublicKeyAscNullsLast = 'vault_vaultStellarPublicKey_ASC_NULLS_LAST',
  VaultVaultStellarPublicKeyDesc = 'vault_vaultStellarPublicKey_DESC',
  VaultVaultStellarPublicKeyDescNullsFirst = 'vault_vaultStellarPublicKey_DESC_NULLS_FIRST',
  VaultVaultStellarPublicKeyDescNullsLast = 'vault_vaultStellarPublicKey_DESC_NULLS_LAST',
  VaultWrappedAsc = 'vault_wrapped_ASC',
  VaultWrappedAscNullsFirst = 'vault_wrapped_ASC_NULLS_FIRST',
  VaultWrappedAscNullsLast = 'vault_wrapped_ASC_NULLS_LAST',
  VaultWrappedDesc = 'vault_wrapped_DESC',
  VaultWrappedDescNullsFirst = 'vault_wrapped_DESC_NULLS_FIRST',
  VaultWrappedDescNullsLast = 'vault_wrapped_DESC_NULLS_LAST'
}

export enum IssueRequestStatus {
  Cancelled = 'CANCELLED',
  Completed = 'COMPLETED',
  Pending = 'PENDING'
}

export type IssueRequestWhereInput = {
  AND?: InputMaybe<Array<IssueRequestWhereInput>>;
  OR?: InputMaybe<Array<IssueRequestWhereInput>>;
  amount_eq?: InputMaybe<Scalars['BigInt']['input']>;
  amount_gt?: InputMaybe<Scalars['BigInt']['input']>;
  amount_gte?: InputMaybe<Scalars['BigInt']['input']>;
  amount_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  amount_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  amount_lt?: InputMaybe<Scalars['BigInt']['input']>;
  amount_lte?: InputMaybe<Scalars['BigInt']['input']>;
  amount_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  amount_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  asset_contains?: InputMaybe<Scalars['String']['input']>;
  asset_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  asset_endsWith?: InputMaybe<Scalars['String']['input']>;
  asset_eq?: InputMaybe<Scalars['String']['input']>;
  asset_gt?: InputMaybe<Scalars['String']['input']>;
  asset_gte?: InputMaybe<Scalars['String']['input']>;
  asset_in?: InputMaybe<Array<Scalars['String']['input']>>;
  asset_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  asset_lt?: InputMaybe<Scalars['String']['input']>;
  asset_lte?: InputMaybe<Scalars['String']['input']>;
  asset_not_contains?: InputMaybe<Scalars['String']['input']>;
  asset_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  asset_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  asset_not_eq?: InputMaybe<Scalars['String']['input']>;
  asset_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  asset_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  asset_startsWith?: InputMaybe<Scalars['String']['input']>;
  fee_eq?: InputMaybe<Scalars['BigInt']['input']>;
  fee_gt?: InputMaybe<Scalars['BigInt']['input']>;
  fee_gte?: InputMaybe<Scalars['BigInt']['input']>;
  fee_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  fee_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  fee_lt?: InputMaybe<Scalars['BigInt']['input']>;
  fee_lte?: InputMaybe<Scalars['BigInt']['input']>;
  fee_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  fee_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  griefingCollateral_eq?: InputMaybe<Scalars['BigInt']['input']>;
  griefingCollateral_gt?: InputMaybe<Scalars['BigInt']['input']>;
  griefingCollateral_gte?: InputMaybe<Scalars['BigInt']['input']>;
  griefingCollateral_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  griefingCollateral_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  griefingCollateral_lt?: InputMaybe<Scalars['BigInt']['input']>;
  griefingCollateral_lte?: InputMaybe<Scalars['BigInt']['input']>;
  griefingCollateral_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  griefingCollateral_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
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
  opentime_eq?: InputMaybe<Scalars['BigInt']['input']>;
  opentime_gt?: InputMaybe<Scalars['BigInt']['input']>;
  opentime_gte?: InputMaybe<Scalars['BigInt']['input']>;
  opentime_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  opentime_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  opentime_lt?: InputMaybe<Scalars['BigInt']['input']>;
  opentime_lte?: InputMaybe<Scalars['BigInt']['input']>;
  opentime_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  opentime_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  period_eq?: InputMaybe<Scalars['BigInt']['input']>;
  period_gt?: InputMaybe<Scalars['BigInt']['input']>;
  period_gte?: InputMaybe<Scalars['BigInt']['input']>;
  period_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  period_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  period_lt?: InputMaybe<Scalars['BigInt']['input']>;
  period_lte?: InputMaybe<Scalars['BigInt']['input']>;
  period_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  period_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  requester_contains?: InputMaybe<Scalars['String']['input']>;
  requester_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  requester_endsWith?: InputMaybe<Scalars['String']['input']>;
  requester_eq?: InputMaybe<Scalars['String']['input']>;
  requester_gt?: InputMaybe<Scalars['String']['input']>;
  requester_gte?: InputMaybe<Scalars['String']['input']>;
  requester_in?: InputMaybe<Array<Scalars['String']['input']>>;
  requester_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  requester_lt?: InputMaybe<Scalars['String']['input']>;
  requester_lte?: InputMaybe<Scalars['String']['input']>;
  requester_not_contains?: InputMaybe<Scalars['String']['input']>;
  requester_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  requester_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  requester_not_eq?: InputMaybe<Scalars['String']['input']>;
  requester_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  requester_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  requester_startsWith?: InputMaybe<Scalars['String']['input']>;
  status_eq?: InputMaybe<IssueRequestStatus>;
  status_in?: InputMaybe<Array<IssueRequestStatus>>;
  status_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  status_not_eq?: InputMaybe<IssueRequestStatus>;
  status_not_in?: InputMaybe<Array<IssueRequestStatus>>;
  stellarAddress_contains?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_endsWith?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_eq?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_gt?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_gte?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_in?: InputMaybe<Array<Scalars['String']['input']>>;
  stellarAddress_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  stellarAddress_lt?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_lte?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_not_contains?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_not_eq?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  stellarAddress_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_startsWith?: InputMaybe<Scalars['String']['input']>;
  timestamp_eq?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_gt?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_gte?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  timestamp_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  timestamp_lt?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_lte?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_not_eq?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_not_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  vault?: InputMaybe<VaultWhereInput>;
  vault_isNull?: InputMaybe<Scalars['Boolean']['input']>;
};

export type IssueRequestsConnection = {
  __typename?: 'IssueRequestsConnection';
  edges: Array<IssueRequestEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export enum ItemType {
  Calls = 'Calls',
  Events = 'Events',
  Extrinsics = 'Extrinsics'
}

export type ItemsCounter = {
  __typename?: 'ItemsCounter';
  id: Scalars['String']['output'];
  level: CounterLevel;
  total: Scalars['Int']['output'];
  type: ItemType;
};

export type ItemsCounterEdge = {
  __typename?: 'ItemsCounterEdge';
  cursor: Scalars['String']['output'];
  node: ItemsCounter;
};

export enum ItemsCounterOrderByInput {
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  LevelAsc = 'level_ASC',
  LevelAscNullsFirst = 'level_ASC_NULLS_FIRST',
  LevelAscNullsLast = 'level_ASC_NULLS_LAST',
  LevelDesc = 'level_DESC',
  LevelDescNullsFirst = 'level_DESC_NULLS_FIRST',
  LevelDescNullsLast = 'level_DESC_NULLS_LAST',
  TotalAsc = 'total_ASC',
  TotalAscNullsFirst = 'total_ASC_NULLS_FIRST',
  TotalAscNullsLast = 'total_ASC_NULLS_LAST',
  TotalDesc = 'total_DESC',
  TotalDescNullsFirst = 'total_DESC_NULLS_FIRST',
  TotalDescNullsLast = 'total_DESC_NULLS_LAST',
  TypeAsc = 'type_ASC',
  TypeAscNullsFirst = 'type_ASC_NULLS_FIRST',
  TypeAscNullsLast = 'type_ASC_NULLS_LAST',
  TypeDesc = 'type_DESC',
  TypeDescNullsFirst = 'type_DESC_NULLS_FIRST',
  TypeDescNullsLast = 'type_DESC_NULLS_LAST'
}

export type ItemsCounterWhereInput = {
  AND?: InputMaybe<Array<ItemsCounterWhereInput>>;
  OR?: InputMaybe<Array<ItemsCounterWhereInput>>;
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
  level_eq?: InputMaybe<CounterLevel>;
  level_in?: InputMaybe<Array<CounterLevel>>;
  level_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  level_not_eq?: InputMaybe<CounterLevel>;
  level_not_in?: InputMaybe<Array<CounterLevel>>;
  total_eq?: InputMaybe<Scalars['Int']['input']>;
  total_gt?: InputMaybe<Scalars['Int']['input']>;
  total_gte?: InputMaybe<Scalars['Int']['input']>;
  total_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  total_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  total_lt?: InputMaybe<Scalars['Int']['input']>;
  total_lte?: InputMaybe<Scalars['Int']['input']>;
  total_not_eq?: InputMaybe<Scalars['Int']['input']>;
  total_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  type_eq?: InputMaybe<ItemType>;
  type_in?: InputMaybe<Array<ItemType>>;
  type_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  type_not_eq?: InputMaybe<ItemType>;
  type_not_in?: InputMaybe<Array<ItemType>>;
};

export type ItemsCountersConnection = {
  __typename?: 'ItemsCountersConnection';
  edges: Array<ItemsCounterEdge>;
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
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  LiquidityTokenBalanceAsc = 'liquidityTokenBalance_ASC',
  LiquidityTokenBalanceAscNullsFirst = 'liquidityTokenBalance_ASC_NULLS_FIRST',
  LiquidityTokenBalanceAscNullsLast = 'liquidityTokenBalance_ASC_NULLS_LAST',
  LiquidityTokenBalanceDesc = 'liquidityTokenBalance_DESC',
  LiquidityTokenBalanceDescNullsFirst = 'liquidityTokenBalance_DESC_NULLS_FIRST',
  LiquidityTokenBalanceDescNullsLast = 'liquidityTokenBalance_DESC_NULLS_LAST',
  PairCreatedAtBlockNumberAsc = 'pair_createdAtBlockNumber_ASC',
  PairCreatedAtBlockNumberAscNullsFirst = 'pair_createdAtBlockNumber_ASC_NULLS_FIRST',
  PairCreatedAtBlockNumberAscNullsLast = 'pair_createdAtBlockNumber_ASC_NULLS_LAST',
  PairCreatedAtBlockNumberDesc = 'pair_createdAtBlockNumber_DESC',
  PairCreatedAtBlockNumberDescNullsFirst = 'pair_createdAtBlockNumber_DESC_NULLS_FIRST',
  PairCreatedAtBlockNumberDescNullsLast = 'pair_createdAtBlockNumber_DESC_NULLS_LAST',
  PairCreatedAtTimestampAsc = 'pair_createdAtTimestamp_ASC',
  PairCreatedAtTimestampAscNullsFirst = 'pair_createdAtTimestamp_ASC_NULLS_FIRST',
  PairCreatedAtTimestampAscNullsLast = 'pair_createdAtTimestamp_ASC_NULLS_LAST',
  PairCreatedAtTimestampDesc = 'pair_createdAtTimestamp_DESC',
  PairCreatedAtTimestampDescNullsFirst = 'pair_createdAtTimestamp_DESC_NULLS_FIRST',
  PairCreatedAtTimestampDescNullsLast = 'pair_createdAtTimestamp_DESC_NULLS_LAST',
  PairIdAsc = 'pair_id_ASC',
  PairIdAscNullsFirst = 'pair_id_ASC_NULLS_FIRST',
  PairIdAscNullsLast = 'pair_id_ASC_NULLS_LAST',
  PairIdDesc = 'pair_id_DESC',
  PairIdDescNullsFirst = 'pair_id_DESC_NULLS_FIRST',
  PairIdDescNullsLast = 'pair_id_DESC_NULLS_LAST',
  PairLiquidityProviderCountAsc = 'pair_liquidityProviderCount_ASC',
  PairLiquidityProviderCountAscNullsFirst = 'pair_liquidityProviderCount_ASC_NULLS_FIRST',
  PairLiquidityProviderCountAscNullsLast = 'pair_liquidityProviderCount_ASC_NULLS_LAST',
  PairLiquidityProviderCountDesc = 'pair_liquidityProviderCount_DESC',
  PairLiquidityProviderCountDescNullsFirst = 'pair_liquidityProviderCount_DESC_NULLS_FIRST',
  PairLiquidityProviderCountDescNullsLast = 'pair_liquidityProviderCount_DESC_NULLS_LAST',
  PairReserve0Asc = 'pair_reserve0_ASC',
  PairReserve0AscNullsFirst = 'pair_reserve0_ASC_NULLS_FIRST',
  PairReserve0AscNullsLast = 'pair_reserve0_ASC_NULLS_LAST',
  PairReserve0Desc = 'pair_reserve0_DESC',
  PairReserve0DescNullsFirst = 'pair_reserve0_DESC_NULLS_FIRST',
  PairReserve0DescNullsLast = 'pair_reserve0_DESC_NULLS_LAST',
  PairReserve1Asc = 'pair_reserve1_ASC',
  PairReserve1AscNullsFirst = 'pair_reserve1_ASC_NULLS_FIRST',
  PairReserve1AscNullsLast = 'pair_reserve1_ASC_NULLS_LAST',
  PairReserve1Desc = 'pair_reserve1_DESC',
  PairReserve1DescNullsFirst = 'pair_reserve1_DESC_NULLS_FIRST',
  PairReserve1DescNullsLast = 'pair_reserve1_DESC_NULLS_LAST',
  PairReserveEthAsc = 'pair_reserveETH_ASC',
  PairReserveEthAscNullsFirst = 'pair_reserveETH_ASC_NULLS_FIRST',
  PairReserveEthAscNullsLast = 'pair_reserveETH_ASC_NULLS_LAST',
  PairReserveEthDesc = 'pair_reserveETH_DESC',
  PairReserveEthDescNullsFirst = 'pair_reserveETH_DESC_NULLS_FIRST',
  PairReserveEthDescNullsLast = 'pair_reserveETH_DESC_NULLS_LAST',
  PairReserveUsdAsc = 'pair_reserveUSD_ASC',
  PairReserveUsdAscNullsFirst = 'pair_reserveUSD_ASC_NULLS_FIRST',
  PairReserveUsdAscNullsLast = 'pair_reserveUSD_ASC_NULLS_LAST',
  PairReserveUsdDesc = 'pair_reserveUSD_DESC',
  PairReserveUsdDescNullsFirst = 'pair_reserveUSD_DESC_NULLS_FIRST',
  PairReserveUsdDescNullsLast = 'pair_reserveUSD_DESC_NULLS_LAST',
  PairToken0PriceAsc = 'pair_token0Price_ASC',
  PairToken0PriceAscNullsFirst = 'pair_token0Price_ASC_NULLS_FIRST',
  PairToken0PriceAscNullsLast = 'pair_token0Price_ASC_NULLS_LAST',
  PairToken0PriceDesc = 'pair_token0Price_DESC',
  PairToken0PriceDescNullsFirst = 'pair_token0Price_DESC_NULLS_FIRST',
  PairToken0PriceDescNullsLast = 'pair_token0Price_DESC_NULLS_LAST',
  PairToken1PriceAsc = 'pair_token1Price_ASC',
  PairToken1PriceAscNullsFirst = 'pair_token1Price_ASC_NULLS_FIRST',
  PairToken1PriceAscNullsLast = 'pair_token1Price_ASC_NULLS_LAST',
  PairToken1PriceDesc = 'pair_token1Price_DESC',
  PairToken1PriceDescNullsFirst = 'pair_token1Price_DESC_NULLS_FIRST',
  PairToken1PriceDescNullsLast = 'pair_token1Price_DESC_NULLS_LAST',
  PairTotalSupplyAsc = 'pair_totalSupply_ASC',
  PairTotalSupplyAscNullsFirst = 'pair_totalSupply_ASC_NULLS_FIRST',
  PairTotalSupplyAscNullsLast = 'pair_totalSupply_ASC_NULLS_LAST',
  PairTotalSupplyDesc = 'pair_totalSupply_DESC',
  PairTotalSupplyDescNullsFirst = 'pair_totalSupply_DESC_NULLS_FIRST',
  PairTotalSupplyDescNullsLast = 'pair_totalSupply_DESC_NULLS_LAST',
  PairTrackedReserveEthAsc = 'pair_trackedReserveETH_ASC',
  PairTrackedReserveEthAscNullsFirst = 'pair_trackedReserveETH_ASC_NULLS_FIRST',
  PairTrackedReserveEthAscNullsLast = 'pair_trackedReserveETH_ASC_NULLS_LAST',
  PairTrackedReserveEthDesc = 'pair_trackedReserveETH_DESC',
  PairTrackedReserveEthDescNullsFirst = 'pair_trackedReserveETH_DESC_NULLS_FIRST',
  PairTrackedReserveEthDescNullsLast = 'pair_trackedReserveETH_DESC_NULLS_LAST',
  PairTxCountAsc = 'pair_txCount_ASC',
  PairTxCountAscNullsFirst = 'pair_txCount_ASC_NULLS_FIRST',
  PairTxCountAscNullsLast = 'pair_txCount_ASC_NULLS_LAST',
  PairTxCountDesc = 'pair_txCount_DESC',
  PairTxCountDescNullsFirst = 'pair_txCount_DESC_NULLS_FIRST',
  PairTxCountDescNullsLast = 'pair_txCount_DESC_NULLS_LAST',
  PairUntrackedVolumeUsdAsc = 'pair_untrackedVolumeUSD_ASC',
  PairUntrackedVolumeUsdAscNullsFirst = 'pair_untrackedVolumeUSD_ASC_NULLS_FIRST',
  PairUntrackedVolumeUsdAscNullsLast = 'pair_untrackedVolumeUSD_ASC_NULLS_LAST',
  PairUntrackedVolumeUsdDesc = 'pair_untrackedVolumeUSD_DESC',
  PairUntrackedVolumeUsdDescNullsFirst = 'pair_untrackedVolumeUSD_DESC_NULLS_FIRST',
  PairUntrackedVolumeUsdDescNullsLast = 'pair_untrackedVolumeUSD_DESC_NULLS_LAST',
  PairVolumeToken0Asc = 'pair_volumeToken0_ASC',
  PairVolumeToken0AscNullsFirst = 'pair_volumeToken0_ASC_NULLS_FIRST',
  PairVolumeToken0AscNullsLast = 'pair_volumeToken0_ASC_NULLS_LAST',
  PairVolumeToken0Desc = 'pair_volumeToken0_DESC',
  PairVolumeToken0DescNullsFirst = 'pair_volumeToken0_DESC_NULLS_FIRST',
  PairVolumeToken0DescNullsLast = 'pair_volumeToken0_DESC_NULLS_LAST',
  PairVolumeToken1Asc = 'pair_volumeToken1_ASC',
  PairVolumeToken1AscNullsFirst = 'pair_volumeToken1_ASC_NULLS_FIRST',
  PairVolumeToken1AscNullsLast = 'pair_volumeToken1_ASC_NULLS_LAST',
  PairVolumeToken1Desc = 'pair_volumeToken1_DESC',
  PairVolumeToken1DescNullsFirst = 'pair_volumeToken1_DESC_NULLS_FIRST',
  PairVolumeToken1DescNullsLast = 'pair_volumeToken1_DESC_NULLS_LAST',
  PairVolumeUsdAsc = 'pair_volumeUSD_ASC',
  PairVolumeUsdAscNullsFirst = 'pair_volumeUSD_ASC_NULLS_FIRST',
  PairVolumeUsdAscNullsLast = 'pair_volumeUSD_ASC_NULLS_LAST',
  PairVolumeUsdDesc = 'pair_volumeUSD_DESC',
  PairVolumeUsdDescNullsFirst = 'pair_volumeUSD_DESC_NULLS_FIRST',
  PairVolumeUsdDescNullsLast = 'pair_volumeUSD_DESC_NULLS_LAST',
  UserIdAsc = 'user_id_ASC',
  UserIdAscNullsFirst = 'user_id_ASC_NULLS_FIRST',
  UserIdAscNullsLast = 'user_id_ASC_NULLS_LAST',
  UserIdDesc = 'user_id_DESC',
  UserIdDescNullsFirst = 'user_id_DESC_NULLS_FIRST',
  UserIdDescNullsLast = 'user_id_DESC_NULLS_LAST',
  UserUsdSwappedAsc = 'user_usdSwapped_ASC',
  UserUsdSwappedAscNullsFirst = 'user_usdSwapped_ASC_NULLS_FIRST',
  UserUsdSwappedAscNullsLast = 'user_usdSwapped_ASC_NULLS_LAST',
  UserUsdSwappedDesc = 'user_usdSwapped_DESC',
  UserUsdSwappedDescNullsFirst = 'user_usdSwapped_DESC_NULLS_FIRST',
  UserUsdSwappedDescNullsLast = 'user_usdSwapped_DESC_NULLS_LAST'
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
  BlockAscNullsFirst = 'block_ASC_NULLS_FIRST',
  BlockAscNullsLast = 'block_ASC_NULLS_LAST',
  BlockDesc = 'block_DESC',
  BlockDescNullsFirst = 'block_DESC_NULLS_FIRST',
  BlockDescNullsLast = 'block_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  LiquidityPositionIdAsc = 'liquidityPosition_id_ASC',
  LiquidityPositionIdAscNullsFirst = 'liquidityPosition_id_ASC_NULLS_FIRST',
  LiquidityPositionIdAscNullsLast = 'liquidityPosition_id_ASC_NULLS_LAST',
  LiquidityPositionIdDesc = 'liquidityPosition_id_DESC',
  LiquidityPositionIdDescNullsFirst = 'liquidityPosition_id_DESC_NULLS_FIRST',
  LiquidityPositionIdDescNullsLast = 'liquidityPosition_id_DESC_NULLS_LAST',
  LiquidityPositionLiquidityTokenBalanceAsc = 'liquidityPosition_liquidityTokenBalance_ASC',
  LiquidityPositionLiquidityTokenBalanceAscNullsFirst = 'liquidityPosition_liquidityTokenBalance_ASC_NULLS_FIRST',
  LiquidityPositionLiquidityTokenBalanceAscNullsLast = 'liquidityPosition_liquidityTokenBalance_ASC_NULLS_LAST',
  LiquidityPositionLiquidityTokenBalanceDesc = 'liquidityPosition_liquidityTokenBalance_DESC',
  LiquidityPositionLiquidityTokenBalanceDescNullsFirst = 'liquidityPosition_liquidityTokenBalance_DESC_NULLS_FIRST',
  LiquidityPositionLiquidityTokenBalanceDescNullsLast = 'liquidityPosition_liquidityTokenBalance_DESC_NULLS_LAST',
  LiquidityTokenBalanceAsc = 'liquidityTokenBalance_ASC',
  LiquidityTokenBalanceAscNullsFirst = 'liquidityTokenBalance_ASC_NULLS_FIRST',
  LiquidityTokenBalanceAscNullsLast = 'liquidityTokenBalance_ASC_NULLS_LAST',
  LiquidityTokenBalanceDesc = 'liquidityTokenBalance_DESC',
  LiquidityTokenBalanceDescNullsFirst = 'liquidityTokenBalance_DESC_NULLS_FIRST',
  LiquidityTokenBalanceDescNullsLast = 'liquidityTokenBalance_DESC_NULLS_LAST',
  LiquidityTokenTotalSupplyAsc = 'liquidityTokenTotalSupply_ASC',
  LiquidityTokenTotalSupplyAscNullsFirst = 'liquidityTokenTotalSupply_ASC_NULLS_FIRST',
  LiquidityTokenTotalSupplyAscNullsLast = 'liquidityTokenTotalSupply_ASC_NULLS_LAST',
  LiquidityTokenTotalSupplyDesc = 'liquidityTokenTotalSupply_DESC',
  LiquidityTokenTotalSupplyDescNullsFirst = 'liquidityTokenTotalSupply_DESC_NULLS_FIRST',
  LiquidityTokenTotalSupplyDescNullsLast = 'liquidityTokenTotalSupply_DESC_NULLS_LAST',
  PairCreatedAtBlockNumberAsc = 'pair_createdAtBlockNumber_ASC',
  PairCreatedAtBlockNumberAscNullsFirst = 'pair_createdAtBlockNumber_ASC_NULLS_FIRST',
  PairCreatedAtBlockNumberAscNullsLast = 'pair_createdAtBlockNumber_ASC_NULLS_LAST',
  PairCreatedAtBlockNumberDesc = 'pair_createdAtBlockNumber_DESC',
  PairCreatedAtBlockNumberDescNullsFirst = 'pair_createdAtBlockNumber_DESC_NULLS_FIRST',
  PairCreatedAtBlockNumberDescNullsLast = 'pair_createdAtBlockNumber_DESC_NULLS_LAST',
  PairCreatedAtTimestampAsc = 'pair_createdAtTimestamp_ASC',
  PairCreatedAtTimestampAscNullsFirst = 'pair_createdAtTimestamp_ASC_NULLS_FIRST',
  PairCreatedAtTimestampAscNullsLast = 'pair_createdAtTimestamp_ASC_NULLS_LAST',
  PairCreatedAtTimestampDesc = 'pair_createdAtTimestamp_DESC',
  PairCreatedAtTimestampDescNullsFirst = 'pair_createdAtTimestamp_DESC_NULLS_FIRST',
  PairCreatedAtTimestampDescNullsLast = 'pair_createdAtTimestamp_DESC_NULLS_LAST',
  PairIdAsc = 'pair_id_ASC',
  PairIdAscNullsFirst = 'pair_id_ASC_NULLS_FIRST',
  PairIdAscNullsLast = 'pair_id_ASC_NULLS_LAST',
  PairIdDesc = 'pair_id_DESC',
  PairIdDescNullsFirst = 'pair_id_DESC_NULLS_FIRST',
  PairIdDescNullsLast = 'pair_id_DESC_NULLS_LAST',
  PairLiquidityProviderCountAsc = 'pair_liquidityProviderCount_ASC',
  PairLiquidityProviderCountAscNullsFirst = 'pair_liquidityProviderCount_ASC_NULLS_FIRST',
  PairLiquidityProviderCountAscNullsLast = 'pair_liquidityProviderCount_ASC_NULLS_LAST',
  PairLiquidityProviderCountDesc = 'pair_liquidityProviderCount_DESC',
  PairLiquidityProviderCountDescNullsFirst = 'pair_liquidityProviderCount_DESC_NULLS_FIRST',
  PairLiquidityProviderCountDescNullsLast = 'pair_liquidityProviderCount_DESC_NULLS_LAST',
  PairReserve0Asc = 'pair_reserve0_ASC',
  PairReserve0AscNullsFirst = 'pair_reserve0_ASC_NULLS_FIRST',
  PairReserve0AscNullsLast = 'pair_reserve0_ASC_NULLS_LAST',
  PairReserve0Desc = 'pair_reserve0_DESC',
  PairReserve0DescNullsFirst = 'pair_reserve0_DESC_NULLS_FIRST',
  PairReserve0DescNullsLast = 'pair_reserve0_DESC_NULLS_LAST',
  PairReserve1Asc = 'pair_reserve1_ASC',
  PairReserve1AscNullsFirst = 'pair_reserve1_ASC_NULLS_FIRST',
  PairReserve1AscNullsLast = 'pair_reserve1_ASC_NULLS_LAST',
  PairReserve1Desc = 'pair_reserve1_DESC',
  PairReserve1DescNullsFirst = 'pair_reserve1_DESC_NULLS_FIRST',
  PairReserve1DescNullsLast = 'pair_reserve1_DESC_NULLS_LAST',
  PairReserveEthAsc = 'pair_reserveETH_ASC',
  PairReserveEthAscNullsFirst = 'pair_reserveETH_ASC_NULLS_FIRST',
  PairReserveEthAscNullsLast = 'pair_reserveETH_ASC_NULLS_LAST',
  PairReserveEthDesc = 'pair_reserveETH_DESC',
  PairReserveEthDescNullsFirst = 'pair_reserveETH_DESC_NULLS_FIRST',
  PairReserveEthDescNullsLast = 'pair_reserveETH_DESC_NULLS_LAST',
  PairReserveUsdAsc = 'pair_reserveUSD_ASC',
  PairReserveUsdAscNullsFirst = 'pair_reserveUSD_ASC_NULLS_FIRST',
  PairReserveUsdAscNullsLast = 'pair_reserveUSD_ASC_NULLS_LAST',
  PairReserveUsdDesc = 'pair_reserveUSD_DESC',
  PairReserveUsdDescNullsFirst = 'pair_reserveUSD_DESC_NULLS_FIRST',
  PairReserveUsdDescNullsLast = 'pair_reserveUSD_DESC_NULLS_LAST',
  PairToken0PriceAsc = 'pair_token0Price_ASC',
  PairToken0PriceAscNullsFirst = 'pair_token0Price_ASC_NULLS_FIRST',
  PairToken0PriceAscNullsLast = 'pair_token0Price_ASC_NULLS_LAST',
  PairToken0PriceDesc = 'pair_token0Price_DESC',
  PairToken0PriceDescNullsFirst = 'pair_token0Price_DESC_NULLS_FIRST',
  PairToken0PriceDescNullsLast = 'pair_token0Price_DESC_NULLS_LAST',
  PairToken1PriceAsc = 'pair_token1Price_ASC',
  PairToken1PriceAscNullsFirst = 'pair_token1Price_ASC_NULLS_FIRST',
  PairToken1PriceAscNullsLast = 'pair_token1Price_ASC_NULLS_LAST',
  PairToken1PriceDesc = 'pair_token1Price_DESC',
  PairToken1PriceDescNullsFirst = 'pair_token1Price_DESC_NULLS_FIRST',
  PairToken1PriceDescNullsLast = 'pair_token1Price_DESC_NULLS_LAST',
  PairTotalSupplyAsc = 'pair_totalSupply_ASC',
  PairTotalSupplyAscNullsFirst = 'pair_totalSupply_ASC_NULLS_FIRST',
  PairTotalSupplyAscNullsLast = 'pair_totalSupply_ASC_NULLS_LAST',
  PairTotalSupplyDesc = 'pair_totalSupply_DESC',
  PairTotalSupplyDescNullsFirst = 'pair_totalSupply_DESC_NULLS_FIRST',
  PairTotalSupplyDescNullsLast = 'pair_totalSupply_DESC_NULLS_LAST',
  PairTrackedReserveEthAsc = 'pair_trackedReserveETH_ASC',
  PairTrackedReserveEthAscNullsFirst = 'pair_trackedReserveETH_ASC_NULLS_FIRST',
  PairTrackedReserveEthAscNullsLast = 'pair_trackedReserveETH_ASC_NULLS_LAST',
  PairTrackedReserveEthDesc = 'pair_trackedReserveETH_DESC',
  PairTrackedReserveEthDescNullsFirst = 'pair_trackedReserveETH_DESC_NULLS_FIRST',
  PairTrackedReserveEthDescNullsLast = 'pair_trackedReserveETH_DESC_NULLS_LAST',
  PairTxCountAsc = 'pair_txCount_ASC',
  PairTxCountAscNullsFirst = 'pair_txCount_ASC_NULLS_FIRST',
  PairTxCountAscNullsLast = 'pair_txCount_ASC_NULLS_LAST',
  PairTxCountDesc = 'pair_txCount_DESC',
  PairTxCountDescNullsFirst = 'pair_txCount_DESC_NULLS_FIRST',
  PairTxCountDescNullsLast = 'pair_txCount_DESC_NULLS_LAST',
  PairUntrackedVolumeUsdAsc = 'pair_untrackedVolumeUSD_ASC',
  PairUntrackedVolumeUsdAscNullsFirst = 'pair_untrackedVolumeUSD_ASC_NULLS_FIRST',
  PairUntrackedVolumeUsdAscNullsLast = 'pair_untrackedVolumeUSD_ASC_NULLS_LAST',
  PairUntrackedVolumeUsdDesc = 'pair_untrackedVolumeUSD_DESC',
  PairUntrackedVolumeUsdDescNullsFirst = 'pair_untrackedVolumeUSD_DESC_NULLS_FIRST',
  PairUntrackedVolumeUsdDescNullsLast = 'pair_untrackedVolumeUSD_DESC_NULLS_LAST',
  PairVolumeToken0Asc = 'pair_volumeToken0_ASC',
  PairVolumeToken0AscNullsFirst = 'pair_volumeToken0_ASC_NULLS_FIRST',
  PairVolumeToken0AscNullsLast = 'pair_volumeToken0_ASC_NULLS_LAST',
  PairVolumeToken0Desc = 'pair_volumeToken0_DESC',
  PairVolumeToken0DescNullsFirst = 'pair_volumeToken0_DESC_NULLS_FIRST',
  PairVolumeToken0DescNullsLast = 'pair_volumeToken0_DESC_NULLS_LAST',
  PairVolumeToken1Asc = 'pair_volumeToken1_ASC',
  PairVolumeToken1AscNullsFirst = 'pair_volumeToken1_ASC_NULLS_FIRST',
  PairVolumeToken1AscNullsLast = 'pair_volumeToken1_ASC_NULLS_LAST',
  PairVolumeToken1Desc = 'pair_volumeToken1_DESC',
  PairVolumeToken1DescNullsFirst = 'pair_volumeToken1_DESC_NULLS_FIRST',
  PairVolumeToken1DescNullsLast = 'pair_volumeToken1_DESC_NULLS_LAST',
  PairVolumeUsdAsc = 'pair_volumeUSD_ASC',
  PairVolumeUsdAscNullsFirst = 'pair_volumeUSD_ASC_NULLS_FIRST',
  PairVolumeUsdAscNullsLast = 'pair_volumeUSD_ASC_NULLS_LAST',
  PairVolumeUsdDesc = 'pair_volumeUSD_DESC',
  PairVolumeUsdDescNullsFirst = 'pair_volumeUSD_DESC_NULLS_FIRST',
  PairVolumeUsdDescNullsLast = 'pair_volumeUSD_DESC_NULLS_LAST',
  Reserve0Asc = 'reserve0_ASC',
  Reserve0AscNullsFirst = 'reserve0_ASC_NULLS_FIRST',
  Reserve0AscNullsLast = 'reserve0_ASC_NULLS_LAST',
  Reserve0Desc = 'reserve0_DESC',
  Reserve0DescNullsFirst = 'reserve0_DESC_NULLS_FIRST',
  Reserve0DescNullsLast = 'reserve0_DESC_NULLS_LAST',
  Reserve1Asc = 'reserve1_ASC',
  Reserve1AscNullsFirst = 'reserve1_ASC_NULLS_FIRST',
  Reserve1AscNullsLast = 'reserve1_ASC_NULLS_LAST',
  Reserve1Desc = 'reserve1_DESC',
  Reserve1DescNullsFirst = 'reserve1_DESC_NULLS_FIRST',
  Reserve1DescNullsLast = 'reserve1_DESC_NULLS_LAST',
  ReserveUsdAsc = 'reserveUSD_ASC',
  ReserveUsdAscNullsFirst = 'reserveUSD_ASC_NULLS_FIRST',
  ReserveUsdAscNullsLast = 'reserveUSD_ASC_NULLS_LAST',
  ReserveUsdDesc = 'reserveUSD_DESC',
  ReserveUsdDescNullsFirst = 'reserveUSD_DESC_NULLS_FIRST',
  ReserveUsdDescNullsLast = 'reserveUSD_DESC_NULLS_LAST',
  TimestampAsc = 'timestamp_ASC',
  TimestampAscNullsFirst = 'timestamp_ASC_NULLS_FIRST',
  TimestampAscNullsLast = 'timestamp_ASC_NULLS_LAST',
  TimestampDesc = 'timestamp_DESC',
  TimestampDescNullsFirst = 'timestamp_DESC_NULLS_FIRST',
  TimestampDescNullsLast = 'timestamp_DESC_NULLS_LAST',
  Token0PriceUsdAsc = 'token0PriceUSD_ASC',
  Token0PriceUsdAscNullsFirst = 'token0PriceUSD_ASC_NULLS_FIRST',
  Token0PriceUsdAscNullsLast = 'token0PriceUSD_ASC_NULLS_LAST',
  Token0PriceUsdDesc = 'token0PriceUSD_DESC',
  Token0PriceUsdDescNullsFirst = 'token0PriceUSD_DESC_NULLS_FIRST',
  Token0PriceUsdDescNullsLast = 'token0PriceUSD_DESC_NULLS_LAST',
  Token1PriceUsdAsc = 'token1PriceUSD_ASC',
  Token1PriceUsdAscNullsFirst = 'token1PriceUSD_ASC_NULLS_FIRST',
  Token1PriceUsdAscNullsLast = 'token1PriceUSD_ASC_NULLS_LAST',
  Token1PriceUsdDesc = 'token1PriceUSD_DESC',
  Token1PriceUsdDescNullsFirst = 'token1PriceUSD_DESC_NULLS_FIRST',
  Token1PriceUsdDescNullsLast = 'token1PriceUSD_DESC_NULLS_LAST',
  UserIdAsc = 'user_id_ASC',
  UserIdAscNullsFirst = 'user_id_ASC_NULLS_FIRST',
  UserIdAscNullsLast = 'user_id_ASC_NULLS_LAST',
  UserIdDesc = 'user_id_DESC',
  UserIdDescNullsFirst = 'user_id_DESC_NULLS_FIRST',
  UserIdDescNullsLast = 'user_id_DESC_NULLS_LAST',
  UserUsdSwappedAsc = 'user_usdSwapped_ASC',
  UserUsdSwappedAscNullsFirst = 'user_usdSwapped_ASC_NULLS_FIRST',
  UserUsdSwappedAscNullsLast = 'user_usdSwapped_ASC_NULLS_LAST',
  UserUsdSwappedDesc = 'user_usdSwapped_DESC',
  UserUsdSwappedDescNullsFirst = 'user_usdSwapped_DESC_NULLS_FIRST',
  UserUsdSwappedDescNullsLast = 'user_usdSwapped_DESC_NULLS_LAST'
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
  Amount0AscNullsFirst = 'amount0_ASC_NULLS_FIRST',
  Amount0AscNullsLast = 'amount0_ASC_NULLS_LAST',
  Amount0Desc = 'amount0_DESC',
  Amount0DescNullsFirst = 'amount0_DESC_NULLS_FIRST',
  Amount0DescNullsLast = 'amount0_DESC_NULLS_LAST',
  Amount1Asc = 'amount1_ASC',
  Amount1AscNullsFirst = 'amount1_ASC_NULLS_FIRST',
  Amount1AscNullsLast = 'amount1_ASC_NULLS_LAST',
  Amount1Desc = 'amount1_DESC',
  Amount1DescNullsFirst = 'amount1_DESC_NULLS_FIRST',
  Amount1DescNullsLast = 'amount1_DESC_NULLS_LAST',
  AmountUsdAsc = 'amountUSD_ASC',
  AmountUsdAscNullsFirst = 'amountUSD_ASC_NULLS_FIRST',
  AmountUsdAscNullsLast = 'amountUSD_ASC_NULLS_LAST',
  AmountUsdDesc = 'amountUSD_DESC',
  AmountUsdDescNullsFirst = 'amountUSD_DESC_NULLS_FIRST',
  AmountUsdDescNullsLast = 'amountUSD_DESC_NULLS_LAST',
  FeeLiquidityAsc = 'feeLiquidity_ASC',
  FeeLiquidityAscNullsFirst = 'feeLiquidity_ASC_NULLS_FIRST',
  FeeLiquidityAscNullsLast = 'feeLiquidity_ASC_NULLS_LAST',
  FeeLiquidityDesc = 'feeLiquidity_DESC',
  FeeLiquidityDescNullsFirst = 'feeLiquidity_DESC_NULLS_FIRST',
  FeeLiquidityDescNullsLast = 'feeLiquidity_DESC_NULLS_LAST',
  FeeToAsc = 'feeTo_ASC',
  FeeToAscNullsFirst = 'feeTo_ASC_NULLS_FIRST',
  FeeToAscNullsLast = 'feeTo_ASC_NULLS_LAST',
  FeeToDesc = 'feeTo_DESC',
  FeeToDescNullsFirst = 'feeTo_DESC_NULLS_FIRST',
  FeeToDescNullsLast = 'feeTo_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  LiquidityAsc = 'liquidity_ASC',
  LiquidityAscNullsFirst = 'liquidity_ASC_NULLS_FIRST',
  LiquidityAscNullsLast = 'liquidity_ASC_NULLS_LAST',
  LiquidityDesc = 'liquidity_DESC',
  LiquidityDescNullsFirst = 'liquidity_DESC_NULLS_FIRST',
  LiquidityDescNullsLast = 'liquidity_DESC_NULLS_LAST',
  LogIndexAsc = 'logIndex_ASC',
  LogIndexAscNullsFirst = 'logIndex_ASC_NULLS_FIRST',
  LogIndexAscNullsLast = 'logIndex_ASC_NULLS_LAST',
  LogIndexDesc = 'logIndex_DESC',
  LogIndexDescNullsFirst = 'logIndex_DESC_NULLS_FIRST',
  LogIndexDescNullsLast = 'logIndex_DESC_NULLS_LAST',
  PairCreatedAtBlockNumberAsc = 'pair_createdAtBlockNumber_ASC',
  PairCreatedAtBlockNumberAscNullsFirst = 'pair_createdAtBlockNumber_ASC_NULLS_FIRST',
  PairCreatedAtBlockNumberAscNullsLast = 'pair_createdAtBlockNumber_ASC_NULLS_LAST',
  PairCreatedAtBlockNumberDesc = 'pair_createdAtBlockNumber_DESC',
  PairCreatedAtBlockNumberDescNullsFirst = 'pair_createdAtBlockNumber_DESC_NULLS_FIRST',
  PairCreatedAtBlockNumberDescNullsLast = 'pair_createdAtBlockNumber_DESC_NULLS_LAST',
  PairCreatedAtTimestampAsc = 'pair_createdAtTimestamp_ASC',
  PairCreatedAtTimestampAscNullsFirst = 'pair_createdAtTimestamp_ASC_NULLS_FIRST',
  PairCreatedAtTimestampAscNullsLast = 'pair_createdAtTimestamp_ASC_NULLS_LAST',
  PairCreatedAtTimestampDesc = 'pair_createdAtTimestamp_DESC',
  PairCreatedAtTimestampDescNullsFirst = 'pair_createdAtTimestamp_DESC_NULLS_FIRST',
  PairCreatedAtTimestampDescNullsLast = 'pair_createdAtTimestamp_DESC_NULLS_LAST',
  PairIdAsc = 'pair_id_ASC',
  PairIdAscNullsFirst = 'pair_id_ASC_NULLS_FIRST',
  PairIdAscNullsLast = 'pair_id_ASC_NULLS_LAST',
  PairIdDesc = 'pair_id_DESC',
  PairIdDescNullsFirst = 'pair_id_DESC_NULLS_FIRST',
  PairIdDescNullsLast = 'pair_id_DESC_NULLS_LAST',
  PairLiquidityProviderCountAsc = 'pair_liquidityProviderCount_ASC',
  PairLiquidityProviderCountAscNullsFirst = 'pair_liquidityProviderCount_ASC_NULLS_FIRST',
  PairLiquidityProviderCountAscNullsLast = 'pair_liquidityProviderCount_ASC_NULLS_LAST',
  PairLiquidityProviderCountDesc = 'pair_liquidityProviderCount_DESC',
  PairLiquidityProviderCountDescNullsFirst = 'pair_liquidityProviderCount_DESC_NULLS_FIRST',
  PairLiquidityProviderCountDescNullsLast = 'pair_liquidityProviderCount_DESC_NULLS_LAST',
  PairReserve0Asc = 'pair_reserve0_ASC',
  PairReserve0AscNullsFirst = 'pair_reserve0_ASC_NULLS_FIRST',
  PairReserve0AscNullsLast = 'pair_reserve0_ASC_NULLS_LAST',
  PairReserve0Desc = 'pair_reserve0_DESC',
  PairReserve0DescNullsFirst = 'pair_reserve0_DESC_NULLS_FIRST',
  PairReserve0DescNullsLast = 'pair_reserve0_DESC_NULLS_LAST',
  PairReserve1Asc = 'pair_reserve1_ASC',
  PairReserve1AscNullsFirst = 'pair_reserve1_ASC_NULLS_FIRST',
  PairReserve1AscNullsLast = 'pair_reserve1_ASC_NULLS_LAST',
  PairReserve1Desc = 'pair_reserve1_DESC',
  PairReserve1DescNullsFirst = 'pair_reserve1_DESC_NULLS_FIRST',
  PairReserve1DescNullsLast = 'pair_reserve1_DESC_NULLS_LAST',
  PairReserveEthAsc = 'pair_reserveETH_ASC',
  PairReserveEthAscNullsFirst = 'pair_reserveETH_ASC_NULLS_FIRST',
  PairReserveEthAscNullsLast = 'pair_reserveETH_ASC_NULLS_LAST',
  PairReserveEthDesc = 'pair_reserveETH_DESC',
  PairReserveEthDescNullsFirst = 'pair_reserveETH_DESC_NULLS_FIRST',
  PairReserveEthDescNullsLast = 'pair_reserveETH_DESC_NULLS_LAST',
  PairReserveUsdAsc = 'pair_reserveUSD_ASC',
  PairReserveUsdAscNullsFirst = 'pair_reserveUSD_ASC_NULLS_FIRST',
  PairReserveUsdAscNullsLast = 'pair_reserveUSD_ASC_NULLS_LAST',
  PairReserveUsdDesc = 'pair_reserveUSD_DESC',
  PairReserveUsdDescNullsFirst = 'pair_reserveUSD_DESC_NULLS_FIRST',
  PairReserveUsdDescNullsLast = 'pair_reserveUSD_DESC_NULLS_LAST',
  PairToken0PriceAsc = 'pair_token0Price_ASC',
  PairToken0PriceAscNullsFirst = 'pair_token0Price_ASC_NULLS_FIRST',
  PairToken0PriceAscNullsLast = 'pair_token0Price_ASC_NULLS_LAST',
  PairToken0PriceDesc = 'pair_token0Price_DESC',
  PairToken0PriceDescNullsFirst = 'pair_token0Price_DESC_NULLS_FIRST',
  PairToken0PriceDescNullsLast = 'pair_token0Price_DESC_NULLS_LAST',
  PairToken1PriceAsc = 'pair_token1Price_ASC',
  PairToken1PriceAscNullsFirst = 'pair_token1Price_ASC_NULLS_FIRST',
  PairToken1PriceAscNullsLast = 'pair_token1Price_ASC_NULLS_LAST',
  PairToken1PriceDesc = 'pair_token1Price_DESC',
  PairToken1PriceDescNullsFirst = 'pair_token1Price_DESC_NULLS_FIRST',
  PairToken1PriceDescNullsLast = 'pair_token1Price_DESC_NULLS_LAST',
  PairTotalSupplyAsc = 'pair_totalSupply_ASC',
  PairTotalSupplyAscNullsFirst = 'pair_totalSupply_ASC_NULLS_FIRST',
  PairTotalSupplyAscNullsLast = 'pair_totalSupply_ASC_NULLS_LAST',
  PairTotalSupplyDesc = 'pair_totalSupply_DESC',
  PairTotalSupplyDescNullsFirst = 'pair_totalSupply_DESC_NULLS_FIRST',
  PairTotalSupplyDescNullsLast = 'pair_totalSupply_DESC_NULLS_LAST',
  PairTrackedReserveEthAsc = 'pair_trackedReserveETH_ASC',
  PairTrackedReserveEthAscNullsFirst = 'pair_trackedReserveETH_ASC_NULLS_FIRST',
  PairTrackedReserveEthAscNullsLast = 'pair_trackedReserveETH_ASC_NULLS_LAST',
  PairTrackedReserveEthDesc = 'pair_trackedReserveETH_DESC',
  PairTrackedReserveEthDescNullsFirst = 'pair_trackedReserveETH_DESC_NULLS_FIRST',
  PairTrackedReserveEthDescNullsLast = 'pair_trackedReserveETH_DESC_NULLS_LAST',
  PairTxCountAsc = 'pair_txCount_ASC',
  PairTxCountAscNullsFirst = 'pair_txCount_ASC_NULLS_FIRST',
  PairTxCountAscNullsLast = 'pair_txCount_ASC_NULLS_LAST',
  PairTxCountDesc = 'pair_txCount_DESC',
  PairTxCountDescNullsFirst = 'pair_txCount_DESC_NULLS_FIRST',
  PairTxCountDescNullsLast = 'pair_txCount_DESC_NULLS_LAST',
  PairUntrackedVolumeUsdAsc = 'pair_untrackedVolumeUSD_ASC',
  PairUntrackedVolumeUsdAscNullsFirst = 'pair_untrackedVolumeUSD_ASC_NULLS_FIRST',
  PairUntrackedVolumeUsdAscNullsLast = 'pair_untrackedVolumeUSD_ASC_NULLS_LAST',
  PairUntrackedVolumeUsdDesc = 'pair_untrackedVolumeUSD_DESC',
  PairUntrackedVolumeUsdDescNullsFirst = 'pair_untrackedVolumeUSD_DESC_NULLS_FIRST',
  PairUntrackedVolumeUsdDescNullsLast = 'pair_untrackedVolumeUSD_DESC_NULLS_LAST',
  PairVolumeToken0Asc = 'pair_volumeToken0_ASC',
  PairVolumeToken0AscNullsFirst = 'pair_volumeToken0_ASC_NULLS_FIRST',
  PairVolumeToken0AscNullsLast = 'pair_volumeToken0_ASC_NULLS_LAST',
  PairVolumeToken0Desc = 'pair_volumeToken0_DESC',
  PairVolumeToken0DescNullsFirst = 'pair_volumeToken0_DESC_NULLS_FIRST',
  PairVolumeToken0DescNullsLast = 'pair_volumeToken0_DESC_NULLS_LAST',
  PairVolumeToken1Asc = 'pair_volumeToken1_ASC',
  PairVolumeToken1AscNullsFirst = 'pair_volumeToken1_ASC_NULLS_FIRST',
  PairVolumeToken1AscNullsLast = 'pair_volumeToken1_ASC_NULLS_LAST',
  PairVolumeToken1Desc = 'pair_volumeToken1_DESC',
  PairVolumeToken1DescNullsFirst = 'pair_volumeToken1_DESC_NULLS_FIRST',
  PairVolumeToken1DescNullsLast = 'pair_volumeToken1_DESC_NULLS_LAST',
  PairVolumeUsdAsc = 'pair_volumeUSD_ASC',
  PairVolumeUsdAscNullsFirst = 'pair_volumeUSD_ASC_NULLS_FIRST',
  PairVolumeUsdAscNullsLast = 'pair_volumeUSD_ASC_NULLS_LAST',
  PairVolumeUsdDesc = 'pair_volumeUSD_DESC',
  PairVolumeUsdDescNullsFirst = 'pair_volumeUSD_DESC_NULLS_FIRST',
  PairVolumeUsdDescNullsLast = 'pair_volumeUSD_DESC_NULLS_LAST',
  SenderAsc = 'sender_ASC',
  SenderAscNullsFirst = 'sender_ASC_NULLS_FIRST',
  SenderAscNullsLast = 'sender_ASC_NULLS_LAST',
  SenderDesc = 'sender_DESC',
  SenderDescNullsFirst = 'sender_DESC_NULLS_FIRST',
  SenderDescNullsLast = 'sender_DESC_NULLS_LAST',
  TimestampAsc = 'timestamp_ASC',
  TimestampAscNullsFirst = 'timestamp_ASC_NULLS_FIRST',
  TimestampAscNullsLast = 'timestamp_ASC_NULLS_LAST',
  TimestampDesc = 'timestamp_DESC',
  TimestampDescNullsFirst = 'timestamp_DESC_NULLS_FIRST',
  TimestampDescNullsLast = 'timestamp_DESC_NULLS_LAST',
  ToAsc = 'to_ASC',
  ToAscNullsFirst = 'to_ASC_NULLS_FIRST',
  ToAscNullsLast = 'to_ASC_NULLS_LAST',
  ToDesc = 'to_DESC',
  ToDescNullsFirst = 'to_DESC_NULLS_FIRST',
  ToDescNullsLast = 'to_DESC_NULLS_LAST',
  TransactionBlockNumberAsc = 'transaction_blockNumber_ASC',
  TransactionBlockNumberAscNullsFirst = 'transaction_blockNumber_ASC_NULLS_FIRST',
  TransactionBlockNumberAscNullsLast = 'transaction_blockNumber_ASC_NULLS_LAST',
  TransactionBlockNumberDesc = 'transaction_blockNumber_DESC',
  TransactionBlockNumberDescNullsFirst = 'transaction_blockNumber_DESC_NULLS_FIRST',
  TransactionBlockNumberDescNullsLast = 'transaction_blockNumber_DESC_NULLS_LAST',
  TransactionIdAsc = 'transaction_id_ASC',
  TransactionIdAscNullsFirst = 'transaction_id_ASC_NULLS_FIRST',
  TransactionIdAscNullsLast = 'transaction_id_ASC_NULLS_LAST',
  TransactionIdDesc = 'transaction_id_DESC',
  TransactionIdDescNullsFirst = 'transaction_id_DESC_NULLS_FIRST',
  TransactionIdDescNullsLast = 'transaction_id_DESC_NULLS_LAST',
  TransactionTimestampAsc = 'transaction_timestamp_ASC',
  TransactionTimestampAscNullsFirst = 'transaction_timestamp_ASC_NULLS_FIRST',
  TransactionTimestampAscNullsLast = 'transaction_timestamp_ASC_NULLS_LAST',
  TransactionTimestampDesc = 'transaction_timestamp_DESC',
  TransactionTimestampDescNullsFirst = 'transaction_timestamp_DESC_NULLS_FIRST',
  TransactionTimestampDescNullsLast = 'transaction_timestamp_DESC_NULLS_LAST'
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

export type NablaBackstopLiquidityDeposit = {
  __typename?: 'NablaBackstopLiquidityDeposit';
  amountPoolTokensDeposited: Scalars['BigInt']['output'];
  backstopPool: BackstopPool;
  id: Scalars['String']['output'];
  poolSharesMinted: Scalars['BigInt']['output'];
  sender: Scalars['String']['output'];
  timestamp: Scalars['DateTime']['output'];
};

export type NablaBackstopLiquidityDepositEdge = {
  __typename?: 'NablaBackstopLiquidityDepositEdge';
  cursor: Scalars['String']['output'];
  node: NablaBackstopLiquidityDeposit;
};

export enum NablaBackstopLiquidityDepositOrderByInput {
  AmountPoolTokensDepositedAsc = 'amountPoolTokensDeposited_ASC',
  AmountPoolTokensDepositedAscNullsFirst = 'amountPoolTokensDeposited_ASC_NULLS_FIRST',
  AmountPoolTokensDepositedAscNullsLast = 'amountPoolTokensDeposited_ASC_NULLS_LAST',
  AmountPoolTokensDepositedDesc = 'amountPoolTokensDeposited_DESC',
  AmountPoolTokensDepositedDescNullsFirst = 'amountPoolTokensDeposited_DESC_NULLS_FIRST',
  AmountPoolTokensDepositedDescNullsLast = 'amountPoolTokensDeposited_DESC_NULLS_LAST',
  BackstopPoolAprAsc = 'backstopPool_apr_ASC',
  BackstopPoolAprAscNullsFirst = 'backstopPool_apr_ASC_NULLS_FIRST',
  BackstopPoolAprAscNullsLast = 'backstopPool_apr_ASC_NULLS_LAST',
  BackstopPoolAprDesc = 'backstopPool_apr_DESC',
  BackstopPoolAprDescNullsFirst = 'backstopPool_apr_DESC_NULLS_FIRST',
  BackstopPoolAprDescNullsLast = 'backstopPool_apr_DESC_NULLS_LAST',
  BackstopPoolIdAsc = 'backstopPool_id_ASC',
  BackstopPoolIdAscNullsFirst = 'backstopPool_id_ASC_NULLS_FIRST',
  BackstopPoolIdAscNullsLast = 'backstopPool_id_ASC_NULLS_LAST',
  BackstopPoolIdDesc = 'backstopPool_id_DESC',
  BackstopPoolIdDescNullsFirst = 'backstopPool_id_DESC_NULLS_FIRST',
  BackstopPoolIdDescNullsLast = 'backstopPool_id_DESC_NULLS_LAST',
  BackstopPoolLpTokenDecimalsAsc = 'backstopPool_lpTokenDecimals_ASC',
  BackstopPoolLpTokenDecimalsAscNullsFirst = 'backstopPool_lpTokenDecimals_ASC_NULLS_FIRST',
  BackstopPoolLpTokenDecimalsAscNullsLast = 'backstopPool_lpTokenDecimals_ASC_NULLS_LAST',
  BackstopPoolLpTokenDecimalsDesc = 'backstopPool_lpTokenDecimals_DESC',
  BackstopPoolLpTokenDecimalsDescNullsFirst = 'backstopPool_lpTokenDecimals_DESC_NULLS_FIRST',
  BackstopPoolLpTokenDecimalsDescNullsLast = 'backstopPool_lpTokenDecimals_DESC_NULLS_LAST',
  BackstopPoolNameAsc = 'backstopPool_name_ASC',
  BackstopPoolNameAscNullsFirst = 'backstopPool_name_ASC_NULLS_FIRST',
  BackstopPoolNameAscNullsLast = 'backstopPool_name_ASC_NULLS_LAST',
  BackstopPoolNameDesc = 'backstopPool_name_DESC',
  BackstopPoolNameDescNullsFirst = 'backstopPool_name_DESC_NULLS_FIRST',
  BackstopPoolNameDescNullsLast = 'backstopPool_name_DESC_NULLS_LAST',
  BackstopPoolPausedAsc = 'backstopPool_paused_ASC',
  BackstopPoolPausedAscNullsFirst = 'backstopPool_paused_ASC_NULLS_FIRST',
  BackstopPoolPausedAscNullsLast = 'backstopPool_paused_ASC_NULLS_LAST',
  BackstopPoolPausedDesc = 'backstopPool_paused_DESC',
  BackstopPoolPausedDescNullsFirst = 'backstopPool_paused_DESC_NULLS_FIRST',
  BackstopPoolPausedDescNullsLast = 'backstopPool_paused_DESC_NULLS_LAST',
  BackstopPoolReservesAsc = 'backstopPool_reserves_ASC',
  BackstopPoolReservesAscNullsFirst = 'backstopPool_reserves_ASC_NULLS_FIRST',
  BackstopPoolReservesAscNullsLast = 'backstopPool_reserves_ASC_NULLS_LAST',
  BackstopPoolReservesDesc = 'backstopPool_reserves_DESC',
  BackstopPoolReservesDescNullsFirst = 'backstopPool_reserves_DESC_NULLS_FIRST',
  BackstopPoolReservesDescNullsLast = 'backstopPool_reserves_DESC_NULLS_LAST',
  BackstopPoolSymbolAsc = 'backstopPool_symbol_ASC',
  BackstopPoolSymbolAscNullsFirst = 'backstopPool_symbol_ASC_NULLS_FIRST',
  BackstopPoolSymbolAscNullsLast = 'backstopPool_symbol_ASC_NULLS_LAST',
  BackstopPoolSymbolDesc = 'backstopPool_symbol_DESC',
  BackstopPoolSymbolDescNullsFirst = 'backstopPool_symbol_DESC_NULLS_FIRST',
  BackstopPoolSymbolDescNullsLast = 'backstopPool_symbol_DESC_NULLS_LAST',
  BackstopPoolTotalSupplyAsc = 'backstopPool_totalSupply_ASC',
  BackstopPoolTotalSupplyAscNullsFirst = 'backstopPool_totalSupply_ASC_NULLS_FIRST',
  BackstopPoolTotalSupplyAscNullsLast = 'backstopPool_totalSupply_ASC_NULLS_LAST',
  BackstopPoolTotalSupplyDesc = 'backstopPool_totalSupply_DESC',
  BackstopPoolTotalSupplyDescNullsFirst = 'backstopPool_totalSupply_DESC_NULLS_FIRST',
  BackstopPoolTotalSupplyDescNullsLast = 'backstopPool_totalSupply_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  PoolSharesMintedAsc = 'poolSharesMinted_ASC',
  PoolSharesMintedAscNullsFirst = 'poolSharesMinted_ASC_NULLS_FIRST',
  PoolSharesMintedAscNullsLast = 'poolSharesMinted_ASC_NULLS_LAST',
  PoolSharesMintedDesc = 'poolSharesMinted_DESC',
  PoolSharesMintedDescNullsFirst = 'poolSharesMinted_DESC_NULLS_FIRST',
  PoolSharesMintedDescNullsLast = 'poolSharesMinted_DESC_NULLS_LAST',
  SenderAsc = 'sender_ASC',
  SenderAscNullsFirst = 'sender_ASC_NULLS_FIRST',
  SenderAscNullsLast = 'sender_ASC_NULLS_LAST',
  SenderDesc = 'sender_DESC',
  SenderDescNullsFirst = 'sender_DESC_NULLS_FIRST',
  SenderDescNullsLast = 'sender_DESC_NULLS_LAST',
  TimestampAsc = 'timestamp_ASC',
  TimestampAscNullsFirst = 'timestamp_ASC_NULLS_FIRST',
  TimestampAscNullsLast = 'timestamp_ASC_NULLS_LAST',
  TimestampDesc = 'timestamp_DESC',
  TimestampDescNullsFirst = 'timestamp_DESC_NULLS_FIRST',
  TimestampDescNullsLast = 'timestamp_DESC_NULLS_LAST'
}

export type NablaBackstopLiquidityDepositWhereInput = {
  AND?: InputMaybe<Array<NablaBackstopLiquidityDepositWhereInput>>;
  OR?: InputMaybe<Array<NablaBackstopLiquidityDepositWhereInput>>;
  amountPoolTokensDeposited_eq?: InputMaybe<Scalars['BigInt']['input']>;
  amountPoolTokensDeposited_gt?: InputMaybe<Scalars['BigInt']['input']>;
  amountPoolTokensDeposited_gte?: InputMaybe<Scalars['BigInt']['input']>;
  amountPoolTokensDeposited_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  amountPoolTokensDeposited_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  amountPoolTokensDeposited_lt?: InputMaybe<Scalars['BigInt']['input']>;
  amountPoolTokensDeposited_lte?: InputMaybe<Scalars['BigInt']['input']>;
  amountPoolTokensDeposited_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  amountPoolTokensDeposited_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  backstopPool?: InputMaybe<BackstopPoolWhereInput>;
  backstopPool_isNull?: InputMaybe<Scalars['Boolean']['input']>;
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
  poolSharesMinted_eq?: InputMaybe<Scalars['BigInt']['input']>;
  poolSharesMinted_gt?: InputMaybe<Scalars['BigInt']['input']>;
  poolSharesMinted_gte?: InputMaybe<Scalars['BigInt']['input']>;
  poolSharesMinted_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  poolSharesMinted_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  poolSharesMinted_lt?: InputMaybe<Scalars['BigInt']['input']>;
  poolSharesMinted_lte?: InputMaybe<Scalars['BigInt']['input']>;
  poolSharesMinted_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  poolSharesMinted_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
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
};

export type NablaBackstopLiquidityDepositsConnection = {
  __typename?: 'NablaBackstopLiquidityDepositsConnection';
  edges: Array<NablaBackstopLiquidityDepositEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type NablaBackstopLiquidityWithdrawal = {
  __typename?: 'NablaBackstopLiquidityWithdrawal';
  amountPoolTokensWithdrawn: Scalars['BigInt']['output'];
  backstopPool: BackstopPool;
  id: Scalars['String']['output'];
  poolSharesBurned: Scalars['BigInt']['output'];
  sender: Scalars['String']['output'];
  timestamp: Scalars['DateTime']['output'];
};

export type NablaBackstopLiquidityWithdrawalEdge = {
  __typename?: 'NablaBackstopLiquidityWithdrawalEdge';
  cursor: Scalars['String']['output'];
  node: NablaBackstopLiquidityWithdrawal;
};

export enum NablaBackstopLiquidityWithdrawalOrderByInput {
  AmountPoolTokensWithdrawnAsc = 'amountPoolTokensWithdrawn_ASC',
  AmountPoolTokensWithdrawnAscNullsFirst = 'amountPoolTokensWithdrawn_ASC_NULLS_FIRST',
  AmountPoolTokensWithdrawnAscNullsLast = 'amountPoolTokensWithdrawn_ASC_NULLS_LAST',
  AmountPoolTokensWithdrawnDesc = 'amountPoolTokensWithdrawn_DESC',
  AmountPoolTokensWithdrawnDescNullsFirst = 'amountPoolTokensWithdrawn_DESC_NULLS_FIRST',
  AmountPoolTokensWithdrawnDescNullsLast = 'amountPoolTokensWithdrawn_DESC_NULLS_LAST',
  BackstopPoolAprAsc = 'backstopPool_apr_ASC',
  BackstopPoolAprAscNullsFirst = 'backstopPool_apr_ASC_NULLS_FIRST',
  BackstopPoolAprAscNullsLast = 'backstopPool_apr_ASC_NULLS_LAST',
  BackstopPoolAprDesc = 'backstopPool_apr_DESC',
  BackstopPoolAprDescNullsFirst = 'backstopPool_apr_DESC_NULLS_FIRST',
  BackstopPoolAprDescNullsLast = 'backstopPool_apr_DESC_NULLS_LAST',
  BackstopPoolIdAsc = 'backstopPool_id_ASC',
  BackstopPoolIdAscNullsFirst = 'backstopPool_id_ASC_NULLS_FIRST',
  BackstopPoolIdAscNullsLast = 'backstopPool_id_ASC_NULLS_LAST',
  BackstopPoolIdDesc = 'backstopPool_id_DESC',
  BackstopPoolIdDescNullsFirst = 'backstopPool_id_DESC_NULLS_FIRST',
  BackstopPoolIdDescNullsLast = 'backstopPool_id_DESC_NULLS_LAST',
  BackstopPoolLpTokenDecimalsAsc = 'backstopPool_lpTokenDecimals_ASC',
  BackstopPoolLpTokenDecimalsAscNullsFirst = 'backstopPool_lpTokenDecimals_ASC_NULLS_FIRST',
  BackstopPoolLpTokenDecimalsAscNullsLast = 'backstopPool_lpTokenDecimals_ASC_NULLS_LAST',
  BackstopPoolLpTokenDecimalsDesc = 'backstopPool_lpTokenDecimals_DESC',
  BackstopPoolLpTokenDecimalsDescNullsFirst = 'backstopPool_lpTokenDecimals_DESC_NULLS_FIRST',
  BackstopPoolLpTokenDecimalsDescNullsLast = 'backstopPool_lpTokenDecimals_DESC_NULLS_LAST',
  BackstopPoolNameAsc = 'backstopPool_name_ASC',
  BackstopPoolNameAscNullsFirst = 'backstopPool_name_ASC_NULLS_FIRST',
  BackstopPoolNameAscNullsLast = 'backstopPool_name_ASC_NULLS_LAST',
  BackstopPoolNameDesc = 'backstopPool_name_DESC',
  BackstopPoolNameDescNullsFirst = 'backstopPool_name_DESC_NULLS_FIRST',
  BackstopPoolNameDescNullsLast = 'backstopPool_name_DESC_NULLS_LAST',
  BackstopPoolPausedAsc = 'backstopPool_paused_ASC',
  BackstopPoolPausedAscNullsFirst = 'backstopPool_paused_ASC_NULLS_FIRST',
  BackstopPoolPausedAscNullsLast = 'backstopPool_paused_ASC_NULLS_LAST',
  BackstopPoolPausedDesc = 'backstopPool_paused_DESC',
  BackstopPoolPausedDescNullsFirst = 'backstopPool_paused_DESC_NULLS_FIRST',
  BackstopPoolPausedDescNullsLast = 'backstopPool_paused_DESC_NULLS_LAST',
  BackstopPoolReservesAsc = 'backstopPool_reserves_ASC',
  BackstopPoolReservesAscNullsFirst = 'backstopPool_reserves_ASC_NULLS_FIRST',
  BackstopPoolReservesAscNullsLast = 'backstopPool_reserves_ASC_NULLS_LAST',
  BackstopPoolReservesDesc = 'backstopPool_reserves_DESC',
  BackstopPoolReservesDescNullsFirst = 'backstopPool_reserves_DESC_NULLS_FIRST',
  BackstopPoolReservesDescNullsLast = 'backstopPool_reserves_DESC_NULLS_LAST',
  BackstopPoolSymbolAsc = 'backstopPool_symbol_ASC',
  BackstopPoolSymbolAscNullsFirst = 'backstopPool_symbol_ASC_NULLS_FIRST',
  BackstopPoolSymbolAscNullsLast = 'backstopPool_symbol_ASC_NULLS_LAST',
  BackstopPoolSymbolDesc = 'backstopPool_symbol_DESC',
  BackstopPoolSymbolDescNullsFirst = 'backstopPool_symbol_DESC_NULLS_FIRST',
  BackstopPoolSymbolDescNullsLast = 'backstopPool_symbol_DESC_NULLS_LAST',
  BackstopPoolTotalSupplyAsc = 'backstopPool_totalSupply_ASC',
  BackstopPoolTotalSupplyAscNullsFirst = 'backstopPool_totalSupply_ASC_NULLS_FIRST',
  BackstopPoolTotalSupplyAscNullsLast = 'backstopPool_totalSupply_ASC_NULLS_LAST',
  BackstopPoolTotalSupplyDesc = 'backstopPool_totalSupply_DESC',
  BackstopPoolTotalSupplyDescNullsFirst = 'backstopPool_totalSupply_DESC_NULLS_FIRST',
  BackstopPoolTotalSupplyDescNullsLast = 'backstopPool_totalSupply_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  PoolSharesBurnedAsc = 'poolSharesBurned_ASC',
  PoolSharesBurnedAscNullsFirst = 'poolSharesBurned_ASC_NULLS_FIRST',
  PoolSharesBurnedAscNullsLast = 'poolSharesBurned_ASC_NULLS_LAST',
  PoolSharesBurnedDesc = 'poolSharesBurned_DESC',
  PoolSharesBurnedDescNullsFirst = 'poolSharesBurned_DESC_NULLS_FIRST',
  PoolSharesBurnedDescNullsLast = 'poolSharesBurned_DESC_NULLS_LAST',
  SenderAsc = 'sender_ASC',
  SenderAscNullsFirst = 'sender_ASC_NULLS_FIRST',
  SenderAscNullsLast = 'sender_ASC_NULLS_LAST',
  SenderDesc = 'sender_DESC',
  SenderDescNullsFirst = 'sender_DESC_NULLS_FIRST',
  SenderDescNullsLast = 'sender_DESC_NULLS_LAST',
  TimestampAsc = 'timestamp_ASC',
  TimestampAscNullsFirst = 'timestamp_ASC_NULLS_FIRST',
  TimestampAscNullsLast = 'timestamp_ASC_NULLS_LAST',
  TimestampDesc = 'timestamp_DESC',
  TimestampDescNullsFirst = 'timestamp_DESC_NULLS_FIRST',
  TimestampDescNullsLast = 'timestamp_DESC_NULLS_LAST'
}

export type NablaBackstopLiquidityWithdrawalWhereInput = {
  AND?: InputMaybe<Array<NablaBackstopLiquidityWithdrawalWhereInput>>;
  OR?: InputMaybe<Array<NablaBackstopLiquidityWithdrawalWhereInput>>;
  amountPoolTokensWithdrawn_eq?: InputMaybe<Scalars['BigInt']['input']>;
  amountPoolTokensWithdrawn_gt?: InputMaybe<Scalars['BigInt']['input']>;
  amountPoolTokensWithdrawn_gte?: InputMaybe<Scalars['BigInt']['input']>;
  amountPoolTokensWithdrawn_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  amountPoolTokensWithdrawn_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  amountPoolTokensWithdrawn_lt?: InputMaybe<Scalars['BigInt']['input']>;
  amountPoolTokensWithdrawn_lte?: InputMaybe<Scalars['BigInt']['input']>;
  amountPoolTokensWithdrawn_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  amountPoolTokensWithdrawn_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  backstopPool?: InputMaybe<BackstopPoolWhereInput>;
  backstopPool_isNull?: InputMaybe<Scalars['Boolean']['input']>;
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
  poolSharesBurned_eq?: InputMaybe<Scalars['BigInt']['input']>;
  poolSharesBurned_gt?: InputMaybe<Scalars['BigInt']['input']>;
  poolSharesBurned_gte?: InputMaybe<Scalars['BigInt']['input']>;
  poolSharesBurned_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  poolSharesBurned_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  poolSharesBurned_lt?: InputMaybe<Scalars['BigInt']['input']>;
  poolSharesBurned_lte?: InputMaybe<Scalars['BigInt']['input']>;
  poolSharesBurned_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  poolSharesBurned_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
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
};

export type NablaBackstopLiquidityWithdrawalsConnection = {
  __typename?: 'NablaBackstopLiquidityWithdrawalsConnection';
  edges: Array<NablaBackstopLiquidityWithdrawalEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type NablaSwap = {
  __typename?: 'NablaSwap';
  amountIn: Scalars['BigInt']['output'];
  amountOut: Scalars['BigInt']['output'];
  id: Scalars['String']['output'];
  sender: Scalars['String']['output'];
  swapFee?: Maybe<NablaSwapFee>;
  timestamp: Scalars['DateTime']['output'];
  to: Scalars['String']['output'];
  tokenIn: NablaToken;
  tokenOut: NablaToken;
};

export type NablaSwapEdge = {
  __typename?: 'NablaSwapEdge';
  cursor: Scalars['String']['output'];
  node: NablaSwap;
};

export type NablaSwapFee = {
  __typename?: 'NablaSwapFee';
  backstopFees: Scalars['BigInt']['output'];
  backstopPool?: Maybe<BackstopPool>;
  id: Scalars['String']['output'];
  lpFees: Scalars['BigInt']['output'];
  protocolFees: Scalars['BigInt']['output'];
  swapPool: SwapPool;
  timestamp: Scalars['BigInt']['output'];
};

export type NablaSwapFeeEdge = {
  __typename?: 'NablaSwapFeeEdge';
  cursor: Scalars['String']['output'];
  node: NablaSwapFee;
};

export enum NablaSwapFeeOrderByInput {
  BackstopFeesAsc = 'backstopFees_ASC',
  BackstopFeesAscNullsFirst = 'backstopFees_ASC_NULLS_FIRST',
  BackstopFeesAscNullsLast = 'backstopFees_ASC_NULLS_LAST',
  BackstopFeesDesc = 'backstopFees_DESC',
  BackstopFeesDescNullsFirst = 'backstopFees_DESC_NULLS_FIRST',
  BackstopFeesDescNullsLast = 'backstopFees_DESC_NULLS_LAST',
  BackstopPoolAprAsc = 'backstopPool_apr_ASC',
  BackstopPoolAprAscNullsFirst = 'backstopPool_apr_ASC_NULLS_FIRST',
  BackstopPoolAprAscNullsLast = 'backstopPool_apr_ASC_NULLS_LAST',
  BackstopPoolAprDesc = 'backstopPool_apr_DESC',
  BackstopPoolAprDescNullsFirst = 'backstopPool_apr_DESC_NULLS_FIRST',
  BackstopPoolAprDescNullsLast = 'backstopPool_apr_DESC_NULLS_LAST',
  BackstopPoolIdAsc = 'backstopPool_id_ASC',
  BackstopPoolIdAscNullsFirst = 'backstopPool_id_ASC_NULLS_FIRST',
  BackstopPoolIdAscNullsLast = 'backstopPool_id_ASC_NULLS_LAST',
  BackstopPoolIdDesc = 'backstopPool_id_DESC',
  BackstopPoolIdDescNullsFirst = 'backstopPool_id_DESC_NULLS_FIRST',
  BackstopPoolIdDescNullsLast = 'backstopPool_id_DESC_NULLS_LAST',
  BackstopPoolLpTokenDecimalsAsc = 'backstopPool_lpTokenDecimals_ASC',
  BackstopPoolLpTokenDecimalsAscNullsFirst = 'backstopPool_lpTokenDecimals_ASC_NULLS_FIRST',
  BackstopPoolLpTokenDecimalsAscNullsLast = 'backstopPool_lpTokenDecimals_ASC_NULLS_LAST',
  BackstopPoolLpTokenDecimalsDesc = 'backstopPool_lpTokenDecimals_DESC',
  BackstopPoolLpTokenDecimalsDescNullsFirst = 'backstopPool_lpTokenDecimals_DESC_NULLS_FIRST',
  BackstopPoolLpTokenDecimalsDescNullsLast = 'backstopPool_lpTokenDecimals_DESC_NULLS_LAST',
  BackstopPoolNameAsc = 'backstopPool_name_ASC',
  BackstopPoolNameAscNullsFirst = 'backstopPool_name_ASC_NULLS_FIRST',
  BackstopPoolNameAscNullsLast = 'backstopPool_name_ASC_NULLS_LAST',
  BackstopPoolNameDesc = 'backstopPool_name_DESC',
  BackstopPoolNameDescNullsFirst = 'backstopPool_name_DESC_NULLS_FIRST',
  BackstopPoolNameDescNullsLast = 'backstopPool_name_DESC_NULLS_LAST',
  BackstopPoolPausedAsc = 'backstopPool_paused_ASC',
  BackstopPoolPausedAscNullsFirst = 'backstopPool_paused_ASC_NULLS_FIRST',
  BackstopPoolPausedAscNullsLast = 'backstopPool_paused_ASC_NULLS_LAST',
  BackstopPoolPausedDesc = 'backstopPool_paused_DESC',
  BackstopPoolPausedDescNullsFirst = 'backstopPool_paused_DESC_NULLS_FIRST',
  BackstopPoolPausedDescNullsLast = 'backstopPool_paused_DESC_NULLS_LAST',
  BackstopPoolReservesAsc = 'backstopPool_reserves_ASC',
  BackstopPoolReservesAscNullsFirst = 'backstopPool_reserves_ASC_NULLS_FIRST',
  BackstopPoolReservesAscNullsLast = 'backstopPool_reserves_ASC_NULLS_LAST',
  BackstopPoolReservesDesc = 'backstopPool_reserves_DESC',
  BackstopPoolReservesDescNullsFirst = 'backstopPool_reserves_DESC_NULLS_FIRST',
  BackstopPoolReservesDescNullsLast = 'backstopPool_reserves_DESC_NULLS_LAST',
  BackstopPoolSymbolAsc = 'backstopPool_symbol_ASC',
  BackstopPoolSymbolAscNullsFirst = 'backstopPool_symbol_ASC_NULLS_FIRST',
  BackstopPoolSymbolAscNullsLast = 'backstopPool_symbol_ASC_NULLS_LAST',
  BackstopPoolSymbolDesc = 'backstopPool_symbol_DESC',
  BackstopPoolSymbolDescNullsFirst = 'backstopPool_symbol_DESC_NULLS_FIRST',
  BackstopPoolSymbolDescNullsLast = 'backstopPool_symbol_DESC_NULLS_LAST',
  BackstopPoolTotalSupplyAsc = 'backstopPool_totalSupply_ASC',
  BackstopPoolTotalSupplyAscNullsFirst = 'backstopPool_totalSupply_ASC_NULLS_FIRST',
  BackstopPoolTotalSupplyAscNullsLast = 'backstopPool_totalSupply_ASC_NULLS_LAST',
  BackstopPoolTotalSupplyDesc = 'backstopPool_totalSupply_DESC',
  BackstopPoolTotalSupplyDescNullsFirst = 'backstopPool_totalSupply_DESC_NULLS_FIRST',
  BackstopPoolTotalSupplyDescNullsLast = 'backstopPool_totalSupply_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  LpFeesAsc = 'lpFees_ASC',
  LpFeesAscNullsFirst = 'lpFees_ASC_NULLS_FIRST',
  LpFeesAscNullsLast = 'lpFees_ASC_NULLS_LAST',
  LpFeesDesc = 'lpFees_DESC',
  LpFeesDescNullsFirst = 'lpFees_DESC_NULLS_FIRST',
  LpFeesDescNullsLast = 'lpFees_DESC_NULLS_LAST',
  ProtocolFeesAsc = 'protocolFees_ASC',
  ProtocolFeesAscNullsFirst = 'protocolFees_ASC_NULLS_FIRST',
  ProtocolFeesAscNullsLast = 'protocolFees_ASC_NULLS_LAST',
  ProtocolFeesDesc = 'protocolFees_DESC',
  ProtocolFeesDescNullsFirst = 'protocolFees_DESC_NULLS_FIRST',
  ProtocolFeesDescNullsLast = 'protocolFees_DESC_NULLS_LAST',
  SwapPoolAprAsc = 'swapPool_apr_ASC',
  SwapPoolAprAscNullsFirst = 'swapPool_apr_ASC_NULLS_FIRST',
  SwapPoolAprAscNullsLast = 'swapPool_apr_ASC_NULLS_LAST',
  SwapPoolAprDesc = 'swapPool_apr_DESC',
  SwapPoolAprDescNullsFirst = 'swapPool_apr_DESC_NULLS_FIRST',
  SwapPoolAprDescNullsLast = 'swapPool_apr_DESC_NULLS_LAST',
  SwapPoolIdAsc = 'swapPool_id_ASC',
  SwapPoolIdAscNullsFirst = 'swapPool_id_ASC_NULLS_FIRST',
  SwapPoolIdAscNullsLast = 'swapPool_id_ASC_NULLS_LAST',
  SwapPoolIdDesc = 'swapPool_id_DESC',
  SwapPoolIdDescNullsFirst = 'swapPool_id_DESC_NULLS_FIRST',
  SwapPoolIdDescNullsLast = 'swapPool_id_DESC_NULLS_LAST',
  SwapPoolInsuranceFeeBpsAsc = 'swapPool_insuranceFeeBps_ASC',
  SwapPoolInsuranceFeeBpsAscNullsFirst = 'swapPool_insuranceFeeBps_ASC_NULLS_FIRST',
  SwapPoolInsuranceFeeBpsAscNullsLast = 'swapPool_insuranceFeeBps_ASC_NULLS_LAST',
  SwapPoolInsuranceFeeBpsDesc = 'swapPool_insuranceFeeBps_DESC',
  SwapPoolInsuranceFeeBpsDescNullsFirst = 'swapPool_insuranceFeeBps_DESC_NULLS_FIRST',
  SwapPoolInsuranceFeeBpsDescNullsLast = 'swapPool_insuranceFeeBps_DESC_NULLS_LAST',
  SwapPoolLpTokenDecimalsAsc = 'swapPool_lpTokenDecimals_ASC',
  SwapPoolLpTokenDecimalsAscNullsFirst = 'swapPool_lpTokenDecimals_ASC_NULLS_FIRST',
  SwapPoolLpTokenDecimalsAscNullsLast = 'swapPool_lpTokenDecimals_ASC_NULLS_LAST',
  SwapPoolLpTokenDecimalsDesc = 'swapPool_lpTokenDecimals_DESC',
  SwapPoolLpTokenDecimalsDescNullsFirst = 'swapPool_lpTokenDecimals_DESC_NULLS_FIRST',
  SwapPoolLpTokenDecimalsDescNullsLast = 'swapPool_lpTokenDecimals_DESC_NULLS_LAST',
  SwapPoolNameAsc = 'swapPool_name_ASC',
  SwapPoolNameAscNullsFirst = 'swapPool_name_ASC_NULLS_FIRST',
  SwapPoolNameAscNullsLast = 'swapPool_name_ASC_NULLS_LAST',
  SwapPoolNameDesc = 'swapPool_name_DESC',
  SwapPoolNameDescNullsFirst = 'swapPool_name_DESC_NULLS_FIRST',
  SwapPoolNameDescNullsLast = 'swapPool_name_DESC_NULLS_LAST',
  SwapPoolPausedAsc = 'swapPool_paused_ASC',
  SwapPoolPausedAscNullsFirst = 'swapPool_paused_ASC_NULLS_FIRST',
  SwapPoolPausedAscNullsLast = 'swapPool_paused_ASC_NULLS_LAST',
  SwapPoolPausedDesc = 'swapPool_paused_DESC',
  SwapPoolPausedDescNullsFirst = 'swapPool_paused_DESC_NULLS_FIRST',
  SwapPoolPausedDescNullsLast = 'swapPool_paused_DESC_NULLS_LAST',
  SwapPoolProtocolTreasuryAddressAsc = 'swapPool_protocolTreasuryAddress_ASC',
  SwapPoolProtocolTreasuryAddressAscNullsFirst = 'swapPool_protocolTreasuryAddress_ASC_NULLS_FIRST',
  SwapPoolProtocolTreasuryAddressAscNullsLast = 'swapPool_protocolTreasuryAddress_ASC_NULLS_LAST',
  SwapPoolProtocolTreasuryAddressDesc = 'swapPool_protocolTreasuryAddress_DESC',
  SwapPoolProtocolTreasuryAddressDescNullsFirst = 'swapPool_protocolTreasuryAddress_DESC_NULLS_FIRST',
  SwapPoolProtocolTreasuryAddressDescNullsLast = 'swapPool_protocolTreasuryAddress_DESC_NULLS_LAST',
  SwapPoolReserveWithSlippageAsc = 'swapPool_reserveWithSlippage_ASC',
  SwapPoolReserveWithSlippageAscNullsFirst = 'swapPool_reserveWithSlippage_ASC_NULLS_FIRST',
  SwapPoolReserveWithSlippageAscNullsLast = 'swapPool_reserveWithSlippage_ASC_NULLS_LAST',
  SwapPoolReserveWithSlippageDesc = 'swapPool_reserveWithSlippage_DESC',
  SwapPoolReserveWithSlippageDescNullsFirst = 'swapPool_reserveWithSlippage_DESC_NULLS_FIRST',
  SwapPoolReserveWithSlippageDescNullsLast = 'swapPool_reserveWithSlippage_DESC_NULLS_LAST',
  SwapPoolReserveAsc = 'swapPool_reserve_ASC',
  SwapPoolReserveAscNullsFirst = 'swapPool_reserve_ASC_NULLS_FIRST',
  SwapPoolReserveAscNullsLast = 'swapPool_reserve_ASC_NULLS_LAST',
  SwapPoolReserveDesc = 'swapPool_reserve_DESC',
  SwapPoolReserveDescNullsFirst = 'swapPool_reserve_DESC_NULLS_FIRST',
  SwapPoolReserveDescNullsLast = 'swapPool_reserve_DESC_NULLS_LAST',
  SwapPoolSymbolAsc = 'swapPool_symbol_ASC',
  SwapPoolSymbolAscNullsFirst = 'swapPool_symbol_ASC_NULLS_FIRST',
  SwapPoolSymbolAscNullsLast = 'swapPool_symbol_ASC_NULLS_LAST',
  SwapPoolSymbolDesc = 'swapPool_symbol_DESC',
  SwapPoolSymbolDescNullsFirst = 'swapPool_symbol_DESC_NULLS_FIRST',
  SwapPoolSymbolDescNullsLast = 'swapPool_symbol_DESC_NULLS_LAST',
  SwapPoolTotalLiabilitiesAsc = 'swapPool_totalLiabilities_ASC',
  SwapPoolTotalLiabilitiesAscNullsFirst = 'swapPool_totalLiabilities_ASC_NULLS_FIRST',
  SwapPoolTotalLiabilitiesAscNullsLast = 'swapPool_totalLiabilities_ASC_NULLS_LAST',
  SwapPoolTotalLiabilitiesDesc = 'swapPool_totalLiabilities_DESC',
  SwapPoolTotalLiabilitiesDescNullsFirst = 'swapPool_totalLiabilities_DESC_NULLS_FIRST',
  SwapPoolTotalLiabilitiesDescNullsLast = 'swapPool_totalLiabilities_DESC_NULLS_LAST',
  SwapPoolTotalSupplyAsc = 'swapPool_totalSupply_ASC',
  SwapPoolTotalSupplyAscNullsFirst = 'swapPool_totalSupply_ASC_NULLS_FIRST',
  SwapPoolTotalSupplyAscNullsLast = 'swapPool_totalSupply_ASC_NULLS_LAST',
  SwapPoolTotalSupplyDesc = 'swapPool_totalSupply_DESC',
  SwapPoolTotalSupplyDescNullsFirst = 'swapPool_totalSupply_DESC_NULLS_FIRST',
  SwapPoolTotalSupplyDescNullsLast = 'swapPool_totalSupply_DESC_NULLS_LAST',
  TimestampAsc = 'timestamp_ASC',
  TimestampAscNullsFirst = 'timestamp_ASC_NULLS_FIRST',
  TimestampAscNullsLast = 'timestamp_ASC_NULLS_LAST',
  TimestampDesc = 'timestamp_DESC',
  TimestampDescNullsFirst = 'timestamp_DESC_NULLS_FIRST',
  TimestampDescNullsLast = 'timestamp_DESC_NULLS_LAST'
}

export type NablaSwapFeeWhereInput = {
  AND?: InputMaybe<Array<NablaSwapFeeWhereInput>>;
  OR?: InputMaybe<Array<NablaSwapFeeWhereInput>>;
  backstopFees_eq?: InputMaybe<Scalars['BigInt']['input']>;
  backstopFees_gt?: InputMaybe<Scalars['BigInt']['input']>;
  backstopFees_gte?: InputMaybe<Scalars['BigInt']['input']>;
  backstopFees_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  backstopFees_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  backstopFees_lt?: InputMaybe<Scalars['BigInt']['input']>;
  backstopFees_lte?: InputMaybe<Scalars['BigInt']['input']>;
  backstopFees_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  backstopFees_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  backstopPool?: InputMaybe<BackstopPoolWhereInput>;
  backstopPool_isNull?: InputMaybe<Scalars['Boolean']['input']>;
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
  lpFees_eq?: InputMaybe<Scalars['BigInt']['input']>;
  lpFees_gt?: InputMaybe<Scalars['BigInt']['input']>;
  lpFees_gte?: InputMaybe<Scalars['BigInt']['input']>;
  lpFees_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  lpFees_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  lpFees_lt?: InputMaybe<Scalars['BigInt']['input']>;
  lpFees_lte?: InputMaybe<Scalars['BigInt']['input']>;
  lpFees_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  lpFees_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  protocolFees_eq?: InputMaybe<Scalars['BigInt']['input']>;
  protocolFees_gt?: InputMaybe<Scalars['BigInt']['input']>;
  protocolFees_gte?: InputMaybe<Scalars['BigInt']['input']>;
  protocolFees_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  protocolFees_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  protocolFees_lt?: InputMaybe<Scalars['BigInt']['input']>;
  protocolFees_lte?: InputMaybe<Scalars['BigInt']['input']>;
  protocolFees_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  protocolFees_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  swapPool?: InputMaybe<SwapPoolWhereInput>;
  swapPool_isNull?: InputMaybe<Scalars['Boolean']['input']>;
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

export type NablaSwapFeesConnection = {
  __typename?: 'NablaSwapFeesConnection';
  edges: Array<NablaSwapFeeEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type NablaSwapLiquidityDeposit = {
  __typename?: 'NablaSwapLiquidityDeposit';
  amountPoolTokensDeposited: Scalars['BigInt']['output'];
  id: Scalars['String']['output'];
  poolSharesMinted: Scalars['BigInt']['output'];
  sender: Scalars['String']['output'];
  swapPool: SwapPool;
  timestamp: Scalars['DateTime']['output'];
};

export type NablaSwapLiquidityDepositEdge = {
  __typename?: 'NablaSwapLiquidityDepositEdge';
  cursor: Scalars['String']['output'];
  node: NablaSwapLiquidityDeposit;
};

export enum NablaSwapLiquidityDepositOrderByInput {
  AmountPoolTokensDepositedAsc = 'amountPoolTokensDeposited_ASC',
  AmountPoolTokensDepositedAscNullsFirst = 'amountPoolTokensDeposited_ASC_NULLS_FIRST',
  AmountPoolTokensDepositedAscNullsLast = 'amountPoolTokensDeposited_ASC_NULLS_LAST',
  AmountPoolTokensDepositedDesc = 'amountPoolTokensDeposited_DESC',
  AmountPoolTokensDepositedDescNullsFirst = 'amountPoolTokensDeposited_DESC_NULLS_FIRST',
  AmountPoolTokensDepositedDescNullsLast = 'amountPoolTokensDeposited_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  PoolSharesMintedAsc = 'poolSharesMinted_ASC',
  PoolSharesMintedAscNullsFirst = 'poolSharesMinted_ASC_NULLS_FIRST',
  PoolSharesMintedAscNullsLast = 'poolSharesMinted_ASC_NULLS_LAST',
  PoolSharesMintedDesc = 'poolSharesMinted_DESC',
  PoolSharesMintedDescNullsFirst = 'poolSharesMinted_DESC_NULLS_FIRST',
  PoolSharesMintedDescNullsLast = 'poolSharesMinted_DESC_NULLS_LAST',
  SenderAsc = 'sender_ASC',
  SenderAscNullsFirst = 'sender_ASC_NULLS_FIRST',
  SenderAscNullsLast = 'sender_ASC_NULLS_LAST',
  SenderDesc = 'sender_DESC',
  SenderDescNullsFirst = 'sender_DESC_NULLS_FIRST',
  SenderDescNullsLast = 'sender_DESC_NULLS_LAST',
  SwapPoolAprAsc = 'swapPool_apr_ASC',
  SwapPoolAprAscNullsFirst = 'swapPool_apr_ASC_NULLS_FIRST',
  SwapPoolAprAscNullsLast = 'swapPool_apr_ASC_NULLS_LAST',
  SwapPoolAprDesc = 'swapPool_apr_DESC',
  SwapPoolAprDescNullsFirst = 'swapPool_apr_DESC_NULLS_FIRST',
  SwapPoolAprDescNullsLast = 'swapPool_apr_DESC_NULLS_LAST',
  SwapPoolIdAsc = 'swapPool_id_ASC',
  SwapPoolIdAscNullsFirst = 'swapPool_id_ASC_NULLS_FIRST',
  SwapPoolIdAscNullsLast = 'swapPool_id_ASC_NULLS_LAST',
  SwapPoolIdDesc = 'swapPool_id_DESC',
  SwapPoolIdDescNullsFirst = 'swapPool_id_DESC_NULLS_FIRST',
  SwapPoolIdDescNullsLast = 'swapPool_id_DESC_NULLS_LAST',
  SwapPoolInsuranceFeeBpsAsc = 'swapPool_insuranceFeeBps_ASC',
  SwapPoolInsuranceFeeBpsAscNullsFirst = 'swapPool_insuranceFeeBps_ASC_NULLS_FIRST',
  SwapPoolInsuranceFeeBpsAscNullsLast = 'swapPool_insuranceFeeBps_ASC_NULLS_LAST',
  SwapPoolInsuranceFeeBpsDesc = 'swapPool_insuranceFeeBps_DESC',
  SwapPoolInsuranceFeeBpsDescNullsFirst = 'swapPool_insuranceFeeBps_DESC_NULLS_FIRST',
  SwapPoolInsuranceFeeBpsDescNullsLast = 'swapPool_insuranceFeeBps_DESC_NULLS_LAST',
  SwapPoolLpTokenDecimalsAsc = 'swapPool_lpTokenDecimals_ASC',
  SwapPoolLpTokenDecimalsAscNullsFirst = 'swapPool_lpTokenDecimals_ASC_NULLS_FIRST',
  SwapPoolLpTokenDecimalsAscNullsLast = 'swapPool_lpTokenDecimals_ASC_NULLS_LAST',
  SwapPoolLpTokenDecimalsDesc = 'swapPool_lpTokenDecimals_DESC',
  SwapPoolLpTokenDecimalsDescNullsFirst = 'swapPool_lpTokenDecimals_DESC_NULLS_FIRST',
  SwapPoolLpTokenDecimalsDescNullsLast = 'swapPool_lpTokenDecimals_DESC_NULLS_LAST',
  SwapPoolNameAsc = 'swapPool_name_ASC',
  SwapPoolNameAscNullsFirst = 'swapPool_name_ASC_NULLS_FIRST',
  SwapPoolNameAscNullsLast = 'swapPool_name_ASC_NULLS_LAST',
  SwapPoolNameDesc = 'swapPool_name_DESC',
  SwapPoolNameDescNullsFirst = 'swapPool_name_DESC_NULLS_FIRST',
  SwapPoolNameDescNullsLast = 'swapPool_name_DESC_NULLS_LAST',
  SwapPoolPausedAsc = 'swapPool_paused_ASC',
  SwapPoolPausedAscNullsFirst = 'swapPool_paused_ASC_NULLS_FIRST',
  SwapPoolPausedAscNullsLast = 'swapPool_paused_ASC_NULLS_LAST',
  SwapPoolPausedDesc = 'swapPool_paused_DESC',
  SwapPoolPausedDescNullsFirst = 'swapPool_paused_DESC_NULLS_FIRST',
  SwapPoolPausedDescNullsLast = 'swapPool_paused_DESC_NULLS_LAST',
  SwapPoolProtocolTreasuryAddressAsc = 'swapPool_protocolTreasuryAddress_ASC',
  SwapPoolProtocolTreasuryAddressAscNullsFirst = 'swapPool_protocolTreasuryAddress_ASC_NULLS_FIRST',
  SwapPoolProtocolTreasuryAddressAscNullsLast = 'swapPool_protocolTreasuryAddress_ASC_NULLS_LAST',
  SwapPoolProtocolTreasuryAddressDesc = 'swapPool_protocolTreasuryAddress_DESC',
  SwapPoolProtocolTreasuryAddressDescNullsFirst = 'swapPool_protocolTreasuryAddress_DESC_NULLS_FIRST',
  SwapPoolProtocolTreasuryAddressDescNullsLast = 'swapPool_protocolTreasuryAddress_DESC_NULLS_LAST',
  SwapPoolReserveWithSlippageAsc = 'swapPool_reserveWithSlippage_ASC',
  SwapPoolReserveWithSlippageAscNullsFirst = 'swapPool_reserveWithSlippage_ASC_NULLS_FIRST',
  SwapPoolReserveWithSlippageAscNullsLast = 'swapPool_reserveWithSlippage_ASC_NULLS_LAST',
  SwapPoolReserveWithSlippageDesc = 'swapPool_reserveWithSlippage_DESC',
  SwapPoolReserveWithSlippageDescNullsFirst = 'swapPool_reserveWithSlippage_DESC_NULLS_FIRST',
  SwapPoolReserveWithSlippageDescNullsLast = 'swapPool_reserveWithSlippage_DESC_NULLS_LAST',
  SwapPoolReserveAsc = 'swapPool_reserve_ASC',
  SwapPoolReserveAscNullsFirst = 'swapPool_reserve_ASC_NULLS_FIRST',
  SwapPoolReserveAscNullsLast = 'swapPool_reserve_ASC_NULLS_LAST',
  SwapPoolReserveDesc = 'swapPool_reserve_DESC',
  SwapPoolReserveDescNullsFirst = 'swapPool_reserve_DESC_NULLS_FIRST',
  SwapPoolReserveDescNullsLast = 'swapPool_reserve_DESC_NULLS_LAST',
  SwapPoolSymbolAsc = 'swapPool_symbol_ASC',
  SwapPoolSymbolAscNullsFirst = 'swapPool_symbol_ASC_NULLS_FIRST',
  SwapPoolSymbolAscNullsLast = 'swapPool_symbol_ASC_NULLS_LAST',
  SwapPoolSymbolDesc = 'swapPool_symbol_DESC',
  SwapPoolSymbolDescNullsFirst = 'swapPool_symbol_DESC_NULLS_FIRST',
  SwapPoolSymbolDescNullsLast = 'swapPool_symbol_DESC_NULLS_LAST',
  SwapPoolTotalLiabilitiesAsc = 'swapPool_totalLiabilities_ASC',
  SwapPoolTotalLiabilitiesAscNullsFirst = 'swapPool_totalLiabilities_ASC_NULLS_FIRST',
  SwapPoolTotalLiabilitiesAscNullsLast = 'swapPool_totalLiabilities_ASC_NULLS_LAST',
  SwapPoolTotalLiabilitiesDesc = 'swapPool_totalLiabilities_DESC',
  SwapPoolTotalLiabilitiesDescNullsFirst = 'swapPool_totalLiabilities_DESC_NULLS_FIRST',
  SwapPoolTotalLiabilitiesDescNullsLast = 'swapPool_totalLiabilities_DESC_NULLS_LAST',
  SwapPoolTotalSupplyAsc = 'swapPool_totalSupply_ASC',
  SwapPoolTotalSupplyAscNullsFirst = 'swapPool_totalSupply_ASC_NULLS_FIRST',
  SwapPoolTotalSupplyAscNullsLast = 'swapPool_totalSupply_ASC_NULLS_LAST',
  SwapPoolTotalSupplyDesc = 'swapPool_totalSupply_DESC',
  SwapPoolTotalSupplyDescNullsFirst = 'swapPool_totalSupply_DESC_NULLS_FIRST',
  SwapPoolTotalSupplyDescNullsLast = 'swapPool_totalSupply_DESC_NULLS_LAST',
  TimestampAsc = 'timestamp_ASC',
  TimestampAscNullsFirst = 'timestamp_ASC_NULLS_FIRST',
  TimestampAscNullsLast = 'timestamp_ASC_NULLS_LAST',
  TimestampDesc = 'timestamp_DESC',
  TimestampDescNullsFirst = 'timestamp_DESC_NULLS_FIRST',
  TimestampDescNullsLast = 'timestamp_DESC_NULLS_LAST'
}

export type NablaSwapLiquidityDepositWhereInput = {
  AND?: InputMaybe<Array<NablaSwapLiquidityDepositWhereInput>>;
  OR?: InputMaybe<Array<NablaSwapLiquidityDepositWhereInput>>;
  amountPoolTokensDeposited_eq?: InputMaybe<Scalars['BigInt']['input']>;
  amountPoolTokensDeposited_gt?: InputMaybe<Scalars['BigInt']['input']>;
  amountPoolTokensDeposited_gte?: InputMaybe<Scalars['BigInt']['input']>;
  amountPoolTokensDeposited_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  amountPoolTokensDeposited_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  amountPoolTokensDeposited_lt?: InputMaybe<Scalars['BigInt']['input']>;
  amountPoolTokensDeposited_lte?: InputMaybe<Scalars['BigInt']['input']>;
  amountPoolTokensDeposited_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  amountPoolTokensDeposited_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
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
  poolSharesMinted_eq?: InputMaybe<Scalars['BigInt']['input']>;
  poolSharesMinted_gt?: InputMaybe<Scalars['BigInt']['input']>;
  poolSharesMinted_gte?: InputMaybe<Scalars['BigInt']['input']>;
  poolSharesMinted_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  poolSharesMinted_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  poolSharesMinted_lt?: InputMaybe<Scalars['BigInt']['input']>;
  poolSharesMinted_lte?: InputMaybe<Scalars['BigInt']['input']>;
  poolSharesMinted_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  poolSharesMinted_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
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
  swapPool?: InputMaybe<SwapPoolWhereInput>;
  swapPool_isNull?: InputMaybe<Scalars['Boolean']['input']>;
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

export type NablaSwapLiquidityDepositsConnection = {
  __typename?: 'NablaSwapLiquidityDepositsConnection';
  edges: Array<NablaSwapLiquidityDepositEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type NablaSwapLiquidityWithdrawal = {
  __typename?: 'NablaSwapLiquidityWithdrawal';
  amountPoolTokensWithdrawn: Scalars['BigInt']['output'];
  id: Scalars['String']['output'];
  poolSharesBurned: Scalars['BigInt']['output'];
  sender: Scalars['String']['output'];
  swapPool: SwapPool;
  timestamp: Scalars['DateTime']['output'];
};

export type NablaSwapLiquidityWithdrawalEdge = {
  __typename?: 'NablaSwapLiquidityWithdrawalEdge';
  cursor: Scalars['String']['output'];
  node: NablaSwapLiquidityWithdrawal;
};

export enum NablaSwapLiquidityWithdrawalOrderByInput {
  AmountPoolTokensWithdrawnAsc = 'amountPoolTokensWithdrawn_ASC',
  AmountPoolTokensWithdrawnAscNullsFirst = 'amountPoolTokensWithdrawn_ASC_NULLS_FIRST',
  AmountPoolTokensWithdrawnAscNullsLast = 'amountPoolTokensWithdrawn_ASC_NULLS_LAST',
  AmountPoolTokensWithdrawnDesc = 'amountPoolTokensWithdrawn_DESC',
  AmountPoolTokensWithdrawnDescNullsFirst = 'amountPoolTokensWithdrawn_DESC_NULLS_FIRST',
  AmountPoolTokensWithdrawnDescNullsLast = 'amountPoolTokensWithdrawn_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  PoolSharesBurnedAsc = 'poolSharesBurned_ASC',
  PoolSharesBurnedAscNullsFirst = 'poolSharesBurned_ASC_NULLS_FIRST',
  PoolSharesBurnedAscNullsLast = 'poolSharesBurned_ASC_NULLS_LAST',
  PoolSharesBurnedDesc = 'poolSharesBurned_DESC',
  PoolSharesBurnedDescNullsFirst = 'poolSharesBurned_DESC_NULLS_FIRST',
  PoolSharesBurnedDescNullsLast = 'poolSharesBurned_DESC_NULLS_LAST',
  SenderAsc = 'sender_ASC',
  SenderAscNullsFirst = 'sender_ASC_NULLS_FIRST',
  SenderAscNullsLast = 'sender_ASC_NULLS_LAST',
  SenderDesc = 'sender_DESC',
  SenderDescNullsFirst = 'sender_DESC_NULLS_FIRST',
  SenderDescNullsLast = 'sender_DESC_NULLS_LAST',
  SwapPoolAprAsc = 'swapPool_apr_ASC',
  SwapPoolAprAscNullsFirst = 'swapPool_apr_ASC_NULLS_FIRST',
  SwapPoolAprAscNullsLast = 'swapPool_apr_ASC_NULLS_LAST',
  SwapPoolAprDesc = 'swapPool_apr_DESC',
  SwapPoolAprDescNullsFirst = 'swapPool_apr_DESC_NULLS_FIRST',
  SwapPoolAprDescNullsLast = 'swapPool_apr_DESC_NULLS_LAST',
  SwapPoolIdAsc = 'swapPool_id_ASC',
  SwapPoolIdAscNullsFirst = 'swapPool_id_ASC_NULLS_FIRST',
  SwapPoolIdAscNullsLast = 'swapPool_id_ASC_NULLS_LAST',
  SwapPoolIdDesc = 'swapPool_id_DESC',
  SwapPoolIdDescNullsFirst = 'swapPool_id_DESC_NULLS_FIRST',
  SwapPoolIdDescNullsLast = 'swapPool_id_DESC_NULLS_LAST',
  SwapPoolInsuranceFeeBpsAsc = 'swapPool_insuranceFeeBps_ASC',
  SwapPoolInsuranceFeeBpsAscNullsFirst = 'swapPool_insuranceFeeBps_ASC_NULLS_FIRST',
  SwapPoolInsuranceFeeBpsAscNullsLast = 'swapPool_insuranceFeeBps_ASC_NULLS_LAST',
  SwapPoolInsuranceFeeBpsDesc = 'swapPool_insuranceFeeBps_DESC',
  SwapPoolInsuranceFeeBpsDescNullsFirst = 'swapPool_insuranceFeeBps_DESC_NULLS_FIRST',
  SwapPoolInsuranceFeeBpsDescNullsLast = 'swapPool_insuranceFeeBps_DESC_NULLS_LAST',
  SwapPoolLpTokenDecimalsAsc = 'swapPool_lpTokenDecimals_ASC',
  SwapPoolLpTokenDecimalsAscNullsFirst = 'swapPool_lpTokenDecimals_ASC_NULLS_FIRST',
  SwapPoolLpTokenDecimalsAscNullsLast = 'swapPool_lpTokenDecimals_ASC_NULLS_LAST',
  SwapPoolLpTokenDecimalsDesc = 'swapPool_lpTokenDecimals_DESC',
  SwapPoolLpTokenDecimalsDescNullsFirst = 'swapPool_lpTokenDecimals_DESC_NULLS_FIRST',
  SwapPoolLpTokenDecimalsDescNullsLast = 'swapPool_lpTokenDecimals_DESC_NULLS_LAST',
  SwapPoolNameAsc = 'swapPool_name_ASC',
  SwapPoolNameAscNullsFirst = 'swapPool_name_ASC_NULLS_FIRST',
  SwapPoolNameAscNullsLast = 'swapPool_name_ASC_NULLS_LAST',
  SwapPoolNameDesc = 'swapPool_name_DESC',
  SwapPoolNameDescNullsFirst = 'swapPool_name_DESC_NULLS_FIRST',
  SwapPoolNameDescNullsLast = 'swapPool_name_DESC_NULLS_LAST',
  SwapPoolPausedAsc = 'swapPool_paused_ASC',
  SwapPoolPausedAscNullsFirst = 'swapPool_paused_ASC_NULLS_FIRST',
  SwapPoolPausedAscNullsLast = 'swapPool_paused_ASC_NULLS_LAST',
  SwapPoolPausedDesc = 'swapPool_paused_DESC',
  SwapPoolPausedDescNullsFirst = 'swapPool_paused_DESC_NULLS_FIRST',
  SwapPoolPausedDescNullsLast = 'swapPool_paused_DESC_NULLS_LAST',
  SwapPoolProtocolTreasuryAddressAsc = 'swapPool_protocolTreasuryAddress_ASC',
  SwapPoolProtocolTreasuryAddressAscNullsFirst = 'swapPool_protocolTreasuryAddress_ASC_NULLS_FIRST',
  SwapPoolProtocolTreasuryAddressAscNullsLast = 'swapPool_protocolTreasuryAddress_ASC_NULLS_LAST',
  SwapPoolProtocolTreasuryAddressDesc = 'swapPool_protocolTreasuryAddress_DESC',
  SwapPoolProtocolTreasuryAddressDescNullsFirst = 'swapPool_protocolTreasuryAddress_DESC_NULLS_FIRST',
  SwapPoolProtocolTreasuryAddressDescNullsLast = 'swapPool_protocolTreasuryAddress_DESC_NULLS_LAST',
  SwapPoolReserveWithSlippageAsc = 'swapPool_reserveWithSlippage_ASC',
  SwapPoolReserveWithSlippageAscNullsFirst = 'swapPool_reserveWithSlippage_ASC_NULLS_FIRST',
  SwapPoolReserveWithSlippageAscNullsLast = 'swapPool_reserveWithSlippage_ASC_NULLS_LAST',
  SwapPoolReserveWithSlippageDesc = 'swapPool_reserveWithSlippage_DESC',
  SwapPoolReserveWithSlippageDescNullsFirst = 'swapPool_reserveWithSlippage_DESC_NULLS_FIRST',
  SwapPoolReserveWithSlippageDescNullsLast = 'swapPool_reserveWithSlippage_DESC_NULLS_LAST',
  SwapPoolReserveAsc = 'swapPool_reserve_ASC',
  SwapPoolReserveAscNullsFirst = 'swapPool_reserve_ASC_NULLS_FIRST',
  SwapPoolReserveAscNullsLast = 'swapPool_reserve_ASC_NULLS_LAST',
  SwapPoolReserveDesc = 'swapPool_reserve_DESC',
  SwapPoolReserveDescNullsFirst = 'swapPool_reserve_DESC_NULLS_FIRST',
  SwapPoolReserveDescNullsLast = 'swapPool_reserve_DESC_NULLS_LAST',
  SwapPoolSymbolAsc = 'swapPool_symbol_ASC',
  SwapPoolSymbolAscNullsFirst = 'swapPool_symbol_ASC_NULLS_FIRST',
  SwapPoolSymbolAscNullsLast = 'swapPool_symbol_ASC_NULLS_LAST',
  SwapPoolSymbolDesc = 'swapPool_symbol_DESC',
  SwapPoolSymbolDescNullsFirst = 'swapPool_symbol_DESC_NULLS_FIRST',
  SwapPoolSymbolDescNullsLast = 'swapPool_symbol_DESC_NULLS_LAST',
  SwapPoolTotalLiabilitiesAsc = 'swapPool_totalLiabilities_ASC',
  SwapPoolTotalLiabilitiesAscNullsFirst = 'swapPool_totalLiabilities_ASC_NULLS_FIRST',
  SwapPoolTotalLiabilitiesAscNullsLast = 'swapPool_totalLiabilities_ASC_NULLS_LAST',
  SwapPoolTotalLiabilitiesDesc = 'swapPool_totalLiabilities_DESC',
  SwapPoolTotalLiabilitiesDescNullsFirst = 'swapPool_totalLiabilities_DESC_NULLS_FIRST',
  SwapPoolTotalLiabilitiesDescNullsLast = 'swapPool_totalLiabilities_DESC_NULLS_LAST',
  SwapPoolTotalSupplyAsc = 'swapPool_totalSupply_ASC',
  SwapPoolTotalSupplyAscNullsFirst = 'swapPool_totalSupply_ASC_NULLS_FIRST',
  SwapPoolTotalSupplyAscNullsLast = 'swapPool_totalSupply_ASC_NULLS_LAST',
  SwapPoolTotalSupplyDesc = 'swapPool_totalSupply_DESC',
  SwapPoolTotalSupplyDescNullsFirst = 'swapPool_totalSupply_DESC_NULLS_FIRST',
  SwapPoolTotalSupplyDescNullsLast = 'swapPool_totalSupply_DESC_NULLS_LAST',
  TimestampAsc = 'timestamp_ASC',
  TimestampAscNullsFirst = 'timestamp_ASC_NULLS_FIRST',
  TimestampAscNullsLast = 'timestamp_ASC_NULLS_LAST',
  TimestampDesc = 'timestamp_DESC',
  TimestampDescNullsFirst = 'timestamp_DESC_NULLS_FIRST',
  TimestampDescNullsLast = 'timestamp_DESC_NULLS_LAST'
}

export type NablaSwapLiquidityWithdrawalWhereInput = {
  AND?: InputMaybe<Array<NablaSwapLiquidityWithdrawalWhereInput>>;
  OR?: InputMaybe<Array<NablaSwapLiquidityWithdrawalWhereInput>>;
  amountPoolTokensWithdrawn_eq?: InputMaybe<Scalars['BigInt']['input']>;
  amountPoolTokensWithdrawn_gt?: InputMaybe<Scalars['BigInt']['input']>;
  amountPoolTokensWithdrawn_gte?: InputMaybe<Scalars['BigInt']['input']>;
  amountPoolTokensWithdrawn_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  amountPoolTokensWithdrawn_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  amountPoolTokensWithdrawn_lt?: InputMaybe<Scalars['BigInt']['input']>;
  amountPoolTokensWithdrawn_lte?: InputMaybe<Scalars['BigInt']['input']>;
  amountPoolTokensWithdrawn_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  amountPoolTokensWithdrawn_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
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
  poolSharesBurned_eq?: InputMaybe<Scalars['BigInt']['input']>;
  poolSharesBurned_gt?: InputMaybe<Scalars['BigInt']['input']>;
  poolSharesBurned_gte?: InputMaybe<Scalars['BigInt']['input']>;
  poolSharesBurned_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  poolSharesBurned_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  poolSharesBurned_lt?: InputMaybe<Scalars['BigInt']['input']>;
  poolSharesBurned_lte?: InputMaybe<Scalars['BigInt']['input']>;
  poolSharesBurned_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  poolSharesBurned_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
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
  swapPool?: InputMaybe<SwapPoolWhereInput>;
  swapPool_isNull?: InputMaybe<Scalars['Boolean']['input']>;
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

export type NablaSwapLiquidityWithdrawalsConnection = {
  __typename?: 'NablaSwapLiquidityWithdrawalsConnection';
  edges: Array<NablaSwapLiquidityWithdrawalEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export enum NablaSwapOrderByInput {
  AmountInAsc = 'amountIn_ASC',
  AmountInAscNullsFirst = 'amountIn_ASC_NULLS_FIRST',
  AmountInAscNullsLast = 'amountIn_ASC_NULLS_LAST',
  AmountInDesc = 'amountIn_DESC',
  AmountInDescNullsFirst = 'amountIn_DESC_NULLS_FIRST',
  AmountInDescNullsLast = 'amountIn_DESC_NULLS_LAST',
  AmountOutAsc = 'amountOut_ASC',
  AmountOutAscNullsFirst = 'amountOut_ASC_NULLS_FIRST',
  AmountOutAscNullsLast = 'amountOut_ASC_NULLS_LAST',
  AmountOutDesc = 'amountOut_DESC',
  AmountOutDescNullsFirst = 'amountOut_DESC_NULLS_FIRST',
  AmountOutDescNullsLast = 'amountOut_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  SenderAsc = 'sender_ASC',
  SenderAscNullsFirst = 'sender_ASC_NULLS_FIRST',
  SenderAscNullsLast = 'sender_ASC_NULLS_LAST',
  SenderDesc = 'sender_DESC',
  SenderDescNullsFirst = 'sender_DESC_NULLS_FIRST',
  SenderDescNullsLast = 'sender_DESC_NULLS_LAST',
  SwapFeeBackstopFeesAsc = 'swapFee_backstopFees_ASC',
  SwapFeeBackstopFeesAscNullsFirst = 'swapFee_backstopFees_ASC_NULLS_FIRST',
  SwapFeeBackstopFeesAscNullsLast = 'swapFee_backstopFees_ASC_NULLS_LAST',
  SwapFeeBackstopFeesDesc = 'swapFee_backstopFees_DESC',
  SwapFeeBackstopFeesDescNullsFirst = 'swapFee_backstopFees_DESC_NULLS_FIRST',
  SwapFeeBackstopFeesDescNullsLast = 'swapFee_backstopFees_DESC_NULLS_LAST',
  SwapFeeIdAsc = 'swapFee_id_ASC',
  SwapFeeIdAscNullsFirst = 'swapFee_id_ASC_NULLS_FIRST',
  SwapFeeIdAscNullsLast = 'swapFee_id_ASC_NULLS_LAST',
  SwapFeeIdDesc = 'swapFee_id_DESC',
  SwapFeeIdDescNullsFirst = 'swapFee_id_DESC_NULLS_FIRST',
  SwapFeeIdDescNullsLast = 'swapFee_id_DESC_NULLS_LAST',
  SwapFeeLpFeesAsc = 'swapFee_lpFees_ASC',
  SwapFeeLpFeesAscNullsFirst = 'swapFee_lpFees_ASC_NULLS_FIRST',
  SwapFeeLpFeesAscNullsLast = 'swapFee_lpFees_ASC_NULLS_LAST',
  SwapFeeLpFeesDesc = 'swapFee_lpFees_DESC',
  SwapFeeLpFeesDescNullsFirst = 'swapFee_lpFees_DESC_NULLS_FIRST',
  SwapFeeLpFeesDescNullsLast = 'swapFee_lpFees_DESC_NULLS_LAST',
  SwapFeeProtocolFeesAsc = 'swapFee_protocolFees_ASC',
  SwapFeeProtocolFeesAscNullsFirst = 'swapFee_protocolFees_ASC_NULLS_FIRST',
  SwapFeeProtocolFeesAscNullsLast = 'swapFee_protocolFees_ASC_NULLS_LAST',
  SwapFeeProtocolFeesDesc = 'swapFee_protocolFees_DESC',
  SwapFeeProtocolFeesDescNullsFirst = 'swapFee_protocolFees_DESC_NULLS_FIRST',
  SwapFeeProtocolFeesDescNullsLast = 'swapFee_protocolFees_DESC_NULLS_LAST',
  SwapFeeTimestampAsc = 'swapFee_timestamp_ASC',
  SwapFeeTimestampAscNullsFirst = 'swapFee_timestamp_ASC_NULLS_FIRST',
  SwapFeeTimestampAscNullsLast = 'swapFee_timestamp_ASC_NULLS_LAST',
  SwapFeeTimestampDesc = 'swapFee_timestamp_DESC',
  SwapFeeTimestampDescNullsFirst = 'swapFee_timestamp_DESC_NULLS_FIRST',
  SwapFeeTimestampDescNullsLast = 'swapFee_timestamp_DESC_NULLS_LAST',
  TimestampAsc = 'timestamp_ASC',
  TimestampAscNullsFirst = 'timestamp_ASC_NULLS_FIRST',
  TimestampAscNullsLast = 'timestamp_ASC_NULLS_LAST',
  TimestampDesc = 'timestamp_DESC',
  TimestampDescNullsFirst = 'timestamp_DESC_NULLS_FIRST',
  TimestampDescNullsLast = 'timestamp_DESC_NULLS_LAST',
  ToAsc = 'to_ASC',
  ToAscNullsFirst = 'to_ASC_NULLS_FIRST',
  ToAscNullsLast = 'to_ASC_NULLS_LAST',
  ToDesc = 'to_DESC',
  ToDescNullsFirst = 'to_DESC_NULLS_FIRST',
  ToDescNullsLast = 'to_DESC_NULLS_LAST',
  TokenInDecimalsAsc = 'tokenIn_decimals_ASC',
  TokenInDecimalsAscNullsFirst = 'tokenIn_decimals_ASC_NULLS_FIRST',
  TokenInDecimalsAscNullsLast = 'tokenIn_decimals_ASC_NULLS_LAST',
  TokenInDecimalsDesc = 'tokenIn_decimals_DESC',
  TokenInDecimalsDescNullsFirst = 'tokenIn_decimals_DESC_NULLS_FIRST',
  TokenInDecimalsDescNullsLast = 'tokenIn_decimals_DESC_NULLS_LAST',
  TokenInIdAsc = 'tokenIn_id_ASC',
  TokenInIdAscNullsFirst = 'tokenIn_id_ASC_NULLS_FIRST',
  TokenInIdAscNullsLast = 'tokenIn_id_ASC_NULLS_LAST',
  TokenInIdDesc = 'tokenIn_id_DESC',
  TokenInIdDescNullsFirst = 'tokenIn_id_DESC_NULLS_FIRST',
  TokenInIdDescNullsLast = 'tokenIn_id_DESC_NULLS_LAST',
  TokenInNameAsc = 'tokenIn_name_ASC',
  TokenInNameAscNullsFirst = 'tokenIn_name_ASC_NULLS_FIRST',
  TokenInNameAscNullsLast = 'tokenIn_name_ASC_NULLS_LAST',
  TokenInNameDesc = 'tokenIn_name_DESC',
  TokenInNameDescNullsFirst = 'tokenIn_name_DESC_NULLS_FIRST',
  TokenInNameDescNullsLast = 'tokenIn_name_DESC_NULLS_LAST',
  TokenInSymbolAsc = 'tokenIn_symbol_ASC',
  TokenInSymbolAscNullsFirst = 'tokenIn_symbol_ASC_NULLS_FIRST',
  TokenInSymbolAscNullsLast = 'tokenIn_symbol_ASC_NULLS_LAST',
  TokenInSymbolDesc = 'tokenIn_symbol_DESC',
  TokenInSymbolDescNullsFirst = 'tokenIn_symbol_DESC_NULLS_FIRST',
  TokenInSymbolDescNullsLast = 'tokenIn_symbol_DESC_NULLS_LAST',
  TokenOutDecimalsAsc = 'tokenOut_decimals_ASC',
  TokenOutDecimalsAscNullsFirst = 'tokenOut_decimals_ASC_NULLS_FIRST',
  TokenOutDecimalsAscNullsLast = 'tokenOut_decimals_ASC_NULLS_LAST',
  TokenOutDecimalsDesc = 'tokenOut_decimals_DESC',
  TokenOutDecimalsDescNullsFirst = 'tokenOut_decimals_DESC_NULLS_FIRST',
  TokenOutDecimalsDescNullsLast = 'tokenOut_decimals_DESC_NULLS_LAST',
  TokenOutIdAsc = 'tokenOut_id_ASC',
  TokenOutIdAscNullsFirst = 'tokenOut_id_ASC_NULLS_FIRST',
  TokenOutIdAscNullsLast = 'tokenOut_id_ASC_NULLS_LAST',
  TokenOutIdDesc = 'tokenOut_id_DESC',
  TokenOutIdDescNullsFirst = 'tokenOut_id_DESC_NULLS_FIRST',
  TokenOutIdDescNullsLast = 'tokenOut_id_DESC_NULLS_LAST',
  TokenOutNameAsc = 'tokenOut_name_ASC',
  TokenOutNameAscNullsFirst = 'tokenOut_name_ASC_NULLS_FIRST',
  TokenOutNameAscNullsLast = 'tokenOut_name_ASC_NULLS_LAST',
  TokenOutNameDesc = 'tokenOut_name_DESC',
  TokenOutNameDescNullsFirst = 'tokenOut_name_DESC_NULLS_FIRST',
  TokenOutNameDescNullsLast = 'tokenOut_name_DESC_NULLS_LAST',
  TokenOutSymbolAsc = 'tokenOut_symbol_ASC',
  TokenOutSymbolAscNullsFirst = 'tokenOut_symbol_ASC_NULLS_FIRST',
  TokenOutSymbolAscNullsLast = 'tokenOut_symbol_ASC_NULLS_LAST',
  TokenOutSymbolDesc = 'tokenOut_symbol_DESC',
  TokenOutSymbolDescNullsFirst = 'tokenOut_symbol_DESC_NULLS_FIRST',
  TokenOutSymbolDescNullsLast = 'tokenOut_symbol_DESC_NULLS_LAST'
}

export type NablaSwapWhereInput = {
  AND?: InputMaybe<Array<NablaSwapWhereInput>>;
  OR?: InputMaybe<Array<NablaSwapWhereInput>>;
  amountIn_eq?: InputMaybe<Scalars['BigInt']['input']>;
  amountIn_gt?: InputMaybe<Scalars['BigInt']['input']>;
  amountIn_gte?: InputMaybe<Scalars['BigInt']['input']>;
  amountIn_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  amountIn_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  amountIn_lt?: InputMaybe<Scalars['BigInt']['input']>;
  amountIn_lte?: InputMaybe<Scalars['BigInt']['input']>;
  amountIn_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  amountIn_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  amountOut_eq?: InputMaybe<Scalars['BigInt']['input']>;
  amountOut_gt?: InputMaybe<Scalars['BigInt']['input']>;
  amountOut_gte?: InputMaybe<Scalars['BigInt']['input']>;
  amountOut_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  amountOut_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  amountOut_lt?: InputMaybe<Scalars['BigInt']['input']>;
  amountOut_lte?: InputMaybe<Scalars['BigInt']['input']>;
  amountOut_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  amountOut_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
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
  swapFee?: InputMaybe<NablaSwapFeeWhereInput>;
  swapFee_isNull?: InputMaybe<Scalars['Boolean']['input']>;
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
  tokenIn?: InputMaybe<NablaTokenWhereInput>;
  tokenIn_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  tokenOut?: InputMaybe<NablaTokenWhereInput>;
  tokenOut_isNull?: InputMaybe<Scalars['Boolean']['input']>;
};

export type NablaSwapsConnection = {
  __typename?: 'NablaSwapsConnection';
  edges: Array<NablaSwapEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type NablaToken = {
  __typename?: 'NablaToken';
  decimals: Scalars['Int']['output'];
  id: Scalars['String']['output'];
  name: Scalars['String']['output'];
  swapPools: Array<SwapPool>;
  symbol: Scalars['String']['output'];
};


export type NablaTokenSwapPoolsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SwapPoolOrderByInput>>;
  where?: InputMaybe<SwapPoolWhereInput>;
};

export type NablaTokenEdge = {
  __typename?: 'NablaTokenEdge';
  cursor: Scalars['String']['output'];
  node: NablaToken;
};

export enum NablaTokenOrderByInput {
  DecimalsAsc = 'decimals_ASC',
  DecimalsAscNullsFirst = 'decimals_ASC_NULLS_FIRST',
  DecimalsAscNullsLast = 'decimals_ASC_NULLS_LAST',
  DecimalsDesc = 'decimals_DESC',
  DecimalsDescNullsFirst = 'decimals_DESC_NULLS_FIRST',
  DecimalsDescNullsLast = 'decimals_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  NameAsc = 'name_ASC',
  NameAscNullsFirst = 'name_ASC_NULLS_FIRST',
  NameAscNullsLast = 'name_ASC_NULLS_LAST',
  NameDesc = 'name_DESC',
  NameDescNullsFirst = 'name_DESC_NULLS_FIRST',
  NameDescNullsLast = 'name_DESC_NULLS_LAST',
  SymbolAsc = 'symbol_ASC',
  SymbolAscNullsFirst = 'symbol_ASC_NULLS_FIRST',
  SymbolAscNullsLast = 'symbol_ASC_NULLS_LAST',
  SymbolDesc = 'symbol_DESC',
  SymbolDescNullsFirst = 'symbol_DESC_NULLS_FIRST',
  SymbolDescNullsLast = 'symbol_DESC_NULLS_LAST'
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
  swapPools_every?: InputMaybe<SwapPoolWhereInput>;
  swapPools_none?: InputMaybe<SwapPoolWhereInput>;
  swapPools_some?: InputMaybe<SwapPoolWhereInput>;
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
  decimals: Scalars['Int']['output'];
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
  BlockchainAscNullsFirst = 'blockchain_ASC_NULLS_FIRST',
  BlockchainAscNullsLast = 'blockchain_ASC_NULLS_LAST',
  BlockchainDesc = 'blockchain_DESC',
  BlockchainDescNullsFirst = 'blockchain_DESC_NULLS_FIRST',
  BlockchainDescNullsLast = 'blockchain_DESC_NULLS_LAST',
  DecimalsAsc = 'decimals_ASC',
  DecimalsAscNullsFirst = 'decimals_ASC_NULLS_FIRST',
  DecimalsAscNullsLast = 'decimals_ASC_NULLS_LAST',
  DecimalsDesc = 'decimals_DESC',
  DecimalsDescNullsFirst = 'decimals_DESC_NULLS_FIRST',
  DecimalsDescNullsLast = 'decimals_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  NameAsc = 'name_ASC',
  NameAscNullsFirst = 'name_ASC_NULLS_FIRST',
  NameAscNullsLast = 'name_ASC_NULLS_LAST',
  NameDesc = 'name_DESC',
  NameDescNullsFirst = 'name_DESC_NULLS_FIRST',
  NameDescNullsLast = 'name_DESC_NULLS_LAST',
  PriceAsc = 'price_ASC',
  PriceAscNullsFirst = 'price_ASC_NULLS_FIRST',
  PriceAscNullsLast = 'price_ASC_NULLS_LAST',
  PriceDesc = 'price_DESC',
  PriceDescNullsFirst = 'price_DESC_NULLS_FIRST',
  PriceDescNullsLast = 'price_DESC_NULLS_LAST',
  SupplyAsc = 'supply_ASC',
  SupplyAscNullsFirst = 'supply_ASC_NULLS_FIRST',
  SupplyAscNullsLast = 'supply_ASC_NULLS_LAST',
  SupplyDesc = 'supply_DESC',
  SupplyDescNullsFirst = 'supply_DESC_NULLS_FIRST',
  SupplyDescNullsLast = 'supply_DESC_NULLS_LAST',
  SymbolAsc = 'symbol_ASC',
  SymbolAscNullsFirst = 'symbol_ASC_NULLS_FIRST',
  SymbolAscNullsLast = 'symbol_ASC_NULLS_LAST',
  SymbolDesc = 'symbol_DESC',
  SymbolDescNullsFirst = 'symbol_DESC_NULLS_FIRST',
  SymbolDescNullsLast = 'symbol_DESC_NULLS_LAST',
  TimestampAsc = 'timestamp_ASC',
  TimestampAscNullsFirst = 'timestamp_ASC_NULLS_FIRST',
  TimestampAscNullsLast = 'timestamp_ASC_NULLS_LAST',
  TimestampDesc = 'timestamp_DESC',
  TimestampDescNullsFirst = 'timestamp_DESC_NULLS_FIRST',
  TimestampDescNullsLast = 'timestamp_DESC_NULLS_LAST'
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
  DailyTxnsAscNullsFirst = 'dailyTxns_ASC_NULLS_FIRST',
  DailyTxnsAscNullsLast = 'dailyTxns_ASC_NULLS_LAST',
  DailyTxnsDesc = 'dailyTxns_DESC',
  DailyTxnsDescNullsFirst = 'dailyTxns_DESC_NULLS_FIRST',
  DailyTxnsDescNullsLast = 'dailyTxns_DESC_NULLS_LAST',
  DailyVolumeToken0Asc = 'dailyVolumeToken0_ASC',
  DailyVolumeToken0AscNullsFirst = 'dailyVolumeToken0_ASC_NULLS_FIRST',
  DailyVolumeToken0AscNullsLast = 'dailyVolumeToken0_ASC_NULLS_LAST',
  DailyVolumeToken0Desc = 'dailyVolumeToken0_DESC',
  DailyVolumeToken0DescNullsFirst = 'dailyVolumeToken0_DESC_NULLS_FIRST',
  DailyVolumeToken0DescNullsLast = 'dailyVolumeToken0_DESC_NULLS_LAST',
  DailyVolumeToken1Asc = 'dailyVolumeToken1_ASC',
  DailyVolumeToken1AscNullsFirst = 'dailyVolumeToken1_ASC_NULLS_FIRST',
  DailyVolumeToken1AscNullsLast = 'dailyVolumeToken1_ASC_NULLS_LAST',
  DailyVolumeToken1Desc = 'dailyVolumeToken1_DESC',
  DailyVolumeToken1DescNullsFirst = 'dailyVolumeToken1_DESC_NULLS_FIRST',
  DailyVolumeToken1DescNullsLast = 'dailyVolumeToken1_DESC_NULLS_LAST',
  DailyVolumeUsdAsc = 'dailyVolumeUSD_ASC',
  DailyVolumeUsdAscNullsFirst = 'dailyVolumeUSD_ASC_NULLS_FIRST',
  DailyVolumeUsdAscNullsLast = 'dailyVolumeUSD_ASC_NULLS_LAST',
  DailyVolumeUsdDesc = 'dailyVolumeUSD_DESC',
  DailyVolumeUsdDescNullsFirst = 'dailyVolumeUSD_DESC_NULLS_FIRST',
  DailyVolumeUsdDescNullsLast = 'dailyVolumeUSD_DESC_NULLS_LAST',
  DateAsc = 'date_ASC',
  DateAscNullsFirst = 'date_ASC_NULLS_FIRST',
  DateAscNullsLast = 'date_ASC_NULLS_LAST',
  DateDesc = 'date_DESC',
  DateDescNullsFirst = 'date_DESC_NULLS_FIRST',
  DateDescNullsLast = 'date_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  PairAddressAsc = 'pairAddress_ASC',
  PairAddressAscNullsFirst = 'pairAddress_ASC_NULLS_FIRST',
  PairAddressAscNullsLast = 'pairAddress_ASC_NULLS_LAST',
  PairAddressDesc = 'pairAddress_DESC',
  PairAddressDescNullsFirst = 'pairAddress_DESC_NULLS_FIRST',
  PairAddressDescNullsLast = 'pairAddress_DESC_NULLS_LAST',
  PairCreatedAtBlockNumberAsc = 'pair_createdAtBlockNumber_ASC',
  PairCreatedAtBlockNumberAscNullsFirst = 'pair_createdAtBlockNumber_ASC_NULLS_FIRST',
  PairCreatedAtBlockNumberAscNullsLast = 'pair_createdAtBlockNumber_ASC_NULLS_LAST',
  PairCreatedAtBlockNumberDesc = 'pair_createdAtBlockNumber_DESC',
  PairCreatedAtBlockNumberDescNullsFirst = 'pair_createdAtBlockNumber_DESC_NULLS_FIRST',
  PairCreatedAtBlockNumberDescNullsLast = 'pair_createdAtBlockNumber_DESC_NULLS_LAST',
  PairCreatedAtTimestampAsc = 'pair_createdAtTimestamp_ASC',
  PairCreatedAtTimestampAscNullsFirst = 'pair_createdAtTimestamp_ASC_NULLS_FIRST',
  PairCreatedAtTimestampAscNullsLast = 'pair_createdAtTimestamp_ASC_NULLS_LAST',
  PairCreatedAtTimestampDesc = 'pair_createdAtTimestamp_DESC',
  PairCreatedAtTimestampDescNullsFirst = 'pair_createdAtTimestamp_DESC_NULLS_FIRST',
  PairCreatedAtTimestampDescNullsLast = 'pair_createdAtTimestamp_DESC_NULLS_LAST',
  PairIdAsc = 'pair_id_ASC',
  PairIdAscNullsFirst = 'pair_id_ASC_NULLS_FIRST',
  PairIdAscNullsLast = 'pair_id_ASC_NULLS_LAST',
  PairIdDesc = 'pair_id_DESC',
  PairIdDescNullsFirst = 'pair_id_DESC_NULLS_FIRST',
  PairIdDescNullsLast = 'pair_id_DESC_NULLS_LAST',
  PairLiquidityProviderCountAsc = 'pair_liquidityProviderCount_ASC',
  PairLiquidityProviderCountAscNullsFirst = 'pair_liquidityProviderCount_ASC_NULLS_FIRST',
  PairLiquidityProviderCountAscNullsLast = 'pair_liquidityProviderCount_ASC_NULLS_LAST',
  PairLiquidityProviderCountDesc = 'pair_liquidityProviderCount_DESC',
  PairLiquidityProviderCountDescNullsFirst = 'pair_liquidityProviderCount_DESC_NULLS_FIRST',
  PairLiquidityProviderCountDescNullsLast = 'pair_liquidityProviderCount_DESC_NULLS_LAST',
  PairReserve0Asc = 'pair_reserve0_ASC',
  PairReserve0AscNullsFirst = 'pair_reserve0_ASC_NULLS_FIRST',
  PairReserve0AscNullsLast = 'pair_reserve0_ASC_NULLS_LAST',
  PairReserve0Desc = 'pair_reserve0_DESC',
  PairReserve0DescNullsFirst = 'pair_reserve0_DESC_NULLS_FIRST',
  PairReserve0DescNullsLast = 'pair_reserve0_DESC_NULLS_LAST',
  PairReserve1Asc = 'pair_reserve1_ASC',
  PairReserve1AscNullsFirst = 'pair_reserve1_ASC_NULLS_FIRST',
  PairReserve1AscNullsLast = 'pair_reserve1_ASC_NULLS_LAST',
  PairReserve1Desc = 'pair_reserve1_DESC',
  PairReserve1DescNullsFirst = 'pair_reserve1_DESC_NULLS_FIRST',
  PairReserve1DescNullsLast = 'pair_reserve1_DESC_NULLS_LAST',
  PairReserveEthAsc = 'pair_reserveETH_ASC',
  PairReserveEthAscNullsFirst = 'pair_reserveETH_ASC_NULLS_FIRST',
  PairReserveEthAscNullsLast = 'pair_reserveETH_ASC_NULLS_LAST',
  PairReserveEthDesc = 'pair_reserveETH_DESC',
  PairReserveEthDescNullsFirst = 'pair_reserveETH_DESC_NULLS_FIRST',
  PairReserveEthDescNullsLast = 'pair_reserveETH_DESC_NULLS_LAST',
  PairReserveUsdAsc = 'pair_reserveUSD_ASC',
  PairReserveUsdAscNullsFirst = 'pair_reserveUSD_ASC_NULLS_FIRST',
  PairReserveUsdAscNullsLast = 'pair_reserveUSD_ASC_NULLS_LAST',
  PairReserveUsdDesc = 'pair_reserveUSD_DESC',
  PairReserveUsdDescNullsFirst = 'pair_reserveUSD_DESC_NULLS_FIRST',
  PairReserveUsdDescNullsLast = 'pair_reserveUSD_DESC_NULLS_LAST',
  PairToken0PriceAsc = 'pair_token0Price_ASC',
  PairToken0PriceAscNullsFirst = 'pair_token0Price_ASC_NULLS_FIRST',
  PairToken0PriceAscNullsLast = 'pair_token0Price_ASC_NULLS_LAST',
  PairToken0PriceDesc = 'pair_token0Price_DESC',
  PairToken0PriceDescNullsFirst = 'pair_token0Price_DESC_NULLS_FIRST',
  PairToken0PriceDescNullsLast = 'pair_token0Price_DESC_NULLS_LAST',
  PairToken1PriceAsc = 'pair_token1Price_ASC',
  PairToken1PriceAscNullsFirst = 'pair_token1Price_ASC_NULLS_FIRST',
  PairToken1PriceAscNullsLast = 'pair_token1Price_ASC_NULLS_LAST',
  PairToken1PriceDesc = 'pair_token1Price_DESC',
  PairToken1PriceDescNullsFirst = 'pair_token1Price_DESC_NULLS_FIRST',
  PairToken1PriceDescNullsLast = 'pair_token1Price_DESC_NULLS_LAST',
  PairTotalSupplyAsc = 'pair_totalSupply_ASC',
  PairTotalSupplyAscNullsFirst = 'pair_totalSupply_ASC_NULLS_FIRST',
  PairTotalSupplyAscNullsLast = 'pair_totalSupply_ASC_NULLS_LAST',
  PairTotalSupplyDesc = 'pair_totalSupply_DESC',
  PairTotalSupplyDescNullsFirst = 'pair_totalSupply_DESC_NULLS_FIRST',
  PairTotalSupplyDescNullsLast = 'pair_totalSupply_DESC_NULLS_LAST',
  PairTrackedReserveEthAsc = 'pair_trackedReserveETH_ASC',
  PairTrackedReserveEthAscNullsFirst = 'pair_trackedReserveETH_ASC_NULLS_FIRST',
  PairTrackedReserveEthAscNullsLast = 'pair_trackedReserveETH_ASC_NULLS_LAST',
  PairTrackedReserveEthDesc = 'pair_trackedReserveETH_DESC',
  PairTrackedReserveEthDescNullsFirst = 'pair_trackedReserveETH_DESC_NULLS_FIRST',
  PairTrackedReserveEthDescNullsLast = 'pair_trackedReserveETH_DESC_NULLS_LAST',
  PairTxCountAsc = 'pair_txCount_ASC',
  PairTxCountAscNullsFirst = 'pair_txCount_ASC_NULLS_FIRST',
  PairTxCountAscNullsLast = 'pair_txCount_ASC_NULLS_LAST',
  PairTxCountDesc = 'pair_txCount_DESC',
  PairTxCountDescNullsFirst = 'pair_txCount_DESC_NULLS_FIRST',
  PairTxCountDescNullsLast = 'pair_txCount_DESC_NULLS_LAST',
  PairUntrackedVolumeUsdAsc = 'pair_untrackedVolumeUSD_ASC',
  PairUntrackedVolumeUsdAscNullsFirst = 'pair_untrackedVolumeUSD_ASC_NULLS_FIRST',
  PairUntrackedVolumeUsdAscNullsLast = 'pair_untrackedVolumeUSD_ASC_NULLS_LAST',
  PairUntrackedVolumeUsdDesc = 'pair_untrackedVolumeUSD_DESC',
  PairUntrackedVolumeUsdDescNullsFirst = 'pair_untrackedVolumeUSD_DESC_NULLS_FIRST',
  PairUntrackedVolumeUsdDescNullsLast = 'pair_untrackedVolumeUSD_DESC_NULLS_LAST',
  PairVolumeToken0Asc = 'pair_volumeToken0_ASC',
  PairVolumeToken0AscNullsFirst = 'pair_volumeToken0_ASC_NULLS_FIRST',
  PairVolumeToken0AscNullsLast = 'pair_volumeToken0_ASC_NULLS_LAST',
  PairVolumeToken0Desc = 'pair_volumeToken0_DESC',
  PairVolumeToken0DescNullsFirst = 'pair_volumeToken0_DESC_NULLS_FIRST',
  PairVolumeToken0DescNullsLast = 'pair_volumeToken0_DESC_NULLS_LAST',
  PairVolumeToken1Asc = 'pair_volumeToken1_ASC',
  PairVolumeToken1AscNullsFirst = 'pair_volumeToken1_ASC_NULLS_FIRST',
  PairVolumeToken1AscNullsLast = 'pair_volumeToken1_ASC_NULLS_LAST',
  PairVolumeToken1Desc = 'pair_volumeToken1_DESC',
  PairVolumeToken1DescNullsFirst = 'pair_volumeToken1_DESC_NULLS_FIRST',
  PairVolumeToken1DescNullsLast = 'pair_volumeToken1_DESC_NULLS_LAST',
  PairVolumeUsdAsc = 'pair_volumeUSD_ASC',
  PairVolumeUsdAscNullsFirst = 'pair_volumeUSD_ASC_NULLS_FIRST',
  PairVolumeUsdAscNullsLast = 'pair_volumeUSD_ASC_NULLS_LAST',
  PairVolumeUsdDesc = 'pair_volumeUSD_DESC',
  PairVolumeUsdDescNullsFirst = 'pair_volumeUSD_DESC_NULLS_FIRST',
  PairVolumeUsdDescNullsLast = 'pair_volumeUSD_DESC_NULLS_LAST',
  Reserve0Asc = 'reserve0_ASC',
  Reserve0AscNullsFirst = 'reserve0_ASC_NULLS_FIRST',
  Reserve0AscNullsLast = 'reserve0_ASC_NULLS_LAST',
  Reserve0Desc = 'reserve0_DESC',
  Reserve0DescNullsFirst = 'reserve0_DESC_NULLS_FIRST',
  Reserve0DescNullsLast = 'reserve0_DESC_NULLS_LAST',
  Reserve1Asc = 'reserve1_ASC',
  Reserve1AscNullsFirst = 'reserve1_ASC_NULLS_FIRST',
  Reserve1AscNullsLast = 'reserve1_ASC_NULLS_LAST',
  Reserve1Desc = 'reserve1_DESC',
  Reserve1DescNullsFirst = 'reserve1_DESC_NULLS_FIRST',
  Reserve1DescNullsLast = 'reserve1_DESC_NULLS_LAST',
  ReserveUsdAsc = 'reserveUSD_ASC',
  ReserveUsdAscNullsFirst = 'reserveUSD_ASC_NULLS_FIRST',
  ReserveUsdAscNullsLast = 'reserveUSD_ASC_NULLS_LAST',
  ReserveUsdDesc = 'reserveUSD_DESC',
  ReserveUsdDescNullsFirst = 'reserveUSD_DESC_NULLS_FIRST',
  ReserveUsdDescNullsLast = 'reserveUSD_DESC_NULLS_LAST',
  Token0DecimalsAsc = 'token0_decimals_ASC',
  Token0DecimalsAscNullsFirst = 'token0_decimals_ASC_NULLS_FIRST',
  Token0DecimalsAscNullsLast = 'token0_decimals_ASC_NULLS_LAST',
  Token0DecimalsDesc = 'token0_decimals_DESC',
  Token0DecimalsDescNullsFirst = 'token0_decimals_DESC_NULLS_FIRST',
  Token0DecimalsDescNullsLast = 'token0_decimals_DESC_NULLS_LAST',
  Token0DerivedEthAsc = 'token0_derivedETH_ASC',
  Token0DerivedEthAscNullsFirst = 'token0_derivedETH_ASC_NULLS_FIRST',
  Token0DerivedEthAscNullsLast = 'token0_derivedETH_ASC_NULLS_LAST',
  Token0DerivedEthDesc = 'token0_derivedETH_DESC',
  Token0DerivedEthDescNullsFirst = 'token0_derivedETH_DESC_NULLS_FIRST',
  Token0DerivedEthDescNullsLast = 'token0_derivedETH_DESC_NULLS_LAST',
  Token0IdAsc = 'token0_id_ASC',
  Token0IdAscNullsFirst = 'token0_id_ASC_NULLS_FIRST',
  Token0IdAscNullsLast = 'token0_id_ASC_NULLS_LAST',
  Token0IdDesc = 'token0_id_DESC',
  Token0IdDescNullsFirst = 'token0_id_DESC_NULLS_FIRST',
  Token0IdDescNullsLast = 'token0_id_DESC_NULLS_LAST',
  Token0NameAsc = 'token0_name_ASC',
  Token0NameAscNullsFirst = 'token0_name_ASC_NULLS_FIRST',
  Token0NameAscNullsLast = 'token0_name_ASC_NULLS_LAST',
  Token0NameDesc = 'token0_name_DESC',
  Token0NameDescNullsFirst = 'token0_name_DESC_NULLS_FIRST',
  Token0NameDescNullsLast = 'token0_name_DESC_NULLS_LAST',
  Token0SymbolAsc = 'token0_symbol_ASC',
  Token0SymbolAscNullsFirst = 'token0_symbol_ASC_NULLS_FIRST',
  Token0SymbolAscNullsLast = 'token0_symbol_ASC_NULLS_LAST',
  Token0SymbolDesc = 'token0_symbol_DESC',
  Token0SymbolDescNullsFirst = 'token0_symbol_DESC_NULLS_FIRST',
  Token0SymbolDescNullsLast = 'token0_symbol_DESC_NULLS_LAST',
  Token0TotalLiquidityAsc = 'token0_totalLiquidity_ASC',
  Token0TotalLiquidityAscNullsFirst = 'token0_totalLiquidity_ASC_NULLS_FIRST',
  Token0TotalLiquidityAscNullsLast = 'token0_totalLiquidity_ASC_NULLS_LAST',
  Token0TotalLiquidityDesc = 'token0_totalLiquidity_DESC',
  Token0TotalLiquidityDescNullsFirst = 'token0_totalLiquidity_DESC_NULLS_FIRST',
  Token0TotalLiquidityDescNullsLast = 'token0_totalLiquidity_DESC_NULLS_LAST',
  Token0TotalSupplyAsc = 'token0_totalSupply_ASC',
  Token0TotalSupplyAscNullsFirst = 'token0_totalSupply_ASC_NULLS_FIRST',
  Token0TotalSupplyAscNullsLast = 'token0_totalSupply_ASC_NULLS_LAST',
  Token0TotalSupplyDesc = 'token0_totalSupply_DESC',
  Token0TotalSupplyDescNullsFirst = 'token0_totalSupply_DESC_NULLS_FIRST',
  Token0TotalSupplyDescNullsLast = 'token0_totalSupply_DESC_NULLS_LAST',
  Token0TradeVolumeUsdAsc = 'token0_tradeVolumeUSD_ASC',
  Token0TradeVolumeUsdAscNullsFirst = 'token0_tradeVolumeUSD_ASC_NULLS_FIRST',
  Token0TradeVolumeUsdAscNullsLast = 'token0_tradeVolumeUSD_ASC_NULLS_LAST',
  Token0TradeVolumeUsdDesc = 'token0_tradeVolumeUSD_DESC',
  Token0TradeVolumeUsdDescNullsFirst = 'token0_tradeVolumeUSD_DESC_NULLS_FIRST',
  Token0TradeVolumeUsdDescNullsLast = 'token0_tradeVolumeUSD_DESC_NULLS_LAST',
  Token0TradeVolumeAsc = 'token0_tradeVolume_ASC',
  Token0TradeVolumeAscNullsFirst = 'token0_tradeVolume_ASC_NULLS_FIRST',
  Token0TradeVolumeAscNullsLast = 'token0_tradeVolume_ASC_NULLS_LAST',
  Token0TradeVolumeDesc = 'token0_tradeVolume_DESC',
  Token0TradeVolumeDescNullsFirst = 'token0_tradeVolume_DESC_NULLS_FIRST',
  Token0TradeVolumeDescNullsLast = 'token0_tradeVolume_DESC_NULLS_LAST',
  Token0TxCountAsc = 'token0_txCount_ASC',
  Token0TxCountAscNullsFirst = 'token0_txCount_ASC_NULLS_FIRST',
  Token0TxCountAscNullsLast = 'token0_txCount_ASC_NULLS_LAST',
  Token0TxCountDesc = 'token0_txCount_DESC',
  Token0TxCountDescNullsFirst = 'token0_txCount_DESC_NULLS_FIRST',
  Token0TxCountDescNullsLast = 'token0_txCount_DESC_NULLS_LAST',
  Token0UntrackedVolumeUsdAsc = 'token0_untrackedVolumeUSD_ASC',
  Token0UntrackedVolumeUsdAscNullsFirst = 'token0_untrackedVolumeUSD_ASC_NULLS_FIRST',
  Token0UntrackedVolumeUsdAscNullsLast = 'token0_untrackedVolumeUSD_ASC_NULLS_LAST',
  Token0UntrackedVolumeUsdDesc = 'token0_untrackedVolumeUSD_DESC',
  Token0UntrackedVolumeUsdDescNullsFirst = 'token0_untrackedVolumeUSD_DESC_NULLS_FIRST',
  Token0UntrackedVolumeUsdDescNullsLast = 'token0_untrackedVolumeUSD_DESC_NULLS_LAST',
  Token1DecimalsAsc = 'token1_decimals_ASC',
  Token1DecimalsAscNullsFirst = 'token1_decimals_ASC_NULLS_FIRST',
  Token1DecimalsAscNullsLast = 'token1_decimals_ASC_NULLS_LAST',
  Token1DecimalsDesc = 'token1_decimals_DESC',
  Token1DecimalsDescNullsFirst = 'token1_decimals_DESC_NULLS_FIRST',
  Token1DecimalsDescNullsLast = 'token1_decimals_DESC_NULLS_LAST',
  Token1DerivedEthAsc = 'token1_derivedETH_ASC',
  Token1DerivedEthAscNullsFirst = 'token1_derivedETH_ASC_NULLS_FIRST',
  Token1DerivedEthAscNullsLast = 'token1_derivedETH_ASC_NULLS_LAST',
  Token1DerivedEthDesc = 'token1_derivedETH_DESC',
  Token1DerivedEthDescNullsFirst = 'token1_derivedETH_DESC_NULLS_FIRST',
  Token1DerivedEthDescNullsLast = 'token1_derivedETH_DESC_NULLS_LAST',
  Token1IdAsc = 'token1_id_ASC',
  Token1IdAscNullsFirst = 'token1_id_ASC_NULLS_FIRST',
  Token1IdAscNullsLast = 'token1_id_ASC_NULLS_LAST',
  Token1IdDesc = 'token1_id_DESC',
  Token1IdDescNullsFirst = 'token1_id_DESC_NULLS_FIRST',
  Token1IdDescNullsLast = 'token1_id_DESC_NULLS_LAST',
  Token1NameAsc = 'token1_name_ASC',
  Token1NameAscNullsFirst = 'token1_name_ASC_NULLS_FIRST',
  Token1NameAscNullsLast = 'token1_name_ASC_NULLS_LAST',
  Token1NameDesc = 'token1_name_DESC',
  Token1NameDescNullsFirst = 'token1_name_DESC_NULLS_FIRST',
  Token1NameDescNullsLast = 'token1_name_DESC_NULLS_LAST',
  Token1SymbolAsc = 'token1_symbol_ASC',
  Token1SymbolAscNullsFirst = 'token1_symbol_ASC_NULLS_FIRST',
  Token1SymbolAscNullsLast = 'token1_symbol_ASC_NULLS_LAST',
  Token1SymbolDesc = 'token1_symbol_DESC',
  Token1SymbolDescNullsFirst = 'token1_symbol_DESC_NULLS_FIRST',
  Token1SymbolDescNullsLast = 'token1_symbol_DESC_NULLS_LAST',
  Token1TotalLiquidityAsc = 'token1_totalLiquidity_ASC',
  Token1TotalLiquidityAscNullsFirst = 'token1_totalLiquidity_ASC_NULLS_FIRST',
  Token1TotalLiquidityAscNullsLast = 'token1_totalLiquidity_ASC_NULLS_LAST',
  Token1TotalLiquidityDesc = 'token1_totalLiquidity_DESC',
  Token1TotalLiquidityDescNullsFirst = 'token1_totalLiquidity_DESC_NULLS_FIRST',
  Token1TotalLiquidityDescNullsLast = 'token1_totalLiquidity_DESC_NULLS_LAST',
  Token1TotalSupplyAsc = 'token1_totalSupply_ASC',
  Token1TotalSupplyAscNullsFirst = 'token1_totalSupply_ASC_NULLS_FIRST',
  Token1TotalSupplyAscNullsLast = 'token1_totalSupply_ASC_NULLS_LAST',
  Token1TotalSupplyDesc = 'token1_totalSupply_DESC',
  Token1TotalSupplyDescNullsFirst = 'token1_totalSupply_DESC_NULLS_FIRST',
  Token1TotalSupplyDescNullsLast = 'token1_totalSupply_DESC_NULLS_LAST',
  Token1TradeVolumeUsdAsc = 'token1_tradeVolumeUSD_ASC',
  Token1TradeVolumeUsdAscNullsFirst = 'token1_tradeVolumeUSD_ASC_NULLS_FIRST',
  Token1TradeVolumeUsdAscNullsLast = 'token1_tradeVolumeUSD_ASC_NULLS_LAST',
  Token1TradeVolumeUsdDesc = 'token1_tradeVolumeUSD_DESC',
  Token1TradeVolumeUsdDescNullsFirst = 'token1_tradeVolumeUSD_DESC_NULLS_FIRST',
  Token1TradeVolumeUsdDescNullsLast = 'token1_tradeVolumeUSD_DESC_NULLS_LAST',
  Token1TradeVolumeAsc = 'token1_tradeVolume_ASC',
  Token1TradeVolumeAscNullsFirst = 'token1_tradeVolume_ASC_NULLS_FIRST',
  Token1TradeVolumeAscNullsLast = 'token1_tradeVolume_ASC_NULLS_LAST',
  Token1TradeVolumeDesc = 'token1_tradeVolume_DESC',
  Token1TradeVolumeDescNullsFirst = 'token1_tradeVolume_DESC_NULLS_FIRST',
  Token1TradeVolumeDescNullsLast = 'token1_tradeVolume_DESC_NULLS_LAST',
  Token1TxCountAsc = 'token1_txCount_ASC',
  Token1TxCountAscNullsFirst = 'token1_txCount_ASC_NULLS_FIRST',
  Token1TxCountAscNullsLast = 'token1_txCount_ASC_NULLS_LAST',
  Token1TxCountDesc = 'token1_txCount_DESC',
  Token1TxCountDescNullsFirst = 'token1_txCount_DESC_NULLS_FIRST',
  Token1TxCountDescNullsLast = 'token1_txCount_DESC_NULLS_LAST',
  Token1UntrackedVolumeUsdAsc = 'token1_untrackedVolumeUSD_ASC',
  Token1UntrackedVolumeUsdAscNullsFirst = 'token1_untrackedVolumeUSD_ASC_NULLS_FIRST',
  Token1UntrackedVolumeUsdAscNullsLast = 'token1_untrackedVolumeUSD_ASC_NULLS_LAST',
  Token1UntrackedVolumeUsdDesc = 'token1_untrackedVolumeUSD_DESC',
  Token1UntrackedVolumeUsdDescNullsFirst = 'token1_untrackedVolumeUSD_DESC_NULLS_FIRST',
  Token1UntrackedVolumeUsdDescNullsLast = 'token1_untrackedVolumeUSD_DESC_NULLS_LAST',
  TotalSupplyAsc = 'totalSupply_ASC',
  TotalSupplyAscNullsFirst = 'totalSupply_ASC_NULLS_FIRST',
  TotalSupplyAscNullsLast = 'totalSupply_ASC_NULLS_LAST',
  TotalSupplyDesc = 'totalSupply_DESC',
  TotalSupplyDescNullsFirst = 'totalSupply_DESC_NULLS_FIRST',
  TotalSupplyDescNullsLast = 'totalSupply_DESC_NULLS_LAST'
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
  HourStartUnixAscNullsFirst = 'hourStartUnix_ASC_NULLS_FIRST',
  HourStartUnixAscNullsLast = 'hourStartUnix_ASC_NULLS_LAST',
  HourStartUnixDesc = 'hourStartUnix_DESC',
  HourStartUnixDescNullsFirst = 'hourStartUnix_DESC_NULLS_FIRST',
  HourStartUnixDescNullsLast = 'hourStartUnix_DESC_NULLS_LAST',
  HourlyTxnsAsc = 'hourlyTxns_ASC',
  HourlyTxnsAscNullsFirst = 'hourlyTxns_ASC_NULLS_FIRST',
  HourlyTxnsAscNullsLast = 'hourlyTxns_ASC_NULLS_LAST',
  HourlyTxnsDesc = 'hourlyTxns_DESC',
  HourlyTxnsDescNullsFirst = 'hourlyTxns_DESC_NULLS_FIRST',
  HourlyTxnsDescNullsLast = 'hourlyTxns_DESC_NULLS_LAST',
  HourlyVolumeToken0Asc = 'hourlyVolumeToken0_ASC',
  HourlyVolumeToken0AscNullsFirst = 'hourlyVolumeToken0_ASC_NULLS_FIRST',
  HourlyVolumeToken0AscNullsLast = 'hourlyVolumeToken0_ASC_NULLS_LAST',
  HourlyVolumeToken0Desc = 'hourlyVolumeToken0_DESC',
  HourlyVolumeToken0DescNullsFirst = 'hourlyVolumeToken0_DESC_NULLS_FIRST',
  HourlyVolumeToken0DescNullsLast = 'hourlyVolumeToken0_DESC_NULLS_LAST',
  HourlyVolumeToken1Asc = 'hourlyVolumeToken1_ASC',
  HourlyVolumeToken1AscNullsFirst = 'hourlyVolumeToken1_ASC_NULLS_FIRST',
  HourlyVolumeToken1AscNullsLast = 'hourlyVolumeToken1_ASC_NULLS_LAST',
  HourlyVolumeToken1Desc = 'hourlyVolumeToken1_DESC',
  HourlyVolumeToken1DescNullsFirst = 'hourlyVolumeToken1_DESC_NULLS_FIRST',
  HourlyVolumeToken1DescNullsLast = 'hourlyVolumeToken1_DESC_NULLS_LAST',
  HourlyVolumeUsdAsc = 'hourlyVolumeUSD_ASC',
  HourlyVolumeUsdAscNullsFirst = 'hourlyVolumeUSD_ASC_NULLS_FIRST',
  HourlyVolumeUsdAscNullsLast = 'hourlyVolumeUSD_ASC_NULLS_LAST',
  HourlyVolumeUsdDesc = 'hourlyVolumeUSD_DESC',
  HourlyVolumeUsdDescNullsFirst = 'hourlyVolumeUSD_DESC_NULLS_FIRST',
  HourlyVolumeUsdDescNullsLast = 'hourlyVolumeUSD_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  PairCreatedAtBlockNumberAsc = 'pair_createdAtBlockNumber_ASC',
  PairCreatedAtBlockNumberAscNullsFirst = 'pair_createdAtBlockNumber_ASC_NULLS_FIRST',
  PairCreatedAtBlockNumberAscNullsLast = 'pair_createdAtBlockNumber_ASC_NULLS_LAST',
  PairCreatedAtBlockNumberDesc = 'pair_createdAtBlockNumber_DESC',
  PairCreatedAtBlockNumberDescNullsFirst = 'pair_createdAtBlockNumber_DESC_NULLS_FIRST',
  PairCreatedAtBlockNumberDescNullsLast = 'pair_createdAtBlockNumber_DESC_NULLS_LAST',
  PairCreatedAtTimestampAsc = 'pair_createdAtTimestamp_ASC',
  PairCreatedAtTimestampAscNullsFirst = 'pair_createdAtTimestamp_ASC_NULLS_FIRST',
  PairCreatedAtTimestampAscNullsLast = 'pair_createdAtTimestamp_ASC_NULLS_LAST',
  PairCreatedAtTimestampDesc = 'pair_createdAtTimestamp_DESC',
  PairCreatedAtTimestampDescNullsFirst = 'pair_createdAtTimestamp_DESC_NULLS_FIRST',
  PairCreatedAtTimestampDescNullsLast = 'pair_createdAtTimestamp_DESC_NULLS_LAST',
  PairIdAsc = 'pair_id_ASC',
  PairIdAscNullsFirst = 'pair_id_ASC_NULLS_FIRST',
  PairIdAscNullsLast = 'pair_id_ASC_NULLS_LAST',
  PairIdDesc = 'pair_id_DESC',
  PairIdDescNullsFirst = 'pair_id_DESC_NULLS_FIRST',
  PairIdDescNullsLast = 'pair_id_DESC_NULLS_LAST',
  PairLiquidityProviderCountAsc = 'pair_liquidityProviderCount_ASC',
  PairLiquidityProviderCountAscNullsFirst = 'pair_liquidityProviderCount_ASC_NULLS_FIRST',
  PairLiquidityProviderCountAscNullsLast = 'pair_liquidityProviderCount_ASC_NULLS_LAST',
  PairLiquidityProviderCountDesc = 'pair_liquidityProviderCount_DESC',
  PairLiquidityProviderCountDescNullsFirst = 'pair_liquidityProviderCount_DESC_NULLS_FIRST',
  PairLiquidityProviderCountDescNullsLast = 'pair_liquidityProviderCount_DESC_NULLS_LAST',
  PairReserve0Asc = 'pair_reserve0_ASC',
  PairReserve0AscNullsFirst = 'pair_reserve0_ASC_NULLS_FIRST',
  PairReserve0AscNullsLast = 'pair_reserve0_ASC_NULLS_LAST',
  PairReserve0Desc = 'pair_reserve0_DESC',
  PairReserve0DescNullsFirst = 'pair_reserve0_DESC_NULLS_FIRST',
  PairReserve0DescNullsLast = 'pair_reserve0_DESC_NULLS_LAST',
  PairReserve1Asc = 'pair_reserve1_ASC',
  PairReserve1AscNullsFirst = 'pair_reserve1_ASC_NULLS_FIRST',
  PairReserve1AscNullsLast = 'pair_reserve1_ASC_NULLS_LAST',
  PairReserve1Desc = 'pair_reserve1_DESC',
  PairReserve1DescNullsFirst = 'pair_reserve1_DESC_NULLS_FIRST',
  PairReserve1DescNullsLast = 'pair_reserve1_DESC_NULLS_LAST',
  PairReserveEthAsc = 'pair_reserveETH_ASC',
  PairReserveEthAscNullsFirst = 'pair_reserveETH_ASC_NULLS_FIRST',
  PairReserveEthAscNullsLast = 'pair_reserveETH_ASC_NULLS_LAST',
  PairReserveEthDesc = 'pair_reserveETH_DESC',
  PairReserveEthDescNullsFirst = 'pair_reserveETH_DESC_NULLS_FIRST',
  PairReserveEthDescNullsLast = 'pair_reserveETH_DESC_NULLS_LAST',
  PairReserveUsdAsc = 'pair_reserveUSD_ASC',
  PairReserveUsdAscNullsFirst = 'pair_reserveUSD_ASC_NULLS_FIRST',
  PairReserveUsdAscNullsLast = 'pair_reserveUSD_ASC_NULLS_LAST',
  PairReserveUsdDesc = 'pair_reserveUSD_DESC',
  PairReserveUsdDescNullsFirst = 'pair_reserveUSD_DESC_NULLS_FIRST',
  PairReserveUsdDescNullsLast = 'pair_reserveUSD_DESC_NULLS_LAST',
  PairToken0PriceAsc = 'pair_token0Price_ASC',
  PairToken0PriceAscNullsFirst = 'pair_token0Price_ASC_NULLS_FIRST',
  PairToken0PriceAscNullsLast = 'pair_token0Price_ASC_NULLS_LAST',
  PairToken0PriceDesc = 'pair_token0Price_DESC',
  PairToken0PriceDescNullsFirst = 'pair_token0Price_DESC_NULLS_FIRST',
  PairToken0PriceDescNullsLast = 'pair_token0Price_DESC_NULLS_LAST',
  PairToken1PriceAsc = 'pair_token1Price_ASC',
  PairToken1PriceAscNullsFirst = 'pair_token1Price_ASC_NULLS_FIRST',
  PairToken1PriceAscNullsLast = 'pair_token1Price_ASC_NULLS_LAST',
  PairToken1PriceDesc = 'pair_token1Price_DESC',
  PairToken1PriceDescNullsFirst = 'pair_token1Price_DESC_NULLS_FIRST',
  PairToken1PriceDescNullsLast = 'pair_token1Price_DESC_NULLS_LAST',
  PairTotalSupplyAsc = 'pair_totalSupply_ASC',
  PairTotalSupplyAscNullsFirst = 'pair_totalSupply_ASC_NULLS_FIRST',
  PairTotalSupplyAscNullsLast = 'pair_totalSupply_ASC_NULLS_LAST',
  PairTotalSupplyDesc = 'pair_totalSupply_DESC',
  PairTotalSupplyDescNullsFirst = 'pair_totalSupply_DESC_NULLS_FIRST',
  PairTotalSupplyDescNullsLast = 'pair_totalSupply_DESC_NULLS_LAST',
  PairTrackedReserveEthAsc = 'pair_trackedReserveETH_ASC',
  PairTrackedReserveEthAscNullsFirst = 'pair_trackedReserveETH_ASC_NULLS_FIRST',
  PairTrackedReserveEthAscNullsLast = 'pair_trackedReserveETH_ASC_NULLS_LAST',
  PairTrackedReserveEthDesc = 'pair_trackedReserveETH_DESC',
  PairTrackedReserveEthDescNullsFirst = 'pair_trackedReserveETH_DESC_NULLS_FIRST',
  PairTrackedReserveEthDescNullsLast = 'pair_trackedReserveETH_DESC_NULLS_LAST',
  PairTxCountAsc = 'pair_txCount_ASC',
  PairTxCountAscNullsFirst = 'pair_txCount_ASC_NULLS_FIRST',
  PairTxCountAscNullsLast = 'pair_txCount_ASC_NULLS_LAST',
  PairTxCountDesc = 'pair_txCount_DESC',
  PairTxCountDescNullsFirst = 'pair_txCount_DESC_NULLS_FIRST',
  PairTxCountDescNullsLast = 'pair_txCount_DESC_NULLS_LAST',
  PairUntrackedVolumeUsdAsc = 'pair_untrackedVolumeUSD_ASC',
  PairUntrackedVolumeUsdAscNullsFirst = 'pair_untrackedVolumeUSD_ASC_NULLS_FIRST',
  PairUntrackedVolumeUsdAscNullsLast = 'pair_untrackedVolumeUSD_ASC_NULLS_LAST',
  PairUntrackedVolumeUsdDesc = 'pair_untrackedVolumeUSD_DESC',
  PairUntrackedVolumeUsdDescNullsFirst = 'pair_untrackedVolumeUSD_DESC_NULLS_FIRST',
  PairUntrackedVolumeUsdDescNullsLast = 'pair_untrackedVolumeUSD_DESC_NULLS_LAST',
  PairVolumeToken0Asc = 'pair_volumeToken0_ASC',
  PairVolumeToken0AscNullsFirst = 'pair_volumeToken0_ASC_NULLS_FIRST',
  PairVolumeToken0AscNullsLast = 'pair_volumeToken0_ASC_NULLS_LAST',
  PairVolumeToken0Desc = 'pair_volumeToken0_DESC',
  PairVolumeToken0DescNullsFirst = 'pair_volumeToken0_DESC_NULLS_FIRST',
  PairVolumeToken0DescNullsLast = 'pair_volumeToken0_DESC_NULLS_LAST',
  PairVolumeToken1Asc = 'pair_volumeToken1_ASC',
  PairVolumeToken1AscNullsFirst = 'pair_volumeToken1_ASC_NULLS_FIRST',
  PairVolumeToken1AscNullsLast = 'pair_volumeToken1_ASC_NULLS_LAST',
  PairVolumeToken1Desc = 'pair_volumeToken1_DESC',
  PairVolumeToken1DescNullsFirst = 'pair_volumeToken1_DESC_NULLS_FIRST',
  PairVolumeToken1DescNullsLast = 'pair_volumeToken1_DESC_NULLS_LAST',
  PairVolumeUsdAsc = 'pair_volumeUSD_ASC',
  PairVolumeUsdAscNullsFirst = 'pair_volumeUSD_ASC_NULLS_FIRST',
  PairVolumeUsdAscNullsLast = 'pair_volumeUSD_ASC_NULLS_LAST',
  PairVolumeUsdDesc = 'pair_volumeUSD_DESC',
  PairVolumeUsdDescNullsFirst = 'pair_volumeUSD_DESC_NULLS_FIRST',
  PairVolumeUsdDescNullsLast = 'pair_volumeUSD_DESC_NULLS_LAST',
  Reserve0Asc = 'reserve0_ASC',
  Reserve0AscNullsFirst = 'reserve0_ASC_NULLS_FIRST',
  Reserve0AscNullsLast = 'reserve0_ASC_NULLS_LAST',
  Reserve0Desc = 'reserve0_DESC',
  Reserve0DescNullsFirst = 'reserve0_DESC_NULLS_FIRST',
  Reserve0DescNullsLast = 'reserve0_DESC_NULLS_LAST',
  Reserve1Asc = 'reserve1_ASC',
  Reserve1AscNullsFirst = 'reserve1_ASC_NULLS_FIRST',
  Reserve1AscNullsLast = 'reserve1_ASC_NULLS_LAST',
  Reserve1Desc = 'reserve1_DESC',
  Reserve1DescNullsFirst = 'reserve1_DESC_NULLS_FIRST',
  Reserve1DescNullsLast = 'reserve1_DESC_NULLS_LAST',
  ReserveUsdAsc = 'reserveUSD_ASC',
  ReserveUsdAscNullsFirst = 'reserveUSD_ASC_NULLS_FIRST',
  ReserveUsdAscNullsLast = 'reserveUSD_ASC_NULLS_LAST',
  ReserveUsdDesc = 'reserveUSD_DESC',
  ReserveUsdDescNullsFirst = 'reserveUSD_DESC_NULLS_FIRST',
  ReserveUsdDescNullsLast = 'reserveUSD_DESC_NULLS_LAST',
  TotalSupplyAsc = 'totalSupply_ASC',
  TotalSupplyAscNullsFirst = 'totalSupply_ASC_NULLS_FIRST',
  TotalSupplyAscNullsLast = 'totalSupply_ASC_NULLS_LAST',
  TotalSupplyDesc = 'totalSupply_DESC',
  TotalSupplyDescNullsFirst = 'totalSupply_DESC_NULLS_FIRST',
  TotalSupplyDescNullsLast = 'totalSupply_DESC_NULLS_LAST'
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
  CreatedAtBlockNumberAscNullsFirst = 'createdAtBlockNumber_ASC_NULLS_FIRST',
  CreatedAtBlockNumberAscNullsLast = 'createdAtBlockNumber_ASC_NULLS_LAST',
  CreatedAtBlockNumberDesc = 'createdAtBlockNumber_DESC',
  CreatedAtBlockNumberDescNullsFirst = 'createdAtBlockNumber_DESC_NULLS_FIRST',
  CreatedAtBlockNumberDescNullsLast = 'createdAtBlockNumber_DESC_NULLS_LAST',
  CreatedAtTimestampAsc = 'createdAtTimestamp_ASC',
  CreatedAtTimestampAscNullsFirst = 'createdAtTimestamp_ASC_NULLS_FIRST',
  CreatedAtTimestampAscNullsLast = 'createdAtTimestamp_ASC_NULLS_LAST',
  CreatedAtTimestampDesc = 'createdAtTimestamp_DESC',
  CreatedAtTimestampDescNullsFirst = 'createdAtTimestamp_DESC_NULLS_FIRST',
  CreatedAtTimestampDescNullsLast = 'createdAtTimestamp_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  LiquidityProviderCountAsc = 'liquidityProviderCount_ASC',
  LiquidityProviderCountAscNullsFirst = 'liquidityProviderCount_ASC_NULLS_FIRST',
  LiquidityProviderCountAscNullsLast = 'liquidityProviderCount_ASC_NULLS_LAST',
  LiquidityProviderCountDesc = 'liquidityProviderCount_DESC',
  LiquidityProviderCountDescNullsFirst = 'liquidityProviderCount_DESC_NULLS_FIRST',
  LiquidityProviderCountDescNullsLast = 'liquidityProviderCount_DESC_NULLS_LAST',
  Reserve0Asc = 'reserve0_ASC',
  Reserve0AscNullsFirst = 'reserve0_ASC_NULLS_FIRST',
  Reserve0AscNullsLast = 'reserve0_ASC_NULLS_LAST',
  Reserve0Desc = 'reserve0_DESC',
  Reserve0DescNullsFirst = 'reserve0_DESC_NULLS_FIRST',
  Reserve0DescNullsLast = 'reserve0_DESC_NULLS_LAST',
  Reserve1Asc = 'reserve1_ASC',
  Reserve1AscNullsFirst = 'reserve1_ASC_NULLS_FIRST',
  Reserve1AscNullsLast = 'reserve1_ASC_NULLS_LAST',
  Reserve1Desc = 'reserve1_DESC',
  Reserve1DescNullsFirst = 'reserve1_DESC_NULLS_FIRST',
  Reserve1DescNullsLast = 'reserve1_DESC_NULLS_LAST',
  ReserveEthAsc = 'reserveETH_ASC',
  ReserveEthAscNullsFirst = 'reserveETH_ASC_NULLS_FIRST',
  ReserveEthAscNullsLast = 'reserveETH_ASC_NULLS_LAST',
  ReserveEthDesc = 'reserveETH_DESC',
  ReserveEthDescNullsFirst = 'reserveETH_DESC_NULLS_FIRST',
  ReserveEthDescNullsLast = 'reserveETH_DESC_NULLS_LAST',
  ReserveUsdAsc = 'reserveUSD_ASC',
  ReserveUsdAscNullsFirst = 'reserveUSD_ASC_NULLS_FIRST',
  ReserveUsdAscNullsLast = 'reserveUSD_ASC_NULLS_LAST',
  ReserveUsdDesc = 'reserveUSD_DESC',
  ReserveUsdDescNullsFirst = 'reserveUSD_DESC_NULLS_FIRST',
  ReserveUsdDescNullsLast = 'reserveUSD_DESC_NULLS_LAST',
  Token0PriceAsc = 'token0Price_ASC',
  Token0PriceAscNullsFirst = 'token0Price_ASC_NULLS_FIRST',
  Token0PriceAscNullsLast = 'token0Price_ASC_NULLS_LAST',
  Token0PriceDesc = 'token0Price_DESC',
  Token0PriceDescNullsFirst = 'token0Price_DESC_NULLS_FIRST',
  Token0PriceDescNullsLast = 'token0Price_DESC_NULLS_LAST',
  Token0DecimalsAsc = 'token0_decimals_ASC',
  Token0DecimalsAscNullsFirst = 'token0_decimals_ASC_NULLS_FIRST',
  Token0DecimalsAscNullsLast = 'token0_decimals_ASC_NULLS_LAST',
  Token0DecimalsDesc = 'token0_decimals_DESC',
  Token0DecimalsDescNullsFirst = 'token0_decimals_DESC_NULLS_FIRST',
  Token0DecimalsDescNullsLast = 'token0_decimals_DESC_NULLS_LAST',
  Token0DerivedEthAsc = 'token0_derivedETH_ASC',
  Token0DerivedEthAscNullsFirst = 'token0_derivedETH_ASC_NULLS_FIRST',
  Token0DerivedEthAscNullsLast = 'token0_derivedETH_ASC_NULLS_LAST',
  Token0DerivedEthDesc = 'token0_derivedETH_DESC',
  Token0DerivedEthDescNullsFirst = 'token0_derivedETH_DESC_NULLS_FIRST',
  Token0DerivedEthDescNullsLast = 'token0_derivedETH_DESC_NULLS_LAST',
  Token0IdAsc = 'token0_id_ASC',
  Token0IdAscNullsFirst = 'token0_id_ASC_NULLS_FIRST',
  Token0IdAscNullsLast = 'token0_id_ASC_NULLS_LAST',
  Token0IdDesc = 'token0_id_DESC',
  Token0IdDescNullsFirst = 'token0_id_DESC_NULLS_FIRST',
  Token0IdDescNullsLast = 'token0_id_DESC_NULLS_LAST',
  Token0NameAsc = 'token0_name_ASC',
  Token0NameAscNullsFirst = 'token0_name_ASC_NULLS_FIRST',
  Token0NameAscNullsLast = 'token0_name_ASC_NULLS_LAST',
  Token0NameDesc = 'token0_name_DESC',
  Token0NameDescNullsFirst = 'token0_name_DESC_NULLS_FIRST',
  Token0NameDescNullsLast = 'token0_name_DESC_NULLS_LAST',
  Token0SymbolAsc = 'token0_symbol_ASC',
  Token0SymbolAscNullsFirst = 'token0_symbol_ASC_NULLS_FIRST',
  Token0SymbolAscNullsLast = 'token0_symbol_ASC_NULLS_LAST',
  Token0SymbolDesc = 'token0_symbol_DESC',
  Token0SymbolDescNullsFirst = 'token0_symbol_DESC_NULLS_FIRST',
  Token0SymbolDescNullsLast = 'token0_symbol_DESC_NULLS_LAST',
  Token0TotalLiquidityAsc = 'token0_totalLiquidity_ASC',
  Token0TotalLiquidityAscNullsFirst = 'token0_totalLiquidity_ASC_NULLS_FIRST',
  Token0TotalLiquidityAscNullsLast = 'token0_totalLiquidity_ASC_NULLS_LAST',
  Token0TotalLiquidityDesc = 'token0_totalLiquidity_DESC',
  Token0TotalLiquidityDescNullsFirst = 'token0_totalLiquidity_DESC_NULLS_FIRST',
  Token0TotalLiquidityDescNullsLast = 'token0_totalLiquidity_DESC_NULLS_LAST',
  Token0TotalSupplyAsc = 'token0_totalSupply_ASC',
  Token0TotalSupplyAscNullsFirst = 'token0_totalSupply_ASC_NULLS_FIRST',
  Token0TotalSupplyAscNullsLast = 'token0_totalSupply_ASC_NULLS_LAST',
  Token0TotalSupplyDesc = 'token0_totalSupply_DESC',
  Token0TotalSupplyDescNullsFirst = 'token0_totalSupply_DESC_NULLS_FIRST',
  Token0TotalSupplyDescNullsLast = 'token0_totalSupply_DESC_NULLS_LAST',
  Token0TradeVolumeUsdAsc = 'token0_tradeVolumeUSD_ASC',
  Token0TradeVolumeUsdAscNullsFirst = 'token0_tradeVolumeUSD_ASC_NULLS_FIRST',
  Token0TradeVolumeUsdAscNullsLast = 'token0_tradeVolumeUSD_ASC_NULLS_LAST',
  Token0TradeVolumeUsdDesc = 'token0_tradeVolumeUSD_DESC',
  Token0TradeVolumeUsdDescNullsFirst = 'token0_tradeVolumeUSD_DESC_NULLS_FIRST',
  Token0TradeVolumeUsdDescNullsLast = 'token0_tradeVolumeUSD_DESC_NULLS_LAST',
  Token0TradeVolumeAsc = 'token0_tradeVolume_ASC',
  Token0TradeVolumeAscNullsFirst = 'token0_tradeVolume_ASC_NULLS_FIRST',
  Token0TradeVolumeAscNullsLast = 'token0_tradeVolume_ASC_NULLS_LAST',
  Token0TradeVolumeDesc = 'token0_tradeVolume_DESC',
  Token0TradeVolumeDescNullsFirst = 'token0_tradeVolume_DESC_NULLS_FIRST',
  Token0TradeVolumeDescNullsLast = 'token0_tradeVolume_DESC_NULLS_LAST',
  Token0TxCountAsc = 'token0_txCount_ASC',
  Token0TxCountAscNullsFirst = 'token0_txCount_ASC_NULLS_FIRST',
  Token0TxCountAscNullsLast = 'token0_txCount_ASC_NULLS_LAST',
  Token0TxCountDesc = 'token0_txCount_DESC',
  Token0TxCountDescNullsFirst = 'token0_txCount_DESC_NULLS_FIRST',
  Token0TxCountDescNullsLast = 'token0_txCount_DESC_NULLS_LAST',
  Token0UntrackedVolumeUsdAsc = 'token0_untrackedVolumeUSD_ASC',
  Token0UntrackedVolumeUsdAscNullsFirst = 'token0_untrackedVolumeUSD_ASC_NULLS_FIRST',
  Token0UntrackedVolumeUsdAscNullsLast = 'token0_untrackedVolumeUSD_ASC_NULLS_LAST',
  Token0UntrackedVolumeUsdDesc = 'token0_untrackedVolumeUSD_DESC',
  Token0UntrackedVolumeUsdDescNullsFirst = 'token0_untrackedVolumeUSD_DESC_NULLS_FIRST',
  Token0UntrackedVolumeUsdDescNullsLast = 'token0_untrackedVolumeUSD_DESC_NULLS_LAST',
  Token1PriceAsc = 'token1Price_ASC',
  Token1PriceAscNullsFirst = 'token1Price_ASC_NULLS_FIRST',
  Token1PriceAscNullsLast = 'token1Price_ASC_NULLS_LAST',
  Token1PriceDesc = 'token1Price_DESC',
  Token1PriceDescNullsFirst = 'token1Price_DESC_NULLS_FIRST',
  Token1PriceDescNullsLast = 'token1Price_DESC_NULLS_LAST',
  Token1DecimalsAsc = 'token1_decimals_ASC',
  Token1DecimalsAscNullsFirst = 'token1_decimals_ASC_NULLS_FIRST',
  Token1DecimalsAscNullsLast = 'token1_decimals_ASC_NULLS_LAST',
  Token1DecimalsDesc = 'token1_decimals_DESC',
  Token1DecimalsDescNullsFirst = 'token1_decimals_DESC_NULLS_FIRST',
  Token1DecimalsDescNullsLast = 'token1_decimals_DESC_NULLS_LAST',
  Token1DerivedEthAsc = 'token1_derivedETH_ASC',
  Token1DerivedEthAscNullsFirst = 'token1_derivedETH_ASC_NULLS_FIRST',
  Token1DerivedEthAscNullsLast = 'token1_derivedETH_ASC_NULLS_LAST',
  Token1DerivedEthDesc = 'token1_derivedETH_DESC',
  Token1DerivedEthDescNullsFirst = 'token1_derivedETH_DESC_NULLS_FIRST',
  Token1DerivedEthDescNullsLast = 'token1_derivedETH_DESC_NULLS_LAST',
  Token1IdAsc = 'token1_id_ASC',
  Token1IdAscNullsFirst = 'token1_id_ASC_NULLS_FIRST',
  Token1IdAscNullsLast = 'token1_id_ASC_NULLS_LAST',
  Token1IdDesc = 'token1_id_DESC',
  Token1IdDescNullsFirst = 'token1_id_DESC_NULLS_FIRST',
  Token1IdDescNullsLast = 'token1_id_DESC_NULLS_LAST',
  Token1NameAsc = 'token1_name_ASC',
  Token1NameAscNullsFirst = 'token1_name_ASC_NULLS_FIRST',
  Token1NameAscNullsLast = 'token1_name_ASC_NULLS_LAST',
  Token1NameDesc = 'token1_name_DESC',
  Token1NameDescNullsFirst = 'token1_name_DESC_NULLS_FIRST',
  Token1NameDescNullsLast = 'token1_name_DESC_NULLS_LAST',
  Token1SymbolAsc = 'token1_symbol_ASC',
  Token1SymbolAscNullsFirst = 'token1_symbol_ASC_NULLS_FIRST',
  Token1SymbolAscNullsLast = 'token1_symbol_ASC_NULLS_LAST',
  Token1SymbolDesc = 'token1_symbol_DESC',
  Token1SymbolDescNullsFirst = 'token1_symbol_DESC_NULLS_FIRST',
  Token1SymbolDescNullsLast = 'token1_symbol_DESC_NULLS_LAST',
  Token1TotalLiquidityAsc = 'token1_totalLiquidity_ASC',
  Token1TotalLiquidityAscNullsFirst = 'token1_totalLiquidity_ASC_NULLS_FIRST',
  Token1TotalLiquidityAscNullsLast = 'token1_totalLiquidity_ASC_NULLS_LAST',
  Token1TotalLiquidityDesc = 'token1_totalLiquidity_DESC',
  Token1TotalLiquidityDescNullsFirst = 'token1_totalLiquidity_DESC_NULLS_FIRST',
  Token1TotalLiquidityDescNullsLast = 'token1_totalLiquidity_DESC_NULLS_LAST',
  Token1TotalSupplyAsc = 'token1_totalSupply_ASC',
  Token1TotalSupplyAscNullsFirst = 'token1_totalSupply_ASC_NULLS_FIRST',
  Token1TotalSupplyAscNullsLast = 'token1_totalSupply_ASC_NULLS_LAST',
  Token1TotalSupplyDesc = 'token1_totalSupply_DESC',
  Token1TotalSupplyDescNullsFirst = 'token1_totalSupply_DESC_NULLS_FIRST',
  Token1TotalSupplyDescNullsLast = 'token1_totalSupply_DESC_NULLS_LAST',
  Token1TradeVolumeUsdAsc = 'token1_tradeVolumeUSD_ASC',
  Token1TradeVolumeUsdAscNullsFirst = 'token1_tradeVolumeUSD_ASC_NULLS_FIRST',
  Token1TradeVolumeUsdAscNullsLast = 'token1_tradeVolumeUSD_ASC_NULLS_LAST',
  Token1TradeVolumeUsdDesc = 'token1_tradeVolumeUSD_DESC',
  Token1TradeVolumeUsdDescNullsFirst = 'token1_tradeVolumeUSD_DESC_NULLS_FIRST',
  Token1TradeVolumeUsdDescNullsLast = 'token1_tradeVolumeUSD_DESC_NULLS_LAST',
  Token1TradeVolumeAsc = 'token1_tradeVolume_ASC',
  Token1TradeVolumeAscNullsFirst = 'token1_tradeVolume_ASC_NULLS_FIRST',
  Token1TradeVolumeAscNullsLast = 'token1_tradeVolume_ASC_NULLS_LAST',
  Token1TradeVolumeDesc = 'token1_tradeVolume_DESC',
  Token1TradeVolumeDescNullsFirst = 'token1_tradeVolume_DESC_NULLS_FIRST',
  Token1TradeVolumeDescNullsLast = 'token1_tradeVolume_DESC_NULLS_LAST',
  Token1TxCountAsc = 'token1_txCount_ASC',
  Token1TxCountAscNullsFirst = 'token1_txCount_ASC_NULLS_FIRST',
  Token1TxCountAscNullsLast = 'token1_txCount_ASC_NULLS_LAST',
  Token1TxCountDesc = 'token1_txCount_DESC',
  Token1TxCountDescNullsFirst = 'token1_txCount_DESC_NULLS_FIRST',
  Token1TxCountDescNullsLast = 'token1_txCount_DESC_NULLS_LAST',
  Token1UntrackedVolumeUsdAsc = 'token1_untrackedVolumeUSD_ASC',
  Token1UntrackedVolumeUsdAscNullsFirst = 'token1_untrackedVolumeUSD_ASC_NULLS_FIRST',
  Token1UntrackedVolumeUsdAscNullsLast = 'token1_untrackedVolumeUSD_ASC_NULLS_LAST',
  Token1UntrackedVolumeUsdDesc = 'token1_untrackedVolumeUSD_DESC',
  Token1UntrackedVolumeUsdDescNullsFirst = 'token1_untrackedVolumeUSD_DESC_NULLS_FIRST',
  Token1UntrackedVolumeUsdDescNullsLast = 'token1_untrackedVolumeUSD_DESC_NULLS_LAST',
  TotalSupplyAsc = 'totalSupply_ASC',
  TotalSupplyAscNullsFirst = 'totalSupply_ASC_NULLS_FIRST',
  TotalSupplyAscNullsLast = 'totalSupply_ASC_NULLS_LAST',
  TotalSupplyDesc = 'totalSupply_DESC',
  TotalSupplyDescNullsFirst = 'totalSupply_DESC_NULLS_FIRST',
  TotalSupplyDescNullsLast = 'totalSupply_DESC_NULLS_LAST',
  TrackedReserveEthAsc = 'trackedReserveETH_ASC',
  TrackedReserveEthAscNullsFirst = 'trackedReserveETH_ASC_NULLS_FIRST',
  TrackedReserveEthAscNullsLast = 'trackedReserveETH_ASC_NULLS_LAST',
  TrackedReserveEthDesc = 'trackedReserveETH_DESC',
  TrackedReserveEthDescNullsFirst = 'trackedReserveETH_DESC_NULLS_FIRST',
  TrackedReserveEthDescNullsLast = 'trackedReserveETH_DESC_NULLS_LAST',
  TxCountAsc = 'txCount_ASC',
  TxCountAscNullsFirst = 'txCount_ASC_NULLS_FIRST',
  TxCountAscNullsLast = 'txCount_ASC_NULLS_LAST',
  TxCountDesc = 'txCount_DESC',
  TxCountDescNullsFirst = 'txCount_DESC_NULLS_FIRST',
  TxCountDescNullsLast = 'txCount_DESC_NULLS_LAST',
  UntrackedVolumeUsdAsc = 'untrackedVolumeUSD_ASC',
  UntrackedVolumeUsdAscNullsFirst = 'untrackedVolumeUSD_ASC_NULLS_FIRST',
  UntrackedVolumeUsdAscNullsLast = 'untrackedVolumeUSD_ASC_NULLS_LAST',
  UntrackedVolumeUsdDesc = 'untrackedVolumeUSD_DESC',
  UntrackedVolumeUsdDescNullsFirst = 'untrackedVolumeUSD_DESC_NULLS_FIRST',
  UntrackedVolumeUsdDescNullsLast = 'untrackedVolumeUSD_DESC_NULLS_LAST',
  VolumeToken0Asc = 'volumeToken0_ASC',
  VolumeToken0AscNullsFirst = 'volumeToken0_ASC_NULLS_FIRST',
  VolumeToken0AscNullsLast = 'volumeToken0_ASC_NULLS_LAST',
  VolumeToken0Desc = 'volumeToken0_DESC',
  VolumeToken0DescNullsFirst = 'volumeToken0_DESC_NULLS_FIRST',
  VolumeToken0DescNullsLast = 'volumeToken0_DESC_NULLS_LAST',
  VolumeToken1Asc = 'volumeToken1_ASC',
  VolumeToken1AscNullsFirst = 'volumeToken1_ASC_NULLS_FIRST',
  VolumeToken1AscNullsLast = 'volumeToken1_ASC_NULLS_LAST',
  VolumeToken1Desc = 'volumeToken1_DESC',
  VolumeToken1DescNullsFirst = 'volumeToken1_DESC_NULLS_FIRST',
  VolumeToken1DescNullsLast = 'volumeToken1_DESC_NULLS_LAST',
  VolumeUsdAsc = 'volumeUSD_ASC',
  VolumeUsdAscNullsFirst = 'volumeUSD_ASC_NULLS_FIRST',
  VolumeUsdAscNullsLast = 'volumeUSD_ASC_NULLS_LAST',
  VolumeUsdDesc = 'volumeUSD_DESC',
  VolumeUsdDescNullsFirst = 'volumeUSD_DESC_NULLS_FIRST',
  VolumeUsdDescNullsLast = 'volumeUSD_DESC_NULLS_LAST'
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
  backstopPools: Array<BackstopPool>;
  backstopPoolsConnection: BackstopPoolsConnection;
  blockById?: Maybe<Block>;
  blocks: Array<Block>;
  blocksConnection: BlocksConnection;
  bundleById?: Maybe<Bundle>;
  bundles: Array<Bundle>;
  bundlesConnection: BundlesConnection;
  burnById?: Maybe<Burn>;
  burns: Array<Burn>;
  burnsConnection: BurnsConnection;
  callById?: Maybe<Call>;
  calls: Array<Call>;
  callsConnection: CallsConnection;
  eventById?: Maybe<Event>;
  events: Array<Event>;
  eventsConnection: EventsConnection;
  extrinsicById?: Maybe<Extrinsic>;
  extrinsics: Array<Extrinsic>;
  extrinsicsConnection: ExtrinsicsConnection;
  factories: Array<Factory>;
  factoriesConnection: FactoriesConnection;
  factoryById?: Maybe<Factory>;
  factoryDayData: Array<FactoryDayData>;
  factoryDayDataById?: Maybe<FactoryDayData>;
  factoryDayDataConnection: FactoryDayDataConnection;
  farmById?: Maybe<Farm>;
  farms: Array<Farm>;
  farmsConnection: FarmsConnection;
  incentiveById?: Maybe<Incentive>;
  incentives: Array<Incentive>;
  incentivesConnection: IncentivesConnection;
  issueRequestById?: Maybe<IssueRequest>;
  issueRequests: Array<IssueRequest>;
  issueRequestsConnection: IssueRequestsConnection;
  itemsCounterById?: Maybe<ItemsCounter>;
  itemsCounters: Array<ItemsCounter>;
  itemsCountersConnection: ItemsCountersConnection;
  liquidityPositionById?: Maybe<LiquidityPosition>;
  liquidityPositionSnapshotById?: Maybe<LiquidityPositionSnapshot>;
  liquidityPositionSnapshots: Array<LiquidityPositionSnapshot>;
  liquidityPositionSnapshotsConnection: LiquidityPositionSnapshotsConnection;
  liquidityPositions: Array<LiquidityPosition>;
  liquidityPositionsConnection: LiquidityPositionsConnection;
  mintById?: Maybe<Mint>;
  mints: Array<Mint>;
  mintsConnection: MintsConnection;
  nablaBackstopLiquidityDepositById?: Maybe<NablaBackstopLiquidityDeposit>;
  nablaBackstopLiquidityDeposits: Array<NablaBackstopLiquidityDeposit>;
  nablaBackstopLiquidityDepositsConnection: NablaBackstopLiquidityDepositsConnection;
  nablaBackstopLiquidityWithdrawalById?: Maybe<NablaBackstopLiquidityWithdrawal>;
  nablaBackstopLiquidityWithdrawals: Array<NablaBackstopLiquidityWithdrawal>;
  nablaBackstopLiquidityWithdrawalsConnection: NablaBackstopLiquidityWithdrawalsConnection;
  nablaSwapById?: Maybe<NablaSwap>;
  nablaSwapFeeById?: Maybe<NablaSwapFee>;
  nablaSwapFees: Array<NablaSwapFee>;
  nablaSwapFeesConnection: NablaSwapFeesConnection;
  nablaSwapLiquidityDepositById?: Maybe<NablaSwapLiquidityDeposit>;
  nablaSwapLiquidityDeposits: Array<NablaSwapLiquidityDeposit>;
  nablaSwapLiquidityDepositsConnection: NablaSwapLiquidityDepositsConnection;
  nablaSwapLiquidityWithdrawalById?: Maybe<NablaSwapLiquidityWithdrawal>;
  nablaSwapLiquidityWithdrawals: Array<NablaSwapLiquidityWithdrawal>;
  nablaSwapLiquidityWithdrawalsConnection: NablaSwapLiquidityWithdrawalsConnection;
  nablaSwaps: Array<NablaSwap>;
  nablaSwapsConnection: NablaSwapsConnection;
  nablaTokenById?: Maybe<NablaToken>;
  nablaTokens: Array<NablaToken>;
  nablaTokensConnection: NablaTokensConnection;
  oraclePriceById?: Maybe<OraclePrice>;
  oraclePrices: Array<OraclePrice>;
  oraclePricesConnection: OraclePricesConnection;
  pairById?: Maybe<Pair>;
  pairDayData: Array<PairDayData>;
  pairDayDataById?: Maybe<PairDayData>;
  pairDayDataConnection: PairDayDataConnection;
  pairHourData: Array<PairHourData>;
  pairHourDataById?: Maybe<PairHourData>;
  pairHourDataConnection: PairHourDataConnection;
  pairs: Array<Pair>;
  pairsConnection: PairsConnection;
  redeemRequestById?: Maybe<RedeemRequest>;
  redeemRequests: Array<RedeemRequest>;
  redeemRequestsConnection: RedeemRequestsConnection;
  routerById?: Maybe<Router>;
  routers: Array<Router>;
  routersConnection: RoutersConnection;
  singleTokenLockById?: Maybe<SingleTokenLock>;
  singleTokenLockDayData: Array<SingleTokenLockDayData>;
  singleTokenLockDayDataById?: Maybe<SingleTokenLockDayData>;
  singleTokenLockDayDataConnection: SingleTokenLockDayDataConnection;
  singleTokenLockHourData: Array<SingleTokenLockHourData>;
  singleTokenLockHourDataById?: Maybe<SingleTokenLockHourData>;
  singleTokenLockHourDataConnection: SingleTokenLockHourDataConnection;
  singleTokenLocks: Array<SingleTokenLock>;
  singleTokenLocksConnection: SingleTokenLocksConnection;
  squidStatus?: Maybe<SquidStatus>;
  stableDayData: Array<StableDayData>;
  stableDayDataById?: Maybe<StableDayData>;
  stableDayDataConnection: StableDayDataConnection;
  stableSwapById?: Maybe<StableSwap>;
  stableSwapDayData: Array<StableSwapDayData>;
  stableSwapDayDataById?: Maybe<StableSwapDayData>;
  stableSwapDayDataConnection: StableSwapDayDataConnection;
  stableSwapEventById?: Maybe<StableSwapEvent>;
  stableSwapEvents: Array<StableSwapEvent>;
  stableSwapEventsConnection: StableSwapEventsConnection;
  stableSwapExchangeById?: Maybe<StableSwapExchange>;
  stableSwapExchanges: Array<StableSwapExchange>;
  stableSwapExchangesConnection: StableSwapExchangesConnection;
  stableSwapHourData: Array<StableSwapHourData>;
  stableSwapHourDataById?: Maybe<StableSwapHourData>;
  stableSwapHourDataConnection: StableSwapHourDataConnection;
  stableSwapInfoById?: Maybe<StableSwapInfo>;
  stableSwapInfos: Array<StableSwapInfo>;
  stableSwapInfosConnection: StableSwapInfosConnection;
  stableSwapLiquidityPositionById?: Maybe<StableSwapLiquidityPosition>;
  stableSwapLiquidityPositions: Array<StableSwapLiquidityPosition>;
  stableSwapLiquidityPositionsConnection: StableSwapLiquidityPositionsConnection;
  stableSwaps: Array<StableSwap>;
  stableSwapsConnection: StableSwapsConnection;
  stakePositionById?: Maybe<StakePosition>;
  stakePositions: Array<StakePosition>;
  stakePositionsConnection: StakePositionsConnection;
  swapById?: Maybe<Swap>;
  swapPoolById?: Maybe<SwapPool>;
  swapPools: Array<SwapPool>;
  swapPoolsConnection: SwapPoolsConnection;
  swaps: Array<Swap>;
  swapsConnection: SwapsConnection;
  tokenById?: Maybe<Token>;
  tokenDayData: Array<TokenDayData>;
  tokenDayDataById?: Maybe<TokenDayData>;
  tokenDayDataConnection: TokenDayDataConnection;
  tokenDepositById?: Maybe<TokenDeposit>;
  tokenDeposits: Array<TokenDeposit>;
  tokenDepositsConnection: TokenDepositsConnection;
  tokenTransferById?: Maybe<TokenTransfer>;
  tokenTransfers: Array<TokenTransfer>;
  tokenTransfersConnection: TokenTransfersConnection;
  tokenWithdrawnById?: Maybe<TokenWithdrawn>;
  tokenWithdrawns: Array<TokenWithdrawn>;
  tokenWithdrawnsConnection: TokenWithdrawnsConnection;
  tokens: Array<Token>;
  tokensConnection: TokensConnection;
  transactionById?: Maybe<Transaction>;
  transactions: Array<Transaction>;
  transactionsConnection: TransactionsConnection;
  transferById?: Maybe<Transfer>;
  transfers: Array<Transfer>;
  transfersConnection: TransfersConnection;
  userById?: Maybe<User>;
  users: Array<User>;
  usersConnection: UsersConnection;
  vaultById?: Maybe<Vault>;
  vaults: Array<Vault>;
  vaultsConnection: VaultsConnection;
  zenlinkDayInfoById?: Maybe<ZenlinkDayInfo>;
  zenlinkDayInfos: Array<ZenlinkDayInfo>;
  zenlinkDayInfosConnection: ZenlinkDayInfosConnection;
  zenlinkInfoById?: Maybe<ZenlinkInfo>;
  zenlinkInfos: Array<ZenlinkInfo>;
  zenlinkInfosConnection: ZenlinkInfosConnection;
  zlkInfoById?: Maybe<ZlkInfo>;
  zlkInfos: Array<ZlkInfo>;
  zlkInfosConnection: ZlkInfosConnection;
};


export type QueryBackstopPoolByIdArgs = {
  id: Scalars['String']['input'];
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


export type QueryBlockByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryBlocksArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<BlockOrderByInput>>;
  where?: InputMaybe<BlockWhereInput>;
};


export type QueryBlocksConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<BlockOrderByInput>;
  where?: InputMaybe<BlockWhereInput>;
};


export type QueryBundleByIdArgs = {
  id: Scalars['String']['input'];
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


export type QueryCallByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryCallsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<CallOrderByInput>>;
  where?: InputMaybe<CallWhereInput>;
};


export type QueryCallsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<CallOrderByInput>;
  where?: InputMaybe<CallWhereInput>;
};


export type QueryEventByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryEventsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<EventOrderByInput>>;
  where?: InputMaybe<EventWhereInput>;
};


export type QueryEventsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<EventOrderByInput>;
  where?: InputMaybe<EventWhereInput>;
};


export type QueryExtrinsicByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryExtrinsicsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ExtrinsicOrderByInput>>;
  where?: InputMaybe<ExtrinsicWhereInput>;
};


export type QueryExtrinsicsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<ExtrinsicOrderByInput>;
  where?: InputMaybe<ExtrinsicWhereInput>;
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


export type QueryFactoryDayDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<FactoryDayDataOrderByInput>>;
  where?: InputMaybe<FactoryDayDataWhereInput>;
};


export type QueryFactoryDayDataByIdArgs = {
  id: Scalars['String']['input'];
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


export type QueryIssueRequestByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryIssueRequestsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<IssueRequestOrderByInput>>;
  where?: InputMaybe<IssueRequestWhereInput>;
};


export type QueryIssueRequestsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<IssueRequestOrderByInput>;
  where?: InputMaybe<IssueRequestWhereInput>;
};


export type QueryItemsCounterByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryItemsCountersArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ItemsCounterOrderByInput>>;
  where?: InputMaybe<ItemsCounterWhereInput>;
};


export type QueryItemsCountersConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<ItemsCounterOrderByInput>;
  where?: InputMaybe<ItemsCounterWhereInput>;
};


export type QueryLiquidityPositionByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryLiquidityPositionSnapshotByIdArgs = {
  id: Scalars['String']['input'];
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


export type QueryNablaBackstopLiquidityDepositByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryNablaBackstopLiquidityDepositsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<NablaBackstopLiquidityDepositOrderByInput>>;
  where?: InputMaybe<NablaBackstopLiquidityDepositWhereInput>;
};


export type QueryNablaBackstopLiquidityDepositsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<NablaBackstopLiquidityDepositOrderByInput>;
  where?: InputMaybe<NablaBackstopLiquidityDepositWhereInput>;
};


export type QueryNablaBackstopLiquidityWithdrawalByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryNablaBackstopLiquidityWithdrawalsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<NablaBackstopLiquidityWithdrawalOrderByInput>>;
  where?: InputMaybe<NablaBackstopLiquidityWithdrawalWhereInput>;
};


export type QueryNablaBackstopLiquidityWithdrawalsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<NablaBackstopLiquidityWithdrawalOrderByInput>;
  where?: InputMaybe<NablaBackstopLiquidityWithdrawalWhereInput>;
};


export type QueryNablaSwapByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryNablaSwapFeeByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryNablaSwapFeesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<NablaSwapFeeOrderByInput>>;
  where?: InputMaybe<NablaSwapFeeWhereInput>;
};


export type QueryNablaSwapFeesConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<NablaSwapFeeOrderByInput>;
  where?: InputMaybe<NablaSwapFeeWhereInput>;
};


export type QueryNablaSwapLiquidityDepositByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryNablaSwapLiquidityDepositsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<NablaSwapLiquidityDepositOrderByInput>>;
  where?: InputMaybe<NablaSwapLiquidityDepositWhereInput>;
};


export type QueryNablaSwapLiquidityDepositsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<NablaSwapLiquidityDepositOrderByInput>;
  where?: InputMaybe<NablaSwapLiquidityDepositWhereInput>;
};


export type QueryNablaSwapLiquidityWithdrawalByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryNablaSwapLiquidityWithdrawalsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<NablaSwapLiquidityWithdrawalOrderByInput>>;
  where?: InputMaybe<NablaSwapLiquidityWithdrawalWhereInput>;
};


export type QueryNablaSwapLiquidityWithdrawalsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<NablaSwapLiquidityWithdrawalOrderByInput>;
  where?: InputMaybe<NablaSwapLiquidityWithdrawalWhereInput>;
};


export type QueryNablaSwapsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<NablaSwapOrderByInput>>;
  where?: InputMaybe<NablaSwapWhereInput>;
};


export type QueryNablaSwapsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<NablaSwapOrderByInput>;
  where?: InputMaybe<NablaSwapWhereInput>;
};


export type QueryNablaTokenByIdArgs = {
  id: Scalars['String']['input'];
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


export type QueryPairDayDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<PairDayDataOrderByInput>>;
  where?: InputMaybe<PairDayDataWhereInput>;
};


export type QueryPairDayDataByIdArgs = {
  id: Scalars['String']['input'];
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


export type QueryRedeemRequestByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryRedeemRequestsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<RedeemRequestOrderByInput>>;
  where?: InputMaybe<RedeemRequestWhereInput>;
};


export type QueryRedeemRequestsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<RedeemRequestOrderByInput>;
  where?: InputMaybe<RedeemRequestWhereInput>;
};


export type QueryRouterByIdArgs = {
  id: Scalars['String']['input'];
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


export type QuerySingleTokenLockDayDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SingleTokenLockDayDataOrderByInput>>;
  where?: InputMaybe<SingleTokenLockDayDataWhereInput>;
};


export type QuerySingleTokenLockDayDataByIdArgs = {
  id: Scalars['String']['input'];
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


export type QueryStableDayDataConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<StableDayDataOrderByInput>;
  where?: InputMaybe<StableDayDataWhereInput>;
};


export type QueryStableSwapByIdArgs = {
  id: Scalars['String']['input'];
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


export type QueryStableSwapDayDataConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<StableSwapDayDataOrderByInput>;
  where?: InputMaybe<StableSwapDayDataWhereInput>;
};


export type QueryStableSwapEventByIdArgs = {
  id: Scalars['String']['input'];
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


export type QueryStableSwapHourDataConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<StableSwapHourDataOrderByInput>;
  where?: InputMaybe<StableSwapHourDataWhereInput>;
};


export type QueryStableSwapInfoByIdArgs = {
  id: Scalars['String']['input'];
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


export type QuerySwapPoolByIdArgs = {
  id: Scalars['String']['input'];
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


export type QueryTokenDayDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<TokenDayDataOrderByInput>>;
  where?: InputMaybe<TokenDayDataWhereInput>;
};


export type QueryTokenDayDataByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryTokenDayDataConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<TokenDayDataOrderByInput>;
  where?: InputMaybe<TokenDayDataWhereInput>;
};


export type QueryTokenDepositByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryTokenDepositsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<TokenDepositOrderByInput>>;
  where?: InputMaybe<TokenDepositWhereInput>;
};


export type QueryTokenDepositsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<TokenDepositOrderByInput>;
  where?: InputMaybe<TokenDepositWhereInput>;
};


export type QueryTokenTransferByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryTokenTransfersArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<TokenTransferOrderByInput>>;
  where?: InputMaybe<TokenTransferWhereInput>;
};


export type QueryTokenTransfersConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<TokenTransferOrderByInput>;
  where?: InputMaybe<TokenTransferWhereInput>;
};


export type QueryTokenWithdrawnByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryTokenWithdrawnsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<TokenWithdrawnOrderByInput>>;
  where?: InputMaybe<TokenWithdrawnWhereInput>;
};


export type QueryTokenWithdrawnsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<TokenWithdrawnOrderByInput>;
  where?: InputMaybe<TokenWithdrawnWhereInput>;
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


export type QueryVaultByIdArgs = {
  id: Scalars['String']['input'];
};


export type QueryVaultsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<VaultOrderByInput>>;
  where?: InputMaybe<VaultWhereInput>;
};


export type QueryVaultsConnectionArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  orderBy: Array<VaultOrderByInput>;
  where?: InputMaybe<VaultWhereInput>;
};


export type QueryZenlinkDayInfoByIdArgs = {
  id: Scalars['String']['input'];
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

export type RedeemRequest = {
  __typename?: 'RedeemRequest';
  amount: Scalars['BigInt']['output'];
  asset: Scalars['String']['output'];
  fee: Scalars['BigInt']['output'];
  id: Scalars['String']['output'];
  opentime: Scalars['BigInt']['output'];
  period: Scalars['BigInt']['output'];
  premium: Scalars['BigInt']['output'];
  redeemer: Scalars['String']['output'];
  status: RedeemRequestStatus;
  stellarAddress: Scalars['String']['output'];
  timestamp: Scalars['DateTime']['output'];
  transferFee: Scalars['BigInt']['output'];
  vault: Vault;
};

export type RedeemRequestEdge = {
  __typename?: 'RedeemRequestEdge';
  cursor: Scalars['String']['output'];
  node: RedeemRequest;
};

export enum RedeemRequestOrderByInput {
  AmountAsc = 'amount_ASC',
  AmountAscNullsFirst = 'amount_ASC_NULLS_FIRST',
  AmountAscNullsLast = 'amount_ASC_NULLS_LAST',
  AmountDesc = 'amount_DESC',
  AmountDescNullsFirst = 'amount_DESC_NULLS_FIRST',
  AmountDescNullsLast = 'amount_DESC_NULLS_LAST',
  AssetAsc = 'asset_ASC',
  AssetAscNullsFirst = 'asset_ASC_NULLS_FIRST',
  AssetAscNullsLast = 'asset_ASC_NULLS_LAST',
  AssetDesc = 'asset_DESC',
  AssetDescNullsFirst = 'asset_DESC_NULLS_FIRST',
  AssetDescNullsLast = 'asset_DESC_NULLS_LAST',
  FeeAsc = 'fee_ASC',
  FeeAscNullsFirst = 'fee_ASC_NULLS_FIRST',
  FeeAscNullsLast = 'fee_ASC_NULLS_LAST',
  FeeDesc = 'fee_DESC',
  FeeDescNullsFirst = 'fee_DESC_NULLS_FIRST',
  FeeDescNullsLast = 'fee_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  OpentimeAsc = 'opentime_ASC',
  OpentimeAscNullsFirst = 'opentime_ASC_NULLS_FIRST',
  OpentimeAscNullsLast = 'opentime_ASC_NULLS_LAST',
  OpentimeDesc = 'opentime_DESC',
  OpentimeDescNullsFirst = 'opentime_DESC_NULLS_FIRST',
  OpentimeDescNullsLast = 'opentime_DESC_NULLS_LAST',
  PeriodAsc = 'period_ASC',
  PeriodAscNullsFirst = 'period_ASC_NULLS_FIRST',
  PeriodAscNullsLast = 'period_ASC_NULLS_LAST',
  PeriodDesc = 'period_DESC',
  PeriodDescNullsFirst = 'period_DESC_NULLS_FIRST',
  PeriodDescNullsLast = 'period_DESC_NULLS_LAST',
  PremiumAsc = 'premium_ASC',
  PremiumAscNullsFirst = 'premium_ASC_NULLS_FIRST',
  PremiumAscNullsLast = 'premium_ASC_NULLS_LAST',
  PremiumDesc = 'premium_DESC',
  PremiumDescNullsFirst = 'premium_DESC_NULLS_FIRST',
  PremiumDescNullsLast = 'premium_DESC_NULLS_LAST',
  RedeemerAsc = 'redeemer_ASC',
  RedeemerAscNullsFirst = 'redeemer_ASC_NULLS_FIRST',
  RedeemerAscNullsLast = 'redeemer_ASC_NULLS_LAST',
  RedeemerDesc = 'redeemer_DESC',
  RedeemerDescNullsFirst = 'redeemer_DESC_NULLS_FIRST',
  RedeemerDescNullsLast = 'redeemer_DESC_NULLS_LAST',
  StatusAsc = 'status_ASC',
  StatusAscNullsFirst = 'status_ASC_NULLS_FIRST',
  StatusAscNullsLast = 'status_ASC_NULLS_LAST',
  StatusDesc = 'status_DESC',
  StatusDescNullsFirst = 'status_DESC_NULLS_FIRST',
  StatusDescNullsLast = 'status_DESC_NULLS_LAST',
  StellarAddressAsc = 'stellarAddress_ASC',
  StellarAddressAscNullsFirst = 'stellarAddress_ASC_NULLS_FIRST',
  StellarAddressAscNullsLast = 'stellarAddress_ASC_NULLS_LAST',
  StellarAddressDesc = 'stellarAddress_DESC',
  StellarAddressDescNullsFirst = 'stellarAddress_DESC_NULLS_FIRST',
  StellarAddressDescNullsLast = 'stellarAddress_DESC_NULLS_LAST',
  TimestampAsc = 'timestamp_ASC',
  TimestampAscNullsFirst = 'timestamp_ASC_NULLS_FIRST',
  TimestampAscNullsLast = 'timestamp_ASC_NULLS_LAST',
  TimestampDesc = 'timestamp_DESC',
  TimestampDescNullsFirst = 'timestamp_DESC_NULLS_FIRST',
  TimestampDescNullsLast = 'timestamp_DESC_NULLS_LAST',
  TransferFeeAsc = 'transferFee_ASC',
  TransferFeeAscNullsFirst = 'transferFee_ASC_NULLS_FIRST',
  TransferFeeAscNullsLast = 'transferFee_ASC_NULLS_LAST',
  TransferFeeDesc = 'transferFee_DESC',
  TransferFeeDescNullsFirst = 'transferFee_DESC_NULLS_FIRST',
  TransferFeeDescNullsLast = 'transferFee_DESC_NULLS_LAST',
  VaultAccountIdAsc = 'vault_accountId_ASC',
  VaultAccountIdAscNullsFirst = 'vault_accountId_ASC_NULLS_FIRST',
  VaultAccountIdAscNullsLast = 'vault_accountId_ASC_NULLS_LAST',
  VaultAccountIdDesc = 'vault_accountId_DESC',
  VaultAccountIdDescNullsFirst = 'vault_accountId_DESC_NULLS_FIRST',
  VaultAccountIdDescNullsLast = 'vault_accountId_DESC_NULLS_LAST',
  VaultCollateralAsc = 'vault_collateral_ASC',
  VaultCollateralAscNullsFirst = 'vault_collateral_ASC_NULLS_FIRST',
  VaultCollateralAscNullsLast = 'vault_collateral_ASC_NULLS_LAST',
  VaultCollateralDesc = 'vault_collateral_DESC',
  VaultCollateralDescNullsFirst = 'vault_collateral_DESC_NULLS_FIRST',
  VaultCollateralDescNullsLast = 'vault_collateral_DESC_NULLS_LAST',
  VaultIdAsc = 'vault_id_ASC',
  VaultIdAscNullsFirst = 'vault_id_ASC_NULLS_FIRST',
  VaultIdAscNullsLast = 'vault_id_ASC_NULLS_LAST',
  VaultIdDesc = 'vault_id_DESC',
  VaultIdDescNullsFirst = 'vault_id_DESC_NULLS_FIRST',
  VaultIdDescNullsLast = 'vault_id_DESC_NULLS_LAST',
  VaultVaultStellarPublicKeyAsc = 'vault_vaultStellarPublicKey_ASC',
  VaultVaultStellarPublicKeyAscNullsFirst = 'vault_vaultStellarPublicKey_ASC_NULLS_FIRST',
  VaultVaultStellarPublicKeyAscNullsLast = 'vault_vaultStellarPublicKey_ASC_NULLS_LAST',
  VaultVaultStellarPublicKeyDesc = 'vault_vaultStellarPublicKey_DESC',
  VaultVaultStellarPublicKeyDescNullsFirst = 'vault_vaultStellarPublicKey_DESC_NULLS_FIRST',
  VaultVaultStellarPublicKeyDescNullsLast = 'vault_vaultStellarPublicKey_DESC_NULLS_LAST',
  VaultWrappedAsc = 'vault_wrapped_ASC',
  VaultWrappedAscNullsFirst = 'vault_wrapped_ASC_NULLS_FIRST',
  VaultWrappedAscNullsLast = 'vault_wrapped_ASC_NULLS_LAST',
  VaultWrappedDesc = 'vault_wrapped_DESC',
  VaultWrappedDescNullsFirst = 'vault_wrapped_DESC_NULLS_FIRST',
  VaultWrappedDescNullsLast = 'vault_wrapped_DESC_NULLS_LAST'
}

export enum RedeemRequestStatus {
  Completed = 'COMPLETED',
  Pending = 'PENDING',
  Reimbursed = 'REIMBURSED',
  ReimbursedMinted = 'REIMBURSED_MINTED',
  Retried = 'RETRIED'
}

export type RedeemRequestWhereInput = {
  AND?: InputMaybe<Array<RedeemRequestWhereInput>>;
  OR?: InputMaybe<Array<RedeemRequestWhereInput>>;
  amount_eq?: InputMaybe<Scalars['BigInt']['input']>;
  amount_gt?: InputMaybe<Scalars['BigInt']['input']>;
  amount_gte?: InputMaybe<Scalars['BigInt']['input']>;
  amount_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  amount_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  amount_lt?: InputMaybe<Scalars['BigInt']['input']>;
  amount_lte?: InputMaybe<Scalars['BigInt']['input']>;
  amount_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  amount_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  asset_contains?: InputMaybe<Scalars['String']['input']>;
  asset_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  asset_endsWith?: InputMaybe<Scalars['String']['input']>;
  asset_eq?: InputMaybe<Scalars['String']['input']>;
  asset_gt?: InputMaybe<Scalars['String']['input']>;
  asset_gte?: InputMaybe<Scalars['String']['input']>;
  asset_in?: InputMaybe<Array<Scalars['String']['input']>>;
  asset_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  asset_lt?: InputMaybe<Scalars['String']['input']>;
  asset_lte?: InputMaybe<Scalars['String']['input']>;
  asset_not_contains?: InputMaybe<Scalars['String']['input']>;
  asset_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  asset_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  asset_not_eq?: InputMaybe<Scalars['String']['input']>;
  asset_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  asset_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  asset_startsWith?: InputMaybe<Scalars['String']['input']>;
  fee_eq?: InputMaybe<Scalars['BigInt']['input']>;
  fee_gt?: InputMaybe<Scalars['BigInt']['input']>;
  fee_gte?: InputMaybe<Scalars['BigInt']['input']>;
  fee_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  fee_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  fee_lt?: InputMaybe<Scalars['BigInt']['input']>;
  fee_lte?: InputMaybe<Scalars['BigInt']['input']>;
  fee_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  fee_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
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
  opentime_eq?: InputMaybe<Scalars['BigInt']['input']>;
  opentime_gt?: InputMaybe<Scalars['BigInt']['input']>;
  opentime_gte?: InputMaybe<Scalars['BigInt']['input']>;
  opentime_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  opentime_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  opentime_lt?: InputMaybe<Scalars['BigInt']['input']>;
  opentime_lte?: InputMaybe<Scalars['BigInt']['input']>;
  opentime_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  opentime_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  period_eq?: InputMaybe<Scalars['BigInt']['input']>;
  period_gt?: InputMaybe<Scalars['BigInt']['input']>;
  period_gte?: InputMaybe<Scalars['BigInt']['input']>;
  period_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  period_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  period_lt?: InputMaybe<Scalars['BigInt']['input']>;
  period_lte?: InputMaybe<Scalars['BigInt']['input']>;
  period_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  period_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  premium_eq?: InputMaybe<Scalars['BigInt']['input']>;
  premium_gt?: InputMaybe<Scalars['BigInt']['input']>;
  premium_gte?: InputMaybe<Scalars['BigInt']['input']>;
  premium_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  premium_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  premium_lt?: InputMaybe<Scalars['BigInt']['input']>;
  premium_lte?: InputMaybe<Scalars['BigInt']['input']>;
  premium_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  premium_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  redeemer_contains?: InputMaybe<Scalars['String']['input']>;
  redeemer_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  redeemer_endsWith?: InputMaybe<Scalars['String']['input']>;
  redeemer_eq?: InputMaybe<Scalars['String']['input']>;
  redeemer_gt?: InputMaybe<Scalars['String']['input']>;
  redeemer_gte?: InputMaybe<Scalars['String']['input']>;
  redeemer_in?: InputMaybe<Array<Scalars['String']['input']>>;
  redeemer_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  redeemer_lt?: InputMaybe<Scalars['String']['input']>;
  redeemer_lte?: InputMaybe<Scalars['String']['input']>;
  redeemer_not_contains?: InputMaybe<Scalars['String']['input']>;
  redeemer_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  redeemer_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  redeemer_not_eq?: InputMaybe<Scalars['String']['input']>;
  redeemer_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  redeemer_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  redeemer_startsWith?: InputMaybe<Scalars['String']['input']>;
  status_eq?: InputMaybe<RedeemRequestStatus>;
  status_in?: InputMaybe<Array<RedeemRequestStatus>>;
  status_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  status_not_eq?: InputMaybe<RedeemRequestStatus>;
  status_not_in?: InputMaybe<Array<RedeemRequestStatus>>;
  stellarAddress_contains?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_endsWith?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_eq?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_gt?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_gte?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_in?: InputMaybe<Array<Scalars['String']['input']>>;
  stellarAddress_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  stellarAddress_lt?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_lte?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_not_contains?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_not_eq?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  stellarAddress_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  stellarAddress_startsWith?: InputMaybe<Scalars['String']['input']>;
  timestamp_eq?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_gt?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_gte?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  timestamp_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  timestamp_lt?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_lte?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_not_eq?: InputMaybe<Scalars['DateTime']['input']>;
  timestamp_not_in?: InputMaybe<Array<Scalars['DateTime']['input']>>;
  transferFee_eq?: InputMaybe<Scalars['BigInt']['input']>;
  transferFee_gt?: InputMaybe<Scalars['BigInt']['input']>;
  transferFee_gte?: InputMaybe<Scalars['BigInt']['input']>;
  transferFee_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  transferFee_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  transferFee_lt?: InputMaybe<Scalars['BigInt']['input']>;
  transferFee_lte?: InputMaybe<Scalars['BigInt']['input']>;
  transferFee_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  transferFee_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  vault?: InputMaybe<VaultWhereInput>;
  vault_isNull?: InputMaybe<Scalars['Boolean']['input']>;
};

export type RedeemRequestsConnection = {
  __typename?: 'RedeemRequestsConnection';
  edges: Array<RedeemRequestEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type Router = {
  __typename?: 'Router';
  backstopPool: Array<BackstopPool>;
  id: Scalars['String']['output'];
  paused: Scalars['Boolean']['output'];
  swapPools: Array<SwapPool>;
};


export type RouterBackstopPoolArgs = {
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
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  PausedAsc = 'paused_ASC',
  PausedAscNullsFirst = 'paused_ASC_NULLS_FIRST',
  PausedAscNullsLast = 'paused_ASC_NULLS_LAST',
  PausedDesc = 'paused_DESC',
  PausedDescNullsFirst = 'paused_DESC_NULLS_FIRST',
  PausedDescNullsLast = 'paused_DESC_NULLS_LAST'
}

export type RouterWhereInput = {
  AND?: InputMaybe<Array<RouterWhereInput>>;
  OR?: InputMaybe<Array<RouterWhereInput>>;
  backstopPool_every?: InputMaybe<BackstopPoolWhereInput>;
  backstopPool_none?: InputMaybe<BackstopPoolWhereInput>;
  backstopPool_some?: InputMaybe<BackstopPoolWhereInput>;
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
  DateAscNullsFirst = 'date_ASC_NULLS_FIRST',
  DateAscNullsLast = 'date_ASC_NULLS_LAST',
  DateDesc = 'date_DESC',
  DateDescNullsFirst = 'date_DESC_NULLS_FIRST',
  DateDescNullsLast = 'date_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  SingleTokenLockIdAsc = 'singleTokenLock_id_ASC',
  SingleTokenLockIdAscNullsFirst = 'singleTokenLock_id_ASC_NULLS_FIRST',
  SingleTokenLockIdAscNullsLast = 'singleTokenLock_id_ASC_NULLS_LAST',
  SingleTokenLockIdDesc = 'singleTokenLock_id_DESC',
  SingleTokenLockIdDescNullsFirst = 'singleTokenLock_id_DESC_NULLS_FIRST',
  SingleTokenLockIdDescNullsLast = 'singleTokenLock_id_DESC_NULLS_LAST',
  SingleTokenLockTotalLiquidityEthAsc = 'singleTokenLock_totalLiquidityETH_ASC',
  SingleTokenLockTotalLiquidityEthAscNullsFirst = 'singleTokenLock_totalLiquidityETH_ASC_NULLS_FIRST',
  SingleTokenLockTotalLiquidityEthAscNullsLast = 'singleTokenLock_totalLiquidityETH_ASC_NULLS_LAST',
  SingleTokenLockTotalLiquidityEthDesc = 'singleTokenLock_totalLiquidityETH_DESC',
  SingleTokenLockTotalLiquidityEthDescNullsFirst = 'singleTokenLock_totalLiquidityETH_DESC_NULLS_FIRST',
  SingleTokenLockTotalLiquidityEthDescNullsLast = 'singleTokenLock_totalLiquidityETH_DESC_NULLS_LAST',
  SingleTokenLockTotalLiquidityUsdAsc = 'singleTokenLock_totalLiquidityUSD_ASC',
  SingleTokenLockTotalLiquidityUsdAscNullsFirst = 'singleTokenLock_totalLiquidityUSD_ASC_NULLS_FIRST',
  SingleTokenLockTotalLiquidityUsdAscNullsLast = 'singleTokenLock_totalLiquidityUSD_ASC_NULLS_LAST',
  SingleTokenLockTotalLiquidityUsdDesc = 'singleTokenLock_totalLiquidityUSD_DESC',
  SingleTokenLockTotalLiquidityUsdDescNullsFirst = 'singleTokenLock_totalLiquidityUSD_DESC_NULLS_FIRST',
  SingleTokenLockTotalLiquidityUsdDescNullsLast = 'singleTokenLock_totalLiquidityUSD_DESC_NULLS_LAST',
  SingleTokenLockTotalLiquidityAsc = 'singleTokenLock_totalLiquidity_ASC',
  SingleTokenLockTotalLiquidityAscNullsFirst = 'singleTokenLock_totalLiquidity_ASC_NULLS_FIRST',
  SingleTokenLockTotalLiquidityAscNullsLast = 'singleTokenLock_totalLiquidity_ASC_NULLS_LAST',
  SingleTokenLockTotalLiquidityDesc = 'singleTokenLock_totalLiquidity_DESC',
  SingleTokenLockTotalLiquidityDescNullsFirst = 'singleTokenLock_totalLiquidity_DESC_NULLS_FIRST',
  SingleTokenLockTotalLiquidityDescNullsLast = 'singleTokenLock_totalLiquidity_DESC_NULLS_LAST',
  TotalLiquidityEthAsc = 'totalLiquidityETH_ASC',
  TotalLiquidityEthAscNullsFirst = 'totalLiquidityETH_ASC_NULLS_FIRST',
  TotalLiquidityEthAscNullsLast = 'totalLiquidityETH_ASC_NULLS_LAST',
  TotalLiquidityEthDesc = 'totalLiquidityETH_DESC',
  TotalLiquidityEthDescNullsFirst = 'totalLiquidityETH_DESC_NULLS_FIRST',
  TotalLiquidityEthDescNullsLast = 'totalLiquidityETH_DESC_NULLS_LAST',
  TotalLiquidityUsdAsc = 'totalLiquidityUSD_ASC',
  TotalLiquidityUsdAscNullsFirst = 'totalLiquidityUSD_ASC_NULLS_FIRST',
  TotalLiquidityUsdAscNullsLast = 'totalLiquidityUSD_ASC_NULLS_LAST',
  TotalLiquidityUsdDesc = 'totalLiquidityUSD_DESC',
  TotalLiquidityUsdDescNullsFirst = 'totalLiquidityUSD_DESC_NULLS_FIRST',
  TotalLiquidityUsdDescNullsLast = 'totalLiquidityUSD_DESC_NULLS_LAST',
  TotalLiquidityAsc = 'totalLiquidity_ASC',
  TotalLiquidityAscNullsFirst = 'totalLiquidity_ASC_NULLS_FIRST',
  TotalLiquidityAscNullsLast = 'totalLiquidity_ASC_NULLS_LAST',
  TotalLiquidityDesc = 'totalLiquidity_DESC',
  TotalLiquidityDescNullsFirst = 'totalLiquidity_DESC_NULLS_FIRST',
  TotalLiquidityDescNullsLast = 'totalLiquidity_DESC_NULLS_LAST'
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
  HourStartUnixAscNullsFirst = 'hourStartUnix_ASC_NULLS_FIRST',
  HourStartUnixAscNullsLast = 'hourStartUnix_ASC_NULLS_LAST',
  HourStartUnixDesc = 'hourStartUnix_DESC',
  HourStartUnixDescNullsFirst = 'hourStartUnix_DESC_NULLS_FIRST',
  HourStartUnixDescNullsLast = 'hourStartUnix_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  SingleTokenLockIdAsc = 'singleTokenLock_id_ASC',
  SingleTokenLockIdAscNullsFirst = 'singleTokenLock_id_ASC_NULLS_FIRST',
  SingleTokenLockIdAscNullsLast = 'singleTokenLock_id_ASC_NULLS_LAST',
  SingleTokenLockIdDesc = 'singleTokenLock_id_DESC',
  SingleTokenLockIdDescNullsFirst = 'singleTokenLock_id_DESC_NULLS_FIRST',
  SingleTokenLockIdDescNullsLast = 'singleTokenLock_id_DESC_NULLS_LAST',
  SingleTokenLockTotalLiquidityEthAsc = 'singleTokenLock_totalLiquidityETH_ASC',
  SingleTokenLockTotalLiquidityEthAscNullsFirst = 'singleTokenLock_totalLiquidityETH_ASC_NULLS_FIRST',
  SingleTokenLockTotalLiquidityEthAscNullsLast = 'singleTokenLock_totalLiquidityETH_ASC_NULLS_LAST',
  SingleTokenLockTotalLiquidityEthDesc = 'singleTokenLock_totalLiquidityETH_DESC',
  SingleTokenLockTotalLiquidityEthDescNullsFirst = 'singleTokenLock_totalLiquidityETH_DESC_NULLS_FIRST',
  SingleTokenLockTotalLiquidityEthDescNullsLast = 'singleTokenLock_totalLiquidityETH_DESC_NULLS_LAST',
  SingleTokenLockTotalLiquidityUsdAsc = 'singleTokenLock_totalLiquidityUSD_ASC',
  SingleTokenLockTotalLiquidityUsdAscNullsFirst = 'singleTokenLock_totalLiquidityUSD_ASC_NULLS_FIRST',
  SingleTokenLockTotalLiquidityUsdAscNullsLast = 'singleTokenLock_totalLiquidityUSD_ASC_NULLS_LAST',
  SingleTokenLockTotalLiquidityUsdDesc = 'singleTokenLock_totalLiquidityUSD_DESC',
  SingleTokenLockTotalLiquidityUsdDescNullsFirst = 'singleTokenLock_totalLiquidityUSD_DESC_NULLS_FIRST',
  SingleTokenLockTotalLiquidityUsdDescNullsLast = 'singleTokenLock_totalLiquidityUSD_DESC_NULLS_LAST',
  SingleTokenLockTotalLiquidityAsc = 'singleTokenLock_totalLiquidity_ASC',
  SingleTokenLockTotalLiquidityAscNullsFirst = 'singleTokenLock_totalLiquidity_ASC_NULLS_FIRST',
  SingleTokenLockTotalLiquidityAscNullsLast = 'singleTokenLock_totalLiquidity_ASC_NULLS_LAST',
  SingleTokenLockTotalLiquidityDesc = 'singleTokenLock_totalLiquidity_DESC',
  SingleTokenLockTotalLiquidityDescNullsFirst = 'singleTokenLock_totalLiquidity_DESC_NULLS_FIRST',
  SingleTokenLockTotalLiquidityDescNullsLast = 'singleTokenLock_totalLiquidity_DESC_NULLS_LAST',
  TotalLiquidityEthAsc = 'totalLiquidityETH_ASC',
  TotalLiquidityEthAscNullsFirst = 'totalLiquidityETH_ASC_NULLS_FIRST',
  TotalLiquidityEthAscNullsLast = 'totalLiquidityETH_ASC_NULLS_LAST',
  TotalLiquidityEthDesc = 'totalLiquidityETH_DESC',
  TotalLiquidityEthDescNullsFirst = 'totalLiquidityETH_DESC_NULLS_FIRST',
  TotalLiquidityEthDescNullsLast = 'totalLiquidityETH_DESC_NULLS_LAST',
  TotalLiquidityUsdAsc = 'totalLiquidityUSD_ASC',
  TotalLiquidityUsdAscNullsFirst = 'totalLiquidityUSD_ASC_NULLS_FIRST',
  TotalLiquidityUsdAscNullsLast = 'totalLiquidityUSD_ASC_NULLS_LAST',
  TotalLiquidityUsdDesc = 'totalLiquidityUSD_DESC',
  TotalLiquidityUsdDescNullsFirst = 'totalLiquidityUSD_DESC_NULLS_FIRST',
  TotalLiquidityUsdDescNullsLast = 'totalLiquidityUSD_DESC_NULLS_LAST',
  TotalLiquidityAsc = 'totalLiquidity_ASC',
  TotalLiquidityAscNullsFirst = 'totalLiquidity_ASC_NULLS_FIRST',
  TotalLiquidityAscNullsLast = 'totalLiquidity_ASC_NULLS_LAST',
  TotalLiquidityDesc = 'totalLiquidity_DESC',
  TotalLiquidityDescNullsFirst = 'totalLiquidity_DESC_NULLS_FIRST',
  TotalLiquidityDescNullsLast = 'totalLiquidity_DESC_NULLS_LAST'
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
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  TokenDecimalsAsc = 'token_decimals_ASC',
  TokenDecimalsAscNullsFirst = 'token_decimals_ASC_NULLS_FIRST',
  TokenDecimalsAscNullsLast = 'token_decimals_ASC_NULLS_LAST',
  TokenDecimalsDesc = 'token_decimals_DESC',
  TokenDecimalsDescNullsFirst = 'token_decimals_DESC_NULLS_FIRST',
  TokenDecimalsDescNullsLast = 'token_decimals_DESC_NULLS_LAST',
  TokenDerivedEthAsc = 'token_derivedETH_ASC',
  TokenDerivedEthAscNullsFirst = 'token_derivedETH_ASC_NULLS_FIRST',
  TokenDerivedEthAscNullsLast = 'token_derivedETH_ASC_NULLS_LAST',
  TokenDerivedEthDesc = 'token_derivedETH_DESC',
  TokenDerivedEthDescNullsFirst = 'token_derivedETH_DESC_NULLS_FIRST',
  TokenDerivedEthDescNullsLast = 'token_derivedETH_DESC_NULLS_LAST',
  TokenIdAsc = 'token_id_ASC',
  TokenIdAscNullsFirst = 'token_id_ASC_NULLS_FIRST',
  TokenIdAscNullsLast = 'token_id_ASC_NULLS_LAST',
  TokenIdDesc = 'token_id_DESC',
  TokenIdDescNullsFirst = 'token_id_DESC_NULLS_FIRST',
  TokenIdDescNullsLast = 'token_id_DESC_NULLS_LAST',
  TokenNameAsc = 'token_name_ASC',
  TokenNameAscNullsFirst = 'token_name_ASC_NULLS_FIRST',
  TokenNameAscNullsLast = 'token_name_ASC_NULLS_LAST',
  TokenNameDesc = 'token_name_DESC',
  TokenNameDescNullsFirst = 'token_name_DESC_NULLS_FIRST',
  TokenNameDescNullsLast = 'token_name_DESC_NULLS_LAST',
  TokenSymbolAsc = 'token_symbol_ASC',
  TokenSymbolAscNullsFirst = 'token_symbol_ASC_NULLS_FIRST',
  TokenSymbolAscNullsLast = 'token_symbol_ASC_NULLS_LAST',
  TokenSymbolDesc = 'token_symbol_DESC',
  TokenSymbolDescNullsFirst = 'token_symbol_DESC_NULLS_FIRST',
  TokenSymbolDescNullsLast = 'token_symbol_DESC_NULLS_LAST',
  TokenTotalLiquidityAsc = 'token_totalLiquidity_ASC',
  TokenTotalLiquidityAscNullsFirst = 'token_totalLiquidity_ASC_NULLS_FIRST',
  TokenTotalLiquidityAscNullsLast = 'token_totalLiquidity_ASC_NULLS_LAST',
  TokenTotalLiquidityDesc = 'token_totalLiquidity_DESC',
  TokenTotalLiquidityDescNullsFirst = 'token_totalLiquidity_DESC_NULLS_FIRST',
  TokenTotalLiquidityDescNullsLast = 'token_totalLiquidity_DESC_NULLS_LAST',
  TokenTotalSupplyAsc = 'token_totalSupply_ASC',
  TokenTotalSupplyAscNullsFirst = 'token_totalSupply_ASC_NULLS_FIRST',
  TokenTotalSupplyAscNullsLast = 'token_totalSupply_ASC_NULLS_LAST',
  TokenTotalSupplyDesc = 'token_totalSupply_DESC',
  TokenTotalSupplyDescNullsFirst = 'token_totalSupply_DESC_NULLS_FIRST',
  TokenTotalSupplyDescNullsLast = 'token_totalSupply_DESC_NULLS_LAST',
  TokenTradeVolumeUsdAsc = 'token_tradeVolumeUSD_ASC',
  TokenTradeVolumeUsdAscNullsFirst = 'token_tradeVolumeUSD_ASC_NULLS_FIRST',
  TokenTradeVolumeUsdAscNullsLast = 'token_tradeVolumeUSD_ASC_NULLS_LAST',
  TokenTradeVolumeUsdDesc = 'token_tradeVolumeUSD_DESC',
  TokenTradeVolumeUsdDescNullsFirst = 'token_tradeVolumeUSD_DESC_NULLS_FIRST',
  TokenTradeVolumeUsdDescNullsLast = 'token_tradeVolumeUSD_DESC_NULLS_LAST',
  TokenTradeVolumeAsc = 'token_tradeVolume_ASC',
  TokenTradeVolumeAscNullsFirst = 'token_tradeVolume_ASC_NULLS_FIRST',
  TokenTradeVolumeAscNullsLast = 'token_tradeVolume_ASC_NULLS_LAST',
  TokenTradeVolumeDesc = 'token_tradeVolume_DESC',
  TokenTradeVolumeDescNullsFirst = 'token_tradeVolume_DESC_NULLS_FIRST',
  TokenTradeVolumeDescNullsLast = 'token_tradeVolume_DESC_NULLS_LAST',
  TokenTxCountAsc = 'token_txCount_ASC',
  TokenTxCountAscNullsFirst = 'token_txCount_ASC_NULLS_FIRST',
  TokenTxCountAscNullsLast = 'token_txCount_ASC_NULLS_LAST',
  TokenTxCountDesc = 'token_txCount_DESC',
  TokenTxCountDescNullsFirst = 'token_txCount_DESC_NULLS_FIRST',
  TokenTxCountDescNullsLast = 'token_txCount_DESC_NULLS_LAST',
  TokenUntrackedVolumeUsdAsc = 'token_untrackedVolumeUSD_ASC',
  TokenUntrackedVolumeUsdAscNullsFirst = 'token_untrackedVolumeUSD_ASC_NULLS_FIRST',
  TokenUntrackedVolumeUsdAscNullsLast = 'token_untrackedVolumeUSD_ASC_NULLS_LAST',
  TokenUntrackedVolumeUsdDesc = 'token_untrackedVolumeUSD_DESC',
  TokenUntrackedVolumeUsdDescNullsFirst = 'token_untrackedVolumeUSD_DESC_NULLS_FIRST',
  TokenUntrackedVolumeUsdDescNullsLast = 'token_untrackedVolumeUSD_DESC_NULLS_LAST',
  TotalLiquidityEthAsc = 'totalLiquidityETH_ASC',
  TotalLiquidityEthAscNullsFirst = 'totalLiquidityETH_ASC_NULLS_FIRST',
  TotalLiquidityEthAscNullsLast = 'totalLiquidityETH_ASC_NULLS_LAST',
  TotalLiquidityEthDesc = 'totalLiquidityETH_DESC',
  TotalLiquidityEthDescNullsFirst = 'totalLiquidityETH_DESC_NULLS_FIRST',
  TotalLiquidityEthDescNullsLast = 'totalLiquidityETH_DESC_NULLS_LAST',
  TotalLiquidityUsdAsc = 'totalLiquidityUSD_ASC',
  TotalLiquidityUsdAscNullsFirst = 'totalLiquidityUSD_ASC_NULLS_FIRST',
  TotalLiquidityUsdAscNullsLast = 'totalLiquidityUSD_ASC_NULLS_LAST',
  TotalLiquidityUsdDesc = 'totalLiquidityUSD_DESC',
  TotalLiquidityUsdDescNullsFirst = 'totalLiquidityUSD_DESC_NULLS_FIRST',
  TotalLiquidityUsdDescNullsLast = 'totalLiquidityUSD_DESC_NULLS_LAST',
  TotalLiquidityAsc = 'totalLiquidity_ASC',
  TotalLiquidityAscNullsFirst = 'totalLiquidity_ASC_NULLS_FIRST',
  TotalLiquidityAscNullsLast = 'totalLiquidity_ASC_NULLS_LAST',
  TotalLiquidityDesc = 'totalLiquidity_DESC',
  TotalLiquidityDescNullsFirst = 'totalLiquidity_DESC_NULLS_FIRST',
  TotalLiquidityDescNullsLast = 'totalLiquidity_DESC_NULLS_LAST'
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
  DailyVolumeUsdAscNullsFirst = 'dailyVolumeUSD_ASC_NULLS_FIRST',
  DailyVolumeUsdAscNullsLast = 'dailyVolumeUSD_ASC_NULLS_LAST',
  DailyVolumeUsdDesc = 'dailyVolumeUSD_DESC',
  DailyVolumeUsdDescNullsFirst = 'dailyVolumeUSD_DESC_NULLS_FIRST',
  DailyVolumeUsdDescNullsLast = 'dailyVolumeUSD_DESC_NULLS_LAST',
  DateAsc = 'date_ASC',
  DateAscNullsFirst = 'date_ASC_NULLS_FIRST',
  DateAscNullsLast = 'date_ASC_NULLS_LAST',
  DateDesc = 'date_DESC',
  DateDescNullsFirst = 'date_DESC_NULLS_FIRST',
  DateDescNullsLast = 'date_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  TvlUsdAsc = 'tvlUSD_ASC',
  TvlUsdAscNullsFirst = 'tvlUSD_ASC_NULLS_FIRST',
  TvlUsdAscNullsLast = 'tvlUSD_ASC_NULLS_LAST',
  TvlUsdDesc = 'tvlUSD_DESC',
  TvlUsdDescNullsFirst = 'tvlUSD_DESC_NULLS_FIRST',
  TvlUsdDescNullsLast = 'tvlUSD_DESC_NULLS_LAST'
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
  DailyVolumeUsdAscNullsFirst = 'dailyVolumeUSD_ASC_NULLS_FIRST',
  DailyVolumeUsdAscNullsLast = 'dailyVolumeUSD_ASC_NULLS_LAST',
  DailyVolumeUsdDesc = 'dailyVolumeUSD_DESC',
  DailyVolumeUsdDescNullsFirst = 'dailyVolumeUSD_DESC_NULLS_FIRST',
  DailyVolumeUsdDescNullsLast = 'dailyVolumeUSD_DESC_NULLS_LAST',
  DateAsc = 'date_ASC',
  DateAscNullsFirst = 'date_ASC_NULLS_FIRST',
  DateAscNullsLast = 'date_ASC_NULLS_LAST',
  DateDesc = 'date_DESC',
  DateDescNullsFirst = 'date_DESC_NULLS_FIRST',
  DateDescNullsLast = 'date_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  StableSwapAAsc = 'stableSwap_a_ASC',
  StableSwapAAscNullsFirst = 'stableSwap_a_ASC_NULLS_FIRST',
  StableSwapAAscNullsLast = 'stableSwap_a_ASC_NULLS_LAST',
  StableSwapADesc = 'stableSwap_a_DESC',
  StableSwapADescNullsFirst = 'stableSwap_a_DESC_NULLS_FIRST',
  StableSwapADescNullsLast = 'stableSwap_a_DESC_NULLS_LAST',
  StableSwapAddressAsc = 'stableSwap_address_ASC',
  StableSwapAddressAscNullsFirst = 'stableSwap_address_ASC_NULLS_FIRST',
  StableSwapAddressAscNullsLast = 'stableSwap_address_ASC_NULLS_LAST',
  StableSwapAddressDesc = 'stableSwap_address_DESC',
  StableSwapAddressDescNullsFirst = 'stableSwap_address_DESC_NULLS_FIRST',
  StableSwapAddressDescNullsLast = 'stableSwap_address_DESC_NULLS_LAST',
  StableSwapAdminFeeAsc = 'stableSwap_adminFee_ASC',
  StableSwapAdminFeeAscNullsFirst = 'stableSwap_adminFee_ASC_NULLS_FIRST',
  StableSwapAdminFeeAscNullsLast = 'stableSwap_adminFee_ASC_NULLS_LAST',
  StableSwapAdminFeeDesc = 'stableSwap_adminFee_DESC',
  StableSwapAdminFeeDescNullsFirst = 'stableSwap_adminFee_DESC_NULLS_FIRST',
  StableSwapAdminFeeDescNullsLast = 'stableSwap_adminFee_DESC_NULLS_LAST',
  StableSwapBaseSwapAddressAsc = 'stableSwap_baseSwapAddress_ASC',
  StableSwapBaseSwapAddressAscNullsFirst = 'stableSwap_baseSwapAddress_ASC_NULLS_FIRST',
  StableSwapBaseSwapAddressAscNullsLast = 'stableSwap_baseSwapAddress_ASC_NULLS_LAST',
  StableSwapBaseSwapAddressDesc = 'stableSwap_baseSwapAddress_DESC',
  StableSwapBaseSwapAddressDescNullsFirst = 'stableSwap_baseSwapAddress_DESC_NULLS_FIRST',
  StableSwapBaseSwapAddressDescNullsLast = 'stableSwap_baseSwapAddress_DESC_NULLS_LAST',
  StableSwapIdAsc = 'stableSwap_id_ASC',
  StableSwapIdAscNullsFirst = 'stableSwap_id_ASC_NULLS_FIRST',
  StableSwapIdAscNullsLast = 'stableSwap_id_ASC_NULLS_LAST',
  StableSwapIdDesc = 'stableSwap_id_DESC',
  StableSwapIdDescNullsFirst = 'stableSwap_id_DESC_NULLS_FIRST',
  StableSwapIdDescNullsLast = 'stableSwap_id_DESC_NULLS_LAST',
  StableSwapLpTokenAsc = 'stableSwap_lpToken_ASC',
  StableSwapLpTokenAscNullsFirst = 'stableSwap_lpToken_ASC_NULLS_FIRST',
  StableSwapLpTokenAscNullsLast = 'stableSwap_lpToken_ASC_NULLS_LAST',
  StableSwapLpTokenDesc = 'stableSwap_lpToken_DESC',
  StableSwapLpTokenDescNullsFirst = 'stableSwap_lpToken_DESC_NULLS_FIRST',
  StableSwapLpTokenDescNullsLast = 'stableSwap_lpToken_DESC_NULLS_LAST',
  StableSwapLpTotalSupplyAsc = 'stableSwap_lpTotalSupply_ASC',
  StableSwapLpTotalSupplyAscNullsFirst = 'stableSwap_lpTotalSupply_ASC_NULLS_FIRST',
  StableSwapLpTotalSupplyAscNullsLast = 'stableSwap_lpTotalSupply_ASC_NULLS_LAST',
  StableSwapLpTotalSupplyDesc = 'stableSwap_lpTotalSupply_DESC',
  StableSwapLpTotalSupplyDescNullsFirst = 'stableSwap_lpTotalSupply_DESC_NULLS_FIRST',
  StableSwapLpTotalSupplyDescNullsLast = 'stableSwap_lpTotalSupply_DESC_NULLS_LAST',
  StableSwapNumTokensAsc = 'stableSwap_numTokens_ASC',
  StableSwapNumTokensAscNullsFirst = 'stableSwap_numTokens_ASC_NULLS_FIRST',
  StableSwapNumTokensAscNullsLast = 'stableSwap_numTokens_ASC_NULLS_LAST',
  StableSwapNumTokensDesc = 'stableSwap_numTokens_DESC',
  StableSwapNumTokensDescNullsFirst = 'stableSwap_numTokens_DESC_NULLS_FIRST',
  StableSwapNumTokensDescNullsLast = 'stableSwap_numTokens_DESC_NULLS_LAST',
  StableSwapSwapFeeAsc = 'stableSwap_swapFee_ASC',
  StableSwapSwapFeeAscNullsFirst = 'stableSwap_swapFee_ASC_NULLS_FIRST',
  StableSwapSwapFeeAscNullsLast = 'stableSwap_swapFee_ASC_NULLS_LAST',
  StableSwapSwapFeeDesc = 'stableSwap_swapFee_DESC',
  StableSwapSwapFeeDescNullsFirst = 'stableSwap_swapFee_DESC_NULLS_FIRST',
  StableSwapSwapFeeDescNullsLast = 'stableSwap_swapFee_DESC_NULLS_LAST',
  StableSwapTvlUsdAsc = 'stableSwap_tvlUSD_ASC',
  StableSwapTvlUsdAscNullsFirst = 'stableSwap_tvlUSD_ASC_NULLS_FIRST',
  StableSwapTvlUsdAscNullsLast = 'stableSwap_tvlUSD_ASC_NULLS_LAST',
  StableSwapTvlUsdDesc = 'stableSwap_tvlUSD_DESC',
  StableSwapTvlUsdDescNullsFirst = 'stableSwap_tvlUSD_DESC_NULLS_FIRST',
  StableSwapTvlUsdDescNullsLast = 'stableSwap_tvlUSD_DESC_NULLS_LAST',
  StableSwapVirtualPriceAsc = 'stableSwap_virtualPrice_ASC',
  StableSwapVirtualPriceAscNullsFirst = 'stableSwap_virtualPrice_ASC_NULLS_FIRST',
  StableSwapVirtualPriceAscNullsLast = 'stableSwap_virtualPrice_ASC_NULLS_LAST',
  StableSwapVirtualPriceDesc = 'stableSwap_virtualPrice_DESC',
  StableSwapVirtualPriceDescNullsFirst = 'stableSwap_virtualPrice_DESC_NULLS_FIRST',
  StableSwapVirtualPriceDescNullsLast = 'stableSwap_virtualPrice_DESC_NULLS_LAST',
  StableSwapVolumeUsdAsc = 'stableSwap_volumeUSD_ASC',
  StableSwapVolumeUsdAscNullsFirst = 'stableSwap_volumeUSD_ASC_NULLS_FIRST',
  StableSwapVolumeUsdAscNullsLast = 'stableSwap_volumeUSD_ASC_NULLS_LAST',
  StableSwapVolumeUsdDesc = 'stableSwap_volumeUSD_DESC',
  StableSwapVolumeUsdDescNullsFirst = 'stableSwap_volumeUSD_DESC_NULLS_FIRST',
  StableSwapVolumeUsdDescNullsLast = 'stableSwap_volumeUSD_DESC_NULLS_LAST',
  TvlUsdAsc = 'tvlUSD_ASC',
  TvlUsdAscNullsFirst = 'tvlUSD_ASC_NULLS_FIRST',
  TvlUsdAscNullsLast = 'tvlUSD_ASC_NULLS_LAST',
  TvlUsdDesc = 'tvlUSD_DESC',
  TvlUsdDescNullsFirst = 'tvlUSD_DESC_NULLS_FIRST',
  TvlUsdDescNullsLast = 'tvlUSD_DESC_NULLS_LAST'
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
  BlockAscNullsFirst = 'block_ASC_NULLS_FIRST',
  BlockAscNullsLast = 'block_ASC_NULLS_LAST',
  BlockDesc = 'block_DESC',
  BlockDescNullsFirst = 'block_DESC_NULLS_FIRST',
  BlockDescNullsLast = 'block_DESC_NULLS_LAST',
  DataAdminFeeAsc = 'data_adminFee_ASC',
  DataAdminFeeAscNullsFirst = 'data_adminFee_ASC_NULLS_FIRST',
  DataAdminFeeAscNullsLast = 'data_adminFee_ASC_NULLS_LAST',
  DataAdminFeeDesc = 'data_adminFee_DESC',
  DataAdminFeeDescNullsFirst = 'data_adminFee_DESC_NULLS_FIRST',
  DataAdminFeeDescNullsLast = 'data_adminFee_DESC_NULLS_LAST',
  DataCallerAsc = 'data_caller_ASC',
  DataCallerAscNullsFirst = 'data_caller_ASC_NULLS_FIRST',
  DataCallerAscNullsLast = 'data_caller_ASC_NULLS_LAST',
  DataCallerDesc = 'data_caller_DESC',
  DataCallerDescNullsFirst = 'data_caller_DESC_NULLS_FIRST',
  DataCallerDescNullsLast = 'data_caller_DESC_NULLS_LAST',
  DataCurrentAAsc = 'data_currentA_ASC',
  DataCurrentAAscNullsFirst = 'data_currentA_ASC_NULLS_FIRST',
  DataCurrentAAscNullsLast = 'data_currentA_ASC_NULLS_LAST',
  DataCurrentADesc = 'data_currentA_DESC',
  DataCurrentADescNullsFirst = 'data_currentA_DESC_NULLS_FIRST',
  DataCurrentADescNullsLast = 'data_currentA_DESC_NULLS_LAST',
  DataFutureTimeAsc = 'data_futureTime_ASC',
  DataFutureTimeAscNullsFirst = 'data_futureTime_ASC_NULLS_FIRST',
  DataFutureTimeAscNullsLast = 'data_futureTime_ASC_NULLS_LAST',
  DataFutureTimeDesc = 'data_futureTime_DESC',
  DataFutureTimeDescNullsFirst = 'data_futureTime_DESC_NULLS_FIRST',
  DataFutureTimeDescNullsLast = 'data_futureTime_DESC_NULLS_LAST',
  DataInitialTimeAsc = 'data_initialTime_ASC',
  DataInitialTimeAscNullsFirst = 'data_initialTime_ASC_NULLS_FIRST',
  DataInitialTimeAscNullsLast = 'data_initialTime_ASC_NULLS_LAST',
  DataInitialTimeDesc = 'data_initialTime_DESC',
  DataInitialTimeDescNullsFirst = 'data_initialTime_DESC_NULLS_FIRST',
  DataInitialTimeDescNullsLast = 'data_initialTime_DESC_NULLS_LAST',
  DataInvariantAsc = 'data_invariant_ASC',
  DataInvariantAscNullsFirst = 'data_invariant_ASC_NULLS_FIRST',
  DataInvariantAscNullsLast = 'data_invariant_ASC_NULLS_LAST',
  DataInvariantDesc = 'data_invariant_DESC',
  DataInvariantDescNullsFirst = 'data_invariant_DESC_NULLS_FIRST',
  DataInvariantDescNullsLast = 'data_invariant_DESC_NULLS_LAST',
  DataIsTypeOfAsc = 'data_isTypeOf_ASC',
  DataIsTypeOfAscNullsFirst = 'data_isTypeOf_ASC_NULLS_FIRST',
  DataIsTypeOfAscNullsLast = 'data_isTypeOf_ASC_NULLS_LAST',
  DataIsTypeOfDesc = 'data_isTypeOf_DESC',
  DataIsTypeOfDescNullsFirst = 'data_isTypeOf_DESC_NULLS_FIRST',
  DataIsTypeOfDescNullsLast = 'data_isTypeOf_DESC_NULLS_LAST',
  DataLpTokenSupplyAsc = 'data_lpTokenSupply_ASC',
  DataLpTokenSupplyAscNullsFirst = 'data_lpTokenSupply_ASC_NULLS_FIRST',
  DataLpTokenSupplyAscNullsLast = 'data_lpTokenSupply_ASC_NULLS_LAST',
  DataLpTokenSupplyDesc = 'data_lpTokenSupply_DESC',
  DataLpTokenSupplyDescNullsFirst = 'data_lpTokenSupply_DESC_NULLS_FIRST',
  DataLpTokenSupplyDescNullsLast = 'data_lpTokenSupply_DESC_NULLS_LAST',
  DataNewAAsc = 'data_newA_ASC',
  DataNewAAscNullsFirst = 'data_newA_ASC_NULLS_FIRST',
  DataNewAAscNullsLast = 'data_newA_ASC_NULLS_LAST',
  DataNewADesc = 'data_newA_DESC',
  DataNewADescNullsFirst = 'data_newA_DESC_NULLS_FIRST',
  DataNewADescNullsLast = 'data_newA_DESC_NULLS_LAST',
  DataOldAAsc = 'data_oldA_ASC',
  DataOldAAscNullsFirst = 'data_oldA_ASC_NULLS_FIRST',
  DataOldAAscNullsLast = 'data_oldA_ASC_NULLS_LAST',
  DataOldADesc = 'data_oldA_DESC',
  DataOldADescNullsFirst = 'data_oldA_DESC_NULLS_FIRST',
  DataOldADescNullsLast = 'data_oldA_DESC_NULLS_LAST',
  DataProviderAsc = 'data_provider_ASC',
  DataProviderAscNullsFirst = 'data_provider_ASC_NULLS_FIRST',
  DataProviderAscNullsLast = 'data_provider_ASC_NULLS_LAST',
  DataProviderDesc = 'data_provider_DESC',
  DataProviderDescNullsFirst = 'data_provider_DESC_NULLS_FIRST',
  DataProviderDescNullsLast = 'data_provider_DESC_NULLS_LAST',
  DataReceiverAsc = 'data_receiver_ASC',
  DataReceiverAscNullsFirst = 'data_receiver_ASC_NULLS_FIRST',
  DataReceiverAscNullsLast = 'data_receiver_ASC_NULLS_LAST',
  DataReceiverDesc = 'data_receiver_DESC',
  DataReceiverDescNullsFirst = 'data_receiver_DESC_NULLS_FIRST',
  DataReceiverDescNullsLast = 'data_receiver_DESC_NULLS_LAST',
  DataSwapFeeAsc = 'data_swapFee_ASC',
  DataSwapFeeAscNullsFirst = 'data_swapFee_ASC_NULLS_FIRST',
  DataSwapFeeAscNullsLast = 'data_swapFee_ASC_NULLS_LAST',
  DataSwapFeeDesc = 'data_swapFee_DESC',
  DataSwapFeeDescNullsFirst = 'data_swapFee_DESC_NULLS_FIRST',
  DataSwapFeeDescNullsLast = 'data_swapFee_DESC_NULLS_LAST',
  DataTimeAsc = 'data_time_ASC',
  DataTimeAscNullsFirst = 'data_time_ASC_NULLS_FIRST',
  DataTimeAscNullsLast = 'data_time_ASC_NULLS_LAST',
  DataTimeDesc = 'data_time_DESC',
  DataTimeDescNullsFirst = 'data_time_DESC_NULLS_FIRST',
  DataTimeDescNullsLast = 'data_time_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  StableSwapAAsc = 'stableSwap_a_ASC',
  StableSwapAAscNullsFirst = 'stableSwap_a_ASC_NULLS_FIRST',
  StableSwapAAscNullsLast = 'stableSwap_a_ASC_NULLS_LAST',
  StableSwapADesc = 'stableSwap_a_DESC',
  StableSwapADescNullsFirst = 'stableSwap_a_DESC_NULLS_FIRST',
  StableSwapADescNullsLast = 'stableSwap_a_DESC_NULLS_LAST',
  StableSwapAddressAsc = 'stableSwap_address_ASC',
  StableSwapAddressAscNullsFirst = 'stableSwap_address_ASC_NULLS_FIRST',
  StableSwapAddressAscNullsLast = 'stableSwap_address_ASC_NULLS_LAST',
  StableSwapAddressDesc = 'stableSwap_address_DESC',
  StableSwapAddressDescNullsFirst = 'stableSwap_address_DESC_NULLS_FIRST',
  StableSwapAddressDescNullsLast = 'stableSwap_address_DESC_NULLS_LAST',
  StableSwapAdminFeeAsc = 'stableSwap_adminFee_ASC',
  StableSwapAdminFeeAscNullsFirst = 'stableSwap_adminFee_ASC_NULLS_FIRST',
  StableSwapAdminFeeAscNullsLast = 'stableSwap_adminFee_ASC_NULLS_LAST',
  StableSwapAdminFeeDesc = 'stableSwap_adminFee_DESC',
  StableSwapAdminFeeDescNullsFirst = 'stableSwap_adminFee_DESC_NULLS_FIRST',
  StableSwapAdminFeeDescNullsLast = 'stableSwap_adminFee_DESC_NULLS_LAST',
  StableSwapBaseSwapAddressAsc = 'stableSwap_baseSwapAddress_ASC',
  StableSwapBaseSwapAddressAscNullsFirst = 'stableSwap_baseSwapAddress_ASC_NULLS_FIRST',
  StableSwapBaseSwapAddressAscNullsLast = 'stableSwap_baseSwapAddress_ASC_NULLS_LAST',
  StableSwapBaseSwapAddressDesc = 'stableSwap_baseSwapAddress_DESC',
  StableSwapBaseSwapAddressDescNullsFirst = 'stableSwap_baseSwapAddress_DESC_NULLS_FIRST',
  StableSwapBaseSwapAddressDescNullsLast = 'stableSwap_baseSwapAddress_DESC_NULLS_LAST',
  StableSwapIdAsc = 'stableSwap_id_ASC',
  StableSwapIdAscNullsFirst = 'stableSwap_id_ASC_NULLS_FIRST',
  StableSwapIdAscNullsLast = 'stableSwap_id_ASC_NULLS_LAST',
  StableSwapIdDesc = 'stableSwap_id_DESC',
  StableSwapIdDescNullsFirst = 'stableSwap_id_DESC_NULLS_FIRST',
  StableSwapIdDescNullsLast = 'stableSwap_id_DESC_NULLS_LAST',
  StableSwapLpTokenAsc = 'stableSwap_lpToken_ASC',
  StableSwapLpTokenAscNullsFirst = 'stableSwap_lpToken_ASC_NULLS_FIRST',
  StableSwapLpTokenAscNullsLast = 'stableSwap_lpToken_ASC_NULLS_LAST',
  StableSwapLpTokenDesc = 'stableSwap_lpToken_DESC',
  StableSwapLpTokenDescNullsFirst = 'stableSwap_lpToken_DESC_NULLS_FIRST',
  StableSwapLpTokenDescNullsLast = 'stableSwap_lpToken_DESC_NULLS_LAST',
  StableSwapLpTotalSupplyAsc = 'stableSwap_lpTotalSupply_ASC',
  StableSwapLpTotalSupplyAscNullsFirst = 'stableSwap_lpTotalSupply_ASC_NULLS_FIRST',
  StableSwapLpTotalSupplyAscNullsLast = 'stableSwap_lpTotalSupply_ASC_NULLS_LAST',
  StableSwapLpTotalSupplyDesc = 'stableSwap_lpTotalSupply_DESC',
  StableSwapLpTotalSupplyDescNullsFirst = 'stableSwap_lpTotalSupply_DESC_NULLS_FIRST',
  StableSwapLpTotalSupplyDescNullsLast = 'stableSwap_lpTotalSupply_DESC_NULLS_LAST',
  StableSwapNumTokensAsc = 'stableSwap_numTokens_ASC',
  StableSwapNumTokensAscNullsFirst = 'stableSwap_numTokens_ASC_NULLS_FIRST',
  StableSwapNumTokensAscNullsLast = 'stableSwap_numTokens_ASC_NULLS_LAST',
  StableSwapNumTokensDesc = 'stableSwap_numTokens_DESC',
  StableSwapNumTokensDescNullsFirst = 'stableSwap_numTokens_DESC_NULLS_FIRST',
  StableSwapNumTokensDescNullsLast = 'stableSwap_numTokens_DESC_NULLS_LAST',
  StableSwapSwapFeeAsc = 'stableSwap_swapFee_ASC',
  StableSwapSwapFeeAscNullsFirst = 'stableSwap_swapFee_ASC_NULLS_FIRST',
  StableSwapSwapFeeAscNullsLast = 'stableSwap_swapFee_ASC_NULLS_LAST',
  StableSwapSwapFeeDesc = 'stableSwap_swapFee_DESC',
  StableSwapSwapFeeDescNullsFirst = 'stableSwap_swapFee_DESC_NULLS_FIRST',
  StableSwapSwapFeeDescNullsLast = 'stableSwap_swapFee_DESC_NULLS_LAST',
  StableSwapTvlUsdAsc = 'stableSwap_tvlUSD_ASC',
  StableSwapTvlUsdAscNullsFirst = 'stableSwap_tvlUSD_ASC_NULLS_FIRST',
  StableSwapTvlUsdAscNullsLast = 'stableSwap_tvlUSD_ASC_NULLS_LAST',
  StableSwapTvlUsdDesc = 'stableSwap_tvlUSD_DESC',
  StableSwapTvlUsdDescNullsFirst = 'stableSwap_tvlUSD_DESC_NULLS_FIRST',
  StableSwapTvlUsdDescNullsLast = 'stableSwap_tvlUSD_DESC_NULLS_LAST',
  StableSwapVirtualPriceAsc = 'stableSwap_virtualPrice_ASC',
  StableSwapVirtualPriceAscNullsFirst = 'stableSwap_virtualPrice_ASC_NULLS_FIRST',
  StableSwapVirtualPriceAscNullsLast = 'stableSwap_virtualPrice_ASC_NULLS_LAST',
  StableSwapVirtualPriceDesc = 'stableSwap_virtualPrice_DESC',
  StableSwapVirtualPriceDescNullsFirst = 'stableSwap_virtualPrice_DESC_NULLS_FIRST',
  StableSwapVirtualPriceDescNullsLast = 'stableSwap_virtualPrice_DESC_NULLS_LAST',
  StableSwapVolumeUsdAsc = 'stableSwap_volumeUSD_ASC',
  StableSwapVolumeUsdAscNullsFirst = 'stableSwap_volumeUSD_ASC_NULLS_FIRST',
  StableSwapVolumeUsdAscNullsLast = 'stableSwap_volumeUSD_ASC_NULLS_LAST',
  StableSwapVolumeUsdDesc = 'stableSwap_volumeUSD_DESC',
  StableSwapVolumeUsdDescNullsFirst = 'stableSwap_volumeUSD_DESC_NULLS_FIRST',
  StableSwapVolumeUsdDescNullsLast = 'stableSwap_volumeUSD_DESC_NULLS_LAST',
  TimestampAsc = 'timestamp_ASC',
  TimestampAscNullsFirst = 'timestamp_ASC_NULLS_FIRST',
  TimestampAscNullsLast = 'timestamp_ASC_NULLS_LAST',
  TimestampDesc = 'timestamp_DESC',
  TimestampDescNullsFirst = 'timestamp_DESC_NULLS_FIRST',
  TimestampDescNullsLast = 'timestamp_DESC_NULLS_LAST',
  TransactionAsc = 'transaction_ASC',
  TransactionAscNullsFirst = 'transaction_ASC_NULLS_FIRST',
  TransactionAscNullsLast = 'transaction_ASC_NULLS_LAST',
  TransactionDesc = 'transaction_DESC',
  TransactionDescNullsFirst = 'transaction_DESC_NULLS_FIRST',
  TransactionDescNullsLast = 'transaction_DESC_NULLS_LAST'
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
  BlockAscNullsFirst = 'block_ASC_NULLS_FIRST',
  BlockAscNullsLast = 'block_ASC_NULLS_LAST',
  BlockDesc = 'block_DESC',
  BlockDescNullsFirst = 'block_DESC_NULLS_FIRST',
  BlockDescNullsLast = 'block_DESC_NULLS_LAST',
  DataBoughtIdAsc = 'data_boughtId_ASC',
  DataBoughtIdAscNullsFirst = 'data_boughtId_ASC_NULLS_FIRST',
  DataBoughtIdAscNullsLast = 'data_boughtId_ASC_NULLS_LAST',
  DataBoughtIdDesc = 'data_boughtId_DESC',
  DataBoughtIdDescNullsFirst = 'data_boughtId_DESC_NULLS_FIRST',
  DataBoughtIdDescNullsLast = 'data_boughtId_DESC_NULLS_LAST',
  DataBuyerAsc = 'data_buyer_ASC',
  DataBuyerAscNullsFirst = 'data_buyer_ASC_NULLS_FIRST',
  DataBuyerAscNullsLast = 'data_buyer_ASC_NULLS_LAST',
  DataBuyerDesc = 'data_buyer_DESC',
  DataBuyerDescNullsFirst = 'data_buyer_DESC_NULLS_FIRST',
  DataBuyerDescNullsLast = 'data_buyer_DESC_NULLS_LAST',
  DataIsTypeOfAsc = 'data_isTypeOf_ASC',
  DataIsTypeOfAscNullsFirst = 'data_isTypeOf_ASC_NULLS_FIRST',
  DataIsTypeOfAscNullsLast = 'data_isTypeOf_ASC_NULLS_LAST',
  DataIsTypeOfDesc = 'data_isTypeOf_DESC',
  DataIsTypeOfDescNullsFirst = 'data_isTypeOf_DESC_NULLS_FIRST',
  DataIsTypeOfDescNullsLast = 'data_isTypeOf_DESC_NULLS_LAST',
  DataSoldIdAsc = 'data_soldId_ASC',
  DataSoldIdAscNullsFirst = 'data_soldId_ASC_NULLS_FIRST',
  DataSoldIdAscNullsLast = 'data_soldId_ASC_NULLS_LAST',
  DataSoldIdDesc = 'data_soldId_DESC',
  DataSoldIdDescNullsFirst = 'data_soldId_DESC_NULLS_FIRST',
  DataSoldIdDescNullsLast = 'data_soldId_DESC_NULLS_LAST',
  DataTokensBoughtAsc = 'data_tokensBought_ASC',
  DataTokensBoughtAscNullsFirst = 'data_tokensBought_ASC_NULLS_FIRST',
  DataTokensBoughtAscNullsLast = 'data_tokensBought_ASC_NULLS_LAST',
  DataTokensBoughtDesc = 'data_tokensBought_DESC',
  DataTokensBoughtDescNullsFirst = 'data_tokensBought_DESC_NULLS_FIRST',
  DataTokensBoughtDescNullsLast = 'data_tokensBought_DESC_NULLS_LAST',
  DataTokensSoldAsc = 'data_tokensSold_ASC',
  DataTokensSoldAscNullsFirst = 'data_tokensSold_ASC_NULLS_FIRST',
  DataTokensSoldAscNullsLast = 'data_tokensSold_ASC_NULLS_LAST',
  DataTokensSoldDesc = 'data_tokensSold_DESC',
  DataTokensSoldDescNullsFirst = 'data_tokensSold_DESC_NULLS_FIRST',
  DataTokensSoldDescNullsLast = 'data_tokensSold_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  StableSwapAAsc = 'stableSwap_a_ASC',
  StableSwapAAscNullsFirst = 'stableSwap_a_ASC_NULLS_FIRST',
  StableSwapAAscNullsLast = 'stableSwap_a_ASC_NULLS_LAST',
  StableSwapADesc = 'stableSwap_a_DESC',
  StableSwapADescNullsFirst = 'stableSwap_a_DESC_NULLS_FIRST',
  StableSwapADescNullsLast = 'stableSwap_a_DESC_NULLS_LAST',
  StableSwapAddressAsc = 'stableSwap_address_ASC',
  StableSwapAddressAscNullsFirst = 'stableSwap_address_ASC_NULLS_FIRST',
  StableSwapAddressAscNullsLast = 'stableSwap_address_ASC_NULLS_LAST',
  StableSwapAddressDesc = 'stableSwap_address_DESC',
  StableSwapAddressDescNullsFirst = 'stableSwap_address_DESC_NULLS_FIRST',
  StableSwapAddressDescNullsLast = 'stableSwap_address_DESC_NULLS_LAST',
  StableSwapAdminFeeAsc = 'stableSwap_adminFee_ASC',
  StableSwapAdminFeeAscNullsFirst = 'stableSwap_adminFee_ASC_NULLS_FIRST',
  StableSwapAdminFeeAscNullsLast = 'stableSwap_adminFee_ASC_NULLS_LAST',
  StableSwapAdminFeeDesc = 'stableSwap_adminFee_DESC',
  StableSwapAdminFeeDescNullsFirst = 'stableSwap_adminFee_DESC_NULLS_FIRST',
  StableSwapAdminFeeDescNullsLast = 'stableSwap_adminFee_DESC_NULLS_LAST',
  StableSwapBaseSwapAddressAsc = 'stableSwap_baseSwapAddress_ASC',
  StableSwapBaseSwapAddressAscNullsFirst = 'stableSwap_baseSwapAddress_ASC_NULLS_FIRST',
  StableSwapBaseSwapAddressAscNullsLast = 'stableSwap_baseSwapAddress_ASC_NULLS_LAST',
  StableSwapBaseSwapAddressDesc = 'stableSwap_baseSwapAddress_DESC',
  StableSwapBaseSwapAddressDescNullsFirst = 'stableSwap_baseSwapAddress_DESC_NULLS_FIRST',
  StableSwapBaseSwapAddressDescNullsLast = 'stableSwap_baseSwapAddress_DESC_NULLS_LAST',
  StableSwapIdAsc = 'stableSwap_id_ASC',
  StableSwapIdAscNullsFirst = 'stableSwap_id_ASC_NULLS_FIRST',
  StableSwapIdAscNullsLast = 'stableSwap_id_ASC_NULLS_LAST',
  StableSwapIdDesc = 'stableSwap_id_DESC',
  StableSwapIdDescNullsFirst = 'stableSwap_id_DESC_NULLS_FIRST',
  StableSwapIdDescNullsLast = 'stableSwap_id_DESC_NULLS_LAST',
  StableSwapLpTokenAsc = 'stableSwap_lpToken_ASC',
  StableSwapLpTokenAscNullsFirst = 'stableSwap_lpToken_ASC_NULLS_FIRST',
  StableSwapLpTokenAscNullsLast = 'stableSwap_lpToken_ASC_NULLS_LAST',
  StableSwapLpTokenDesc = 'stableSwap_lpToken_DESC',
  StableSwapLpTokenDescNullsFirst = 'stableSwap_lpToken_DESC_NULLS_FIRST',
  StableSwapLpTokenDescNullsLast = 'stableSwap_lpToken_DESC_NULLS_LAST',
  StableSwapLpTotalSupplyAsc = 'stableSwap_lpTotalSupply_ASC',
  StableSwapLpTotalSupplyAscNullsFirst = 'stableSwap_lpTotalSupply_ASC_NULLS_FIRST',
  StableSwapLpTotalSupplyAscNullsLast = 'stableSwap_lpTotalSupply_ASC_NULLS_LAST',
  StableSwapLpTotalSupplyDesc = 'stableSwap_lpTotalSupply_DESC',
  StableSwapLpTotalSupplyDescNullsFirst = 'stableSwap_lpTotalSupply_DESC_NULLS_FIRST',
  StableSwapLpTotalSupplyDescNullsLast = 'stableSwap_lpTotalSupply_DESC_NULLS_LAST',
  StableSwapNumTokensAsc = 'stableSwap_numTokens_ASC',
  StableSwapNumTokensAscNullsFirst = 'stableSwap_numTokens_ASC_NULLS_FIRST',
  StableSwapNumTokensAscNullsLast = 'stableSwap_numTokens_ASC_NULLS_LAST',
  StableSwapNumTokensDesc = 'stableSwap_numTokens_DESC',
  StableSwapNumTokensDescNullsFirst = 'stableSwap_numTokens_DESC_NULLS_FIRST',
  StableSwapNumTokensDescNullsLast = 'stableSwap_numTokens_DESC_NULLS_LAST',
  StableSwapSwapFeeAsc = 'stableSwap_swapFee_ASC',
  StableSwapSwapFeeAscNullsFirst = 'stableSwap_swapFee_ASC_NULLS_FIRST',
  StableSwapSwapFeeAscNullsLast = 'stableSwap_swapFee_ASC_NULLS_LAST',
  StableSwapSwapFeeDesc = 'stableSwap_swapFee_DESC',
  StableSwapSwapFeeDescNullsFirst = 'stableSwap_swapFee_DESC_NULLS_FIRST',
  StableSwapSwapFeeDescNullsLast = 'stableSwap_swapFee_DESC_NULLS_LAST',
  StableSwapTvlUsdAsc = 'stableSwap_tvlUSD_ASC',
  StableSwapTvlUsdAscNullsFirst = 'stableSwap_tvlUSD_ASC_NULLS_FIRST',
  StableSwapTvlUsdAscNullsLast = 'stableSwap_tvlUSD_ASC_NULLS_LAST',
  StableSwapTvlUsdDesc = 'stableSwap_tvlUSD_DESC',
  StableSwapTvlUsdDescNullsFirst = 'stableSwap_tvlUSD_DESC_NULLS_FIRST',
  StableSwapTvlUsdDescNullsLast = 'stableSwap_tvlUSD_DESC_NULLS_LAST',
  StableSwapVirtualPriceAsc = 'stableSwap_virtualPrice_ASC',
  StableSwapVirtualPriceAscNullsFirst = 'stableSwap_virtualPrice_ASC_NULLS_FIRST',
  StableSwapVirtualPriceAscNullsLast = 'stableSwap_virtualPrice_ASC_NULLS_LAST',
  StableSwapVirtualPriceDesc = 'stableSwap_virtualPrice_DESC',
  StableSwapVirtualPriceDescNullsFirst = 'stableSwap_virtualPrice_DESC_NULLS_FIRST',
  StableSwapVirtualPriceDescNullsLast = 'stableSwap_virtualPrice_DESC_NULLS_LAST',
  StableSwapVolumeUsdAsc = 'stableSwap_volumeUSD_ASC',
  StableSwapVolumeUsdAscNullsFirst = 'stableSwap_volumeUSD_ASC_NULLS_FIRST',
  StableSwapVolumeUsdAscNullsLast = 'stableSwap_volumeUSD_ASC_NULLS_LAST',
  StableSwapVolumeUsdDesc = 'stableSwap_volumeUSD_DESC',
  StableSwapVolumeUsdDescNullsFirst = 'stableSwap_volumeUSD_DESC_NULLS_FIRST',
  StableSwapVolumeUsdDescNullsLast = 'stableSwap_volumeUSD_DESC_NULLS_LAST',
  TimestampAsc = 'timestamp_ASC',
  TimestampAscNullsFirst = 'timestamp_ASC_NULLS_FIRST',
  TimestampAscNullsLast = 'timestamp_ASC_NULLS_LAST',
  TimestampDesc = 'timestamp_DESC',
  TimestampDescNullsFirst = 'timestamp_DESC_NULLS_FIRST',
  TimestampDescNullsLast = 'timestamp_DESC_NULLS_LAST',
  TransactionAsc = 'transaction_ASC',
  TransactionAscNullsFirst = 'transaction_ASC_NULLS_FIRST',
  TransactionAscNullsLast = 'transaction_ASC_NULLS_LAST',
  TransactionDesc = 'transaction_DESC',
  TransactionDescNullsFirst = 'transaction_DESC_NULLS_FIRST',
  TransactionDescNullsLast = 'transaction_DESC_NULLS_LAST'
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
  HourStartUnixAscNullsFirst = 'hourStartUnix_ASC_NULLS_FIRST',
  HourStartUnixAscNullsLast = 'hourStartUnix_ASC_NULLS_LAST',
  HourStartUnixDesc = 'hourStartUnix_DESC',
  HourStartUnixDescNullsFirst = 'hourStartUnix_DESC_NULLS_FIRST',
  HourStartUnixDescNullsLast = 'hourStartUnix_DESC_NULLS_LAST',
  HourlyVolumeUsdAsc = 'hourlyVolumeUSD_ASC',
  HourlyVolumeUsdAscNullsFirst = 'hourlyVolumeUSD_ASC_NULLS_FIRST',
  HourlyVolumeUsdAscNullsLast = 'hourlyVolumeUSD_ASC_NULLS_LAST',
  HourlyVolumeUsdDesc = 'hourlyVolumeUSD_DESC',
  HourlyVolumeUsdDescNullsFirst = 'hourlyVolumeUSD_DESC_NULLS_FIRST',
  HourlyVolumeUsdDescNullsLast = 'hourlyVolumeUSD_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  StableSwapAAsc = 'stableSwap_a_ASC',
  StableSwapAAscNullsFirst = 'stableSwap_a_ASC_NULLS_FIRST',
  StableSwapAAscNullsLast = 'stableSwap_a_ASC_NULLS_LAST',
  StableSwapADesc = 'stableSwap_a_DESC',
  StableSwapADescNullsFirst = 'stableSwap_a_DESC_NULLS_FIRST',
  StableSwapADescNullsLast = 'stableSwap_a_DESC_NULLS_LAST',
  StableSwapAddressAsc = 'stableSwap_address_ASC',
  StableSwapAddressAscNullsFirst = 'stableSwap_address_ASC_NULLS_FIRST',
  StableSwapAddressAscNullsLast = 'stableSwap_address_ASC_NULLS_LAST',
  StableSwapAddressDesc = 'stableSwap_address_DESC',
  StableSwapAddressDescNullsFirst = 'stableSwap_address_DESC_NULLS_FIRST',
  StableSwapAddressDescNullsLast = 'stableSwap_address_DESC_NULLS_LAST',
  StableSwapAdminFeeAsc = 'stableSwap_adminFee_ASC',
  StableSwapAdminFeeAscNullsFirst = 'stableSwap_adminFee_ASC_NULLS_FIRST',
  StableSwapAdminFeeAscNullsLast = 'stableSwap_adminFee_ASC_NULLS_LAST',
  StableSwapAdminFeeDesc = 'stableSwap_adminFee_DESC',
  StableSwapAdminFeeDescNullsFirst = 'stableSwap_adminFee_DESC_NULLS_FIRST',
  StableSwapAdminFeeDescNullsLast = 'stableSwap_adminFee_DESC_NULLS_LAST',
  StableSwapBaseSwapAddressAsc = 'stableSwap_baseSwapAddress_ASC',
  StableSwapBaseSwapAddressAscNullsFirst = 'stableSwap_baseSwapAddress_ASC_NULLS_FIRST',
  StableSwapBaseSwapAddressAscNullsLast = 'stableSwap_baseSwapAddress_ASC_NULLS_LAST',
  StableSwapBaseSwapAddressDesc = 'stableSwap_baseSwapAddress_DESC',
  StableSwapBaseSwapAddressDescNullsFirst = 'stableSwap_baseSwapAddress_DESC_NULLS_FIRST',
  StableSwapBaseSwapAddressDescNullsLast = 'stableSwap_baseSwapAddress_DESC_NULLS_LAST',
  StableSwapIdAsc = 'stableSwap_id_ASC',
  StableSwapIdAscNullsFirst = 'stableSwap_id_ASC_NULLS_FIRST',
  StableSwapIdAscNullsLast = 'stableSwap_id_ASC_NULLS_LAST',
  StableSwapIdDesc = 'stableSwap_id_DESC',
  StableSwapIdDescNullsFirst = 'stableSwap_id_DESC_NULLS_FIRST',
  StableSwapIdDescNullsLast = 'stableSwap_id_DESC_NULLS_LAST',
  StableSwapLpTokenAsc = 'stableSwap_lpToken_ASC',
  StableSwapLpTokenAscNullsFirst = 'stableSwap_lpToken_ASC_NULLS_FIRST',
  StableSwapLpTokenAscNullsLast = 'stableSwap_lpToken_ASC_NULLS_LAST',
  StableSwapLpTokenDesc = 'stableSwap_lpToken_DESC',
  StableSwapLpTokenDescNullsFirst = 'stableSwap_lpToken_DESC_NULLS_FIRST',
  StableSwapLpTokenDescNullsLast = 'stableSwap_lpToken_DESC_NULLS_LAST',
  StableSwapLpTotalSupplyAsc = 'stableSwap_lpTotalSupply_ASC',
  StableSwapLpTotalSupplyAscNullsFirst = 'stableSwap_lpTotalSupply_ASC_NULLS_FIRST',
  StableSwapLpTotalSupplyAscNullsLast = 'stableSwap_lpTotalSupply_ASC_NULLS_LAST',
  StableSwapLpTotalSupplyDesc = 'stableSwap_lpTotalSupply_DESC',
  StableSwapLpTotalSupplyDescNullsFirst = 'stableSwap_lpTotalSupply_DESC_NULLS_FIRST',
  StableSwapLpTotalSupplyDescNullsLast = 'stableSwap_lpTotalSupply_DESC_NULLS_LAST',
  StableSwapNumTokensAsc = 'stableSwap_numTokens_ASC',
  StableSwapNumTokensAscNullsFirst = 'stableSwap_numTokens_ASC_NULLS_FIRST',
  StableSwapNumTokensAscNullsLast = 'stableSwap_numTokens_ASC_NULLS_LAST',
  StableSwapNumTokensDesc = 'stableSwap_numTokens_DESC',
  StableSwapNumTokensDescNullsFirst = 'stableSwap_numTokens_DESC_NULLS_FIRST',
  StableSwapNumTokensDescNullsLast = 'stableSwap_numTokens_DESC_NULLS_LAST',
  StableSwapSwapFeeAsc = 'stableSwap_swapFee_ASC',
  StableSwapSwapFeeAscNullsFirst = 'stableSwap_swapFee_ASC_NULLS_FIRST',
  StableSwapSwapFeeAscNullsLast = 'stableSwap_swapFee_ASC_NULLS_LAST',
  StableSwapSwapFeeDesc = 'stableSwap_swapFee_DESC',
  StableSwapSwapFeeDescNullsFirst = 'stableSwap_swapFee_DESC_NULLS_FIRST',
  StableSwapSwapFeeDescNullsLast = 'stableSwap_swapFee_DESC_NULLS_LAST',
  StableSwapTvlUsdAsc = 'stableSwap_tvlUSD_ASC',
  StableSwapTvlUsdAscNullsFirst = 'stableSwap_tvlUSD_ASC_NULLS_FIRST',
  StableSwapTvlUsdAscNullsLast = 'stableSwap_tvlUSD_ASC_NULLS_LAST',
  StableSwapTvlUsdDesc = 'stableSwap_tvlUSD_DESC',
  StableSwapTvlUsdDescNullsFirst = 'stableSwap_tvlUSD_DESC_NULLS_FIRST',
  StableSwapTvlUsdDescNullsLast = 'stableSwap_tvlUSD_DESC_NULLS_LAST',
  StableSwapVirtualPriceAsc = 'stableSwap_virtualPrice_ASC',
  StableSwapVirtualPriceAscNullsFirst = 'stableSwap_virtualPrice_ASC_NULLS_FIRST',
  StableSwapVirtualPriceAscNullsLast = 'stableSwap_virtualPrice_ASC_NULLS_LAST',
  StableSwapVirtualPriceDesc = 'stableSwap_virtualPrice_DESC',
  StableSwapVirtualPriceDescNullsFirst = 'stableSwap_virtualPrice_DESC_NULLS_FIRST',
  StableSwapVirtualPriceDescNullsLast = 'stableSwap_virtualPrice_DESC_NULLS_LAST',
  StableSwapVolumeUsdAsc = 'stableSwap_volumeUSD_ASC',
  StableSwapVolumeUsdAscNullsFirst = 'stableSwap_volumeUSD_ASC_NULLS_FIRST',
  StableSwapVolumeUsdAscNullsLast = 'stableSwap_volumeUSD_ASC_NULLS_LAST',
  StableSwapVolumeUsdDesc = 'stableSwap_volumeUSD_DESC',
  StableSwapVolumeUsdDescNullsFirst = 'stableSwap_volumeUSD_DESC_NULLS_FIRST',
  StableSwapVolumeUsdDescNullsLast = 'stableSwap_volumeUSD_DESC_NULLS_LAST',
  TvlUsdAsc = 'tvlUSD_ASC',
  TvlUsdAscNullsFirst = 'tvlUSD_ASC_NULLS_FIRST',
  TvlUsdAscNullsLast = 'tvlUSD_ASC_NULLS_LAST',
  TvlUsdDesc = 'tvlUSD_DESC',
  TvlUsdDescNullsFirst = 'tvlUSD_DESC_NULLS_FIRST',
  TvlUsdDescNullsLast = 'tvlUSD_DESC_NULLS_LAST'
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
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  PoolCountAsc = 'poolCount_ASC',
  PoolCountAscNullsFirst = 'poolCount_ASC_NULLS_FIRST',
  PoolCountAscNullsLast = 'poolCount_ASC_NULLS_LAST',
  PoolCountDesc = 'poolCount_DESC',
  PoolCountDescNullsFirst = 'poolCount_DESC_NULLS_FIRST',
  PoolCountDescNullsLast = 'poolCount_DESC_NULLS_LAST',
  TotalTvlUsdAsc = 'totalTvlUSD_ASC',
  TotalTvlUsdAscNullsFirst = 'totalTvlUSD_ASC_NULLS_FIRST',
  TotalTvlUsdAscNullsLast = 'totalTvlUSD_ASC_NULLS_LAST',
  TotalTvlUsdDesc = 'totalTvlUSD_DESC',
  TotalTvlUsdDescNullsFirst = 'totalTvlUSD_DESC_NULLS_FIRST',
  TotalTvlUsdDescNullsLast = 'totalTvlUSD_DESC_NULLS_LAST',
  TotalVolumeUsdAsc = 'totalVolumeUSD_ASC',
  TotalVolumeUsdAscNullsFirst = 'totalVolumeUSD_ASC_NULLS_FIRST',
  TotalVolumeUsdAscNullsLast = 'totalVolumeUSD_ASC_NULLS_LAST',
  TotalVolumeUsdDesc = 'totalVolumeUSD_DESC',
  TotalVolumeUsdDescNullsFirst = 'totalVolumeUSD_DESC_NULLS_FIRST',
  TotalVolumeUsdDescNullsLast = 'totalVolumeUSD_DESC_NULLS_LAST',
  TxCountAsc = 'txCount_ASC',
  TxCountAscNullsFirst = 'txCount_ASC_NULLS_FIRST',
  TxCountAscNullsLast = 'txCount_ASC_NULLS_LAST',
  TxCountDesc = 'txCount_DESC',
  TxCountDescNullsFirst = 'txCount_DESC_NULLS_FIRST',
  TxCountDescNullsLast = 'txCount_DESC_NULLS_LAST'
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
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  LiquidityTokenBalanceAsc = 'liquidityTokenBalance_ASC',
  LiquidityTokenBalanceAscNullsFirst = 'liquidityTokenBalance_ASC_NULLS_FIRST',
  LiquidityTokenBalanceAscNullsLast = 'liquidityTokenBalance_ASC_NULLS_LAST',
  LiquidityTokenBalanceDesc = 'liquidityTokenBalance_DESC',
  LiquidityTokenBalanceDescNullsFirst = 'liquidityTokenBalance_DESC_NULLS_FIRST',
  LiquidityTokenBalanceDescNullsLast = 'liquidityTokenBalance_DESC_NULLS_LAST',
  StableSwapAAsc = 'stableSwap_a_ASC',
  StableSwapAAscNullsFirst = 'stableSwap_a_ASC_NULLS_FIRST',
  StableSwapAAscNullsLast = 'stableSwap_a_ASC_NULLS_LAST',
  StableSwapADesc = 'stableSwap_a_DESC',
  StableSwapADescNullsFirst = 'stableSwap_a_DESC_NULLS_FIRST',
  StableSwapADescNullsLast = 'stableSwap_a_DESC_NULLS_LAST',
  StableSwapAddressAsc = 'stableSwap_address_ASC',
  StableSwapAddressAscNullsFirst = 'stableSwap_address_ASC_NULLS_FIRST',
  StableSwapAddressAscNullsLast = 'stableSwap_address_ASC_NULLS_LAST',
  StableSwapAddressDesc = 'stableSwap_address_DESC',
  StableSwapAddressDescNullsFirst = 'stableSwap_address_DESC_NULLS_FIRST',
  StableSwapAddressDescNullsLast = 'stableSwap_address_DESC_NULLS_LAST',
  StableSwapAdminFeeAsc = 'stableSwap_adminFee_ASC',
  StableSwapAdminFeeAscNullsFirst = 'stableSwap_adminFee_ASC_NULLS_FIRST',
  StableSwapAdminFeeAscNullsLast = 'stableSwap_adminFee_ASC_NULLS_LAST',
  StableSwapAdminFeeDesc = 'stableSwap_adminFee_DESC',
  StableSwapAdminFeeDescNullsFirst = 'stableSwap_adminFee_DESC_NULLS_FIRST',
  StableSwapAdminFeeDescNullsLast = 'stableSwap_adminFee_DESC_NULLS_LAST',
  StableSwapBaseSwapAddressAsc = 'stableSwap_baseSwapAddress_ASC',
  StableSwapBaseSwapAddressAscNullsFirst = 'stableSwap_baseSwapAddress_ASC_NULLS_FIRST',
  StableSwapBaseSwapAddressAscNullsLast = 'stableSwap_baseSwapAddress_ASC_NULLS_LAST',
  StableSwapBaseSwapAddressDesc = 'stableSwap_baseSwapAddress_DESC',
  StableSwapBaseSwapAddressDescNullsFirst = 'stableSwap_baseSwapAddress_DESC_NULLS_FIRST',
  StableSwapBaseSwapAddressDescNullsLast = 'stableSwap_baseSwapAddress_DESC_NULLS_LAST',
  StableSwapIdAsc = 'stableSwap_id_ASC',
  StableSwapIdAscNullsFirst = 'stableSwap_id_ASC_NULLS_FIRST',
  StableSwapIdAscNullsLast = 'stableSwap_id_ASC_NULLS_LAST',
  StableSwapIdDesc = 'stableSwap_id_DESC',
  StableSwapIdDescNullsFirst = 'stableSwap_id_DESC_NULLS_FIRST',
  StableSwapIdDescNullsLast = 'stableSwap_id_DESC_NULLS_LAST',
  StableSwapLpTokenAsc = 'stableSwap_lpToken_ASC',
  StableSwapLpTokenAscNullsFirst = 'stableSwap_lpToken_ASC_NULLS_FIRST',
  StableSwapLpTokenAscNullsLast = 'stableSwap_lpToken_ASC_NULLS_LAST',
  StableSwapLpTokenDesc = 'stableSwap_lpToken_DESC',
  StableSwapLpTokenDescNullsFirst = 'stableSwap_lpToken_DESC_NULLS_FIRST',
  StableSwapLpTokenDescNullsLast = 'stableSwap_lpToken_DESC_NULLS_LAST',
  StableSwapLpTotalSupplyAsc = 'stableSwap_lpTotalSupply_ASC',
  StableSwapLpTotalSupplyAscNullsFirst = 'stableSwap_lpTotalSupply_ASC_NULLS_FIRST',
  StableSwapLpTotalSupplyAscNullsLast = 'stableSwap_lpTotalSupply_ASC_NULLS_LAST',
  StableSwapLpTotalSupplyDesc = 'stableSwap_lpTotalSupply_DESC',
  StableSwapLpTotalSupplyDescNullsFirst = 'stableSwap_lpTotalSupply_DESC_NULLS_FIRST',
  StableSwapLpTotalSupplyDescNullsLast = 'stableSwap_lpTotalSupply_DESC_NULLS_LAST',
  StableSwapNumTokensAsc = 'stableSwap_numTokens_ASC',
  StableSwapNumTokensAscNullsFirst = 'stableSwap_numTokens_ASC_NULLS_FIRST',
  StableSwapNumTokensAscNullsLast = 'stableSwap_numTokens_ASC_NULLS_LAST',
  StableSwapNumTokensDesc = 'stableSwap_numTokens_DESC',
  StableSwapNumTokensDescNullsFirst = 'stableSwap_numTokens_DESC_NULLS_FIRST',
  StableSwapNumTokensDescNullsLast = 'stableSwap_numTokens_DESC_NULLS_LAST',
  StableSwapSwapFeeAsc = 'stableSwap_swapFee_ASC',
  StableSwapSwapFeeAscNullsFirst = 'stableSwap_swapFee_ASC_NULLS_FIRST',
  StableSwapSwapFeeAscNullsLast = 'stableSwap_swapFee_ASC_NULLS_LAST',
  StableSwapSwapFeeDesc = 'stableSwap_swapFee_DESC',
  StableSwapSwapFeeDescNullsFirst = 'stableSwap_swapFee_DESC_NULLS_FIRST',
  StableSwapSwapFeeDescNullsLast = 'stableSwap_swapFee_DESC_NULLS_LAST',
  StableSwapTvlUsdAsc = 'stableSwap_tvlUSD_ASC',
  StableSwapTvlUsdAscNullsFirst = 'stableSwap_tvlUSD_ASC_NULLS_FIRST',
  StableSwapTvlUsdAscNullsLast = 'stableSwap_tvlUSD_ASC_NULLS_LAST',
  StableSwapTvlUsdDesc = 'stableSwap_tvlUSD_DESC',
  StableSwapTvlUsdDescNullsFirst = 'stableSwap_tvlUSD_DESC_NULLS_FIRST',
  StableSwapTvlUsdDescNullsLast = 'stableSwap_tvlUSD_DESC_NULLS_LAST',
  StableSwapVirtualPriceAsc = 'stableSwap_virtualPrice_ASC',
  StableSwapVirtualPriceAscNullsFirst = 'stableSwap_virtualPrice_ASC_NULLS_FIRST',
  StableSwapVirtualPriceAscNullsLast = 'stableSwap_virtualPrice_ASC_NULLS_LAST',
  StableSwapVirtualPriceDesc = 'stableSwap_virtualPrice_DESC',
  StableSwapVirtualPriceDescNullsFirst = 'stableSwap_virtualPrice_DESC_NULLS_FIRST',
  StableSwapVirtualPriceDescNullsLast = 'stableSwap_virtualPrice_DESC_NULLS_LAST',
  StableSwapVolumeUsdAsc = 'stableSwap_volumeUSD_ASC',
  StableSwapVolumeUsdAscNullsFirst = 'stableSwap_volumeUSD_ASC_NULLS_FIRST',
  StableSwapVolumeUsdAscNullsLast = 'stableSwap_volumeUSD_ASC_NULLS_LAST',
  StableSwapVolumeUsdDesc = 'stableSwap_volumeUSD_DESC',
  StableSwapVolumeUsdDescNullsFirst = 'stableSwap_volumeUSD_DESC_NULLS_FIRST',
  StableSwapVolumeUsdDescNullsLast = 'stableSwap_volumeUSD_DESC_NULLS_LAST',
  UserIdAsc = 'user_id_ASC',
  UserIdAscNullsFirst = 'user_id_ASC_NULLS_FIRST',
  UserIdAscNullsLast = 'user_id_ASC_NULLS_LAST',
  UserIdDesc = 'user_id_DESC',
  UserIdDescNullsFirst = 'user_id_DESC_NULLS_FIRST',
  UserIdDescNullsLast = 'user_id_DESC_NULLS_LAST',
  UserUsdSwappedAsc = 'user_usdSwapped_ASC',
  UserUsdSwappedAscNullsFirst = 'user_usdSwapped_ASC_NULLS_FIRST',
  UserUsdSwappedAscNullsLast = 'user_usdSwapped_ASC_NULLS_LAST',
  UserUsdSwappedDesc = 'user_usdSwapped_DESC',
  UserUsdSwappedDescNullsFirst = 'user_usdSwapped_DESC_NULLS_FIRST',
  UserUsdSwappedDescNullsLast = 'user_usdSwapped_DESC_NULLS_LAST'
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
  AAscNullsFirst = 'a_ASC_NULLS_FIRST',
  AAscNullsLast = 'a_ASC_NULLS_LAST',
  ADesc = 'a_DESC',
  ADescNullsFirst = 'a_DESC_NULLS_FIRST',
  ADescNullsLast = 'a_DESC_NULLS_LAST',
  AddressAsc = 'address_ASC',
  AddressAscNullsFirst = 'address_ASC_NULLS_FIRST',
  AddressAscNullsLast = 'address_ASC_NULLS_LAST',
  AddressDesc = 'address_DESC',
  AddressDescNullsFirst = 'address_DESC_NULLS_FIRST',
  AddressDescNullsLast = 'address_DESC_NULLS_LAST',
  AdminFeeAsc = 'adminFee_ASC',
  AdminFeeAscNullsFirst = 'adminFee_ASC_NULLS_FIRST',
  AdminFeeAscNullsLast = 'adminFee_ASC_NULLS_LAST',
  AdminFeeDesc = 'adminFee_DESC',
  AdminFeeDescNullsFirst = 'adminFee_DESC_NULLS_FIRST',
  AdminFeeDescNullsLast = 'adminFee_DESC_NULLS_LAST',
  BaseSwapAddressAsc = 'baseSwapAddress_ASC',
  BaseSwapAddressAscNullsFirst = 'baseSwapAddress_ASC_NULLS_FIRST',
  BaseSwapAddressAscNullsLast = 'baseSwapAddress_ASC_NULLS_LAST',
  BaseSwapAddressDesc = 'baseSwapAddress_DESC',
  BaseSwapAddressDescNullsFirst = 'baseSwapAddress_DESC_NULLS_FIRST',
  BaseSwapAddressDescNullsLast = 'baseSwapAddress_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  LpTokenAsc = 'lpToken_ASC',
  LpTokenAscNullsFirst = 'lpToken_ASC_NULLS_FIRST',
  LpTokenAscNullsLast = 'lpToken_ASC_NULLS_LAST',
  LpTokenDesc = 'lpToken_DESC',
  LpTokenDescNullsFirst = 'lpToken_DESC_NULLS_FIRST',
  LpTokenDescNullsLast = 'lpToken_DESC_NULLS_LAST',
  LpTotalSupplyAsc = 'lpTotalSupply_ASC',
  LpTotalSupplyAscNullsFirst = 'lpTotalSupply_ASC_NULLS_FIRST',
  LpTotalSupplyAscNullsLast = 'lpTotalSupply_ASC_NULLS_LAST',
  LpTotalSupplyDesc = 'lpTotalSupply_DESC',
  LpTotalSupplyDescNullsFirst = 'lpTotalSupply_DESC_NULLS_FIRST',
  LpTotalSupplyDescNullsLast = 'lpTotalSupply_DESC_NULLS_LAST',
  NumTokensAsc = 'numTokens_ASC',
  NumTokensAscNullsFirst = 'numTokens_ASC_NULLS_FIRST',
  NumTokensAscNullsLast = 'numTokens_ASC_NULLS_LAST',
  NumTokensDesc = 'numTokens_DESC',
  NumTokensDescNullsFirst = 'numTokens_DESC_NULLS_FIRST',
  NumTokensDescNullsLast = 'numTokens_DESC_NULLS_LAST',
  StableSwapInfoIdAsc = 'stableSwapInfo_id_ASC',
  StableSwapInfoIdAscNullsFirst = 'stableSwapInfo_id_ASC_NULLS_FIRST',
  StableSwapInfoIdAscNullsLast = 'stableSwapInfo_id_ASC_NULLS_LAST',
  StableSwapInfoIdDesc = 'stableSwapInfo_id_DESC',
  StableSwapInfoIdDescNullsFirst = 'stableSwapInfo_id_DESC_NULLS_FIRST',
  StableSwapInfoIdDescNullsLast = 'stableSwapInfo_id_DESC_NULLS_LAST',
  StableSwapInfoPoolCountAsc = 'stableSwapInfo_poolCount_ASC',
  StableSwapInfoPoolCountAscNullsFirst = 'stableSwapInfo_poolCount_ASC_NULLS_FIRST',
  StableSwapInfoPoolCountAscNullsLast = 'stableSwapInfo_poolCount_ASC_NULLS_LAST',
  StableSwapInfoPoolCountDesc = 'stableSwapInfo_poolCount_DESC',
  StableSwapInfoPoolCountDescNullsFirst = 'stableSwapInfo_poolCount_DESC_NULLS_FIRST',
  StableSwapInfoPoolCountDescNullsLast = 'stableSwapInfo_poolCount_DESC_NULLS_LAST',
  StableSwapInfoTotalTvlUsdAsc = 'stableSwapInfo_totalTvlUSD_ASC',
  StableSwapInfoTotalTvlUsdAscNullsFirst = 'stableSwapInfo_totalTvlUSD_ASC_NULLS_FIRST',
  StableSwapInfoTotalTvlUsdAscNullsLast = 'stableSwapInfo_totalTvlUSD_ASC_NULLS_LAST',
  StableSwapInfoTotalTvlUsdDesc = 'stableSwapInfo_totalTvlUSD_DESC',
  StableSwapInfoTotalTvlUsdDescNullsFirst = 'stableSwapInfo_totalTvlUSD_DESC_NULLS_FIRST',
  StableSwapInfoTotalTvlUsdDescNullsLast = 'stableSwapInfo_totalTvlUSD_DESC_NULLS_LAST',
  StableSwapInfoTotalVolumeUsdAsc = 'stableSwapInfo_totalVolumeUSD_ASC',
  StableSwapInfoTotalVolumeUsdAscNullsFirst = 'stableSwapInfo_totalVolumeUSD_ASC_NULLS_FIRST',
  StableSwapInfoTotalVolumeUsdAscNullsLast = 'stableSwapInfo_totalVolumeUSD_ASC_NULLS_LAST',
  StableSwapInfoTotalVolumeUsdDesc = 'stableSwapInfo_totalVolumeUSD_DESC',
  StableSwapInfoTotalVolumeUsdDescNullsFirst = 'stableSwapInfo_totalVolumeUSD_DESC_NULLS_FIRST',
  StableSwapInfoTotalVolumeUsdDescNullsLast = 'stableSwapInfo_totalVolumeUSD_DESC_NULLS_LAST',
  StableSwapInfoTxCountAsc = 'stableSwapInfo_txCount_ASC',
  StableSwapInfoTxCountAscNullsFirst = 'stableSwapInfo_txCount_ASC_NULLS_FIRST',
  StableSwapInfoTxCountAscNullsLast = 'stableSwapInfo_txCount_ASC_NULLS_LAST',
  StableSwapInfoTxCountDesc = 'stableSwapInfo_txCount_DESC',
  StableSwapInfoTxCountDescNullsFirst = 'stableSwapInfo_txCount_DESC_NULLS_FIRST',
  StableSwapInfoTxCountDescNullsLast = 'stableSwapInfo_txCount_DESC_NULLS_LAST',
  SwapFeeAsc = 'swapFee_ASC',
  SwapFeeAscNullsFirst = 'swapFee_ASC_NULLS_FIRST',
  SwapFeeAscNullsLast = 'swapFee_ASC_NULLS_LAST',
  SwapFeeDesc = 'swapFee_DESC',
  SwapFeeDescNullsFirst = 'swapFee_DESC_NULLS_FIRST',
  SwapFeeDescNullsLast = 'swapFee_DESC_NULLS_LAST',
  TvlUsdAsc = 'tvlUSD_ASC',
  TvlUsdAscNullsFirst = 'tvlUSD_ASC_NULLS_FIRST',
  TvlUsdAscNullsLast = 'tvlUSD_ASC_NULLS_LAST',
  TvlUsdDesc = 'tvlUSD_DESC',
  TvlUsdDescNullsFirst = 'tvlUSD_DESC_NULLS_FIRST',
  TvlUsdDescNullsLast = 'tvlUSD_DESC_NULLS_LAST',
  VirtualPriceAsc = 'virtualPrice_ASC',
  VirtualPriceAscNullsFirst = 'virtualPrice_ASC_NULLS_FIRST',
  VirtualPriceAscNullsLast = 'virtualPrice_ASC_NULLS_LAST',
  VirtualPriceDesc = 'virtualPrice_DESC',
  VirtualPriceDescNullsFirst = 'virtualPrice_DESC_NULLS_FIRST',
  VirtualPriceDescNullsLast = 'virtualPrice_DESC_NULLS_LAST',
  VolumeUsdAsc = 'volumeUSD_ASC',
  VolumeUsdAscNullsFirst = 'volumeUSD_ASC_NULLS_FIRST',
  VolumeUsdAscNullsLast = 'volumeUSD_ASC_NULLS_LAST',
  VolumeUsdDesc = 'volumeUSD_DESC',
  VolumeUsdDescNullsFirst = 'volumeUSD_DESC_NULLS_FIRST',
  VolumeUsdDescNullsLast = 'volumeUSD_DESC_NULLS_LAST'
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
  FarmCreatedAtBlockAscNullsFirst = 'farm_createdAtBlock_ASC_NULLS_FIRST',
  FarmCreatedAtBlockAscNullsLast = 'farm_createdAtBlock_ASC_NULLS_LAST',
  FarmCreatedAtBlockDesc = 'farm_createdAtBlock_DESC',
  FarmCreatedAtBlockDescNullsFirst = 'farm_createdAtBlock_DESC_NULLS_FIRST',
  FarmCreatedAtBlockDescNullsLast = 'farm_createdAtBlock_DESC_NULLS_LAST',
  FarmCreatedAtTimestampAsc = 'farm_createdAtTimestamp_ASC',
  FarmCreatedAtTimestampAscNullsFirst = 'farm_createdAtTimestamp_ASC_NULLS_FIRST',
  FarmCreatedAtTimestampAscNullsLast = 'farm_createdAtTimestamp_ASC_NULLS_LAST',
  FarmCreatedAtTimestampDesc = 'farm_createdAtTimestamp_DESC',
  FarmCreatedAtTimestampDescNullsFirst = 'farm_createdAtTimestamp_DESC_NULLS_FIRST',
  FarmCreatedAtTimestampDescNullsLast = 'farm_createdAtTimestamp_DESC_NULLS_LAST',
  FarmIdAsc = 'farm_id_ASC',
  FarmIdAscNullsFirst = 'farm_id_ASC_NULLS_FIRST',
  FarmIdAscNullsLast = 'farm_id_ASC_NULLS_LAST',
  FarmIdDesc = 'farm_id_DESC',
  FarmIdDescNullsFirst = 'farm_id_DESC_NULLS_FIRST',
  FarmIdDescNullsLast = 'farm_id_DESC_NULLS_LAST',
  FarmLiquidityStakedAsc = 'farm_liquidityStaked_ASC',
  FarmLiquidityStakedAscNullsFirst = 'farm_liquidityStaked_ASC_NULLS_FIRST',
  FarmLiquidityStakedAscNullsLast = 'farm_liquidityStaked_ASC_NULLS_LAST',
  FarmLiquidityStakedDesc = 'farm_liquidityStaked_DESC',
  FarmLiquidityStakedDescNullsFirst = 'farm_liquidityStaked_DESC_NULLS_FIRST',
  FarmLiquidityStakedDescNullsLast = 'farm_liquidityStaked_DESC_NULLS_LAST',
  FarmPidAsc = 'farm_pid_ASC',
  FarmPidAscNullsFirst = 'farm_pid_ASC_NULLS_FIRST',
  FarmPidAscNullsLast = 'farm_pid_ASC_NULLS_LAST',
  FarmPidDesc = 'farm_pid_DESC',
  FarmPidDescNullsFirst = 'farm_pid_DESC_NULLS_FIRST',
  FarmPidDescNullsLast = 'farm_pid_DESC_NULLS_LAST',
  FarmRewardUsdPerDayAsc = 'farm_rewardUSDPerDay_ASC',
  FarmRewardUsdPerDayAscNullsFirst = 'farm_rewardUSDPerDay_ASC_NULLS_FIRST',
  FarmRewardUsdPerDayAscNullsLast = 'farm_rewardUSDPerDay_ASC_NULLS_LAST',
  FarmRewardUsdPerDayDesc = 'farm_rewardUSDPerDay_DESC',
  FarmRewardUsdPerDayDescNullsFirst = 'farm_rewardUSDPerDay_DESC_NULLS_FIRST',
  FarmRewardUsdPerDayDescNullsLast = 'farm_rewardUSDPerDay_DESC_NULLS_LAST',
  FarmStakeAprAsc = 'farm_stakeApr_ASC',
  FarmStakeAprAscNullsFirst = 'farm_stakeApr_ASC_NULLS_FIRST',
  FarmStakeAprAscNullsLast = 'farm_stakeApr_ASC_NULLS_LAST',
  FarmStakeAprDesc = 'farm_stakeApr_DESC',
  FarmStakeAprDescNullsFirst = 'farm_stakeApr_DESC_NULLS_FIRST',
  FarmStakeAprDescNullsLast = 'farm_stakeApr_DESC_NULLS_LAST',
  FarmStakeTokenAsc = 'farm_stakeToken_ASC',
  FarmStakeTokenAscNullsFirst = 'farm_stakeToken_ASC_NULLS_FIRST',
  FarmStakeTokenAscNullsLast = 'farm_stakeToken_ASC_NULLS_LAST',
  FarmStakeTokenDesc = 'farm_stakeToken_DESC',
  FarmStakeTokenDescNullsFirst = 'farm_stakeToken_DESC_NULLS_FIRST',
  FarmStakeTokenDescNullsLast = 'farm_stakeToken_DESC_NULLS_LAST',
  FarmStakedUsdAsc = 'farm_stakedUSD_ASC',
  FarmStakedUsdAscNullsFirst = 'farm_stakedUSD_ASC_NULLS_FIRST',
  FarmStakedUsdAscNullsLast = 'farm_stakedUSD_ASC_NULLS_LAST',
  FarmStakedUsdDesc = 'farm_stakedUSD_DESC',
  FarmStakedUsdDescNullsFirst = 'farm_stakedUSD_DESC_NULLS_FIRST',
  FarmStakedUsdDescNullsLast = 'farm_stakedUSD_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  LiquidityStakedBalanceAsc = 'liquidityStakedBalance_ASC',
  LiquidityStakedBalanceAscNullsFirst = 'liquidityStakedBalance_ASC_NULLS_FIRST',
  LiquidityStakedBalanceAscNullsLast = 'liquidityStakedBalance_ASC_NULLS_LAST',
  LiquidityStakedBalanceDesc = 'liquidityStakedBalance_DESC',
  LiquidityStakedBalanceDescNullsFirst = 'liquidityStakedBalance_DESC_NULLS_FIRST',
  LiquidityStakedBalanceDescNullsLast = 'liquidityStakedBalance_DESC_NULLS_LAST',
  UserIdAsc = 'user_id_ASC',
  UserIdAscNullsFirst = 'user_id_ASC_NULLS_FIRST',
  UserIdAscNullsLast = 'user_id_ASC_NULLS_LAST',
  UserIdDesc = 'user_id_DESC',
  UserIdDescNullsFirst = 'user_id_DESC_NULLS_FIRST',
  UserIdDescNullsLast = 'user_id_DESC_NULLS_LAST',
  UserUsdSwappedAsc = 'user_usdSwapped_ASC',
  UserUsdSwappedAscNullsFirst = 'user_usdSwapped_ASC_NULLS_FIRST',
  UserUsdSwappedAscNullsLast = 'user_usdSwapped_ASC_NULLS_LAST',
  UserUsdSwappedDesc = 'user_usdSwapped_DESC',
  UserUsdSwappedDescNullsFirst = 'user_usdSwapped_DESC_NULLS_FIRST',
  UserUsdSwappedDescNullsLast = 'user_usdSwapped_DESC_NULLS_LAST'
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

export type Subscription = {
  __typename?: 'Subscription';
  backstopPoolById?: Maybe<BackstopPool>;
  backstopPools: Array<BackstopPool>;
  blockById?: Maybe<Block>;
  blocks: Array<Block>;
  bundleById?: Maybe<Bundle>;
  bundles: Array<Bundle>;
  burnById?: Maybe<Burn>;
  burns: Array<Burn>;
  callById?: Maybe<Call>;
  calls: Array<Call>;
  eventById?: Maybe<Event>;
  events: Array<Event>;
  extrinsicById?: Maybe<Extrinsic>;
  extrinsics: Array<Extrinsic>;
  factories: Array<Factory>;
  factoryById?: Maybe<Factory>;
  factoryDayData: Array<FactoryDayData>;
  factoryDayDataById?: Maybe<FactoryDayData>;
  farmById?: Maybe<Farm>;
  farms: Array<Farm>;
  incentiveById?: Maybe<Incentive>;
  incentives: Array<Incentive>;
  issueRequestById?: Maybe<IssueRequest>;
  issueRequests: Array<IssueRequest>;
  itemsCounterById?: Maybe<ItemsCounter>;
  itemsCounters: Array<ItemsCounter>;
  liquidityPositionById?: Maybe<LiquidityPosition>;
  liquidityPositionSnapshotById?: Maybe<LiquidityPositionSnapshot>;
  liquidityPositionSnapshots: Array<LiquidityPositionSnapshot>;
  liquidityPositions: Array<LiquidityPosition>;
  mintById?: Maybe<Mint>;
  mints: Array<Mint>;
  nablaBackstopLiquidityDepositById?: Maybe<NablaBackstopLiquidityDeposit>;
  nablaBackstopLiquidityDeposits: Array<NablaBackstopLiquidityDeposit>;
  nablaBackstopLiquidityWithdrawalById?: Maybe<NablaBackstopLiquidityWithdrawal>;
  nablaBackstopLiquidityWithdrawals: Array<NablaBackstopLiquidityWithdrawal>;
  nablaSwapById?: Maybe<NablaSwap>;
  nablaSwapFeeById?: Maybe<NablaSwapFee>;
  nablaSwapFees: Array<NablaSwapFee>;
  nablaSwapLiquidityDepositById?: Maybe<NablaSwapLiquidityDeposit>;
  nablaSwapLiquidityDeposits: Array<NablaSwapLiquidityDeposit>;
  nablaSwapLiquidityWithdrawalById?: Maybe<NablaSwapLiquidityWithdrawal>;
  nablaSwapLiquidityWithdrawals: Array<NablaSwapLiquidityWithdrawal>;
  nablaSwaps: Array<NablaSwap>;
  nablaTokenById?: Maybe<NablaToken>;
  nablaTokens: Array<NablaToken>;
  oraclePriceById?: Maybe<OraclePrice>;
  oraclePrices: Array<OraclePrice>;
  pairById?: Maybe<Pair>;
  pairDayData: Array<PairDayData>;
  pairDayDataById?: Maybe<PairDayData>;
  pairHourData: Array<PairHourData>;
  pairHourDataById?: Maybe<PairHourData>;
  pairs: Array<Pair>;
  redeemRequestById?: Maybe<RedeemRequest>;
  redeemRequests: Array<RedeemRequest>;
  routerById?: Maybe<Router>;
  routers: Array<Router>;
  singleTokenLockById?: Maybe<SingleTokenLock>;
  singleTokenLockDayData: Array<SingleTokenLockDayData>;
  singleTokenLockDayDataById?: Maybe<SingleTokenLockDayData>;
  singleTokenLockHourData: Array<SingleTokenLockHourData>;
  singleTokenLockHourDataById?: Maybe<SingleTokenLockHourData>;
  singleTokenLocks: Array<SingleTokenLock>;
  stableDayData: Array<StableDayData>;
  stableDayDataById?: Maybe<StableDayData>;
  stableSwapById?: Maybe<StableSwap>;
  stableSwapDayData: Array<StableSwapDayData>;
  stableSwapDayDataById?: Maybe<StableSwapDayData>;
  stableSwapEventById?: Maybe<StableSwapEvent>;
  stableSwapEvents: Array<StableSwapEvent>;
  stableSwapExchangeById?: Maybe<StableSwapExchange>;
  stableSwapExchanges: Array<StableSwapExchange>;
  stableSwapHourData: Array<StableSwapHourData>;
  stableSwapHourDataById?: Maybe<StableSwapHourData>;
  stableSwapInfoById?: Maybe<StableSwapInfo>;
  stableSwapInfos: Array<StableSwapInfo>;
  stableSwapLiquidityPositionById?: Maybe<StableSwapLiquidityPosition>;
  stableSwapLiquidityPositions: Array<StableSwapLiquidityPosition>;
  stableSwaps: Array<StableSwap>;
  stakePositionById?: Maybe<StakePosition>;
  stakePositions: Array<StakePosition>;
  swapById?: Maybe<Swap>;
  swapPoolById?: Maybe<SwapPool>;
  swapPools: Array<SwapPool>;
  swaps: Array<Swap>;
  tokenById?: Maybe<Token>;
  tokenDayData: Array<TokenDayData>;
  tokenDayDataById?: Maybe<TokenDayData>;
  tokenDepositById?: Maybe<TokenDeposit>;
  tokenDeposits: Array<TokenDeposit>;
  tokenTransferById?: Maybe<TokenTransfer>;
  tokenTransfers: Array<TokenTransfer>;
  tokenWithdrawnById?: Maybe<TokenWithdrawn>;
  tokenWithdrawns: Array<TokenWithdrawn>;
  tokens: Array<Token>;
  transactionById?: Maybe<Transaction>;
  transactions: Array<Transaction>;
  transferById?: Maybe<Transfer>;
  transfers: Array<Transfer>;
  userById?: Maybe<User>;
  users: Array<User>;
  vaultById?: Maybe<Vault>;
  vaults: Array<Vault>;
  zenlinkDayInfoById?: Maybe<ZenlinkDayInfo>;
  zenlinkDayInfos: Array<ZenlinkDayInfo>;
  zenlinkInfoById?: Maybe<ZenlinkInfo>;
  zenlinkInfos: Array<ZenlinkInfo>;
  zlkInfoById?: Maybe<ZlkInfo>;
  zlkInfos: Array<ZlkInfo>;
};


export type SubscriptionBackstopPoolByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionBackstopPoolsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<BackstopPoolOrderByInput>>;
  where?: InputMaybe<BackstopPoolWhereInput>;
};


export type SubscriptionBlockByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionBlocksArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<BlockOrderByInput>>;
  where?: InputMaybe<BlockWhereInput>;
};


export type SubscriptionBundleByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionBundlesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<BundleOrderByInput>>;
  where?: InputMaybe<BundleWhereInput>;
};


export type SubscriptionBurnByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionBurnsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<BurnOrderByInput>>;
  where?: InputMaybe<BurnWhereInput>;
};


export type SubscriptionCallByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionCallsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<CallOrderByInput>>;
  where?: InputMaybe<CallWhereInput>;
};


export type SubscriptionEventByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionEventsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<EventOrderByInput>>;
  where?: InputMaybe<EventWhereInput>;
};


export type SubscriptionExtrinsicByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionExtrinsicsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ExtrinsicOrderByInput>>;
  where?: InputMaybe<ExtrinsicWhereInput>;
};


export type SubscriptionFactoriesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<FactoryOrderByInput>>;
  where?: InputMaybe<FactoryWhereInput>;
};


export type SubscriptionFactoryByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionFactoryDayDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<FactoryDayDataOrderByInput>>;
  where?: InputMaybe<FactoryDayDataWhereInput>;
};


export type SubscriptionFactoryDayDataByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionFarmByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionFarmsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<FarmOrderByInput>>;
  where?: InputMaybe<FarmWhereInput>;
};


export type SubscriptionIncentiveByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionIncentivesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<IncentiveOrderByInput>>;
  where?: InputMaybe<IncentiveWhereInput>;
};


export type SubscriptionIssueRequestByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionIssueRequestsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<IssueRequestOrderByInput>>;
  where?: InputMaybe<IssueRequestWhereInput>;
};


export type SubscriptionItemsCounterByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionItemsCountersArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ItemsCounterOrderByInput>>;
  where?: InputMaybe<ItemsCounterWhereInput>;
};


export type SubscriptionLiquidityPositionByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionLiquidityPositionSnapshotByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionLiquidityPositionSnapshotsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<LiquidityPositionSnapshotOrderByInput>>;
  where?: InputMaybe<LiquidityPositionSnapshotWhereInput>;
};


export type SubscriptionLiquidityPositionsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<LiquidityPositionOrderByInput>>;
  where?: InputMaybe<LiquidityPositionWhereInput>;
};


export type SubscriptionMintByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionMintsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<MintOrderByInput>>;
  where?: InputMaybe<MintWhereInput>;
};


export type SubscriptionNablaBackstopLiquidityDepositByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionNablaBackstopLiquidityDepositsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<NablaBackstopLiquidityDepositOrderByInput>>;
  where?: InputMaybe<NablaBackstopLiquidityDepositWhereInput>;
};


export type SubscriptionNablaBackstopLiquidityWithdrawalByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionNablaBackstopLiquidityWithdrawalsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<NablaBackstopLiquidityWithdrawalOrderByInput>>;
  where?: InputMaybe<NablaBackstopLiquidityWithdrawalWhereInput>;
};


export type SubscriptionNablaSwapByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionNablaSwapFeeByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionNablaSwapFeesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<NablaSwapFeeOrderByInput>>;
  where?: InputMaybe<NablaSwapFeeWhereInput>;
};


export type SubscriptionNablaSwapLiquidityDepositByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionNablaSwapLiquidityDepositsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<NablaSwapLiquidityDepositOrderByInput>>;
  where?: InputMaybe<NablaSwapLiquidityDepositWhereInput>;
};


export type SubscriptionNablaSwapLiquidityWithdrawalByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionNablaSwapLiquidityWithdrawalsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<NablaSwapLiquidityWithdrawalOrderByInput>>;
  where?: InputMaybe<NablaSwapLiquidityWithdrawalWhereInput>;
};


export type SubscriptionNablaSwapsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<NablaSwapOrderByInput>>;
  where?: InputMaybe<NablaSwapWhereInput>;
};


export type SubscriptionNablaTokenByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionNablaTokensArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<NablaTokenOrderByInput>>;
  where?: InputMaybe<NablaTokenWhereInput>;
};


export type SubscriptionOraclePriceByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionOraclePricesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<OraclePriceOrderByInput>>;
  where?: InputMaybe<OraclePriceWhereInput>;
};


export type SubscriptionPairByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionPairDayDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<PairDayDataOrderByInput>>;
  where?: InputMaybe<PairDayDataWhereInput>;
};


export type SubscriptionPairDayDataByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionPairHourDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<PairHourDataOrderByInput>>;
  where?: InputMaybe<PairHourDataWhereInput>;
};


export type SubscriptionPairHourDataByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionPairsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<PairOrderByInput>>;
  where?: InputMaybe<PairWhereInput>;
};


export type SubscriptionRedeemRequestByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionRedeemRequestsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<RedeemRequestOrderByInput>>;
  where?: InputMaybe<RedeemRequestWhereInput>;
};


export type SubscriptionRouterByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionRoutersArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<RouterOrderByInput>>;
  where?: InputMaybe<RouterWhereInput>;
};


export type SubscriptionSingleTokenLockByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionSingleTokenLockDayDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SingleTokenLockDayDataOrderByInput>>;
  where?: InputMaybe<SingleTokenLockDayDataWhereInput>;
};


export type SubscriptionSingleTokenLockDayDataByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionSingleTokenLockHourDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SingleTokenLockHourDataOrderByInput>>;
  where?: InputMaybe<SingleTokenLockHourDataWhereInput>;
};


export type SubscriptionSingleTokenLockHourDataByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionSingleTokenLocksArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SingleTokenLockOrderByInput>>;
  where?: InputMaybe<SingleTokenLockWhereInput>;
};


export type SubscriptionStableDayDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StableDayDataOrderByInput>>;
  where?: InputMaybe<StableDayDataWhereInput>;
};


export type SubscriptionStableDayDataByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionStableSwapByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionStableSwapDayDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StableSwapDayDataOrderByInput>>;
  where?: InputMaybe<StableSwapDayDataWhereInput>;
};


export type SubscriptionStableSwapDayDataByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionStableSwapEventByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionStableSwapEventsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StableSwapEventOrderByInput>>;
  where?: InputMaybe<StableSwapEventWhereInput>;
};


export type SubscriptionStableSwapExchangeByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionStableSwapExchangesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StableSwapExchangeOrderByInput>>;
  where?: InputMaybe<StableSwapExchangeWhereInput>;
};


export type SubscriptionStableSwapHourDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StableSwapHourDataOrderByInput>>;
  where?: InputMaybe<StableSwapHourDataWhereInput>;
};


export type SubscriptionStableSwapHourDataByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionStableSwapInfoByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionStableSwapInfosArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StableSwapInfoOrderByInput>>;
  where?: InputMaybe<StableSwapInfoWhereInput>;
};


export type SubscriptionStableSwapLiquidityPositionByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionStableSwapLiquidityPositionsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StableSwapLiquidityPositionOrderByInput>>;
  where?: InputMaybe<StableSwapLiquidityPositionWhereInput>;
};


export type SubscriptionStableSwapsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StableSwapOrderByInput>>;
  where?: InputMaybe<StableSwapWhereInput>;
};


export type SubscriptionStakePositionByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionStakePositionsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<StakePositionOrderByInput>>;
  where?: InputMaybe<StakePositionWhereInput>;
};


export type SubscriptionSwapByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionSwapPoolByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionSwapPoolsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SwapPoolOrderByInput>>;
  where?: InputMaybe<SwapPoolWhereInput>;
};


export type SubscriptionSwapsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<SwapOrderByInput>>;
  where?: InputMaybe<SwapWhereInput>;
};


export type SubscriptionTokenByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionTokenDayDataArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<TokenDayDataOrderByInput>>;
  where?: InputMaybe<TokenDayDataWhereInput>;
};


export type SubscriptionTokenDayDataByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionTokenDepositByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionTokenDepositsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<TokenDepositOrderByInput>>;
  where?: InputMaybe<TokenDepositWhereInput>;
};


export type SubscriptionTokenTransferByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionTokenTransfersArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<TokenTransferOrderByInput>>;
  where?: InputMaybe<TokenTransferWhereInput>;
};


export type SubscriptionTokenWithdrawnByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionTokenWithdrawnsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<TokenWithdrawnOrderByInput>>;
  where?: InputMaybe<TokenWithdrawnWhereInput>;
};


export type SubscriptionTokensArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<TokenOrderByInput>>;
  where?: InputMaybe<TokenWhereInput>;
};


export type SubscriptionTransactionByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionTransactionsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<TransactionOrderByInput>>;
  where?: InputMaybe<TransactionWhereInput>;
};


export type SubscriptionTransferByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionTransfersArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<TransferOrderByInput>>;
  where?: InputMaybe<TransferWhereInput>;
};


export type SubscriptionUserByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionUsersArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<UserOrderByInput>>;
  where?: InputMaybe<UserWhereInput>;
};


export type SubscriptionVaultByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionVaultsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<VaultOrderByInput>>;
  where?: InputMaybe<VaultWhereInput>;
};


export type SubscriptionZenlinkDayInfoByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionZenlinkDayInfosArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ZenlinkDayInfoOrderByInput>>;
  where?: InputMaybe<ZenlinkDayInfoWhereInput>;
};


export type SubscriptionZenlinkInfoByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionZenlinkInfosArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ZenlinkInfoOrderByInput>>;
  where?: InputMaybe<ZenlinkInfoWhereInput>;
};


export type SubscriptionZlkInfoByIdArgs = {
  id: Scalars['String']['input'];
};


export type SubscriptionZlkInfosArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<ZlkInfoOrderByInput>>;
  where?: InputMaybe<ZlkInfoWhereInput>;
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
  Amount0InAscNullsFirst = 'amount0In_ASC_NULLS_FIRST',
  Amount0InAscNullsLast = 'amount0In_ASC_NULLS_LAST',
  Amount0InDesc = 'amount0In_DESC',
  Amount0InDescNullsFirst = 'amount0In_DESC_NULLS_FIRST',
  Amount0InDescNullsLast = 'amount0In_DESC_NULLS_LAST',
  Amount0OutAsc = 'amount0Out_ASC',
  Amount0OutAscNullsFirst = 'amount0Out_ASC_NULLS_FIRST',
  Amount0OutAscNullsLast = 'amount0Out_ASC_NULLS_LAST',
  Amount0OutDesc = 'amount0Out_DESC',
  Amount0OutDescNullsFirst = 'amount0Out_DESC_NULLS_FIRST',
  Amount0OutDescNullsLast = 'amount0Out_DESC_NULLS_LAST',
  Amount1InAsc = 'amount1In_ASC',
  Amount1InAscNullsFirst = 'amount1In_ASC_NULLS_FIRST',
  Amount1InAscNullsLast = 'amount1In_ASC_NULLS_LAST',
  Amount1InDesc = 'amount1In_DESC',
  Amount1InDescNullsFirst = 'amount1In_DESC_NULLS_FIRST',
  Amount1InDescNullsLast = 'amount1In_DESC_NULLS_LAST',
  Amount1OutAsc = 'amount1Out_ASC',
  Amount1OutAscNullsFirst = 'amount1Out_ASC_NULLS_FIRST',
  Amount1OutAscNullsLast = 'amount1Out_ASC_NULLS_LAST',
  Amount1OutDesc = 'amount1Out_DESC',
  Amount1OutDescNullsFirst = 'amount1Out_DESC_NULLS_FIRST',
  Amount1OutDescNullsLast = 'amount1Out_DESC_NULLS_LAST',
  AmountUsdAsc = 'amountUSD_ASC',
  AmountUsdAscNullsFirst = 'amountUSD_ASC_NULLS_FIRST',
  AmountUsdAscNullsLast = 'amountUSD_ASC_NULLS_LAST',
  AmountUsdDesc = 'amountUSD_DESC',
  AmountUsdDescNullsFirst = 'amountUSD_DESC_NULLS_FIRST',
  AmountUsdDescNullsLast = 'amountUSD_DESC_NULLS_LAST',
  FromAsc = 'from_ASC',
  FromAscNullsFirst = 'from_ASC_NULLS_FIRST',
  FromAscNullsLast = 'from_ASC_NULLS_LAST',
  FromDesc = 'from_DESC',
  FromDescNullsFirst = 'from_DESC_NULLS_FIRST',
  FromDescNullsLast = 'from_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  LogIndexAsc = 'logIndex_ASC',
  LogIndexAscNullsFirst = 'logIndex_ASC_NULLS_FIRST',
  LogIndexAscNullsLast = 'logIndex_ASC_NULLS_LAST',
  LogIndexDesc = 'logIndex_DESC',
  LogIndexDescNullsFirst = 'logIndex_DESC_NULLS_FIRST',
  LogIndexDescNullsLast = 'logIndex_DESC_NULLS_LAST',
  PairCreatedAtBlockNumberAsc = 'pair_createdAtBlockNumber_ASC',
  PairCreatedAtBlockNumberAscNullsFirst = 'pair_createdAtBlockNumber_ASC_NULLS_FIRST',
  PairCreatedAtBlockNumberAscNullsLast = 'pair_createdAtBlockNumber_ASC_NULLS_LAST',
  PairCreatedAtBlockNumberDesc = 'pair_createdAtBlockNumber_DESC',
  PairCreatedAtBlockNumberDescNullsFirst = 'pair_createdAtBlockNumber_DESC_NULLS_FIRST',
  PairCreatedAtBlockNumberDescNullsLast = 'pair_createdAtBlockNumber_DESC_NULLS_LAST',
  PairCreatedAtTimestampAsc = 'pair_createdAtTimestamp_ASC',
  PairCreatedAtTimestampAscNullsFirst = 'pair_createdAtTimestamp_ASC_NULLS_FIRST',
  PairCreatedAtTimestampAscNullsLast = 'pair_createdAtTimestamp_ASC_NULLS_LAST',
  PairCreatedAtTimestampDesc = 'pair_createdAtTimestamp_DESC',
  PairCreatedAtTimestampDescNullsFirst = 'pair_createdAtTimestamp_DESC_NULLS_FIRST',
  PairCreatedAtTimestampDescNullsLast = 'pair_createdAtTimestamp_DESC_NULLS_LAST',
  PairIdAsc = 'pair_id_ASC',
  PairIdAscNullsFirst = 'pair_id_ASC_NULLS_FIRST',
  PairIdAscNullsLast = 'pair_id_ASC_NULLS_LAST',
  PairIdDesc = 'pair_id_DESC',
  PairIdDescNullsFirst = 'pair_id_DESC_NULLS_FIRST',
  PairIdDescNullsLast = 'pair_id_DESC_NULLS_LAST',
  PairLiquidityProviderCountAsc = 'pair_liquidityProviderCount_ASC',
  PairLiquidityProviderCountAscNullsFirst = 'pair_liquidityProviderCount_ASC_NULLS_FIRST',
  PairLiquidityProviderCountAscNullsLast = 'pair_liquidityProviderCount_ASC_NULLS_LAST',
  PairLiquidityProviderCountDesc = 'pair_liquidityProviderCount_DESC',
  PairLiquidityProviderCountDescNullsFirst = 'pair_liquidityProviderCount_DESC_NULLS_FIRST',
  PairLiquidityProviderCountDescNullsLast = 'pair_liquidityProviderCount_DESC_NULLS_LAST',
  PairReserve0Asc = 'pair_reserve0_ASC',
  PairReserve0AscNullsFirst = 'pair_reserve0_ASC_NULLS_FIRST',
  PairReserve0AscNullsLast = 'pair_reserve0_ASC_NULLS_LAST',
  PairReserve0Desc = 'pair_reserve0_DESC',
  PairReserve0DescNullsFirst = 'pair_reserve0_DESC_NULLS_FIRST',
  PairReserve0DescNullsLast = 'pair_reserve0_DESC_NULLS_LAST',
  PairReserve1Asc = 'pair_reserve1_ASC',
  PairReserve1AscNullsFirst = 'pair_reserve1_ASC_NULLS_FIRST',
  PairReserve1AscNullsLast = 'pair_reserve1_ASC_NULLS_LAST',
  PairReserve1Desc = 'pair_reserve1_DESC',
  PairReserve1DescNullsFirst = 'pair_reserve1_DESC_NULLS_FIRST',
  PairReserve1DescNullsLast = 'pair_reserve1_DESC_NULLS_LAST',
  PairReserveEthAsc = 'pair_reserveETH_ASC',
  PairReserveEthAscNullsFirst = 'pair_reserveETH_ASC_NULLS_FIRST',
  PairReserveEthAscNullsLast = 'pair_reserveETH_ASC_NULLS_LAST',
  PairReserveEthDesc = 'pair_reserveETH_DESC',
  PairReserveEthDescNullsFirst = 'pair_reserveETH_DESC_NULLS_FIRST',
  PairReserveEthDescNullsLast = 'pair_reserveETH_DESC_NULLS_LAST',
  PairReserveUsdAsc = 'pair_reserveUSD_ASC',
  PairReserveUsdAscNullsFirst = 'pair_reserveUSD_ASC_NULLS_FIRST',
  PairReserveUsdAscNullsLast = 'pair_reserveUSD_ASC_NULLS_LAST',
  PairReserveUsdDesc = 'pair_reserveUSD_DESC',
  PairReserveUsdDescNullsFirst = 'pair_reserveUSD_DESC_NULLS_FIRST',
  PairReserveUsdDescNullsLast = 'pair_reserveUSD_DESC_NULLS_LAST',
  PairToken0PriceAsc = 'pair_token0Price_ASC',
  PairToken0PriceAscNullsFirst = 'pair_token0Price_ASC_NULLS_FIRST',
  PairToken0PriceAscNullsLast = 'pair_token0Price_ASC_NULLS_LAST',
  PairToken0PriceDesc = 'pair_token0Price_DESC',
  PairToken0PriceDescNullsFirst = 'pair_token0Price_DESC_NULLS_FIRST',
  PairToken0PriceDescNullsLast = 'pair_token0Price_DESC_NULLS_LAST',
  PairToken1PriceAsc = 'pair_token1Price_ASC',
  PairToken1PriceAscNullsFirst = 'pair_token1Price_ASC_NULLS_FIRST',
  PairToken1PriceAscNullsLast = 'pair_token1Price_ASC_NULLS_LAST',
  PairToken1PriceDesc = 'pair_token1Price_DESC',
  PairToken1PriceDescNullsFirst = 'pair_token1Price_DESC_NULLS_FIRST',
  PairToken1PriceDescNullsLast = 'pair_token1Price_DESC_NULLS_LAST',
  PairTotalSupplyAsc = 'pair_totalSupply_ASC',
  PairTotalSupplyAscNullsFirst = 'pair_totalSupply_ASC_NULLS_FIRST',
  PairTotalSupplyAscNullsLast = 'pair_totalSupply_ASC_NULLS_LAST',
  PairTotalSupplyDesc = 'pair_totalSupply_DESC',
  PairTotalSupplyDescNullsFirst = 'pair_totalSupply_DESC_NULLS_FIRST',
  PairTotalSupplyDescNullsLast = 'pair_totalSupply_DESC_NULLS_LAST',
  PairTrackedReserveEthAsc = 'pair_trackedReserveETH_ASC',
  PairTrackedReserveEthAscNullsFirst = 'pair_trackedReserveETH_ASC_NULLS_FIRST',
  PairTrackedReserveEthAscNullsLast = 'pair_trackedReserveETH_ASC_NULLS_LAST',
  PairTrackedReserveEthDesc = 'pair_trackedReserveETH_DESC',
  PairTrackedReserveEthDescNullsFirst = 'pair_trackedReserveETH_DESC_NULLS_FIRST',
  PairTrackedReserveEthDescNullsLast = 'pair_trackedReserveETH_DESC_NULLS_LAST',
  PairTxCountAsc = 'pair_txCount_ASC',
  PairTxCountAscNullsFirst = 'pair_txCount_ASC_NULLS_FIRST',
  PairTxCountAscNullsLast = 'pair_txCount_ASC_NULLS_LAST',
  PairTxCountDesc = 'pair_txCount_DESC',
  PairTxCountDescNullsFirst = 'pair_txCount_DESC_NULLS_FIRST',
  PairTxCountDescNullsLast = 'pair_txCount_DESC_NULLS_LAST',
  PairUntrackedVolumeUsdAsc = 'pair_untrackedVolumeUSD_ASC',
  PairUntrackedVolumeUsdAscNullsFirst = 'pair_untrackedVolumeUSD_ASC_NULLS_FIRST',
  PairUntrackedVolumeUsdAscNullsLast = 'pair_untrackedVolumeUSD_ASC_NULLS_LAST',
  PairUntrackedVolumeUsdDesc = 'pair_untrackedVolumeUSD_DESC',
  PairUntrackedVolumeUsdDescNullsFirst = 'pair_untrackedVolumeUSD_DESC_NULLS_FIRST',
  PairUntrackedVolumeUsdDescNullsLast = 'pair_untrackedVolumeUSD_DESC_NULLS_LAST',
  PairVolumeToken0Asc = 'pair_volumeToken0_ASC',
  PairVolumeToken0AscNullsFirst = 'pair_volumeToken0_ASC_NULLS_FIRST',
  PairVolumeToken0AscNullsLast = 'pair_volumeToken0_ASC_NULLS_LAST',
  PairVolumeToken0Desc = 'pair_volumeToken0_DESC',
  PairVolumeToken0DescNullsFirst = 'pair_volumeToken0_DESC_NULLS_FIRST',
  PairVolumeToken0DescNullsLast = 'pair_volumeToken0_DESC_NULLS_LAST',
  PairVolumeToken1Asc = 'pair_volumeToken1_ASC',
  PairVolumeToken1AscNullsFirst = 'pair_volumeToken1_ASC_NULLS_FIRST',
  PairVolumeToken1AscNullsLast = 'pair_volumeToken1_ASC_NULLS_LAST',
  PairVolumeToken1Desc = 'pair_volumeToken1_DESC',
  PairVolumeToken1DescNullsFirst = 'pair_volumeToken1_DESC_NULLS_FIRST',
  PairVolumeToken1DescNullsLast = 'pair_volumeToken1_DESC_NULLS_LAST',
  PairVolumeUsdAsc = 'pair_volumeUSD_ASC',
  PairVolumeUsdAscNullsFirst = 'pair_volumeUSD_ASC_NULLS_FIRST',
  PairVolumeUsdAscNullsLast = 'pair_volumeUSD_ASC_NULLS_LAST',
  PairVolumeUsdDesc = 'pair_volumeUSD_DESC',
  PairVolumeUsdDescNullsFirst = 'pair_volumeUSD_DESC_NULLS_FIRST',
  PairVolumeUsdDescNullsLast = 'pair_volumeUSD_DESC_NULLS_LAST',
  SenderAsc = 'sender_ASC',
  SenderAscNullsFirst = 'sender_ASC_NULLS_FIRST',
  SenderAscNullsLast = 'sender_ASC_NULLS_LAST',
  SenderDesc = 'sender_DESC',
  SenderDescNullsFirst = 'sender_DESC_NULLS_FIRST',
  SenderDescNullsLast = 'sender_DESC_NULLS_LAST',
  TimestampAsc = 'timestamp_ASC',
  TimestampAscNullsFirst = 'timestamp_ASC_NULLS_FIRST',
  TimestampAscNullsLast = 'timestamp_ASC_NULLS_LAST',
  TimestampDesc = 'timestamp_DESC',
  TimestampDescNullsFirst = 'timestamp_DESC_NULLS_FIRST',
  TimestampDescNullsLast = 'timestamp_DESC_NULLS_LAST',
  ToAsc = 'to_ASC',
  ToAscNullsFirst = 'to_ASC_NULLS_FIRST',
  ToAscNullsLast = 'to_ASC_NULLS_LAST',
  ToDesc = 'to_DESC',
  ToDescNullsFirst = 'to_DESC_NULLS_FIRST',
  ToDescNullsLast = 'to_DESC_NULLS_LAST',
  TransactionBlockNumberAsc = 'transaction_blockNumber_ASC',
  TransactionBlockNumberAscNullsFirst = 'transaction_blockNumber_ASC_NULLS_FIRST',
  TransactionBlockNumberAscNullsLast = 'transaction_blockNumber_ASC_NULLS_LAST',
  TransactionBlockNumberDesc = 'transaction_blockNumber_DESC',
  TransactionBlockNumberDescNullsFirst = 'transaction_blockNumber_DESC_NULLS_FIRST',
  TransactionBlockNumberDescNullsLast = 'transaction_blockNumber_DESC_NULLS_LAST',
  TransactionIdAsc = 'transaction_id_ASC',
  TransactionIdAscNullsFirst = 'transaction_id_ASC_NULLS_FIRST',
  TransactionIdAscNullsLast = 'transaction_id_ASC_NULLS_LAST',
  TransactionIdDesc = 'transaction_id_DESC',
  TransactionIdDescNullsFirst = 'transaction_id_DESC_NULLS_FIRST',
  TransactionIdDescNullsLast = 'transaction_id_DESC_NULLS_LAST',
  TransactionTimestampAsc = 'transaction_timestamp_ASC',
  TransactionTimestampAscNullsFirst = 'transaction_timestamp_ASC_NULLS_FIRST',
  TransactionTimestampAscNullsLast = 'transaction_timestamp_ASC_NULLS_LAST',
  TransactionTimestampDesc = 'transaction_timestamp_DESC',
  TransactionTimestampDescNullsFirst = 'transaction_timestamp_DESC_NULLS_FIRST',
  TransactionTimestampDescNullsLast = 'transaction_timestamp_DESC_NULLS_LAST'
}

export type SwapPool = {
  __typename?: 'SwapPool';
  apr: Scalars['BigInt']['output'];
  backstop: BackstopPool;
  feesHistory: Array<NablaSwapFee>;
  id: Scalars['String']['output'];
  insuranceFeeBps: Scalars['BigInt']['output'];
  lpTokenDecimals: Scalars['Int']['output'];
  name: Scalars['String']['output'];
  paused: Scalars['Boolean']['output'];
  protocolTreasuryAddress?: Maybe<Scalars['String']['output']>;
  reserve: Scalars['BigInt']['output'];
  reserveWithSlippage: Scalars['BigInt']['output'];
  router?: Maybe<Router>;
  symbol: Scalars['String']['output'];
  token: NablaToken;
  totalLiabilities: Scalars['BigInt']['output'];
  totalSupply: Scalars['BigInt']['output'];
};


export type SwapPoolFeesHistoryArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  orderBy?: InputMaybe<Array<NablaSwapFeeOrderByInput>>;
  where?: InputMaybe<NablaSwapFeeWhereInput>;
};

export type SwapPoolEdge = {
  __typename?: 'SwapPoolEdge';
  cursor: Scalars['String']['output'];
  node: SwapPool;
};

export enum SwapPoolOrderByInput {
  AprAsc = 'apr_ASC',
  AprAscNullsFirst = 'apr_ASC_NULLS_FIRST',
  AprAscNullsLast = 'apr_ASC_NULLS_LAST',
  AprDesc = 'apr_DESC',
  AprDescNullsFirst = 'apr_DESC_NULLS_FIRST',
  AprDescNullsLast = 'apr_DESC_NULLS_LAST',
  BackstopAprAsc = 'backstop_apr_ASC',
  BackstopAprAscNullsFirst = 'backstop_apr_ASC_NULLS_FIRST',
  BackstopAprAscNullsLast = 'backstop_apr_ASC_NULLS_LAST',
  BackstopAprDesc = 'backstop_apr_DESC',
  BackstopAprDescNullsFirst = 'backstop_apr_DESC_NULLS_FIRST',
  BackstopAprDescNullsLast = 'backstop_apr_DESC_NULLS_LAST',
  BackstopIdAsc = 'backstop_id_ASC',
  BackstopIdAscNullsFirst = 'backstop_id_ASC_NULLS_FIRST',
  BackstopIdAscNullsLast = 'backstop_id_ASC_NULLS_LAST',
  BackstopIdDesc = 'backstop_id_DESC',
  BackstopIdDescNullsFirst = 'backstop_id_DESC_NULLS_FIRST',
  BackstopIdDescNullsLast = 'backstop_id_DESC_NULLS_LAST',
  BackstopLpTokenDecimalsAsc = 'backstop_lpTokenDecimals_ASC',
  BackstopLpTokenDecimalsAscNullsFirst = 'backstop_lpTokenDecimals_ASC_NULLS_FIRST',
  BackstopLpTokenDecimalsAscNullsLast = 'backstop_lpTokenDecimals_ASC_NULLS_LAST',
  BackstopLpTokenDecimalsDesc = 'backstop_lpTokenDecimals_DESC',
  BackstopLpTokenDecimalsDescNullsFirst = 'backstop_lpTokenDecimals_DESC_NULLS_FIRST',
  BackstopLpTokenDecimalsDescNullsLast = 'backstop_lpTokenDecimals_DESC_NULLS_LAST',
  BackstopNameAsc = 'backstop_name_ASC',
  BackstopNameAscNullsFirst = 'backstop_name_ASC_NULLS_FIRST',
  BackstopNameAscNullsLast = 'backstop_name_ASC_NULLS_LAST',
  BackstopNameDesc = 'backstop_name_DESC',
  BackstopNameDescNullsFirst = 'backstop_name_DESC_NULLS_FIRST',
  BackstopNameDescNullsLast = 'backstop_name_DESC_NULLS_LAST',
  BackstopPausedAsc = 'backstop_paused_ASC',
  BackstopPausedAscNullsFirst = 'backstop_paused_ASC_NULLS_FIRST',
  BackstopPausedAscNullsLast = 'backstop_paused_ASC_NULLS_LAST',
  BackstopPausedDesc = 'backstop_paused_DESC',
  BackstopPausedDescNullsFirst = 'backstop_paused_DESC_NULLS_FIRST',
  BackstopPausedDescNullsLast = 'backstop_paused_DESC_NULLS_LAST',
  BackstopReservesAsc = 'backstop_reserves_ASC',
  BackstopReservesAscNullsFirst = 'backstop_reserves_ASC_NULLS_FIRST',
  BackstopReservesAscNullsLast = 'backstop_reserves_ASC_NULLS_LAST',
  BackstopReservesDesc = 'backstop_reserves_DESC',
  BackstopReservesDescNullsFirst = 'backstop_reserves_DESC_NULLS_FIRST',
  BackstopReservesDescNullsLast = 'backstop_reserves_DESC_NULLS_LAST',
  BackstopSymbolAsc = 'backstop_symbol_ASC',
  BackstopSymbolAscNullsFirst = 'backstop_symbol_ASC_NULLS_FIRST',
  BackstopSymbolAscNullsLast = 'backstop_symbol_ASC_NULLS_LAST',
  BackstopSymbolDesc = 'backstop_symbol_DESC',
  BackstopSymbolDescNullsFirst = 'backstop_symbol_DESC_NULLS_FIRST',
  BackstopSymbolDescNullsLast = 'backstop_symbol_DESC_NULLS_LAST',
  BackstopTotalSupplyAsc = 'backstop_totalSupply_ASC',
  BackstopTotalSupplyAscNullsFirst = 'backstop_totalSupply_ASC_NULLS_FIRST',
  BackstopTotalSupplyAscNullsLast = 'backstop_totalSupply_ASC_NULLS_LAST',
  BackstopTotalSupplyDesc = 'backstop_totalSupply_DESC',
  BackstopTotalSupplyDescNullsFirst = 'backstop_totalSupply_DESC_NULLS_FIRST',
  BackstopTotalSupplyDescNullsLast = 'backstop_totalSupply_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  InsuranceFeeBpsAsc = 'insuranceFeeBps_ASC',
  InsuranceFeeBpsAscNullsFirst = 'insuranceFeeBps_ASC_NULLS_FIRST',
  InsuranceFeeBpsAscNullsLast = 'insuranceFeeBps_ASC_NULLS_LAST',
  InsuranceFeeBpsDesc = 'insuranceFeeBps_DESC',
  InsuranceFeeBpsDescNullsFirst = 'insuranceFeeBps_DESC_NULLS_FIRST',
  InsuranceFeeBpsDescNullsLast = 'insuranceFeeBps_DESC_NULLS_LAST',
  LpTokenDecimalsAsc = 'lpTokenDecimals_ASC',
  LpTokenDecimalsAscNullsFirst = 'lpTokenDecimals_ASC_NULLS_FIRST',
  LpTokenDecimalsAscNullsLast = 'lpTokenDecimals_ASC_NULLS_LAST',
  LpTokenDecimalsDesc = 'lpTokenDecimals_DESC',
  LpTokenDecimalsDescNullsFirst = 'lpTokenDecimals_DESC_NULLS_FIRST',
  LpTokenDecimalsDescNullsLast = 'lpTokenDecimals_DESC_NULLS_LAST',
  NameAsc = 'name_ASC',
  NameAscNullsFirst = 'name_ASC_NULLS_FIRST',
  NameAscNullsLast = 'name_ASC_NULLS_LAST',
  NameDesc = 'name_DESC',
  NameDescNullsFirst = 'name_DESC_NULLS_FIRST',
  NameDescNullsLast = 'name_DESC_NULLS_LAST',
  PausedAsc = 'paused_ASC',
  PausedAscNullsFirst = 'paused_ASC_NULLS_FIRST',
  PausedAscNullsLast = 'paused_ASC_NULLS_LAST',
  PausedDesc = 'paused_DESC',
  PausedDescNullsFirst = 'paused_DESC_NULLS_FIRST',
  PausedDescNullsLast = 'paused_DESC_NULLS_LAST',
  ProtocolTreasuryAddressAsc = 'protocolTreasuryAddress_ASC',
  ProtocolTreasuryAddressAscNullsFirst = 'protocolTreasuryAddress_ASC_NULLS_FIRST',
  ProtocolTreasuryAddressAscNullsLast = 'protocolTreasuryAddress_ASC_NULLS_LAST',
  ProtocolTreasuryAddressDesc = 'protocolTreasuryAddress_DESC',
  ProtocolTreasuryAddressDescNullsFirst = 'protocolTreasuryAddress_DESC_NULLS_FIRST',
  ProtocolTreasuryAddressDescNullsLast = 'protocolTreasuryAddress_DESC_NULLS_LAST',
  ReserveWithSlippageAsc = 'reserveWithSlippage_ASC',
  ReserveWithSlippageAscNullsFirst = 'reserveWithSlippage_ASC_NULLS_FIRST',
  ReserveWithSlippageAscNullsLast = 'reserveWithSlippage_ASC_NULLS_LAST',
  ReserveWithSlippageDesc = 'reserveWithSlippage_DESC',
  ReserveWithSlippageDescNullsFirst = 'reserveWithSlippage_DESC_NULLS_FIRST',
  ReserveWithSlippageDescNullsLast = 'reserveWithSlippage_DESC_NULLS_LAST',
  ReserveAsc = 'reserve_ASC',
  ReserveAscNullsFirst = 'reserve_ASC_NULLS_FIRST',
  ReserveAscNullsLast = 'reserve_ASC_NULLS_LAST',
  ReserveDesc = 'reserve_DESC',
  ReserveDescNullsFirst = 'reserve_DESC_NULLS_FIRST',
  ReserveDescNullsLast = 'reserve_DESC_NULLS_LAST',
  RouterIdAsc = 'router_id_ASC',
  RouterIdAscNullsFirst = 'router_id_ASC_NULLS_FIRST',
  RouterIdAscNullsLast = 'router_id_ASC_NULLS_LAST',
  RouterIdDesc = 'router_id_DESC',
  RouterIdDescNullsFirst = 'router_id_DESC_NULLS_FIRST',
  RouterIdDescNullsLast = 'router_id_DESC_NULLS_LAST',
  RouterPausedAsc = 'router_paused_ASC',
  RouterPausedAscNullsFirst = 'router_paused_ASC_NULLS_FIRST',
  RouterPausedAscNullsLast = 'router_paused_ASC_NULLS_LAST',
  RouterPausedDesc = 'router_paused_DESC',
  RouterPausedDescNullsFirst = 'router_paused_DESC_NULLS_FIRST',
  RouterPausedDescNullsLast = 'router_paused_DESC_NULLS_LAST',
  SymbolAsc = 'symbol_ASC',
  SymbolAscNullsFirst = 'symbol_ASC_NULLS_FIRST',
  SymbolAscNullsLast = 'symbol_ASC_NULLS_LAST',
  SymbolDesc = 'symbol_DESC',
  SymbolDescNullsFirst = 'symbol_DESC_NULLS_FIRST',
  SymbolDescNullsLast = 'symbol_DESC_NULLS_LAST',
  TokenDecimalsAsc = 'token_decimals_ASC',
  TokenDecimalsAscNullsFirst = 'token_decimals_ASC_NULLS_FIRST',
  TokenDecimalsAscNullsLast = 'token_decimals_ASC_NULLS_LAST',
  TokenDecimalsDesc = 'token_decimals_DESC',
  TokenDecimalsDescNullsFirst = 'token_decimals_DESC_NULLS_FIRST',
  TokenDecimalsDescNullsLast = 'token_decimals_DESC_NULLS_LAST',
  TokenIdAsc = 'token_id_ASC',
  TokenIdAscNullsFirst = 'token_id_ASC_NULLS_FIRST',
  TokenIdAscNullsLast = 'token_id_ASC_NULLS_LAST',
  TokenIdDesc = 'token_id_DESC',
  TokenIdDescNullsFirst = 'token_id_DESC_NULLS_FIRST',
  TokenIdDescNullsLast = 'token_id_DESC_NULLS_LAST',
  TokenNameAsc = 'token_name_ASC',
  TokenNameAscNullsFirst = 'token_name_ASC_NULLS_FIRST',
  TokenNameAscNullsLast = 'token_name_ASC_NULLS_LAST',
  TokenNameDesc = 'token_name_DESC',
  TokenNameDescNullsFirst = 'token_name_DESC_NULLS_FIRST',
  TokenNameDescNullsLast = 'token_name_DESC_NULLS_LAST',
  TokenSymbolAsc = 'token_symbol_ASC',
  TokenSymbolAscNullsFirst = 'token_symbol_ASC_NULLS_FIRST',
  TokenSymbolAscNullsLast = 'token_symbol_ASC_NULLS_LAST',
  TokenSymbolDesc = 'token_symbol_DESC',
  TokenSymbolDescNullsFirst = 'token_symbol_DESC_NULLS_FIRST',
  TokenSymbolDescNullsLast = 'token_symbol_DESC_NULLS_LAST',
  TotalLiabilitiesAsc = 'totalLiabilities_ASC',
  TotalLiabilitiesAscNullsFirst = 'totalLiabilities_ASC_NULLS_FIRST',
  TotalLiabilitiesAscNullsLast = 'totalLiabilities_ASC_NULLS_LAST',
  TotalLiabilitiesDesc = 'totalLiabilities_DESC',
  TotalLiabilitiesDescNullsFirst = 'totalLiabilities_DESC_NULLS_FIRST',
  TotalLiabilitiesDescNullsLast = 'totalLiabilities_DESC_NULLS_LAST',
  TotalSupplyAsc = 'totalSupply_ASC',
  TotalSupplyAscNullsFirst = 'totalSupply_ASC_NULLS_FIRST',
  TotalSupplyAscNullsLast = 'totalSupply_ASC_NULLS_LAST',
  TotalSupplyDesc = 'totalSupply_DESC',
  TotalSupplyDescNullsFirst = 'totalSupply_DESC_NULLS_FIRST',
  TotalSupplyDescNullsLast = 'totalSupply_DESC_NULLS_LAST'
}

export type SwapPoolWhereInput = {
  AND?: InputMaybe<Array<SwapPoolWhereInput>>;
  OR?: InputMaybe<Array<SwapPoolWhereInput>>;
  apr_eq?: InputMaybe<Scalars['BigInt']['input']>;
  apr_gt?: InputMaybe<Scalars['BigInt']['input']>;
  apr_gte?: InputMaybe<Scalars['BigInt']['input']>;
  apr_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  apr_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  apr_lt?: InputMaybe<Scalars['BigInt']['input']>;
  apr_lte?: InputMaybe<Scalars['BigInt']['input']>;
  apr_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  apr_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  backstop?: InputMaybe<BackstopPoolWhereInput>;
  backstop_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  feesHistory_every?: InputMaybe<NablaSwapFeeWhereInput>;
  feesHistory_none?: InputMaybe<NablaSwapFeeWhereInput>;
  feesHistory_some?: InputMaybe<NablaSwapFeeWhereInput>;
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
  insuranceFeeBps_eq?: InputMaybe<Scalars['BigInt']['input']>;
  insuranceFeeBps_gt?: InputMaybe<Scalars['BigInt']['input']>;
  insuranceFeeBps_gte?: InputMaybe<Scalars['BigInt']['input']>;
  insuranceFeeBps_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  insuranceFeeBps_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  insuranceFeeBps_lt?: InputMaybe<Scalars['BigInt']['input']>;
  insuranceFeeBps_lte?: InputMaybe<Scalars['BigInt']['input']>;
  insuranceFeeBps_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  insuranceFeeBps_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  lpTokenDecimals_eq?: InputMaybe<Scalars['Int']['input']>;
  lpTokenDecimals_gt?: InputMaybe<Scalars['Int']['input']>;
  lpTokenDecimals_gte?: InputMaybe<Scalars['Int']['input']>;
  lpTokenDecimals_in?: InputMaybe<Array<Scalars['Int']['input']>>;
  lpTokenDecimals_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  lpTokenDecimals_lt?: InputMaybe<Scalars['Int']['input']>;
  lpTokenDecimals_lte?: InputMaybe<Scalars['Int']['input']>;
  lpTokenDecimals_not_eq?: InputMaybe<Scalars['Int']['input']>;
  lpTokenDecimals_not_in?: InputMaybe<Array<Scalars['Int']['input']>>;
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
  paused_eq?: InputMaybe<Scalars['Boolean']['input']>;
  paused_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  paused_not_eq?: InputMaybe<Scalars['Boolean']['input']>;
  protocolTreasuryAddress_contains?: InputMaybe<Scalars['String']['input']>;
  protocolTreasuryAddress_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  protocolTreasuryAddress_endsWith?: InputMaybe<Scalars['String']['input']>;
  protocolTreasuryAddress_eq?: InputMaybe<Scalars['String']['input']>;
  protocolTreasuryAddress_gt?: InputMaybe<Scalars['String']['input']>;
  protocolTreasuryAddress_gte?: InputMaybe<Scalars['String']['input']>;
  protocolTreasuryAddress_in?: InputMaybe<Array<Scalars['String']['input']>>;
  protocolTreasuryAddress_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  protocolTreasuryAddress_lt?: InputMaybe<Scalars['String']['input']>;
  protocolTreasuryAddress_lte?: InputMaybe<Scalars['String']['input']>;
  protocolTreasuryAddress_not_contains?: InputMaybe<Scalars['String']['input']>;
  protocolTreasuryAddress_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  protocolTreasuryAddress_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  protocolTreasuryAddress_not_eq?: InputMaybe<Scalars['String']['input']>;
  protocolTreasuryAddress_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  protocolTreasuryAddress_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  protocolTreasuryAddress_startsWith?: InputMaybe<Scalars['String']['input']>;
  reserveWithSlippage_eq?: InputMaybe<Scalars['BigInt']['input']>;
  reserveWithSlippage_gt?: InputMaybe<Scalars['BigInt']['input']>;
  reserveWithSlippage_gte?: InputMaybe<Scalars['BigInt']['input']>;
  reserveWithSlippage_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  reserveWithSlippage_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  reserveWithSlippage_lt?: InputMaybe<Scalars['BigInt']['input']>;
  reserveWithSlippage_lte?: InputMaybe<Scalars['BigInt']['input']>;
  reserveWithSlippage_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  reserveWithSlippage_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  reserve_eq?: InputMaybe<Scalars['BigInt']['input']>;
  reserve_gt?: InputMaybe<Scalars['BigInt']['input']>;
  reserve_gte?: InputMaybe<Scalars['BigInt']['input']>;
  reserve_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  reserve_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  reserve_lt?: InputMaybe<Scalars['BigInt']['input']>;
  reserve_lte?: InputMaybe<Scalars['BigInt']['input']>;
  reserve_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  reserve_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  router?: InputMaybe<RouterWhereInput>;
  router_isNull?: InputMaybe<Scalars['Boolean']['input']>;
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
  token?: InputMaybe<NablaTokenWhereInput>;
  token_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalLiabilities_eq?: InputMaybe<Scalars['BigInt']['input']>;
  totalLiabilities_gt?: InputMaybe<Scalars['BigInt']['input']>;
  totalLiabilities_gte?: InputMaybe<Scalars['BigInt']['input']>;
  totalLiabilities_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
  totalLiabilities_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  totalLiabilities_lt?: InputMaybe<Scalars['BigInt']['input']>;
  totalLiabilities_lte?: InputMaybe<Scalars['BigInt']['input']>;
  totalLiabilities_not_eq?: InputMaybe<Scalars['BigInt']['input']>;
  totalLiabilities_not_in?: InputMaybe<Array<Scalars['BigInt']['input']>>;
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
  DailyTxnsAscNullsFirst = 'dailyTxns_ASC_NULLS_FIRST',
  DailyTxnsAscNullsLast = 'dailyTxns_ASC_NULLS_LAST',
  DailyTxnsDesc = 'dailyTxns_DESC',
  DailyTxnsDescNullsFirst = 'dailyTxns_DESC_NULLS_FIRST',
  DailyTxnsDescNullsLast = 'dailyTxns_DESC_NULLS_LAST',
  DailyVolumeEthAsc = 'dailyVolumeETH_ASC',
  DailyVolumeEthAscNullsFirst = 'dailyVolumeETH_ASC_NULLS_FIRST',
  DailyVolumeEthAscNullsLast = 'dailyVolumeETH_ASC_NULLS_LAST',
  DailyVolumeEthDesc = 'dailyVolumeETH_DESC',
  DailyVolumeEthDescNullsFirst = 'dailyVolumeETH_DESC_NULLS_FIRST',
  DailyVolumeEthDescNullsLast = 'dailyVolumeETH_DESC_NULLS_LAST',
  DailyVolumeTokenAsc = 'dailyVolumeToken_ASC',
  DailyVolumeTokenAscNullsFirst = 'dailyVolumeToken_ASC_NULLS_FIRST',
  DailyVolumeTokenAscNullsLast = 'dailyVolumeToken_ASC_NULLS_LAST',
  DailyVolumeTokenDesc = 'dailyVolumeToken_DESC',
  DailyVolumeTokenDescNullsFirst = 'dailyVolumeToken_DESC_NULLS_FIRST',
  DailyVolumeTokenDescNullsLast = 'dailyVolumeToken_DESC_NULLS_LAST',
  DailyVolumeUsdAsc = 'dailyVolumeUSD_ASC',
  DailyVolumeUsdAscNullsFirst = 'dailyVolumeUSD_ASC_NULLS_FIRST',
  DailyVolumeUsdAscNullsLast = 'dailyVolumeUSD_ASC_NULLS_LAST',
  DailyVolumeUsdDesc = 'dailyVolumeUSD_DESC',
  DailyVolumeUsdDescNullsFirst = 'dailyVolumeUSD_DESC_NULLS_FIRST',
  DailyVolumeUsdDescNullsLast = 'dailyVolumeUSD_DESC_NULLS_LAST',
  DateAsc = 'date_ASC',
  DateAscNullsFirst = 'date_ASC_NULLS_FIRST',
  DateAscNullsLast = 'date_ASC_NULLS_LAST',
  DateDesc = 'date_DESC',
  DateDescNullsFirst = 'date_DESC_NULLS_FIRST',
  DateDescNullsLast = 'date_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  PriceUsdAsc = 'priceUSD_ASC',
  PriceUsdAscNullsFirst = 'priceUSD_ASC_NULLS_FIRST',
  PriceUsdAscNullsLast = 'priceUSD_ASC_NULLS_LAST',
  PriceUsdDesc = 'priceUSD_DESC',
  PriceUsdDescNullsFirst = 'priceUSD_DESC_NULLS_FIRST',
  PriceUsdDescNullsLast = 'priceUSD_DESC_NULLS_LAST',
  TokenDecimalsAsc = 'token_decimals_ASC',
  TokenDecimalsAscNullsFirst = 'token_decimals_ASC_NULLS_FIRST',
  TokenDecimalsAscNullsLast = 'token_decimals_ASC_NULLS_LAST',
  TokenDecimalsDesc = 'token_decimals_DESC',
  TokenDecimalsDescNullsFirst = 'token_decimals_DESC_NULLS_FIRST',
  TokenDecimalsDescNullsLast = 'token_decimals_DESC_NULLS_LAST',
  TokenDerivedEthAsc = 'token_derivedETH_ASC',
  TokenDerivedEthAscNullsFirst = 'token_derivedETH_ASC_NULLS_FIRST',
  TokenDerivedEthAscNullsLast = 'token_derivedETH_ASC_NULLS_LAST',
  TokenDerivedEthDesc = 'token_derivedETH_DESC',
  TokenDerivedEthDescNullsFirst = 'token_derivedETH_DESC_NULLS_FIRST',
  TokenDerivedEthDescNullsLast = 'token_derivedETH_DESC_NULLS_LAST',
  TokenIdAsc = 'token_id_ASC',
  TokenIdAscNullsFirst = 'token_id_ASC_NULLS_FIRST',
  TokenIdAscNullsLast = 'token_id_ASC_NULLS_LAST',
  TokenIdDesc = 'token_id_DESC',
  TokenIdDescNullsFirst = 'token_id_DESC_NULLS_FIRST',
  TokenIdDescNullsLast = 'token_id_DESC_NULLS_LAST',
  TokenNameAsc = 'token_name_ASC',
  TokenNameAscNullsFirst = 'token_name_ASC_NULLS_FIRST',
  TokenNameAscNullsLast = 'token_name_ASC_NULLS_LAST',
  TokenNameDesc = 'token_name_DESC',
  TokenNameDescNullsFirst = 'token_name_DESC_NULLS_FIRST',
  TokenNameDescNullsLast = 'token_name_DESC_NULLS_LAST',
  TokenSymbolAsc = 'token_symbol_ASC',
  TokenSymbolAscNullsFirst = 'token_symbol_ASC_NULLS_FIRST',
  TokenSymbolAscNullsLast = 'token_symbol_ASC_NULLS_LAST',
  TokenSymbolDesc = 'token_symbol_DESC',
  TokenSymbolDescNullsFirst = 'token_symbol_DESC_NULLS_FIRST',
  TokenSymbolDescNullsLast = 'token_symbol_DESC_NULLS_LAST',
  TokenTotalLiquidityAsc = 'token_totalLiquidity_ASC',
  TokenTotalLiquidityAscNullsFirst = 'token_totalLiquidity_ASC_NULLS_FIRST',
  TokenTotalLiquidityAscNullsLast = 'token_totalLiquidity_ASC_NULLS_LAST',
  TokenTotalLiquidityDesc = 'token_totalLiquidity_DESC',
  TokenTotalLiquidityDescNullsFirst = 'token_totalLiquidity_DESC_NULLS_FIRST',
  TokenTotalLiquidityDescNullsLast = 'token_totalLiquidity_DESC_NULLS_LAST',
  TokenTotalSupplyAsc = 'token_totalSupply_ASC',
  TokenTotalSupplyAscNullsFirst = 'token_totalSupply_ASC_NULLS_FIRST',
  TokenTotalSupplyAscNullsLast = 'token_totalSupply_ASC_NULLS_LAST',
  TokenTotalSupplyDesc = 'token_totalSupply_DESC',
  TokenTotalSupplyDescNullsFirst = 'token_totalSupply_DESC_NULLS_FIRST',
  TokenTotalSupplyDescNullsLast = 'token_totalSupply_DESC_NULLS_LAST',
  TokenTradeVolumeUsdAsc = 'token_tradeVolumeUSD_ASC',
  TokenTradeVolumeUsdAscNullsFirst = 'token_tradeVolumeUSD_ASC_NULLS_FIRST',
  TokenTradeVolumeUsdAscNullsLast = 'token_tradeVolumeUSD_ASC_NULLS_LAST',
  TokenTradeVolumeUsdDesc = 'token_tradeVolumeUSD_DESC',
  TokenTradeVolumeUsdDescNullsFirst = 'token_tradeVolumeUSD_DESC_NULLS_FIRST',
  TokenTradeVolumeUsdDescNullsLast = 'token_tradeVolumeUSD_DESC_NULLS_LAST',
  TokenTradeVolumeAsc = 'token_tradeVolume_ASC',
  TokenTradeVolumeAscNullsFirst = 'token_tradeVolume_ASC_NULLS_FIRST',
  TokenTradeVolumeAscNullsLast = 'token_tradeVolume_ASC_NULLS_LAST',
  TokenTradeVolumeDesc = 'token_tradeVolume_DESC',
  TokenTradeVolumeDescNullsFirst = 'token_tradeVolume_DESC_NULLS_FIRST',
  TokenTradeVolumeDescNullsLast = 'token_tradeVolume_DESC_NULLS_LAST',
  TokenTxCountAsc = 'token_txCount_ASC',
  TokenTxCountAscNullsFirst = 'token_txCount_ASC_NULLS_FIRST',
  TokenTxCountAscNullsLast = 'token_txCount_ASC_NULLS_LAST',
  TokenTxCountDesc = 'token_txCount_DESC',
  TokenTxCountDescNullsFirst = 'token_txCount_DESC_NULLS_FIRST',
  TokenTxCountDescNullsLast = 'token_txCount_DESC_NULLS_LAST',
  TokenUntrackedVolumeUsdAsc = 'token_untrackedVolumeUSD_ASC',
  TokenUntrackedVolumeUsdAscNullsFirst = 'token_untrackedVolumeUSD_ASC_NULLS_FIRST',
  TokenUntrackedVolumeUsdAscNullsLast = 'token_untrackedVolumeUSD_ASC_NULLS_LAST',
  TokenUntrackedVolumeUsdDesc = 'token_untrackedVolumeUSD_DESC',
  TokenUntrackedVolumeUsdDescNullsFirst = 'token_untrackedVolumeUSD_DESC_NULLS_FIRST',
  TokenUntrackedVolumeUsdDescNullsLast = 'token_untrackedVolumeUSD_DESC_NULLS_LAST',
  TotalLiquidityEthAsc = 'totalLiquidityETH_ASC',
  TotalLiquidityEthAscNullsFirst = 'totalLiquidityETH_ASC_NULLS_FIRST',
  TotalLiquidityEthAscNullsLast = 'totalLiquidityETH_ASC_NULLS_LAST',
  TotalLiquidityEthDesc = 'totalLiquidityETH_DESC',
  TotalLiquidityEthDescNullsFirst = 'totalLiquidityETH_DESC_NULLS_FIRST',
  TotalLiquidityEthDescNullsLast = 'totalLiquidityETH_DESC_NULLS_LAST',
  TotalLiquidityTokenAsc = 'totalLiquidityToken_ASC',
  TotalLiquidityTokenAscNullsFirst = 'totalLiquidityToken_ASC_NULLS_FIRST',
  TotalLiquidityTokenAscNullsLast = 'totalLiquidityToken_ASC_NULLS_LAST',
  TotalLiquidityTokenDesc = 'totalLiquidityToken_DESC',
  TotalLiquidityTokenDescNullsFirst = 'totalLiquidityToken_DESC_NULLS_FIRST',
  TotalLiquidityTokenDescNullsLast = 'totalLiquidityToken_DESC_NULLS_LAST',
  TotalLiquidityUsdAsc = 'totalLiquidityUSD_ASC',
  TotalLiquidityUsdAscNullsFirst = 'totalLiquidityUSD_ASC_NULLS_FIRST',
  TotalLiquidityUsdAscNullsLast = 'totalLiquidityUSD_ASC_NULLS_LAST',
  TotalLiquidityUsdDesc = 'totalLiquidityUSD_DESC',
  TotalLiquidityUsdDescNullsFirst = 'totalLiquidityUSD_DESC_NULLS_FIRST',
  TotalLiquidityUsdDescNullsLast = 'totalLiquidityUSD_DESC_NULLS_LAST'
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

export type TokenDeposit = {
  __typename?: 'TokenDeposit';
  amount: Scalars['BigInt']['output'];
  blockNumber: Scalars['Int']['output'];
  currencyId: Scalars['String']['output'];
  extrinsicHash?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  timestamp: Scalars['DateTime']['output'];
  who: Scalars['String']['output'];
};

export type TokenDepositEdge = {
  __typename?: 'TokenDepositEdge';
  cursor: Scalars['String']['output'];
  node: TokenDeposit;
};

export enum TokenDepositOrderByInput {
  AmountAsc = 'amount_ASC',
  AmountAscNullsFirst = 'amount_ASC_NULLS_FIRST',
  AmountAscNullsLast = 'amount_ASC_NULLS_LAST',
  AmountDesc = 'amount_DESC',
  AmountDescNullsFirst = 'amount_DESC_NULLS_FIRST',
  AmountDescNullsLast = 'amount_DESC_NULLS_LAST',
  BlockNumberAsc = 'blockNumber_ASC',
  BlockNumberAscNullsFirst = 'blockNumber_ASC_NULLS_FIRST',
  BlockNumberAscNullsLast = 'blockNumber_ASC_NULLS_LAST',
  BlockNumberDesc = 'blockNumber_DESC',
  BlockNumberDescNullsFirst = 'blockNumber_DESC_NULLS_FIRST',
  BlockNumberDescNullsLast = 'blockNumber_DESC_NULLS_LAST',
  CurrencyIdAsc = 'currencyId_ASC',
  CurrencyIdAscNullsFirst = 'currencyId_ASC_NULLS_FIRST',
  CurrencyIdAscNullsLast = 'currencyId_ASC_NULLS_LAST',
  CurrencyIdDesc = 'currencyId_DESC',
  CurrencyIdDescNullsFirst = 'currencyId_DESC_NULLS_FIRST',
  CurrencyIdDescNullsLast = 'currencyId_DESC_NULLS_LAST',
  ExtrinsicHashAsc = 'extrinsicHash_ASC',
  ExtrinsicHashAscNullsFirst = 'extrinsicHash_ASC_NULLS_FIRST',
  ExtrinsicHashAscNullsLast = 'extrinsicHash_ASC_NULLS_LAST',
  ExtrinsicHashDesc = 'extrinsicHash_DESC',
  ExtrinsicHashDescNullsFirst = 'extrinsicHash_DESC_NULLS_FIRST',
  ExtrinsicHashDescNullsLast = 'extrinsicHash_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  TimestampAsc = 'timestamp_ASC',
  TimestampAscNullsFirst = 'timestamp_ASC_NULLS_FIRST',
  TimestampAscNullsLast = 'timestamp_ASC_NULLS_LAST',
  TimestampDesc = 'timestamp_DESC',
  TimestampDescNullsFirst = 'timestamp_DESC_NULLS_FIRST',
  TimestampDescNullsLast = 'timestamp_DESC_NULLS_LAST',
  WhoAsc = 'who_ASC',
  WhoAscNullsFirst = 'who_ASC_NULLS_FIRST',
  WhoAscNullsLast = 'who_ASC_NULLS_LAST',
  WhoDesc = 'who_DESC',
  WhoDescNullsFirst = 'who_DESC_NULLS_FIRST',
  WhoDescNullsLast = 'who_DESC_NULLS_LAST'
}

export type TokenDepositWhereInput = {
  AND?: InputMaybe<Array<TokenDepositWhereInput>>;
  OR?: InputMaybe<Array<TokenDepositWhereInput>>;
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
  currencyId_contains?: InputMaybe<Scalars['String']['input']>;
  currencyId_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  currencyId_endsWith?: InputMaybe<Scalars['String']['input']>;
  currencyId_eq?: InputMaybe<Scalars['String']['input']>;
  currencyId_gt?: InputMaybe<Scalars['String']['input']>;
  currencyId_gte?: InputMaybe<Scalars['String']['input']>;
  currencyId_in?: InputMaybe<Array<Scalars['String']['input']>>;
  currencyId_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  currencyId_lt?: InputMaybe<Scalars['String']['input']>;
  currencyId_lte?: InputMaybe<Scalars['String']['input']>;
  currencyId_not_contains?: InputMaybe<Scalars['String']['input']>;
  currencyId_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  currencyId_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  currencyId_not_eq?: InputMaybe<Scalars['String']['input']>;
  currencyId_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  currencyId_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  currencyId_startsWith?: InputMaybe<Scalars['String']['input']>;
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
  who_contains?: InputMaybe<Scalars['String']['input']>;
  who_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  who_endsWith?: InputMaybe<Scalars['String']['input']>;
  who_eq?: InputMaybe<Scalars['String']['input']>;
  who_gt?: InputMaybe<Scalars['String']['input']>;
  who_gte?: InputMaybe<Scalars['String']['input']>;
  who_in?: InputMaybe<Array<Scalars['String']['input']>>;
  who_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  who_lt?: InputMaybe<Scalars['String']['input']>;
  who_lte?: InputMaybe<Scalars['String']['input']>;
  who_not_contains?: InputMaybe<Scalars['String']['input']>;
  who_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  who_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  who_not_eq?: InputMaybe<Scalars['String']['input']>;
  who_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  who_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  who_startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type TokenDepositsConnection = {
  __typename?: 'TokenDepositsConnection';
  edges: Array<TokenDepositEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type TokenEdge = {
  __typename?: 'TokenEdge';
  cursor: Scalars['String']['output'];
  node: Token;
};

export enum TokenOrderByInput {
  DecimalsAsc = 'decimals_ASC',
  DecimalsAscNullsFirst = 'decimals_ASC_NULLS_FIRST',
  DecimalsAscNullsLast = 'decimals_ASC_NULLS_LAST',
  DecimalsDesc = 'decimals_DESC',
  DecimalsDescNullsFirst = 'decimals_DESC_NULLS_FIRST',
  DecimalsDescNullsLast = 'decimals_DESC_NULLS_LAST',
  DerivedEthAsc = 'derivedETH_ASC',
  DerivedEthAscNullsFirst = 'derivedETH_ASC_NULLS_FIRST',
  DerivedEthAscNullsLast = 'derivedETH_ASC_NULLS_LAST',
  DerivedEthDesc = 'derivedETH_DESC',
  DerivedEthDescNullsFirst = 'derivedETH_DESC_NULLS_FIRST',
  DerivedEthDescNullsLast = 'derivedETH_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  NameAsc = 'name_ASC',
  NameAscNullsFirst = 'name_ASC_NULLS_FIRST',
  NameAscNullsLast = 'name_ASC_NULLS_LAST',
  NameDesc = 'name_DESC',
  NameDescNullsFirst = 'name_DESC_NULLS_FIRST',
  NameDescNullsLast = 'name_DESC_NULLS_LAST',
  SymbolAsc = 'symbol_ASC',
  SymbolAscNullsFirst = 'symbol_ASC_NULLS_FIRST',
  SymbolAscNullsLast = 'symbol_ASC_NULLS_LAST',
  SymbolDesc = 'symbol_DESC',
  SymbolDescNullsFirst = 'symbol_DESC_NULLS_FIRST',
  SymbolDescNullsLast = 'symbol_DESC_NULLS_LAST',
  TotalLiquidityAsc = 'totalLiquidity_ASC',
  TotalLiquidityAscNullsFirst = 'totalLiquidity_ASC_NULLS_FIRST',
  TotalLiquidityAscNullsLast = 'totalLiquidity_ASC_NULLS_LAST',
  TotalLiquidityDesc = 'totalLiquidity_DESC',
  TotalLiquidityDescNullsFirst = 'totalLiquidity_DESC_NULLS_FIRST',
  TotalLiquidityDescNullsLast = 'totalLiquidity_DESC_NULLS_LAST',
  TotalSupplyAsc = 'totalSupply_ASC',
  TotalSupplyAscNullsFirst = 'totalSupply_ASC_NULLS_FIRST',
  TotalSupplyAscNullsLast = 'totalSupply_ASC_NULLS_LAST',
  TotalSupplyDesc = 'totalSupply_DESC',
  TotalSupplyDescNullsFirst = 'totalSupply_DESC_NULLS_FIRST',
  TotalSupplyDescNullsLast = 'totalSupply_DESC_NULLS_LAST',
  TradeVolumeUsdAsc = 'tradeVolumeUSD_ASC',
  TradeVolumeUsdAscNullsFirst = 'tradeVolumeUSD_ASC_NULLS_FIRST',
  TradeVolumeUsdAscNullsLast = 'tradeVolumeUSD_ASC_NULLS_LAST',
  TradeVolumeUsdDesc = 'tradeVolumeUSD_DESC',
  TradeVolumeUsdDescNullsFirst = 'tradeVolumeUSD_DESC_NULLS_FIRST',
  TradeVolumeUsdDescNullsLast = 'tradeVolumeUSD_DESC_NULLS_LAST',
  TradeVolumeAsc = 'tradeVolume_ASC',
  TradeVolumeAscNullsFirst = 'tradeVolume_ASC_NULLS_FIRST',
  TradeVolumeAscNullsLast = 'tradeVolume_ASC_NULLS_LAST',
  TradeVolumeDesc = 'tradeVolume_DESC',
  TradeVolumeDescNullsFirst = 'tradeVolume_DESC_NULLS_FIRST',
  TradeVolumeDescNullsLast = 'tradeVolume_DESC_NULLS_LAST',
  TxCountAsc = 'txCount_ASC',
  TxCountAscNullsFirst = 'txCount_ASC_NULLS_FIRST',
  TxCountAscNullsLast = 'txCount_ASC_NULLS_LAST',
  TxCountDesc = 'txCount_DESC',
  TxCountDescNullsFirst = 'txCount_DESC_NULLS_FIRST',
  TxCountDescNullsLast = 'txCount_DESC_NULLS_LAST',
  UntrackedVolumeUsdAsc = 'untrackedVolumeUSD_ASC',
  UntrackedVolumeUsdAscNullsFirst = 'untrackedVolumeUSD_ASC_NULLS_FIRST',
  UntrackedVolumeUsdAscNullsLast = 'untrackedVolumeUSD_ASC_NULLS_LAST',
  UntrackedVolumeUsdDesc = 'untrackedVolumeUSD_DESC',
  UntrackedVolumeUsdDescNullsFirst = 'untrackedVolumeUSD_DESC_NULLS_FIRST',
  UntrackedVolumeUsdDescNullsLast = 'untrackedVolumeUSD_DESC_NULLS_LAST'
}

export type TokenTransfer = {
  __typename?: 'TokenTransfer';
  amount: Scalars['BigInt']['output'];
  blockNumber: Scalars['Int']['output'];
  currencyId: Scalars['String']['output'];
  extrinsicHash?: Maybe<Scalars['String']['output']>;
  from: Scalars['String']['output'];
  id: Scalars['String']['output'];
  remark?: Maybe<Scalars['String']['output']>;
  timestamp: Scalars['DateTime']['output'];
  to: Scalars['String']['output'];
};

export type TokenTransferEdge = {
  __typename?: 'TokenTransferEdge';
  cursor: Scalars['String']['output'];
  node: TokenTransfer;
};

export enum TokenTransferOrderByInput {
  AmountAsc = 'amount_ASC',
  AmountAscNullsFirst = 'amount_ASC_NULLS_FIRST',
  AmountAscNullsLast = 'amount_ASC_NULLS_LAST',
  AmountDesc = 'amount_DESC',
  AmountDescNullsFirst = 'amount_DESC_NULLS_FIRST',
  AmountDescNullsLast = 'amount_DESC_NULLS_LAST',
  BlockNumberAsc = 'blockNumber_ASC',
  BlockNumberAscNullsFirst = 'blockNumber_ASC_NULLS_FIRST',
  BlockNumberAscNullsLast = 'blockNumber_ASC_NULLS_LAST',
  BlockNumberDesc = 'blockNumber_DESC',
  BlockNumberDescNullsFirst = 'blockNumber_DESC_NULLS_FIRST',
  BlockNumberDescNullsLast = 'blockNumber_DESC_NULLS_LAST',
  CurrencyIdAsc = 'currencyId_ASC',
  CurrencyIdAscNullsFirst = 'currencyId_ASC_NULLS_FIRST',
  CurrencyIdAscNullsLast = 'currencyId_ASC_NULLS_LAST',
  CurrencyIdDesc = 'currencyId_DESC',
  CurrencyIdDescNullsFirst = 'currencyId_DESC_NULLS_FIRST',
  CurrencyIdDescNullsLast = 'currencyId_DESC_NULLS_LAST',
  ExtrinsicHashAsc = 'extrinsicHash_ASC',
  ExtrinsicHashAscNullsFirst = 'extrinsicHash_ASC_NULLS_FIRST',
  ExtrinsicHashAscNullsLast = 'extrinsicHash_ASC_NULLS_LAST',
  ExtrinsicHashDesc = 'extrinsicHash_DESC',
  ExtrinsicHashDescNullsFirst = 'extrinsicHash_DESC_NULLS_FIRST',
  ExtrinsicHashDescNullsLast = 'extrinsicHash_DESC_NULLS_LAST',
  FromAsc = 'from_ASC',
  FromAscNullsFirst = 'from_ASC_NULLS_FIRST',
  FromAscNullsLast = 'from_ASC_NULLS_LAST',
  FromDesc = 'from_DESC',
  FromDescNullsFirst = 'from_DESC_NULLS_FIRST',
  FromDescNullsLast = 'from_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  RemarkAsc = 'remark_ASC',
  RemarkAscNullsFirst = 'remark_ASC_NULLS_FIRST',
  RemarkAscNullsLast = 'remark_ASC_NULLS_LAST',
  RemarkDesc = 'remark_DESC',
  RemarkDescNullsFirst = 'remark_DESC_NULLS_FIRST',
  RemarkDescNullsLast = 'remark_DESC_NULLS_LAST',
  TimestampAsc = 'timestamp_ASC',
  TimestampAscNullsFirst = 'timestamp_ASC_NULLS_FIRST',
  TimestampAscNullsLast = 'timestamp_ASC_NULLS_LAST',
  TimestampDesc = 'timestamp_DESC',
  TimestampDescNullsFirst = 'timestamp_DESC_NULLS_FIRST',
  TimestampDescNullsLast = 'timestamp_DESC_NULLS_LAST',
  ToAsc = 'to_ASC',
  ToAscNullsFirst = 'to_ASC_NULLS_FIRST',
  ToAscNullsLast = 'to_ASC_NULLS_LAST',
  ToDesc = 'to_DESC',
  ToDescNullsFirst = 'to_DESC_NULLS_FIRST',
  ToDescNullsLast = 'to_DESC_NULLS_LAST'
}

export type TokenTransferWhereInput = {
  AND?: InputMaybe<Array<TokenTransferWhereInput>>;
  OR?: InputMaybe<Array<TokenTransferWhereInput>>;
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
  currencyId_contains?: InputMaybe<Scalars['String']['input']>;
  currencyId_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  currencyId_endsWith?: InputMaybe<Scalars['String']['input']>;
  currencyId_eq?: InputMaybe<Scalars['String']['input']>;
  currencyId_gt?: InputMaybe<Scalars['String']['input']>;
  currencyId_gte?: InputMaybe<Scalars['String']['input']>;
  currencyId_in?: InputMaybe<Array<Scalars['String']['input']>>;
  currencyId_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  currencyId_lt?: InputMaybe<Scalars['String']['input']>;
  currencyId_lte?: InputMaybe<Scalars['String']['input']>;
  currencyId_not_contains?: InputMaybe<Scalars['String']['input']>;
  currencyId_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  currencyId_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  currencyId_not_eq?: InputMaybe<Scalars['String']['input']>;
  currencyId_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  currencyId_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  currencyId_startsWith?: InputMaybe<Scalars['String']['input']>;
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
  remark_contains?: InputMaybe<Scalars['String']['input']>;
  remark_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  remark_endsWith?: InputMaybe<Scalars['String']['input']>;
  remark_eq?: InputMaybe<Scalars['String']['input']>;
  remark_gt?: InputMaybe<Scalars['String']['input']>;
  remark_gte?: InputMaybe<Scalars['String']['input']>;
  remark_in?: InputMaybe<Array<Scalars['String']['input']>>;
  remark_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  remark_lt?: InputMaybe<Scalars['String']['input']>;
  remark_lte?: InputMaybe<Scalars['String']['input']>;
  remark_not_contains?: InputMaybe<Scalars['String']['input']>;
  remark_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  remark_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  remark_not_eq?: InputMaybe<Scalars['String']['input']>;
  remark_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  remark_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  remark_startsWith?: InputMaybe<Scalars['String']['input']>;
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

export type TokenTransfersConnection = {
  __typename?: 'TokenTransfersConnection';
  edges: Array<TokenTransferEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

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

export type TokenWithdrawn = {
  __typename?: 'TokenWithdrawn';
  amount: Scalars['BigInt']['output'];
  blockNumber: Scalars['Int']['output'];
  currencyId: Scalars['String']['output'];
  extrinsicHash?: Maybe<Scalars['String']['output']>;
  id: Scalars['String']['output'];
  timestamp: Scalars['DateTime']['output'];
  who: Scalars['String']['output'];
};

export type TokenWithdrawnEdge = {
  __typename?: 'TokenWithdrawnEdge';
  cursor: Scalars['String']['output'];
  node: TokenWithdrawn;
};

export enum TokenWithdrawnOrderByInput {
  AmountAsc = 'amount_ASC',
  AmountAscNullsFirst = 'amount_ASC_NULLS_FIRST',
  AmountAscNullsLast = 'amount_ASC_NULLS_LAST',
  AmountDesc = 'amount_DESC',
  AmountDescNullsFirst = 'amount_DESC_NULLS_FIRST',
  AmountDescNullsLast = 'amount_DESC_NULLS_LAST',
  BlockNumberAsc = 'blockNumber_ASC',
  BlockNumberAscNullsFirst = 'blockNumber_ASC_NULLS_FIRST',
  BlockNumberAscNullsLast = 'blockNumber_ASC_NULLS_LAST',
  BlockNumberDesc = 'blockNumber_DESC',
  BlockNumberDescNullsFirst = 'blockNumber_DESC_NULLS_FIRST',
  BlockNumberDescNullsLast = 'blockNumber_DESC_NULLS_LAST',
  CurrencyIdAsc = 'currencyId_ASC',
  CurrencyIdAscNullsFirst = 'currencyId_ASC_NULLS_FIRST',
  CurrencyIdAscNullsLast = 'currencyId_ASC_NULLS_LAST',
  CurrencyIdDesc = 'currencyId_DESC',
  CurrencyIdDescNullsFirst = 'currencyId_DESC_NULLS_FIRST',
  CurrencyIdDescNullsLast = 'currencyId_DESC_NULLS_LAST',
  ExtrinsicHashAsc = 'extrinsicHash_ASC',
  ExtrinsicHashAscNullsFirst = 'extrinsicHash_ASC_NULLS_FIRST',
  ExtrinsicHashAscNullsLast = 'extrinsicHash_ASC_NULLS_LAST',
  ExtrinsicHashDesc = 'extrinsicHash_DESC',
  ExtrinsicHashDescNullsFirst = 'extrinsicHash_DESC_NULLS_FIRST',
  ExtrinsicHashDescNullsLast = 'extrinsicHash_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  TimestampAsc = 'timestamp_ASC',
  TimestampAscNullsFirst = 'timestamp_ASC_NULLS_FIRST',
  TimestampAscNullsLast = 'timestamp_ASC_NULLS_LAST',
  TimestampDesc = 'timestamp_DESC',
  TimestampDescNullsFirst = 'timestamp_DESC_NULLS_FIRST',
  TimestampDescNullsLast = 'timestamp_DESC_NULLS_LAST',
  WhoAsc = 'who_ASC',
  WhoAscNullsFirst = 'who_ASC_NULLS_FIRST',
  WhoAscNullsLast = 'who_ASC_NULLS_LAST',
  WhoDesc = 'who_DESC',
  WhoDescNullsFirst = 'who_DESC_NULLS_FIRST',
  WhoDescNullsLast = 'who_DESC_NULLS_LAST'
}

export type TokenWithdrawnWhereInput = {
  AND?: InputMaybe<Array<TokenWithdrawnWhereInput>>;
  OR?: InputMaybe<Array<TokenWithdrawnWhereInput>>;
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
  currencyId_contains?: InputMaybe<Scalars['String']['input']>;
  currencyId_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  currencyId_endsWith?: InputMaybe<Scalars['String']['input']>;
  currencyId_eq?: InputMaybe<Scalars['String']['input']>;
  currencyId_gt?: InputMaybe<Scalars['String']['input']>;
  currencyId_gte?: InputMaybe<Scalars['String']['input']>;
  currencyId_in?: InputMaybe<Array<Scalars['String']['input']>>;
  currencyId_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  currencyId_lt?: InputMaybe<Scalars['String']['input']>;
  currencyId_lte?: InputMaybe<Scalars['String']['input']>;
  currencyId_not_contains?: InputMaybe<Scalars['String']['input']>;
  currencyId_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  currencyId_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  currencyId_not_eq?: InputMaybe<Scalars['String']['input']>;
  currencyId_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  currencyId_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  currencyId_startsWith?: InputMaybe<Scalars['String']['input']>;
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
  who_contains?: InputMaybe<Scalars['String']['input']>;
  who_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  who_endsWith?: InputMaybe<Scalars['String']['input']>;
  who_eq?: InputMaybe<Scalars['String']['input']>;
  who_gt?: InputMaybe<Scalars['String']['input']>;
  who_gte?: InputMaybe<Scalars['String']['input']>;
  who_in?: InputMaybe<Array<Scalars['String']['input']>>;
  who_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  who_lt?: InputMaybe<Scalars['String']['input']>;
  who_lte?: InputMaybe<Scalars['String']['input']>;
  who_not_contains?: InputMaybe<Scalars['String']['input']>;
  who_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  who_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  who_not_eq?: InputMaybe<Scalars['String']['input']>;
  who_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  who_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  who_startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type TokenWithdrawnsConnection = {
  __typename?: 'TokenWithdrawnsConnection';
  edges: Array<TokenWithdrawnEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
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
  BlockNumberAscNullsFirst = 'blockNumber_ASC_NULLS_FIRST',
  BlockNumberAscNullsLast = 'blockNumber_ASC_NULLS_LAST',
  BlockNumberDesc = 'blockNumber_DESC',
  BlockNumberDescNullsFirst = 'blockNumber_DESC_NULLS_FIRST',
  BlockNumberDescNullsLast = 'blockNumber_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  TimestampAsc = 'timestamp_ASC',
  TimestampAscNullsFirst = 'timestamp_ASC_NULLS_FIRST',
  TimestampAscNullsLast = 'timestamp_ASC_NULLS_LAST',
  TimestampDesc = 'timestamp_DESC',
  TimestampDescNullsFirst = 'timestamp_DESC_NULLS_FIRST',
  TimestampDescNullsLast = 'timestamp_DESC_NULLS_LAST'
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
  remark?: Maybe<Scalars['String']['output']>;
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
  AmountAscNullsFirst = 'amount_ASC_NULLS_FIRST',
  AmountAscNullsLast = 'amount_ASC_NULLS_LAST',
  AmountDesc = 'amount_DESC',
  AmountDescNullsFirst = 'amount_DESC_NULLS_FIRST',
  AmountDescNullsLast = 'amount_DESC_NULLS_LAST',
  BlockNumberAsc = 'blockNumber_ASC',
  BlockNumberAscNullsFirst = 'blockNumber_ASC_NULLS_FIRST',
  BlockNumberAscNullsLast = 'blockNumber_ASC_NULLS_LAST',
  BlockNumberDesc = 'blockNumber_DESC',
  BlockNumberDescNullsFirst = 'blockNumber_DESC_NULLS_FIRST',
  BlockNumberDescNullsLast = 'blockNumber_DESC_NULLS_LAST',
  ExtrinsicHashAsc = 'extrinsicHash_ASC',
  ExtrinsicHashAscNullsFirst = 'extrinsicHash_ASC_NULLS_FIRST',
  ExtrinsicHashAscNullsLast = 'extrinsicHash_ASC_NULLS_LAST',
  ExtrinsicHashDesc = 'extrinsicHash_DESC',
  ExtrinsicHashDescNullsFirst = 'extrinsicHash_DESC_NULLS_FIRST',
  ExtrinsicHashDescNullsLast = 'extrinsicHash_DESC_NULLS_LAST',
  FeeAsc = 'fee_ASC',
  FeeAscNullsFirst = 'fee_ASC_NULLS_FIRST',
  FeeAscNullsLast = 'fee_ASC_NULLS_LAST',
  FeeDesc = 'fee_DESC',
  FeeDescNullsFirst = 'fee_DESC_NULLS_FIRST',
  FeeDescNullsLast = 'fee_DESC_NULLS_LAST',
  FromAsc = 'from_ASC',
  FromAscNullsFirst = 'from_ASC_NULLS_FIRST',
  FromAscNullsLast = 'from_ASC_NULLS_LAST',
  FromDesc = 'from_DESC',
  FromDescNullsFirst = 'from_DESC_NULLS_FIRST',
  FromDescNullsLast = 'from_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  RemarkAsc = 'remark_ASC',
  RemarkAscNullsFirst = 'remark_ASC_NULLS_FIRST',
  RemarkAscNullsLast = 'remark_ASC_NULLS_LAST',
  RemarkDesc = 'remark_DESC',
  RemarkDescNullsFirst = 'remark_DESC_NULLS_FIRST',
  RemarkDescNullsLast = 'remark_DESC_NULLS_LAST',
  TimestampAsc = 'timestamp_ASC',
  TimestampAscNullsFirst = 'timestamp_ASC_NULLS_FIRST',
  TimestampAscNullsLast = 'timestamp_ASC_NULLS_LAST',
  TimestampDesc = 'timestamp_DESC',
  TimestampDescNullsFirst = 'timestamp_DESC_NULLS_FIRST',
  TimestampDescNullsLast = 'timestamp_DESC_NULLS_LAST',
  ToAsc = 'to_ASC',
  ToAscNullsFirst = 'to_ASC_NULLS_FIRST',
  ToAscNullsLast = 'to_ASC_NULLS_LAST',
  ToDesc = 'to_DESC',
  ToDescNullsFirst = 'to_DESC_NULLS_FIRST',
  ToDescNullsLast = 'to_DESC_NULLS_LAST'
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
  remark_contains?: InputMaybe<Scalars['String']['input']>;
  remark_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  remark_endsWith?: InputMaybe<Scalars['String']['input']>;
  remark_eq?: InputMaybe<Scalars['String']['input']>;
  remark_gt?: InputMaybe<Scalars['String']['input']>;
  remark_gte?: InputMaybe<Scalars['String']['input']>;
  remark_in?: InputMaybe<Array<Scalars['String']['input']>>;
  remark_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  remark_lt?: InputMaybe<Scalars['String']['input']>;
  remark_lte?: InputMaybe<Scalars['String']['input']>;
  remark_not_contains?: InputMaybe<Scalars['String']['input']>;
  remark_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  remark_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  remark_not_eq?: InputMaybe<Scalars['String']['input']>;
  remark_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  remark_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  remark_startsWith?: InputMaybe<Scalars['String']['input']>;
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
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  UsdSwappedAsc = 'usdSwapped_ASC',
  UsdSwappedAscNullsFirst = 'usdSwapped_ASC_NULLS_FIRST',
  UsdSwappedAscNullsLast = 'usdSwapped_ASC_NULLS_LAST',
  UsdSwappedDesc = 'usdSwapped_DESC',
  UsdSwappedDescNullsFirst = 'usdSwapped_DESC_NULLS_FIRST',
  UsdSwappedDescNullsLast = 'usdSwapped_DESC_NULLS_LAST'
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

export type Vault = {
  __typename?: 'Vault';
  accountId: Scalars['String']['output'];
  collateral: Scalars['String']['output'];
  id: Scalars['String']['output'];
  vaultStellarPublicKey: Scalars['String']['output'];
  wrapped: Scalars['String']['output'];
};

export type VaultEdge = {
  __typename?: 'VaultEdge';
  cursor: Scalars['String']['output'];
  node: Vault;
};

export enum VaultOrderByInput {
  AccountIdAsc = 'accountId_ASC',
  AccountIdAscNullsFirst = 'accountId_ASC_NULLS_FIRST',
  AccountIdAscNullsLast = 'accountId_ASC_NULLS_LAST',
  AccountIdDesc = 'accountId_DESC',
  AccountIdDescNullsFirst = 'accountId_DESC_NULLS_FIRST',
  AccountIdDescNullsLast = 'accountId_DESC_NULLS_LAST',
  CollateralAsc = 'collateral_ASC',
  CollateralAscNullsFirst = 'collateral_ASC_NULLS_FIRST',
  CollateralAscNullsLast = 'collateral_ASC_NULLS_LAST',
  CollateralDesc = 'collateral_DESC',
  CollateralDescNullsFirst = 'collateral_DESC_NULLS_FIRST',
  CollateralDescNullsLast = 'collateral_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  VaultStellarPublicKeyAsc = 'vaultStellarPublicKey_ASC',
  VaultStellarPublicKeyAscNullsFirst = 'vaultStellarPublicKey_ASC_NULLS_FIRST',
  VaultStellarPublicKeyAscNullsLast = 'vaultStellarPublicKey_ASC_NULLS_LAST',
  VaultStellarPublicKeyDesc = 'vaultStellarPublicKey_DESC',
  VaultStellarPublicKeyDescNullsFirst = 'vaultStellarPublicKey_DESC_NULLS_FIRST',
  VaultStellarPublicKeyDescNullsLast = 'vaultStellarPublicKey_DESC_NULLS_LAST',
  WrappedAsc = 'wrapped_ASC',
  WrappedAscNullsFirst = 'wrapped_ASC_NULLS_FIRST',
  WrappedAscNullsLast = 'wrapped_ASC_NULLS_LAST',
  WrappedDesc = 'wrapped_DESC',
  WrappedDescNullsFirst = 'wrapped_DESC_NULLS_FIRST',
  WrappedDescNullsLast = 'wrapped_DESC_NULLS_LAST'
}

export type VaultWhereInput = {
  AND?: InputMaybe<Array<VaultWhereInput>>;
  OR?: InputMaybe<Array<VaultWhereInput>>;
  accountId_contains?: InputMaybe<Scalars['String']['input']>;
  accountId_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  accountId_endsWith?: InputMaybe<Scalars['String']['input']>;
  accountId_eq?: InputMaybe<Scalars['String']['input']>;
  accountId_gt?: InputMaybe<Scalars['String']['input']>;
  accountId_gte?: InputMaybe<Scalars['String']['input']>;
  accountId_in?: InputMaybe<Array<Scalars['String']['input']>>;
  accountId_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  accountId_lt?: InputMaybe<Scalars['String']['input']>;
  accountId_lte?: InputMaybe<Scalars['String']['input']>;
  accountId_not_contains?: InputMaybe<Scalars['String']['input']>;
  accountId_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  accountId_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  accountId_not_eq?: InputMaybe<Scalars['String']['input']>;
  accountId_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  accountId_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  accountId_startsWith?: InputMaybe<Scalars['String']['input']>;
  collateral_contains?: InputMaybe<Scalars['String']['input']>;
  collateral_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  collateral_endsWith?: InputMaybe<Scalars['String']['input']>;
  collateral_eq?: InputMaybe<Scalars['String']['input']>;
  collateral_gt?: InputMaybe<Scalars['String']['input']>;
  collateral_gte?: InputMaybe<Scalars['String']['input']>;
  collateral_in?: InputMaybe<Array<Scalars['String']['input']>>;
  collateral_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  collateral_lt?: InputMaybe<Scalars['String']['input']>;
  collateral_lte?: InputMaybe<Scalars['String']['input']>;
  collateral_not_contains?: InputMaybe<Scalars['String']['input']>;
  collateral_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  collateral_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  collateral_not_eq?: InputMaybe<Scalars['String']['input']>;
  collateral_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  collateral_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  collateral_startsWith?: InputMaybe<Scalars['String']['input']>;
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
  vaultStellarPublicKey_contains?: InputMaybe<Scalars['String']['input']>;
  vaultStellarPublicKey_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  vaultStellarPublicKey_endsWith?: InputMaybe<Scalars['String']['input']>;
  vaultStellarPublicKey_eq?: InputMaybe<Scalars['String']['input']>;
  vaultStellarPublicKey_gt?: InputMaybe<Scalars['String']['input']>;
  vaultStellarPublicKey_gte?: InputMaybe<Scalars['String']['input']>;
  vaultStellarPublicKey_in?: InputMaybe<Array<Scalars['String']['input']>>;
  vaultStellarPublicKey_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  vaultStellarPublicKey_lt?: InputMaybe<Scalars['String']['input']>;
  vaultStellarPublicKey_lte?: InputMaybe<Scalars['String']['input']>;
  vaultStellarPublicKey_not_contains?: InputMaybe<Scalars['String']['input']>;
  vaultStellarPublicKey_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  vaultStellarPublicKey_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  vaultStellarPublicKey_not_eq?: InputMaybe<Scalars['String']['input']>;
  vaultStellarPublicKey_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  vaultStellarPublicKey_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  vaultStellarPublicKey_startsWith?: InputMaybe<Scalars['String']['input']>;
  wrapped_contains?: InputMaybe<Scalars['String']['input']>;
  wrapped_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  wrapped_endsWith?: InputMaybe<Scalars['String']['input']>;
  wrapped_eq?: InputMaybe<Scalars['String']['input']>;
  wrapped_gt?: InputMaybe<Scalars['String']['input']>;
  wrapped_gte?: InputMaybe<Scalars['String']['input']>;
  wrapped_in?: InputMaybe<Array<Scalars['String']['input']>>;
  wrapped_isNull?: InputMaybe<Scalars['Boolean']['input']>;
  wrapped_lt?: InputMaybe<Scalars['String']['input']>;
  wrapped_lte?: InputMaybe<Scalars['String']['input']>;
  wrapped_not_contains?: InputMaybe<Scalars['String']['input']>;
  wrapped_not_containsInsensitive?: InputMaybe<Scalars['String']['input']>;
  wrapped_not_endsWith?: InputMaybe<Scalars['String']['input']>;
  wrapped_not_eq?: InputMaybe<Scalars['String']['input']>;
  wrapped_not_in?: InputMaybe<Array<Scalars['String']['input']>>;
  wrapped_not_startsWith?: InputMaybe<Scalars['String']['input']>;
  wrapped_startsWith?: InputMaybe<Scalars['String']['input']>;
};

export type VaultsConnection = {
  __typename?: 'VaultsConnection';
  edges: Array<VaultEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
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
  BurnAscNullsFirst = 'burn_ASC_NULLS_FIRST',
  BurnAscNullsLast = 'burn_ASC_NULLS_LAST',
  BurnDesc = 'burn_DESC',
  BurnDescNullsFirst = 'burn_DESC_NULLS_FIRST',
  BurnDescNullsLast = 'burn_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  UpdatedDateAsc = 'updatedDate_ASC',
  UpdatedDateAscNullsFirst = 'updatedDate_ASC_NULLS_FIRST',
  UpdatedDateAscNullsLast = 'updatedDate_ASC_NULLS_LAST',
  UpdatedDateDesc = 'updatedDate_DESC',
  UpdatedDateDescNullsFirst = 'updatedDate_DESC_NULLS_FIRST',
  UpdatedDateDescNullsLast = 'updatedDate_DESC_NULLS_LAST'
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
  DailyVolumeUsdAscNullsFirst = 'dailyVolumeUSD_ASC_NULLS_FIRST',
  DailyVolumeUsdAscNullsLast = 'dailyVolumeUSD_ASC_NULLS_LAST',
  DailyVolumeUsdDesc = 'dailyVolumeUSD_DESC',
  DailyVolumeUsdDescNullsFirst = 'dailyVolumeUSD_DESC_NULLS_FIRST',
  DailyVolumeUsdDescNullsLast = 'dailyVolumeUSD_DESC_NULLS_LAST',
  DateAsc = 'date_ASC',
  DateAscNullsFirst = 'date_ASC_NULLS_FIRST',
  DateAscNullsLast = 'date_ASC_NULLS_LAST',
  DateDesc = 'date_DESC',
  DateDescNullsFirst = 'date_DESC_NULLS_FIRST',
  DateDescNullsLast = 'date_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  StableInfoDailyVolumeUsdAsc = 'stableInfo_dailyVolumeUSD_ASC',
  StableInfoDailyVolumeUsdAscNullsFirst = 'stableInfo_dailyVolumeUSD_ASC_NULLS_FIRST',
  StableInfoDailyVolumeUsdAscNullsLast = 'stableInfo_dailyVolumeUSD_ASC_NULLS_LAST',
  StableInfoDailyVolumeUsdDesc = 'stableInfo_dailyVolumeUSD_DESC',
  StableInfoDailyVolumeUsdDescNullsFirst = 'stableInfo_dailyVolumeUSD_DESC_NULLS_FIRST',
  StableInfoDailyVolumeUsdDescNullsLast = 'stableInfo_dailyVolumeUSD_DESC_NULLS_LAST',
  StableInfoDateAsc = 'stableInfo_date_ASC',
  StableInfoDateAscNullsFirst = 'stableInfo_date_ASC_NULLS_FIRST',
  StableInfoDateAscNullsLast = 'stableInfo_date_ASC_NULLS_LAST',
  StableInfoDateDesc = 'stableInfo_date_DESC',
  StableInfoDateDescNullsFirst = 'stableInfo_date_DESC_NULLS_FIRST',
  StableInfoDateDescNullsLast = 'stableInfo_date_DESC_NULLS_LAST',
  StableInfoIdAsc = 'stableInfo_id_ASC',
  StableInfoIdAscNullsFirst = 'stableInfo_id_ASC_NULLS_FIRST',
  StableInfoIdAscNullsLast = 'stableInfo_id_ASC_NULLS_LAST',
  StableInfoIdDesc = 'stableInfo_id_DESC',
  StableInfoIdDescNullsFirst = 'stableInfo_id_DESC_NULLS_FIRST',
  StableInfoIdDescNullsLast = 'stableInfo_id_DESC_NULLS_LAST',
  StableInfoTvlUsdAsc = 'stableInfo_tvlUSD_ASC',
  StableInfoTvlUsdAscNullsFirst = 'stableInfo_tvlUSD_ASC_NULLS_FIRST',
  StableInfoTvlUsdAscNullsLast = 'stableInfo_tvlUSD_ASC_NULLS_LAST',
  StableInfoTvlUsdDesc = 'stableInfo_tvlUSD_DESC',
  StableInfoTvlUsdDescNullsFirst = 'stableInfo_tvlUSD_DESC_NULLS_FIRST',
  StableInfoTvlUsdDescNullsLast = 'stableInfo_tvlUSD_DESC_NULLS_LAST',
  StandardInfoDailyVolumeEthAsc = 'standardInfo_dailyVolumeETH_ASC',
  StandardInfoDailyVolumeEthAscNullsFirst = 'standardInfo_dailyVolumeETH_ASC_NULLS_FIRST',
  StandardInfoDailyVolumeEthAscNullsLast = 'standardInfo_dailyVolumeETH_ASC_NULLS_LAST',
  StandardInfoDailyVolumeEthDesc = 'standardInfo_dailyVolumeETH_DESC',
  StandardInfoDailyVolumeEthDescNullsFirst = 'standardInfo_dailyVolumeETH_DESC_NULLS_FIRST',
  StandardInfoDailyVolumeEthDescNullsLast = 'standardInfo_dailyVolumeETH_DESC_NULLS_LAST',
  StandardInfoDailyVolumeUsdAsc = 'standardInfo_dailyVolumeUSD_ASC',
  StandardInfoDailyVolumeUsdAscNullsFirst = 'standardInfo_dailyVolumeUSD_ASC_NULLS_FIRST',
  StandardInfoDailyVolumeUsdAscNullsLast = 'standardInfo_dailyVolumeUSD_ASC_NULLS_LAST',
  StandardInfoDailyVolumeUsdDesc = 'standardInfo_dailyVolumeUSD_DESC',
  StandardInfoDailyVolumeUsdDescNullsFirst = 'standardInfo_dailyVolumeUSD_DESC_NULLS_FIRST',
  StandardInfoDailyVolumeUsdDescNullsLast = 'standardInfo_dailyVolumeUSD_DESC_NULLS_LAST',
  StandardInfoDailyVolumeUntrackedAsc = 'standardInfo_dailyVolumeUntracked_ASC',
  StandardInfoDailyVolumeUntrackedAscNullsFirst = 'standardInfo_dailyVolumeUntracked_ASC_NULLS_FIRST',
  StandardInfoDailyVolumeUntrackedAscNullsLast = 'standardInfo_dailyVolumeUntracked_ASC_NULLS_LAST',
  StandardInfoDailyVolumeUntrackedDesc = 'standardInfo_dailyVolumeUntracked_DESC',
  StandardInfoDailyVolumeUntrackedDescNullsFirst = 'standardInfo_dailyVolumeUntracked_DESC_NULLS_FIRST',
  StandardInfoDailyVolumeUntrackedDescNullsLast = 'standardInfo_dailyVolumeUntracked_DESC_NULLS_LAST',
  StandardInfoDateAsc = 'standardInfo_date_ASC',
  StandardInfoDateAscNullsFirst = 'standardInfo_date_ASC_NULLS_FIRST',
  StandardInfoDateAscNullsLast = 'standardInfo_date_ASC_NULLS_LAST',
  StandardInfoDateDesc = 'standardInfo_date_DESC',
  StandardInfoDateDescNullsFirst = 'standardInfo_date_DESC_NULLS_FIRST',
  StandardInfoDateDescNullsLast = 'standardInfo_date_DESC_NULLS_LAST',
  StandardInfoIdAsc = 'standardInfo_id_ASC',
  StandardInfoIdAscNullsFirst = 'standardInfo_id_ASC_NULLS_FIRST',
  StandardInfoIdAscNullsLast = 'standardInfo_id_ASC_NULLS_LAST',
  StandardInfoIdDesc = 'standardInfo_id_DESC',
  StandardInfoIdDescNullsFirst = 'standardInfo_id_DESC_NULLS_FIRST',
  StandardInfoIdDescNullsLast = 'standardInfo_id_DESC_NULLS_LAST',
  StandardInfoTotalLiquidityEthAsc = 'standardInfo_totalLiquidityETH_ASC',
  StandardInfoTotalLiquidityEthAscNullsFirst = 'standardInfo_totalLiquidityETH_ASC_NULLS_FIRST',
  StandardInfoTotalLiquidityEthAscNullsLast = 'standardInfo_totalLiquidityETH_ASC_NULLS_LAST',
  StandardInfoTotalLiquidityEthDesc = 'standardInfo_totalLiquidityETH_DESC',
  StandardInfoTotalLiquidityEthDescNullsFirst = 'standardInfo_totalLiquidityETH_DESC_NULLS_FIRST',
  StandardInfoTotalLiquidityEthDescNullsLast = 'standardInfo_totalLiquidityETH_DESC_NULLS_LAST',
  StandardInfoTotalLiquidityUsdAsc = 'standardInfo_totalLiquidityUSD_ASC',
  StandardInfoTotalLiquidityUsdAscNullsFirst = 'standardInfo_totalLiquidityUSD_ASC_NULLS_FIRST',
  StandardInfoTotalLiquidityUsdAscNullsLast = 'standardInfo_totalLiquidityUSD_ASC_NULLS_LAST',
  StandardInfoTotalLiquidityUsdDesc = 'standardInfo_totalLiquidityUSD_DESC',
  StandardInfoTotalLiquidityUsdDescNullsFirst = 'standardInfo_totalLiquidityUSD_DESC_NULLS_FIRST',
  StandardInfoTotalLiquidityUsdDescNullsLast = 'standardInfo_totalLiquidityUSD_DESC_NULLS_LAST',
  StandardInfoTotalVolumeEthAsc = 'standardInfo_totalVolumeETH_ASC',
  StandardInfoTotalVolumeEthAscNullsFirst = 'standardInfo_totalVolumeETH_ASC_NULLS_FIRST',
  StandardInfoTotalVolumeEthAscNullsLast = 'standardInfo_totalVolumeETH_ASC_NULLS_LAST',
  StandardInfoTotalVolumeEthDesc = 'standardInfo_totalVolumeETH_DESC',
  StandardInfoTotalVolumeEthDescNullsFirst = 'standardInfo_totalVolumeETH_DESC_NULLS_FIRST',
  StandardInfoTotalVolumeEthDescNullsLast = 'standardInfo_totalVolumeETH_DESC_NULLS_LAST',
  StandardInfoTotalVolumeUsdAsc = 'standardInfo_totalVolumeUSD_ASC',
  StandardInfoTotalVolumeUsdAscNullsFirst = 'standardInfo_totalVolumeUSD_ASC_NULLS_FIRST',
  StandardInfoTotalVolumeUsdAscNullsLast = 'standardInfo_totalVolumeUSD_ASC_NULLS_LAST',
  StandardInfoTotalVolumeUsdDesc = 'standardInfo_totalVolumeUSD_DESC',
  StandardInfoTotalVolumeUsdDescNullsFirst = 'standardInfo_totalVolumeUSD_DESC_NULLS_FIRST',
  StandardInfoTotalVolumeUsdDescNullsLast = 'standardInfo_totalVolumeUSD_DESC_NULLS_LAST',
  StandardInfoTxCountAsc = 'standardInfo_txCount_ASC',
  StandardInfoTxCountAscNullsFirst = 'standardInfo_txCount_ASC_NULLS_FIRST',
  StandardInfoTxCountAscNullsLast = 'standardInfo_txCount_ASC_NULLS_LAST',
  StandardInfoTxCountDesc = 'standardInfo_txCount_DESC',
  StandardInfoTxCountDescNullsFirst = 'standardInfo_txCount_DESC_NULLS_FIRST',
  StandardInfoTxCountDescNullsLast = 'standardInfo_txCount_DESC_NULLS_LAST',
  TvlUsdAsc = 'tvlUSD_ASC',
  TvlUsdAscNullsFirst = 'tvlUSD_ASC_NULLS_FIRST',
  TvlUsdAscNullsLast = 'tvlUSD_ASC_NULLS_LAST',
  TvlUsdDesc = 'tvlUSD_DESC',
  TvlUsdDescNullsFirst = 'tvlUSD_DESC_NULLS_FIRST',
  TvlUsdDescNullsLast = 'tvlUSD_DESC_NULLS_LAST'
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
  FactoryIdAscNullsFirst = 'factory_id_ASC_NULLS_FIRST',
  FactoryIdAscNullsLast = 'factory_id_ASC_NULLS_LAST',
  FactoryIdDesc = 'factory_id_DESC',
  FactoryIdDescNullsFirst = 'factory_id_DESC_NULLS_FIRST',
  FactoryIdDescNullsLast = 'factory_id_DESC_NULLS_LAST',
  FactoryPairCountAsc = 'factory_pairCount_ASC',
  FactoryPairCountAscNullsFirst = 'factory_pairCount_ASC_NULLS_FIRST',
  FactoryPairCountAscNullsLast = 'factory_pairCount_ASC_NULLS_LAST',
  FactoryPairCountDesc = 'factory_pairCount_DESC',
  FactoryPairCountDescNullsFirst = 'factory_pairCount_DESC_NULLS_FIRST',
  FactoryPairCountDescNullsLast = 'factory_pairCount_DESC_NULLS_LAST',
  FactoryTotalLiquidityEthAsc = 'factory_totalLiquidityETH_ASC',
  FactoryTotalLiquidityEthAscNullsFirst = 'factory_totalLiquidityETH_ASC_NULLS_FIRST',
  FactoryTotalLiquidityEthAscNullsLast = 'factory_totalLiquidityETH_ASC_NULLS_LAST',
  FactoryTotalLiquidityEthDesc = 'factory_totalLiquidityETH_DESC',
  FactoryTotalLiquidityEthDescNullsFirst = 'factory_totalLiquidityETH_DESC_NULLS_FIRST',
  FactoryTotalLiquidityEthDescNullsLast = 'factory_totalLiquidityETH_DESC_NULLS_LAST',
  FactoryTotalLiquidityUsdAsc = 'factory_totalLiquidityUSD_ASC',
  FactoryTotalLiquidityUsdAscNullsFirst = 'factory_totalLiquidityUSD_ASC_NULLS_FIRST',
  FactoryTotalLiquidityUsdAscNullsLast = 'factory_totalLiquidityUSD_ASC_NULLS_LAST',
  FactoryTotalLiquidityUsdDesc = 'factory_totalLiquidityUSD_DESC',
  FactoryTotalLiquidityUsdDescNullsFirst = 'factory_totalLiquidityUSD_DESC_NULLS_FIRST',
  FactoryTotalLiquidityUsdDescNullsLast = 'factory_totalLiquidityUSD_DESC_NULLS_LAST',
  FactoryTotalVolumeEthAsc = 'factory_totalVolumeETH_ASC',
  FactoryTotalVolumeEthAscNullsFirst = 'factory_totalVolumeETH_ASC_NULLS_FIRST',
  FactoryTotalVolumeEthAscNullsLast = 'factory_totalVolumeETH_ASC_NULLS_LAST',
  FactoryTotalVolumeEthDesc = 'factory_totalVolumeETH_DESC',
  FactoryTotalVolumeEthDescNullsFirst = 'factory_totalVolumeETH_DESC_NULLS_FIRST',
  FactoryTotalVolumeEthDescNullsLast = 'factory_totalVolumeETH_DESC_NULLS_LAST',
  FactoryTotalVolumeUsdAsc = 'factory_totalVolumeUSD_ASC',
  FactoryTotalVolumeUsdAscNullsFirst = 'factory_totalVolumeUSD_ASC_NULLS_FIRST',
  FactoryTotalVolumeUsdAscNullsLast = 'factory_totalVolumeUSD_ASC_NULLS_LAST',
  FactoryTotalVolumeUsdDesc = 'factory_totalVolumeUSD_DESC',
  FactoryTotalVolumeUsdDescNullsFirst = 'factory_totalVolumeUSD_DESC_NULLS_FIRST',
  FactoryTotalVolumeUsdDescNullsLast = 'factory_totalVolumeUSD_DESC_NULLS_LAST',
  FactoryTxCountAsc = 'factory_txCount_ASC',
  FactoryTxCountAscNullsFirst = 'factory_txCount_ASC_NULLS_FIRST',
  FactoryTxCountAscNullsLast = 'factory_txCount_ASC_NULLS_LAST',
  FactoryTxCountDesc = 'factory_txCount_DESC',
  FactoryTxCountDescNullsFirst = 'factory_txCount_DESC_NULLS_FIRST',
  FactoryTxCountDescNullsLast = 'factory_txCount_DESC_NULLS_LAST',
  FactoryUntrackedVolumeUsdAsc = 'factory_untrackedVolumeUSD_ASC',
  FactoryUntrackedVolumeUsdAscNullsFirst = 'factory_untrackedVolumeUSD_ASC_NULLS_FIRST',
  FactoryUntrackedVolumeUsdAscNullsLast = 'factory_untrackedVolumeUSD_ASC_NULLS_LAST',
  FactoryUntrackedVolumeUsdDesc = 'factory_untrackedVolumeUSD_DESC',
  FactoryUntrackedVolumeUsdDescNullsFirst = 'factory_untrackedVolumeUSD_DESC_NULLS_FIRST',
  FactoryUntrackedVolumeUsdDescNullsLast = 'factory_untrackedVolumeUSD_DESC_NULLS_LAST',
  IdAsc = 'id_ASC',
  IdAscNullsFirst = 'id_ASC_NULLS_FIRST',
  IdAscNullsLast = 'id_ASC_NULLS_LAST',
  IdDesc = 'id_DESC',
  IdDescNullsFirst = 'id_DESC_NULLS_FIRST',
  IdDescNullsLast = 'id_DESC_NULLS_LAST',
  StableSwapInfoIdAsc = 'stableSwapInfo_id_ASC',
  StableSwapInfoIdAscNullsFirst = 'stableSwapInfo_id_ASC_NULLS_FIRST',
  StableSwapInfoIdAscNullsLast = 'stableSwapInfo_id_ASC_NULLS_LAST',
  StableSwapInfoIdDesc = 'stableSwapInfo_id_DESC',
  StableSwapInfoIdDescNullsFirst = 'stableSwapInfo_id_DESC_NULLS_FIRST',
  StableSwapInfoIdDescNullsLast = 'stableSwapInfo_id_DESC_NULLS_LAST',
  StableSwapInfoPoolCountAsc = 'stableSwapInfo_poolCount_ASC',
  StableSwapInfoPoolCountAscNullsFirst = 'stableSwapInfo_poolCount_ASC_NULLS_FIRST',
  StableSwapInfoPoolCountAscNullsLast = 'stableSwapInfo_poolCount_ASC_NULLS_LAST',
  StableSwapInfoPoolCountDesc = 'stableSwapInfo_poolCount_DESC',
  StableSwapInfoPoolCountDescNullsFirst = 'stableSwapInfo_poolCount_DESC_NULLS_FIRST',
  StableSwapInfoPoolCountDescNullsLast = 'stableSwapInfo_poolCount_DESC_NULLS_LAST',
  StableSwapInfoTotalTvlUsdAsc = 'stableSwapInfo_totalTvlUSD_ASC',
  StableSwapInfoTotalTvlUsdAscNullsFirst = 'stableSwapInfo_totalTvlUSD_ASC_NULLS_FIRST',
  StableSwapInfoTotalTvlUsdAscNullsLast = 'stableSwapInfo_totalTvlUSD_ASC_NULLS_LAST',
  StableSwapInfoTotalTvlUsdDesc = 'stableSwapInfo_totalTvlUSD_DESC',
  StableSwapInfoTotalTvlUsdDescNullsFirst = 'stableSwapInfo_totalTvlUSD_DESC_NULLS_FIRST',
  StableSwapInfoTotalTvlUsdDescNullsLast = 'stableSwapInfo_totalTvlUSD_DESC_NULLS_LAST',
  StableSwapInfoTotalVolumeUsdAsc = 'stableSwapInfo_totalVolumeUSD_ASC',
  StableSwapInfoTotalVolumeUsdAscNullsFirst = 'stableSwapInfo_totalVolumeUSD_ASC_NULLS_FIRST',
  StableSwapInfoTotalVolumeUsdAscNullsLast = 'stableSwapInfo_totalVolumeUSD_ASC_NULLS_LAST',
  StableSwapInfoTotalVolumeUsdDesc = 'stableSwapInfo_totalVolumeUSD_DESC',
  StableSwapInfoTotalVolumeUsdDescNullsFirst = 'stableSwapInfo_totalVolumeUSD_DESC_NULLS_FIRST',
  StableSwapInfoTotalVolumeUsdDescNullsLast = 'stableSwapInfo_totalVolumeUSD_DESC_NULLS_LAST',
  StableSwapInfoTxCountAsc = 'stableSwapInfo_txCount_ASC',
  StableSwapInfoTxCountAscNullsFirst = 'stableSwapInfo_txCount_ASC_NULLS_FIRST',
  StableSwapInfoTxCountAscNullsLast = 'stableSwapInfo_txCount_ASC_NULLS_LAST',
  StableSwapInfoTxCountDesc = 'stableSwapInfo_txCount_DESC',
  StableSwapInfoTxCountDescNullsFirst = 'stableSwapInfo_txCount_DESC_NULLS_FIRST',
  StableSwapInfoTxCountDescNullsLast = 'stableSwapInfo_txCount_DESC_NULLS_LAST',
  TotalTvlUsdAsc = 'totalTvlUSD_ASC',
  TotalTvlUsdAscNullsFirst = 'totalTvlUSD_ASC_NULLS_FIRST',
  TotalTvlUsdAscNullsLast = 'totalTvlUSD_ASC_NULLS_LAST',
  TotalTvlUsdDesc = 'totalTvlUSD_DESC',
  TotalTvlUsdDescNullsFirst = 'totalTvlUSD_DESC_NULLS_FIRST',
  TotalTvlUsdDescNullsLast = 'totalTvlUSD_DESC_NULLS_LAST',
  TotalVolumeUsdAsc = 'totalVolumeUSD_ASC',
  TotalVolumeUsdAscNullsFirst = 'totalVolumeUSD_ASC_NULLS_FIRST',
  TotalVolumeUsdAscNullsLast = 'totalVolumeUSD_ASC_NULLS_LAST',
  TotalVolumeUsdDesc = 'totalVolumeUSD_DESC',
  TotalVolumeUsdDescNullsFirst = 'totalVolumeUSD_DESC_NULLS_FIRST',
  TotalVolumeUsdDescNullsLast = 'totalVolumeUSD_DESC_NULLS_LAST',
  TxCountAsc = 'txCount_ASC',
  TxCountAscNullsFirst = 'txCount_ASC_NULLS_FIRST',
  TxCountAscNullsLast = 'txCount_ASC_NULLS_LAST',
  TxCountDesc = 'txCount_DESC',
  TxCountDescNullsFirst = 'txCount_DESC_NULLS_FIRST',
  TxCountDescNullsLast = 'txCount_DESC_NULLS_LAST',
  UpdatedDateAsc = 'updatedDate_ASC',
  UpdatedDateAscNullsFirst = 'updatedDate_ASC_NULLS_FIRST',
  UpdatedDateAscNullsLast = 'updatedDate_ASC_NULLS_LAST',
  UpdatedDateDesc = 'updatedDate_DESC',
  UpdatedDateDescNullsFirst = 'updatedDate_DESC_NULLS_FIRST',
  UpdatedDateDescNullsLast = 'updatedDate_DESC_NULLS_LAST'
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

export type GetLatestBlockQueryVariables = Exact<{ [key: string]: never; }>;


export type GetLatestBlockQuery = { __typename?: 'Query', blocks: Array<{ __typename?: 'Block', id: string, timestamp: any, height: number }> };

export type GetRouterQueryVariables = Exact<{
  id: Scalars['String']['input'];
}>;


export type GetRouterQuery = { __typename?: 'Query', routerById?: { __typename?: 'Router', id: string, paused: boolean, swapPools: Array<{ __typename?: 'SwapPool', id: string, paused: boolean, name: string, reserve: any, reserveWithSlippage: any, totalLiabilities: any, totalSupply: any, lpTokenDecimals: number, apr: any, symbol: string, insuranceFeeBps: any, protocolTreasuryAddress?: string | null, token: { __typename?: 'NablaToken', id: string, decimals: number, name: string, symbol: string } }>, backstopPool: Array<{ __typename?: 'BackstopPool', id: string, name: string, paused: boolean, symbol: string, totalSupply: any, apr: any, reserves: any, lpTokenDecimals: number, token: { __typename?: 'NablaToken', id: string, decimals: number, name: string, symbol: string } }> } | null };


export const GetLatestBlockDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"getLatestBlock"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"blocks"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"IntValue","value":"1"}},{"kind":"Argument","name":{"kind":"Name","value":"orderBy"},"value":{"kind":"EnumValue","value":"timestamp_DESC"}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"timestamp"}},{"kind":"Field","name":{"kind":"Name","value":"height"}}]}}]}}]} as unknown as DocumentNode<GetLatestBlockQuery, GetLatestBlockQueryVariables>;
export const GetRouterDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"getRouter"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"routerById"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"swapPools"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"paused"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"reserve"}},{"kind":"Field","name":{"kind":"Name","value":"reserveWithSlippage"}},{"kind":"Field","name":{"kind":"Name","value":"totalLiabilities"}},{"kind":"Field","name":{"kind":"Name","value":"totalSupply"}},{"kind":"Field","name":{"kind":"Name","value":"lpTokenDecimals"}},{"kind":"Field","name":{"kind":"Name","value":"apr"}},{"kind":"Field","name":{"kind":"Name","value":"symbol"}},{"kind":"Field","name":{"kind":"Name","value":"token"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"decimals"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"symbol"}}]}},{"kind":"Field","name":{"kind":"Name","value":"insuranceFeeBps"}},{"kind":"Field","name":{"kind":"Name","value":"protocolTreasuryAddress"}}]}},{"kind":"Field","name":{"kind":"Name","value":"backstopPool"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"paused"}},{"kind":"Field","name":{"kind":"Name","value":"symbol"}},{"kind":"Field","name":{"kind":"Name","value":"totalSupply"}},{"kind":"Field","name":{"kind":"Name","value":"apr"}},{"kind":"Field","name":{"kind":"Name","value":"reserves"}},{"kind":"Field","name":{"kind":"Name","value":"lpTokenDecimals"}},{"kind":"Field","name":{"kind":"Name","value":"token"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"decimals"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"symbol"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"paused"}}]}}]}}]} as unknown as DocumentNode<GetRouterQuery, GetRouterQueryVariables>;