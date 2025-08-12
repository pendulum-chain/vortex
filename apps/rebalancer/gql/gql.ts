/* eslint-disable */
import * as types from './graphql';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n    query getLatestBlock {\n        blocks(limit: 1, orderBy: timestamp_DESC) {\n            id\n            timestamp\n            height\n        }\n    }\n": typeof types.GetLatestBlockDocument,
    "\n    query getRouter($id: String!) {\n        routerById(id: $id) {\n            id\n            swapPools {\n                id\n                paused\n                name\n                reserve\n                reserveWithSlippage\n                totalLiabilities\n                totalSupply\n                lpTokenDecimals\n                apr\n                symbol\n                token {\n                    id\n                    decimals\n                    name\n                    symbol\n                }\n                insuranceFeeBps\n                protocolTreasuryAddress\n            }\n            backstopPool {\n                id\n                name\n                paused\n                symbol\n                totalSupply\n                apr\n                reserves\n                lpTokenDecimals\n                token {\n                    id\n                    decimals\n                    name\n                    symbol\n                }\n            }\n            paused\n        }\n    }\n": typeof types.GetRouterDocument,
};
const documents: Documents = {
    "\n    query getLatestBlock {\n        blocks(limit: 1, orderBy: timestamp_DESC) {\n            id\n            timestamp\n            height\n        }\n    }\n": types.GetLatestBlockDocument,
    "\n    query getRouter($id: String!) {\n        routerById(id: $id) {\n            id\n            swapPools {\n                id\n                paused\n                name\n                reserve\n                reserveWithSlippage\n                totalLiabilities\n                totalSupply\n                lpTokenDecimals\n                apr\n                symbol\n                token {\n                    id\n                    decimals\n                    name\n                    symbol\n                }\n                insuranceFeeBps\n                protocolTreasuryAddress\n            }\n            backstopPool {\n                id\n                name\n                paused\n                symbol\n                totalSupply\n                apr\n                reserves\n                lpTokenDecimals\n                token {\n                    id\n                    decimals\n                    name\n                    symbol\n                }\n            }\n            paused\n        }\n    }\n": types.GetRouterDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query getLatestBlock {\n        blocks(limit: 1, orderBy: timestamp_DESC) {\n            id\n            timestamp\n            height\n        }\n    }\n"): (typeof documents)["\n    query getLatestBlock {\n        blocks(limit: 1, orderBy: timestamp_DESC) {\n            id\n            timestamp\n            height\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query getRouter($id: String!) {\n        routerById(id: $id) {\n            id\n            swapPools {\n                id\n                paused\n                name\n                reserve\n                reserveWithSlippage\n                totalLiabilities\n                totalSupply\n                lpTokenDecimals\n                apr\n                symbol\n                token {\n                    id\n                    decimals\n                    name\n                    symbol\n                }\n                insuranceFeeBps\n                protocolTreasuryAddress\n            }\n            backstopPool {\n                id\n                name\n                paused\n                symbol\n                totalSupply\n                apr\n                reserves\n                lpTokenDecimals\n                token {\n                    id\n                    decimals\n                    name\n                    symbol\n                }\n            }\n            paused\n        }\n    }\n"): (typeof documents)["\n    query getRouter($id: String!) {\n        routerById(id: $id) {\n            id\n            swapPools {\n                id\n                paused\n                name\n                reserve\n                reserveWithSlippage\n                totalLiabilities\n                totalSupply\n                lpTokenDecimals\n                apr\n                symbol\n                token {\n                    id\n                    decimals\n                    name\n                    symbol\n                }\n                insuranceFeeBps\n                protocolTreasuryAddress\n            }\n            backstopPool {\n                id\n                name\n                paused\n                symbol\n                totalSupply\n                apr\n                reserves\n                lpTokenDecimals\n                token {\n                    id\n                    decimals\n                    name\n                    symbol\n                }\n            }\n            paused\n        }\n    }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;